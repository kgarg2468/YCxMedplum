/**
 * Vapi webhook server (SETUP.md § voice).
 *
 * Expose with:  npx localtunnel --port 3000   (or ngrok)
 * Run with:     npm run server
 *
 * Subscribes to two Vapi events:
 *   - `transcript`          per-turn red-flag check (do NOT wait for end of call)
 *   - `end-of-call-report`  full pipeline: extract → resolve → detect → persist
 *
 * Extraction runs here, AFTER the call — never in the voice reply path. Blocking
 * the conversation on a 3-second extraction makes the demo feel broken.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import express from 'express';
import { MedplumClient } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { extractWithRetry } from './llm/extract.js';
import { resolveAll } from './rxnav.js';
import { runReview, detectCascadeChains } from './engine/detect.js';
import { checkRedFlags } from './voice/prompt.js';
import { persistReview, writeRedFlagTask, summarizeWritten } from './fhir/writers.js';
import { DEMO_CONDITIONS, DEMO_DURATIONS, seedDemoPatient, patientLabel } from './fhir/seed.js';
import { renderReviewHtml, type ReviewSnapshot } from './ui/panel.js';

const PORT = Number(process.env.PORT ?? 3000);
const SNAPSHOT_PATH = 'out/last-review.json';

// The review panel shows the most recent run — live call or canned demo. The
// demo runner writes the same file from its own process, so re-read on mtime
// change rather than caching forever: `npm run demo` must repaint the panel
// without a server restart (that's the on-stage wifi-failure fallback).
let lastSnapshot: ReviewSnapshot | null = null;
let snapshotMtime = 0;

function currentSnapshot(): ReviewSnapshot | null {
  try {
    if (existsSync(SNAPSHOT_PATH)) {
      const mtime = statSync(SNAPSHOT_PATH).mtimeMs;
      if (mtime !== snapshotMtime) {
        lastSnapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
        snapshotMtime = mtime;
      }
    }
  } catch { /* mid-write race — serve the cached one */ }
  return lastSnapshot;
}

function saveSnapshot(snap: ReviewSnapshot) {
  lastSnapshot = snap;
  mkdirSync('out', { recursive: true });
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snap, null, 2));
  snapshotMtime = statSync(SNAPSHOT_PATH).mtimeMs;
}

const app = express();
app.use(express.json());

// One demo patient per server run, created lazily on the first end-of-call report.
let medplum: MedplumClient | null = null;
let patient: Patient | null = null;

async function getMedplum(): Promise<{ medplum: MedplumClient; patient: Patient } | null> {
  if (!process.env.MEDPLUM_CLIENT_ID || !process.env.MEDPLUM_CLIENT_SECRET) {
    console.warn('[medplum] no credentials in .env — findings will print to console only');
    return null;
  }
  if (!medplum) {
    medplum = new MedplumClient({ baseUrl: process.env.MEDPLUM_BASE_URL });
    await medplum.startClientLogin(
      process.env.MEDPLUM_CLIENT_ID,
      process.env.MEDPLUM_CLIENT_SECRET,
    );
  }
  if (!patient) {
    ({ patient } = await seedDemoPatient(medplum));
  }
  return { medplum, patient };
}

// Calls already handled (by webhook or poller), so the two paths never double-run.
const processedCalls = new Set<string>();

// One urgent Task per call, even though red flags are checked every turn.
const escalatedCalls = new Set<string>();

/**
 * Escalate red flags NOW — at the turn they were detected, not at end of call.
 * Creates an urgent FHIR Task a clinician queue can pick up. Returns true if the
 * Task was written (false when Medplum credentials are absent).
 */
async function escalateRedFlags(flags: string[], callId?: string): Promise<boolean> {
  console.warn('⚠ RED FLAG:', flags.join('; '));

  // Dedupe only when we can actually identify the call. Bucketing every
  // id-less turn under one key would let the first such escalation suppress
  // every later one, silently. On a safety path a duplicate Task is cheap and
  // a missed one is not, so when in doubt we escalate.
  if (callId) {
    if (escalatedCalls.has(callId)) return true;
    // Claim the id BEFORE awaiting. The per-turn webhook fires this without
    // awaiting, so marking it only after the write completes lets two turns of
    // the same call race past the check and create two urgent Tasks.
    escalatedCalls.add(callId);
  }

  try {
    const ctx = await getMedplum();
    if (!ctx) {
      if (callId) escalatedCalls.delete(callId);
      return false;
    }
    const task = await writeRedFlagTask(ctx.medplum, ctx.patient, flags);
    console.warn(`→ Urgent Task/${task.id} created for clinician`);
    return true;
  } catch (err) {
    // Release the claim so a transient failure can still be escalated later.
    if (callId) escalatedCalls.delete(callId);
    console.error('[redflag] escalation failed:', err);
    return false;
  }
}

async function runPipeline(transcript: string, callId: string | undefined, via: string) {
  if (callId) {
    if (processedCalls.has(callId)) return;
    processedCalls.add(callId);
  }
  // Retry is only safe up to the point where we start writing to Medplum. The
  // writers are create-only, so re-running after a partial write would duplicate
  // every resource on the patient's chart.
  let wroteToMedplum = false;

  try {
    console.log(`\n[call ended, via ${via}] transcript: ${transcript.length} chars — running pipeline`);

    const ex = await extractWithRetry(transcript);
    const meds = await resolveAll(ex.medications);
    const review = runReview({
      meds,
      symptoms: ex.symptoms,
      conditions: DEMO_CONDITIONS,
      values: ex.values,
      redFlags: [...checkRedFlags(transcript), ...ex.red_flags],
      durationsWeeks: DEMO_DURATIONS,
    });

    console.log(`${review.findings.length} findings, ACB ${review.acbScore}`);
    for (const f of review.findings) {
      console.log(`  [${f.severity}] ${f.kind}: ${f.implicated.join(' → ')}`);
    }
    const chains = detectCascadeChains(review.findings.filter((f) => f.kind === 'cascade'));
    for (const c of chains) console.log(`  ★ CHAIN: ${c.join(' → ')}`);

    const snapshot: ReviewSnapshot = {
      at: new Date().toISOString(), source: 'live-call', review, chains,
    };

    // End-of-call safety net: if the per-turn webhook path never fired (e.g. the
    // poller found this call), the red flags still get their urgent Task here.
    let taskWritten = false;
    if (review.redFlags.length) {
      taskWritten = await escalateRedFlags(review.redFlags, callId);
    }

    const ctx = await getMedplum();
    if (ctx) {
      wroteToMedplum = true;
      const written = await persistReview(ctx.medplum, ctx.patient, review);
      snapshot.patientId = ctx.patient.id;
      snapshot.patientLabel = patientLabel(ctx.patient);
      snapshot.written = {
        meds: written.meds.length, flags: written.flags.length,
        cascades: written.cascades.length, goals: written.goals.length,
        risk: Boolean(written.risk), task: taskWritten,
        resources: summarizeWritten(written),
      };
      console.log(
        `→ Medplum: MedicationStatement × ${written.meds.length}, Flag × ${written.flags.length}, ` +
        `DetectedIssue × ${written.cascades.length}, Goal × ${written.goals.length}` +
        `\n→ Open the console at Patient/${ctx.patient.id}`,
      );
    }

    saveSnapshot(snapshot);
    console.log('→ Review panel updated: http://localhost:3000/review');
  } catch (err) {
    // Un-mark the call so the poller can retry a transient failure (RxNav
    // timeout, Anthropic 429). Only when nothing was written yet: past that
    // point a retry would duplicate resources rather than repair anything.
    const retryable = Boolean(callId) && !wroteToMedplum;
    if (retryable) processedCalls.delete(callId!);
    console.error(
      `[pipeline] failed (${retryable ? 'will retry via poller' : 'not retrying, writes already started'}):`,
      err,
    );
  }
}

app.post('/vapi', async (req, res) => {
  // Ack immediately — Vapi retries slow webhooks, and nothing below is in the reply path.
  res.sendStatus(200);

  const msg = req.body?.message;

  // Per-turn red flag check. Do NOT wait for end of call for this.
  if (msg?.type === 'transcript' && msg.role === 'user') {
    const flags = checkRedFlags(msg.transcript ?? '');
    if (flags.length) void escalateRedFlags(flags, msg.call?.id);
    return;
  }

  if (msg?.type !== 'end-of-call-report') return;
  await runPipeline(msg.artifact?.transcript ?? '', msg.call?.id, 'webhook');
});

/**
 * Tunnel-free fallback: poll the Vapi API for ended calls and run the pipeline on
 * their stored transcripts. Free tunnels (localtunnel, localhost.run) drop at will;
 * this path needs only OUTBOUND https, so the demo works even if the webhook never
 * arrives. The webhook remains the fast path (and the only per-turn red-flag path);
 * processedCalls dedupes the two.
 */
const serverStart = Date.now();
async function pollVapiCalls() {
  if (!process.env.VAPI_API_KEY) return;
  try {
    const res = await fetch('https://api.vapi.ai/call?limit=5', {
      headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
    });
    if (!res.ok) return;
    const calls: any[] = await res.json();
    for (const c of calls) {
      if (c?.status !== 'ended' || processedCalls.has(c.id)) continue;
      if (!c.endedAt || new Date(c.endedAt).getTime() < serverStart) continue;
      const transcript = c.artifact?.transcript ?? '';
      if (transcript) await runPipeline(transcript, c.id, 'poller');
    }
  } catch {
    // Offline or rate-limited — try again next tick.
  }
}
setInterval(pollVapiCalls, 10_000);

app.get('/review', (_req, res) => res.type('html').send(renderReviewHtml(currentSnapshot())));
app.get('/review.json', (_req, res) => res.json(currentSnapshot()));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Webhook listening on http://localhost:${PORT}/vapi`);
  console.log(`Expose it:  npx localtunnel --port ${PORT}`);
});

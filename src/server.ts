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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import express from 'express';
import { MedplumClient } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { extractWithRetry } from './llm/extract.js';
import { resolveAll } from './rxnav.js';
import { runReview, detectCascadeChains } from './engine/detect.js';
import { checkRedFlags } from './voice/prompt.js';
import { persistReview } from './fhir/writers.js';
import { DEMO_CONDITIONS, DEMO_DURATIONS, seedDemoPatient } from './fhir/seed.js';
import { renderReviewHtml, type ReviewSnapshot } from './ui/panel.js';

const PORT = Number(process.env.PORT ?? 3000);
const SNAPSHOT_PATH = 'out/last-review.json';

// The review panel shows the most recent run — live call or canned demo.
let lastSnapshot: ReviewSnapshot | null = existsSync(SNAPSHOT_PATH)
  ? JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
  : null;

function saveSnapshot(snap: ReviewSnapshot) {
  lastSnapshot = snap;
  mkdirSync('out', { recursive: true });
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snap, null, 2));
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

app.post('/vapi', async (req, res) => {
  // Ack immediately — Vapi retries slow webhooks, and nothing below is in the reply path.
  res.sendStatus(200);

  const msg = req.body?.message;

  // Per-turn red flag check. Do NOT wait for end of call for this.
  if (msg?.type === 'transcript' && msg.role === 'user') {
    const flags = checkRedFlags(msg.transcript ?? '');
    if (flags.length) console.warn('⚠ RED FLAG:', flags.join('; '));
    return;
  }

  if (msg?.type !== 'end-of-call-report') return;

  try {
    const transcript = msg.artifact?.transcript ?? '';
    console.log(`\n[call ended] transcript: ${transcript.length} chars — running pipeline`);

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

    const ctx = await getMedplum();
    if (ctx) {
      const written = await persistReview(ctx.medplum, ctx.patient, review);
      snapshot.patientId = ctx.patient.id;
      snapshot.written = {
        meds: written.meds.length, flags: written.flags.length,
        cascades: written.cascades.length, goals: written.goals.length,
        risk: Boolean(written.risk),
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
    console.error('[pipeline] failed:', err);
  }
});

app.get('/review', (_req, res) => res.type('html').send(renderReviewHtml(lastSnapshot)));
app.get('/review.json', (_req, res) => res.json(lastSnapshot));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Webhook listening on http://localhost:${PORT}/vapi`);
  console.log(`Expose it:  npx localtunnel --port ${PORT}`);
});

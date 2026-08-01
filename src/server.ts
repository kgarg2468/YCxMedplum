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
import { randomUUID } from 'node:crypto';
import express from 'express';
import { MedplumClient } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { extractWithRetry } from './llm/extract.js';
import { resolveAll } from './rxnav.js';
import { runReview, detectCascadeChains } from './engine/detect.js';
import { checkRedFlags } from './voice/prompt.js';
import { persistReview, summarizeWritten, writeRedFlagTask, writeRedFlagFlag } from './fhir/writers.js';
import { DEMO_CONDITIONS, DEMO_DURATIONS, seedDemoPatient, patientLabel } from './fhir/seed.js';
import { renderReviewHtml, type ReviewSnapshot } from './ui/panel.js';
import { runSentinel } from './moss/redflags.js';
import { warmSentinel } from './moss/session.js';
import { classOfLexicalReason } from './moss/concepts.js';
import type { RedFlagClass, RedFlagVerdict, SentinelResult } from './moss/types.js';

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

// Memoised. Two callers can now race for it (the per-turn red-flag path and the
// end-of-call pipeline), and two concurrent first callers must not both seed a
// second demo patient. A failed login clears the memo so the next call retries.
let medplumInit: Promise<{ medplum: MedplumClient; patient: Patient } | null> | null = null;

async function getMedplum(): Promise<{ medplum: MedplumClient; patient: Patient } | null> {
  medplumInit ??= initMedplum().catch((err) => { medplumInit = null; throw err; });
  return medplumInit;
}

async function initMedplum(): Promise<{ medplum: MedplumClient; patient: Patient } | null> {
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

// ─── Per-turn red-flag screening (Sentinel) ──────────────────────────────────
//
// `runSentinel` always runs `checkRedFlags` first and unconditionally, so what is
// ESCALATED on this path is a strict superset of what the server escalated before:
// with MOSS_MODE unset it is the same six regexes and nothing else. Everything here
// happens after the 200 has gone back to Vapi, so none of it is in the voice reply
// path.
//
// State is per call and bounded. A red flag is usually assembled across several quiet
// turns ("I had a bit of a fall." / "On Sunday." / "I caught my head on the tub."), so
// the screener needs the preceding turns, not just this one.
//
// TWO RULES ABOUT WHAT REACHES A CHART, both of them the result of measurement:
//
//  1. A FHIR Flag requires a VERIFIER-CONFIRMED class. Escalating to the console and
//     writing an active Flag with category "Urgent clinical review" onto a real
//     patient chart are different acts with different costs. The six regexes fire on
//     flat denials ("No chest pain, never, my heart's been fine all my life") and on
//     third-party attribution ("My mother had black stools before she went into
//     hospital"), measured at 2/32 on the benign fixture set, so a regex hit alone is
//     not evidence enough for a chart entry. runSentinel now builds a candidate for
//     lexical hits too, so in `on` mode a genuine regex hit still gets its Flag, it
//     just gets it on the same evidence as everything else. In `off` and `shadow`
//     there are no verdicts, so no Flag is written and behaviour is exactly what it
//     was before Sentinel existed: console plus the end-of-call panel.
//
//  2. IDENTITY IS THE CLASS, NEVER THE REASON STRING. Dedupe on the string put two
//     spellings of the suicidality alarm on one chart, and let a wrong-class
//     escalation on one turn plus the right class on the next write two Flags for one
//     fall. `RedFlagClass` is the key everywhere below.

const WINDOW_TURNS = 3;
/** Cap on tracked calls, so a call whose end-of-call report never arrives cannot leak. */
const MAX_TRACKED_CALLS = 20;
/** Cap on stored results per call. A long review is ~40 user turns. */
const MAX_TURNS_LOGGED = 200;

const turnBuffers = new Map<string, string[]>();
const sentinelLog = new Map<string, SentinelResult[]>();
/** Classes already persisted as a Flag for this call, so one class reaches the chart once. */
const flaggedClasses = new Map<string, Set<RedFlagClass>>();

function forgetCall(callId: string) {
  turnBuffers.delete(callId);
  sentinelLog.delete(callId);
  flaggedClasses.delete(callId);
}

function trackCall(callId: string) {
  if (turnBuffers.has(callId)) return;
  turnBuffers.set(callId, []);
  // Maps iterate in insertion order, so the first key is the oldest call.
  while (turnBuffers.size > MAX_TRACKED_CALLS) {
    const oldest = turnBuffers.keys().next().value;
    if (!oldest) break;
    forgetCall(oldest);
  }
}

let warnedNoCallId = false;

/**
 * The key all per-call state hangs off. A missing `msg.call.id` must NOT collapse into
 * a shared literal like 'unknown': that bucket is never cleared and is shared by every
 * caller, so one patient's escalation silently suppresses the next patient's Flag for
 * the same class, for the life of the process, and their words get mixed into one
 * rolling window.
 *
 * So an id-less turn gets a fresh unique key. It is screened and it escalates; it just
 * has no window and no dedupe. The worst case becomes a duplicate Flag rather than a
 * missing one, and duplicates are recoverable by a clinician where silence is not. The
 * LRU in trackCall bounds the throwaway keys.
 *
 * Vapi's documented `transcript` server message does not show a `call` object, so this
 * branch is not hypothetical: confirm against a real call before relying on the window.
 */
function callKey(callId: string | undefined): string {
  if (callId) return callId;
  if (!warnedNoCallId) {
    warnedNoCallId = true;
    console.warn(
      '[sentinel] transcript events carry no call.id: screening each turn in isolation'
      + ' (no rolling window, no per-call dedupe, duplicate Flags possible).',
    );
  }
  return `anon:${randomUUID()}`;
}

/**
 * Screen one finalised user turn. Never throws.
 *
 * runSentinel already swallows everything, but Express 4 does not catch a rejected
 * async handler and Node turns an unhandled rejection into a dead process. A voice
 * agent that hangs up mid-call because a red-flag check threw is worse than one that
 * never had the check, so the belt goes with the braces.
 */
async function screenTurn(callId: string, text: string) {
  try {
    await screen(callId, text);
  } catch (err) {
    console.error('[sentinel] turn screening failed:', err);
  }
}

async function screen(callId: string, text: string) {
  trackCall(callId);

  // Buffer BEFORE the await, not after. In `on` mode runSentinel takes 0.8s to 2.4s
  // whenever it verifies a candidate, and a turn arriving inside that window used to
  // see a buffer still missing its predecessor: the rolling window silently failed to
  // assemble in exactly the fast-short-turns case it exists for. buildWindow tolerates
  // the current turn already being the last element.
  const buffer = turnBuffers.get(callId) ?? [];
  buffer.push(text);
  const turns = buffer.slice(-WINDOW_TURNS);
  turnBuffers.set(callId, turns);

  const res = await runSentinel(text, turns);

  const log = sentinelLog.get(callId) ?? [];
  if (log.length < MAX_TURNS_LOGGED) log.push(res);
  sentinelLog.set(callId, log);

  if (!res.escalated.length) return;

  // The actuator, unchanged from main and deliberately still the first thing that
  // happens: it logs, and it creates the urgent Task a clinician queue picks up. What
  // changed is only its INPUT. It used to be handed `checkRedFlags(transcript)`; it is
  // now handed `res.escalated`, which is that same set unioned with whatever the
  // verifier confirmed. With MOSS_MODE unset the two are identical, so this is a pure
  // superset and the Task inherits the recall measured at 16/18 on held-out vernacular.
  //
  // An `anon:` key means the payload carried no call.id. Pass undefined rather than the
  // synthetic key: main's `escalatedCalls` has no eviction, so feeding it a fresh uuid
  // per turn would leak, and `undefined` already means "cannot identify the call, so
  // escalate rather than dedupe", which is the behaviour we want anyway.
  await escalateRedFlags(res.escalated, callId.startsWith('anon:') ? undefined : callId);

  // Rule 1: only a class the verifier actually checked and confirmed reaches a chart.
  const confirmed = res.verdicts.filter((v) => v.verifierRan && v.confirmed);
  if (!confirmed.length) return;

  // Rule 2: one Flag per CLASS per call. Without this, a patient who says "I hit my
  // head" and then answers three follow-up questions about it produces four Flags.
  const already = flaggedClasses.get(callId) ?? new Set<RedFlagClass>();
  flaggedClasses.set(callId, already);
  const fresh = confirmed.filter((v) => !already.has(v.candidate.cls));
  if (!fresh.length) return;

  // Mark AFTER the write succeeds, never before. Marking first meant one failed
  // Medplum write permanently consumed the class's single slot: a false positive at
  // turn 1 whose write failed would silently swallow a genuine crushing chest pain at
  // turn 12, with no retry and no second error line.
  // The window as the VERIFIER saw it, so the audit string and the ruling cannot
  // describe different text. Falls back to the local join only if a candidate is
  // somehow missing it.
  const windowText = fresh[0]?.candidate.windowText || turns.join(' ');
  if (await writeRedFlag(res, windowText, fresh)) {
    for (const v of fresh) already.add(v.candidate.cls);
  }
}

/**
 * The display string for a confirmed class: the regex's own wording when the regex
 * caught it too, otherwise the concept table's. One string per class, so the Flag,
 * the panel banner and the console line cannot disagree about what was escalated.
 */
function reasonFor(res: SentinelResult, cls: RedFlagClass): string {
  return res.lexical.find((r) => classOfLexicalReason(r) === cls)
    ?? res.candidates.find((c) => c.cls === cls)?.reason
    ?? cls;
}

/**
 * Write the escalation to Medplum as a Flag a clinician has to pick up. Returns true
 * only if the resource was actually created, because the caller uses that to decide
 * whether the class may be marked as handled.
 *
 * The audit detail travels with it: whoever opens this must be able to answer "why did
 * a machine escalate this?" without replaying the call. It carries the VERBATIM window
 * and the closed question that was asked, plus the verifier's quoted span. It does not
 * carry model prose: the verifier's free-text rationale was fabricating clinical detail
 * the patient never said, which is worse than no basis at all (see verifyRedFlag.ts).
 *
 * The try/catch is the enforcement point for "nothing propagates into the request
 * path": writeRedFlagFlag deliberately does not swallow its own errors.
 */
async function writeRedFlag(
  res: SentinelResult,
  windowText: string,
  verdicts: RedFlagVerdict[],
): Promise<boolean> {
  try {
    const ctx = await getMedplum();
    if (!ctx) return false;

    const reasons = verdicts.map((v) => reasonFor(res, v.candidate.cls));

    const detail = [
      `Patient said, verbatim, last ${WINDOW_TURNS} user turns: "${windowText}"`,
      `Lexical regex: ${res.lexical.length ? res.lexical.join('; ') : 'no match'}`,
      ...verdicts.map((v) =>
        `Verifier confirmed ${v.candidate.cls}. Question asked: "${v.candidate.question}"`
        + ` Evidence: ${v.rationale}`),
      `Sentinel mode: ${res.mode}`,
    ].join(' | ');

    const flag = await writeRedFlagFlag(ctx.medplum, ctx.patient, reasons, detail);
    console.log(`→ Medplum: Flag/${flag.id} (urgent clinical review)`);
    return true;
  } catch (err) {
    console.error('[red-flag] could not write Flag, will retry on the next turn:', err);
    return false;
  }
}

// ─── Urgent escalation to a clinician (FHIR Task) ───────────────────────────
//
// This is the ACTUATOR, and it is fed by screenTurn above rather than by
// checkRedFlags directly. The set it receives is `SentinelResult.escalated`, which
// is the six regexes unioned with whatever the verifier confirmed, so with
// MOSS_MODE unset it is byte-identical to the regex output and this path behaves
// exactly as it did before Sentinel existed.
//
// Two resources, deliberately, because they answer different questions. The Task is
// "somebody act on this now", one per call, and it fires on anything that escalated.
// The Flag written above is "here is the auditable basis", one per verifier-
// confirmed class, carrying the patient's verbatim words. A regex false positive
// ("No chest pain, never") therefore still raises the Task it always did, but does
// not put an evidence-bearing Flag on the chart.
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

    // What the per-turn screener saw. Fetched here rather than after the review so its
    // escalations can be unioned into review.redFlags: a Sentinel-only escalation
    // writes a Flag to Medplum, and the panel banner must not be able to disagree with
    // the chart about what was escalated. checkRedFlags catches none of the held-out
    // vernacular, so without this union the banner would depend on the end-of-call
    // extractor independently rediscovering the flag over the whole transcript.
    const screened = callId ? sentinelLog.get(callId) : undefined;
    const screenedFlags = (screened ?? []).flatMap((r) => r.escalated);

    const ex = await extractWithRetry(transcript);
    const meds = await resolveAll(ex.medications);
    const review = runReview({
      meds,
      symptoms: ex.symptoms,
      conditions: DEMO_CONDITIONS,
      values: ex.values,
      redFlags: [...new Set([...checkRedFlags(transcript), ...ex.red_flags, ...screenedFlags])],
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

    // The panel shows what was proposed, what the verifier ruled, and what escalated.
    if (screened?.length) snapshot.sentinel = screened;

    // End-of-call safety net: if the per-turn webhook path never fired (e.g. the
    // poller found this call), the red flags still get their urgent Task here.
    // `escalatedCalls` dedupes against the per-turn path, so a call that already
    // escalated mid-review does not get a second Task.
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
  } finally {
    // The snapshot has the screening record now; the per-call buffers are dead weight.
    // Not on the retryable path: a poller retry still wants the screening log, but it
    // re-screens nothing, so dropping the buffers here is safe either way.
    if (callId) forgetCall(callId);
  }
}

app.post('/vapi', async (req, res) => {
  // Ack immediately — Vapi retries slow webhooks, and nothing below is in the reply path.
  res.sendStatus(200);

  const msg = req.body?.message;

  // Per-turn red flag check. Do NOT wait for end of call for this.
  if (msg?.type === 'transcript' && msg.role === 'user') {
    // Vapi emits interim partials as well as one final per turn. Screening the
    // partials meant screening half-sentences ("I hit my"), logging the same flag
    // several times, and paying for it every keystroke of the ASR.
    //
    // The test is `=== 'partial'`, NOT `!== 'final'`. Absence of the field means
    // SCREEN, because nothing validates this third-party payload and a Vapi event
    // shape that omits transcriptType would otherwise skip checkRedFlags entirely,
    // which contradicts "the regexes always run first and unconditionally". Only skip
    // what is explicitly known to be an interim partial. A duplicate screen on a
    // re-sent final costs one verifier call and is deduped by class downstream; a
    // missed final costs the Task.
    if (msg.transcriptType === 'partial') return;
    // screenTurn runs checkRedFlags first and unconditionally, then unions in whatever
    // Sentinel confirms, and hands the result to escalateRedFlags. With MOSS_MODE unset
    // that set is exactly `checkRedFlags(transcript)`, so this path is behaviourally
    // identical to the two lines it replaces.
    await screenTurn(callKey(msg.call?.id), msg.transcript ?? '');
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
  // Moss's session() is a ~580ms cloud auth call. Pay it here, while nobody is on the
  // phone, never on a turn. No-op (and no network) when MOSS_MODE is off. Never rejects.
  void warmSentinel();
});

/**
 * Two servers, deliberately separate (SETUP.md § voice).
 *
 *   createWebhookApp  → the tunnelled, internet-facing surface. Exactly one
 *                       authenticated route (`POST /vapi`) plus a metadata-free
 *                       `/health`. The review panel and the start route are NOT
 *                       mounted here, so exposing the tunnel exposes nothing else.
 *   createLocalApp    → 127.0.0.1 only. Authenticated `POST /demo/start-call`
 *                       plus `/review` and `/review.json` for the operator.
 *
 * Vapi events consumed:
 *   `transcript`          per-turn red-flag check (do NOT wait for end of call)
 *   `end-of-call-report`  full pipeline: extract → reconcile → detect → persist
 *
 * Extraction runs after the call, never in the voice reply path.
 *
 * Everything external is injected (`ServerDependencies`) so the routes can be
 * tested with no Medplum, no Vapi, and no Anthropic credentials. Importing this
 * module opens no port and starts no interval: listeners and the poller start
 * only under direct execution.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import express, { type Express, type Request } from 'express';
import { MedplumClient } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { extractWithRetry, type ExtractOptions } from './llm/extract.js';
import { resolveAll } from './rxnav.js';
import { runReview, detectCascadeChains } from './engine/detect.js';
import { checkRedFlags } from './voice/prompt.js';
import { persistReview, writeRedFlagFlag, writeRedFlagTask, summarizeWritten } from './fhir/writers.js';
import { DEMO_CONDITIONS, DEMO_DURATIONS, DEMO_IDENTIFIER_SYSTEM, SYNTHETIC_TAG, patientLabel } from './fhir/seed.js';
import { loadChartContext } from './context/loadChartContext.js';
import { buildVoicePrefill } from './voice/buildPrefill.js';
import { compareMedicationState } from './context/compareMedicationState.js';
import { CallSessionStore, createOutboundCall, type VapiFetch } from './voice/callCoordinator.js';
import type {
  CallSession, InterviewContext, MedicationGap, PatientReportedMedication, PreparedReview,
  ReconciledMedicationState,
} from './context/types.js';
import type { Extraction, ResolvedMed, SpokenMed } from './types.js';
import { normaliseRedFlags, runSentinel } from './moss/redflags.js';
import { REDFLAG_REASONS } from './moss/concepts.js';
import { warmSentinel } from './moss/session.js';
import type { RedFlagClass, SentinelResult } from './moss/types.js';
import {
  renderReviewHtml,
  type ReviewSnapshot, type SnapshotChartMedication, type SnapshotGap,
} from './ui/panel.js';

const WEBHOOK_PORT = Number(process.env.PORT ?? 3000);
const REVIEW_PORT = Number(process.env.REVIEW_PORT ?? 3001);
const SNAPSHOT_PATH = 'out/last-review.json';

/** A syntactically safe FHIR id. Never enough on its own — see `isDemoPatient`. */
const PATIENT_ID_PATTERN = /^[A-Za-z0-9.-]{1,64}$/;
/** E.164. */
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const SENTINEL_WINDOW_TURNS = 3;
const sentinelTurns = new Map<string, string[]>();
const sentinelLog = new Map<string, SentinelResult[]>();
const sentinelFlagged = new Map<string, Set<RedFlagClass>>();

// ── dependency surface ──────────────────────────────────────────────────────

export interface ServerConfig {
  vapiApiKey?: string;
  vapiAssistantId?: string;
  vapiPhoneNumberId?: string;
  webhookSecret?: string;
  startSecret?: string;
  defaultCustomerNumber?: string;
}

export interface SnapshotStore {
  read(): ReviewSnapshot | null;
  save(snapshot: ReviewSnapshot): void;
}

export interface ServerDependencies {
  config: ServerConfig;
  sessions: CallSessionStore;
  /** Calls already handled by webhook or poller, so the two never double-run. */
  processedCalls: Set<string>;
  /** One urgent Task per call, even though red flags are checked every turn. */
  escalatedCalls: Set<string>;
  snapshots: SnapshotStore;
  getMedplum(): Promise<MedplumClient | null>;
  loadChart(medplum: MedplumClient, patientId: string): Promise<InterviewContext>;
  vapiFetch: VapiFetch;
  extract(transcript: string, options: ExtractOptions): Promise<Extraction>;
  resolveMeds(meds: SpokenMed[]): Promise<ResolvedMed[]>;
  persistReview: typeof persistReview;
  writeRedFlagTask: typeof writeRedFlagTask;
  now(): Date;
  /** Test seam: fires once a pipeline run reaches a terminal state. */
  onPipelineSettled?(callId: string | undefined, outcome: 'processed' | 'failed' | 'skipped'): void;
}

// ── snapshot store (file-backed, shared with the canned demo runner) ────────

/**
 * The review panel shows the most recent run — live call or canned demo. The
 * demo runner writes the same file from its own process, so re-read on mtime
 * change rather than caching forever: `npm run demo` must repaint the panel
 * without a server restart (that's the on-stage wifi-failure fallback).
 */
export function fileSnapshotStore(path = SNAPSHOT_PATH): SnapshotStore {
  let cached: ReviewSnapshot | null = null;
  let mtime = 0;
  return {
    read() {
      try {
        if (existsSync(path)) {
          const current = statSync(path).mtimeMs;
          if (current !== mtime) {
            cached = JSON.parse(readFileSync(path, 'utf8'));
            mtime = current;
          }
        }
      } catch { /* mid-write race — serve the cached one */ }
      return cached;
    },
    save(snapshot) {
      cached = snapshot;
      mkdirSync('out', { recursive: true });
      writeFileSync(path, JSON.stringify(snapshot, null, 2));
      mtime = statSync(path).mtimeMs;
    },
  };
}

let medplumClient: MedplumClient | null = null;

async function defaultGetMedplum(): Promise<MedplumClient | null> {
  if (!process.env.MEDPLUM_CLIENT_ID || !process.env.MEDPLUM_CLIENT_SECRET) {
    console.warn('[medplum] no credentials in .env — findings will print to console only');
    return null;
  }
  if (!medplumClient) {
    medplumClient = new MedplumClient({ baseUrl: process.env.MEDPLUM_BASE_URL });
    await medplumClient.startClientLogin(
      process.env.MEDPLUM_CLIENT_ID,
      process.env.MEDPLUM_CLIENT_SECRET,
    );
  }
  return medplumClient;
}

export function defaultDependencies(env: NodeJS.ProcessEnv = process.env): ServerDependencies {
  return {
    config: {
      vapiApiKey: env.VAPI_API_KEY,
      vapiAssistantId: env.VAPI_ASSISTANT_ID,
      vapiPhoneNumberId: env.VAPI_PHONE_NUMBER_ID,
      webhookSecret: env.VAPI_WEBHOOK_SECRET,
      startSecret: env.DEMO_START_SECRET,
      defaultCustomerNumber: env.DEMO_CUSTOMER_NUMBER,
    },
    sessions: new CallSessionStore(),
    processedCalls: new Set<string>(),
    escalatedCalls: new Set<string>(),
    snapshots: fileSnapshotStore(),
    getMedplum: defaultGetMedplum,
    loadChart: loadChartContext,
    vapiFetch: (url, init) => fetch(url, init),
    extract: (transcript, options) => extractWithRetry(transcript, options),
    resolveMeds: resolveAll,
    persistReview,
    writeRedFlagTask,
    now: () => new Date(),
  };
}

// ── authentication ──────────────────────────────────────────────────────────

/**
 * Constant-time bearer comparison over SHA-256 digests, so the fixed digest
 * length keeps `timingSafeEqual` from throwing on a length mismatch (which would
 * itself leak the secret's length).
 */
export function bearerMatches(header: string | undefined, secret: string): boolean {
  const provided = /^Bearer\s+(.+)$/.exec(header ?? '')?.[1];
  if (!provided) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

function authorized(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  return bearerMatches(req.header('authorization'), secret);
}

// ── the patient gate ────────────────────────────────────────────────────────

/**
 * A syntactically valid patient id is never enough. The record must carry both
 * the demo identifier system and the synthetic tag, which admits several
 * explicitly synthetic test patients and excludes every ordinary record.
 */
export function isDemoPatient(patient: Patient | null | undefined): boolean {
  if (!patient) return false;
  const hasIdentifier = (patient.identifier ?? []).some((i) => i.system === DEMO_IDENTIFIER_SYSTEM);
  const hasTag = (patient.meta?.tag ?? []).some(
    (t) => t.system === SYNTHETIC_TAG.system && t.code === SYNTHETIC_TAG.code,
  );
  return hasIdentifier && hasTag;
}

// ── reconciled pipeline ─────────────────────────────────────────────────────

/** Section 5's lossless `ResolvedMed` -> `PatientReportedMedication` direction. */
function toPatientReported(med: ResolvedMed): PatientReportedMedication {
  return {
    chartAlias: null,
    provenance: 'patient-reported',
    name: med.name_guess ?? med.spoken_as,
    ingredient: med.ingredient,
    rxcui: med.rxcui,
    strength: med.strength,
    frequency: med.frequency,
    indication: med.stated_indication,
    patientWords: med.spoken_as,
    extractionConfidence: med.confidence,
    otc: med.otc,
  };
}

/**
 * ...and back. A chart-confirmed medication carries `high` MATCH confidence — it
 * was joined by alias, not heard — and no fabricated verbatim quote.
 */
export function toResolvedMed(med: PatientReportedMedication): ResolvedMed {
  return {
    spoken_as: med.patientWords ?? med.name,
    name_guess: med.name,
    strength: med.strength,
    frequency: med.frequency,
    stated_indication: med.indication,
    otc: med.otc,
    confidence: med.provenance === 'chart-confirmed' ? 'high' : (med.extractionConfidence ?? 'low'),
    rxcui: med.rxcui,
    ingredient: med.ingredient,
    unresolved: !med.ingredient,
    provenance: med.provenance,
  };
}

/**
 * Build the normalized review once per call and freeze it in the session. Every
 * retry reuses it, so extraction never runs twice and the writer identities
 * stay stable.
 */
async function prepareReview(
  deps: ServerDependencies,
  transcript: string,
  session: CallSession | undefined,
  screenedFlags: string[] = [],
): Promise<PreparedReview> {
  const chartAliases = session ? Object.keys(session.aliasToChartKey) : [];
  const extraction = await deps.extract(transcript, { chartAliases });

  // Resolve what the patient said first, then reconcile it against the chart.
  const spoken = await deps.resolveMeds(extraction.medications);
  const reconciled = compareMedicationState(
    session?.context.medications ?? [],
    extraction.chart_medication_confirmations,
    spoken.map(toPatientReported),
  );

  const meds = reconciled.current.map(toResolvedMed);
  const review = runReview({
    meds,
    symptoms: extraction.symptoms,
    // Chart conditions when we have a chart; no invented durations for a real
    // patient — the canned constants stay for transcript-only runs.
    conditions: session ? session.context.conditions.map((c) => c.display) : DEMO_CONDITIONS,
    values: extraction.values,
    redFlags: normaliseRedFlags([...checkRedFlags(transcript), ...extraction.red_flags, ...screenedFlags]),
    durationsWeeks: session ? {} : DEMO_DURATIONS,
  });

  return {
    review,
    reconciled,
    concerns: extraction.medication_concerns,
    preparedAt: deps.now().toISOString(),
  };
}

// ── snapshot projection (presentation-only: no ids, no links, ever) ─────────

/**
 * What the patient actually answered for one charted medication. Silence is
 * `none`, never an assumption of current use — the panel's review-basis line is
 * built from these and must not overstate what was confirmed.
 */
function confirmationFor(
  alias: string,
  reconciled: ReconciledMedicationState,
): SnapshotChartMedication['confirmation'] {
  const gap = reconciled.gaps.find((g) => g.chartMedication?.alias === alias);
  if (gap?.confirmation) return gap.confirmation.useStatus;
  if (gap?.kind === 'use-unclear') return 'unclear';
  if (reconciled.current.some((m) => m.chartAlias === alias)) return 'taking-as-documented';
  return 'none';
}

function chartSummary(
  context: InterviewContext,
  reconciled: ReconciledMedicationState,
): { medications: SnapshotChartMedication[]; conditions: string[] } {
  return {
    medications: context.medications.map((m) => ({
      display: m.display,
      ingredient: m.ingredient,
      rxcui: m.rxcui,
      strength: m.strength,
      frequency: m.frequency,
      sourceDisplay: m.sourceDisplay,
      confirmation: confirmationFor(m.alias, reconciled),
    })),
    conditions: context.conditions.map((c) => c.display),
  };
}

/** The one line of detail that makes a gap actionable, without any identifier. */
function gapNote(gap: MedicationGap): string | undefined {
  const chart = gap.chartMedication;
  switch (gap.kind) {
    case 'strength-mismatch':
      return `chart ${chart?.strength ?? 'unrecorded'} · patient ${gap.confirmation?.reportedStrength ?? gap.patientMedication?.strength ?? 'unclear'}`;
    case 'frequency-mismatch':
      return `chart ${chart?.frequency ?? 'unrecorded'} · patient ${gap.confirmation?.reportedFrequency ?? gap.patientMedication?.frequency ?? 'unclear'}`;
    case 'patient-only':
      return gap.patientMedication?.patientWords ?? undefined;
    default:
      return chart?.sourceDisplay ? `recorded source: ${chart.sourceDisplay}` : undefined;
  }
}

function gapSummaries(reconciled: ReconciledMedicationState): SnapshotGap[] {
  return reconciled.gaps.map((g) => {
    const note = gapNote(g);
    return note ? { kind: g.kind, display: g.display, note } : { kind: g.kind, display: g.display };
  });
}

/**
 * Escalate red flags NOW — at the turn they were detected, not at end of call.
 * Creates an urgent FHIR Task a clinician queue can pick up. An unlinked call
 * has no patient to write against, so it logs and stops there.
 */
async function escalateRedFlags(
  deps: ServerDependencies,
  flags: string[],
  callId: string | undefined,
): Promise<boolean> {
  const key = callId ?? 'no-call-id';
  if (deps.escalatedCalls.has(key)) return true;
  console.warn('⚠ RED FLAG:', flags.join('; '));

  const session = deps.sessions.get(callId);
  if (!session) {
    console.warn('[redflag] unlinked call — logged only, no patient-specific write');
    return false;
  }
  try {
    const medplum = await deps.getMedplum();
    if (!medplum) return false;
    const task = await deps.writeRedFlagTask(medplum, session.patient, flags,
      { runId: callId ?? 'live-call' });
    deps.escalatedCalls.add(key);
    console.warn(`→ Urgent Task/${task.id} created for clinician`);
    return true;
  } catch (err) {
    console.error('[redflag] escalation failed:', err);
    return false;
  }
}

/** Semantic recall runs after the webhook is acknowledged and fails back to lexical checks. */
async function screenSentinelTurn(
  deps: ServerDependencies,
  callId: string | undefined,
  text: string,
): Promise<void> {
  const key = callId ?? `unlinked:${Date.now()}`;
  const turns = [...(sentinelTurns.get(key) ?? []), text].slice(-SENTINEL_WINDOW_TURNS);
  if (callId) sentinelTurns.set(key, turns);

  const result = await runSentinel(text, turns);
  if (callId) sentinelLog.set(key, [...(sentinelLog.get(key) ?? []), result].slice(-20));
  if (result.escalated.length) await escalateRedFlags(deps, result.escalated, callId);

  const confirmed = result.verdicts.filter((v) => v.verifierRan && v.confirmed);
  const session = deps.sessions.get(callId);
  if (!callId || !session || !confirmed.length) return;

  const handled = sentinelFlagged.get(callId) ?? new Set<RedFlagClass>();
  sentinelFlagged.set(callId, handled);
  const fresh = confirmed.filter((v) => !handled.has(v.candidate.cls));
  if (!fresh.length) return;

  try {
    const medplum = await deps.getMedplum();
    if (!medplum) return;
    const reasons = fresh.map((v) => REDFLAG_REASONS[v.candidate.cls].reason);
    const detail = [
      `Patient said, verbatim: "${fresh[0].candidate.windowText}"`,
      `Lexical regex: ${result.lexical.length ? result.lexical.join('; ') : 'no match'}`,
      ...fresh.map((v) => `Verifier confirmed ${v.candidate.cls}. Evidence: ${v.rationale}`),
      `Sentinel mode: ${result.mode}`,
    ].join(' | ');
    await writeRedFlagFlag(medplum, session.patient, reasons, detail, { runId: callId });
    for (const verdict of fresh) handled.add(verdict.candidate.cls);
  } catch (err) {
    console.error('[sentinel] could not write evidence Flag; the urgent Task remains:', err);
  }
}

async function runPipeline(
  deps: ServerDependencies,
  transcript: string,
  callId: string | undefined,
  via: string,
): Promise<void> {
  if (callId) {
    if (deps.processedCalls.has(callId)) {
      deps.onPipelineSettled?.(callId, 'skipped');
      return;
    }
    deps.processedCalls.add(callId);
  }

  const session = deps.sessions.get(callId);
  const screened = callId ? (sentinelLog.get(callId) ?? []) : [];
  try {
    console.log(`\n[call ended, via ${via}] transcript: ${transcript.length} chars — running pipeline`);

    // Freeze before any write. A retry reuses this exact review.
    const screenedFlags = screened.flatMap((result) => result.escalated);
    const prepared = session?.preparedReview ?? await prepareReview(deps, transcript, session, screenedFlags);
    if (session) session.preparedReview = prepared;
    const { review } = prepared;

    console.log(`${review.findings.length} findings, ACB ${review.acbScore}`);
    for (const f of review.findings) {
      console.log(`  [${f.severity}] ${f.kind}: ${f.implicated.join(' → ')}`);
    }
    const chains = detectCascadeChains(review.findings.filter((f) => f.kind === 'cascade'));
    for (const c of chains) console.log(`  ★ CHAIN: ${c.join(' → ')}`);

    const snapshot: ReviewSnapshot = {
      at: deps.now().toISOString(), source: 'live-call', review, chains,
      concerns: prepared.concerns.map((c) => ({
        medicationName: c.medicationName, patientWords: c.patientWords, intent: c.intent,
      })),
      gaps: gapSummaries(prepared.reconciled),
      ...(session
        ? {
            patientDisplay: patientLabel(session.patient),
            chart: chartSummary(session.context, prepared.reconciled),
          }
        : {}),
    };
    if (screened.length) snapshot.sentinel = screened;

    // End-of-call safety net: if the per-turn webhook path never fired (e.g. the
    // poller found this call), the red flags still get their urgent Task here.
    let taskWritten = false;
    if (review.redFlags.length) {
      taskWritten = await escalateRedFlags(deps, review.redFlags, callId);
    }

    const medplum = session ? await deps.getMedplum() : null;
    if (session && medplum) {
      // The Vapi call id is the run id, so a retry of this same call updates the
      // resources it already wrote instead of duplicating them.
      const written = await deps.persistReview(medplum, session.patient, review,
        { runId: callId ?? 'live-call' });
      snapshot.written = {
        meds: written.meds.length, flags: written.flags.length,
        cascades: written.cascades.length, goals: written.goals.length,
        risk: Boolean(written.risk), task: taskWritten,
        // Type, label and note only. The generated ids stay in Medplum: this
        // snapshot is rendered on a projector.
        resources: summarizeWritten(written).map(({ type, label, note }) => ({ type, label, note })),
      };
      console.log(
        `→ Medplum: MedicationStatement × ${written.meds.length}, Flag × ${written.flags.length}, ` +
        `DetectedIssue × ${written.cascades.length}, Goal × ${written.goals.length}`,
      );
    } else if (!session) {
      // Unlinked call: the panel may show the transcript-only review, but no
      // patient-specific resource is written against anybody's chart.
      console.warn('[pipeline] unlinked call — panel only, no patient-specific FHIR write');
    }

    deps.snapshots.save(snapshot);
    // Mark processed (session released) only once every write and the snapshot
    // succeeded. Failure keeps the session so the retry reuses it.
    deps.sessions.delete(callId);
    if (callId) {
      sentinelTurns.delete(callId);
      sentinelLog.delete(callId);
      sentinelFlagged.delete(callId);
    }
    console.log(`→ Review panel updated: http://127.0.0.1:${REVIEW_PORT}/review`);
    deps.onPipelineSettled?.(callId, 'processed');
  } catch (err) {
    // Un-mark the call so the poller can retry after a transient failure
    // (RxNav timeout, Anthropic 429, Medplum hiccup). The session — and the
    // frozen review inside it — is deliberately kept.
    if (callId) deps.processedCalls.delete(callId);
    console.error('[pipeline] failed (will retry via poller):', err);
    deps.onPipelineSettled?.(callId, 'failed');
  }
}

// ── the tunnelled app: one authenticated route, nothing else ────────────────

export function createWebhookApp(deps: ServerDependencies): Express {
  const app = express();
  app.use(express.json());

  app.post('/vapi', async (req, res) => {
    // Reject before acknowledgement and before any processing.
    if (!deps.config.webhookSecret) {
      res.sendStatus(503);
      return;
    }
    if (!authorized(req, deps.config.webhookSecret)) {
      res.sendStatus(401);
      return;
    }

    // Ack immediately — Vapi retries slow webhooks, and nothing below is in the
    // voice reply path.
    res.sendStatus(200);

    const msg = req.body?.message;

    // Per-turn red flag check. Do NOT wait for end of call for this.
    if (msg?.type === 'transcript' && msg.role === 'user') {
      if (msg.transcriptType === 'partial') return;
      await screenSentinelTurn(deps, msg.call?.id, msg.transcript ?? '');
      return;
    }

    if (msg?.type !== 'end-of-call-report') return;
    await runPipeline(deps, msg.artifact?.transcript ?? '', msg.call?.id, 'webhook');
  });

  // Metadata-free by design: this is the only other thing the tunnel exposes.
  app.get('/health', (_req, res) => { res.json({ ok: true }); });

  return app;
}

// ── the local app: operator-only, 127.0.0.1 ─────────────────────────────────

export function createLocalApp(deps: ServerDependencies): Express {
  const app = express();
  app.use(express.json());

  app.post('/demo/start-call', async (req, res) => {
    if (!deps.config.startSecret) {
      res.status(503).json({ error: 'start-call is not configured' });
      return;
    }
    if (!authorized(req, deps.config.startSecret)) {
      res.sendStatus(401);
      return;
    }

    const patientId = String(req.body?.patientId ?? '');
    const customerNumber = String(req.body?.customerNumber ?? deps.config.defaultCustomerNumber ?? '');
    if (!PATIENT_ID_PATTERN.test(patientId)) {
      res.status(400).json({ error: 'patientId is not a valid FHIR id' });
      return;
    }
    if (!PHONE_PATTERN.test(customerNumber)) {
      res.status(400).json({ error: 'customerNumber must be E.164' });
      return;
    }

    const { vapiApiKey, vapiAssistantId, vapiPhoneNumberId } = deps.config;
    if (!vapiApiKey || !vapiAssistantId || !vapiPhoneNumberId) {
      // Lazy: a missing Vapi id never stops the panel or the canned fallback.
      res.status(503).json({ error: 'Vapi is not configured on this server' });
      return;
    }

    try {
      const medplum = await deps.getMedplum();
      if (!medplum) {
        res.status(503).json({ error: 'Medplum is not configured on this server' });
        return;
      }

      // Authorization first: read the exact patient and refuse before any
      // external I/O unless the record is explicitly synthetic.
      let patient: Patient;
      try {
        patient = await medplum.readResource('Patient', patientId);
      } catch {
        res.status(404).json({ error: 'patient not found' });
        return;
      }
      if (!isDemoPatient(patient)) {
        res.status(403).json({ error: 'patient is not an explicitly synthetic demo record' });
        return;
      }

      const context = await deps.loadChart(medplum, patientId);
      const { variableValues, aliasToChartKey } = buildVoicePrefill(context);

      const { callId } = await createOutboundCall({
        apiKey: vapiApiKey,
        assistantId: vapiAssistantId,
        phoneNumberId: vapiPhoneNumberId,
        customerNumber,
        variableValues,
      }, deps.vapiFetch);

      deps.sessions.set(callId, { context, patient, aliasToChartKey, preparedReview: null });
      // Never log the token, the header, the number, or the chart itself.
      console.log(`[start-call] call ${callId} placed for ${context.patientDisplay} ` +
        `(${Object.keys(aliasToChartKey).length} current chart medications)`);
      res.json({ callId });
    } catch (err) {
      console.error('[start-call] failed:', err);
      res.status(502).json({ error: 'could not place the call' });
    }
  });

  app.get('/review', (_req, res) => { res.type('html').send(renderReviewHtml(deps.snapshots.read())); });
  app.get('/review.json', (_req, res) => { res.json(deps.snapshots.read()); });

  return app;
}

// ── tunnel-free fallback poller ─────────────────────────────────────────────

/**
 * Poll the Vapi API for ended calls and run the pipeline on their stored
 * transcripts. Free tunnels drop at will; this path needs only OUTBOUND https,
 * so the demo works even if the webhook never arrives. The webhook remains the
 * fast path (and the only per-turn red-flag path); `processedCalls` dedupes them.
 */
export async function pollVapiCalls(deps: ServerDependencies, since: number): Promise<void> {
  if (!deps.config.vapiApiKey) return;
  try {
    const res = await deps.vapiFetch('https://api.vapi.ai/call?limit=5', {
      method: 'GET',
      headers: { Authorization: `Bearer ${deps.config.vapiApiKey}` },
      body: '',
    });
    if (!res.ok) return;
    const parsed: unknown = JSON.parse(await res.text());
    const calls = Array.isArray(parsed) ? parsed : [];
    for (const c of calls) {
      if (c?.status !== 'ended' || deps.processedCalls.has(c.id)) continue;
      if (!c.endedAt || new Date(c.endedAt).getTime() < since) continue;
      const transcript = c.artifact?.transcript ?? '';
      if (transcript) await runPipeline(deps, transcript, c.id, 'poller');
    }
  } catch {
    // Offline or rate-limited — try again next tick.
  }
}

// ── direct execution only ───────────────────────────────────────────────────

export function startServers(deps: ServerDependencies = defaultDependencies()) {
  const webhook = createWebhookApp(deps).listen(WEBHOOK_PORT, () => {
    console.log(`Webhook listening on http://localhost:${WEBHOOK_PORT}/vapi`);
    console.log(`Expose it:  npx localtunnel --port ${WEBHOOK_PORT}`);
  });
  const local = createLocalApp(deps).listen(REVIEW_PORT, '127.0.0.1', () => {
    console.log(`Review panel: http://127.0.0.1:${REVIEW_PORT}/review  (local only)`);
  });
  const since = Date.now();
  const poller = setInterval(() => void pollVapiCalls(deps, since), 10_000);
  void warmSentinel();
  return { webhook, local, poller };
}

// pathToFileURL, not string concatenation — this repository path contains a space.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServers();
}

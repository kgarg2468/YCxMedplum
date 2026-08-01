/**
 * Server tests — offline. Every external system is injected: Medplum is a
 * structural stub, Vapi is an injected fetch, extraction is a local function.
 * Each app is bound to port 0 and closed in `finally`, so importing the server
 * opens no fixed port and starts no interval.
 */

import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import type { MedplumClient } from '@medplum/core';
import type { Patient, Task } from '@medplum/fhirtypes';
import {
  createWebhookApp, createLocalApp, type ServerDependencies, type ServerConfig,
} from './server.js';
import { CallSessionStore } from './voice/callCoordinator.js';
import type { InterviewContext } from './context/types.js';
import type { Extraction, ResolvedMed, SpokenMed } from './types.js';
import type { ReviewSnapshot } from './ui/panel.js';
import { SYNTHETIC_TAG, DEMO_IDENTIFIER_SYSTEM } from './fhir/seed.js';
import { persistReview as realPersistReview } from './fhir/writers.js';

// ── fixtures ────────────────────────────────────────────────────────────────

const SYNTHETIC: Patient = {
  resourceType: 'Patient',
  id: 'synthetic-1',
  identifier: [{ system: DEMO_IDENTIFIER_SYSTEM, value: 'patient-margaret-okonkwo' }],
  meta: { tag: [SYNTHETIC_TAG] },
  name: [{ given: ['Margaret'], family: 'Okonkwo' }],
};

const SYNTHETIC_2: Patient = {
  ...SYNTHETIC,
  id: 'synthetic-2',
  identifier: [{ system: DEMO_IDENTIFIER_SYSTEM, value: 'patient-two' }],
  name: [{ given: ['Ada'], family: 'Nwosu' }],
};

/** Valid-looking id, but no demo identifier and no synthetic tag. */
const ORDINARY: Patient = {
  resourceType: 'Patient',
  id: 'ordinary-1',
  name: [{ given: ['Real'], family: 'Person' }],
};

function chartContext(patientId: string, display: string): InterviewContext {
  return {
    patientId,
    patientDisplay: display,
    loadedAt: '2026-08-01T00:00:00.000Z',
    medications: [{
      alias: 'M1',
      resourceType: 'MedicationRequest',
      resourceId: `${patientId}-mr-1`,
      display: 'oxybutynin 5 mg',
      ingredient: 'oxybutynin',
      rxcui: '32675',
      strength: '5 mg',
      frequency: 'three times daily',
      status: 'active',
      isCurrent: true,
      sourceReference: 'Practitioner/urology',
      sourceDisplay: 'Urology — Dr. Samuel Reed',
      authoredOn: '2026-01-01',
    }],
    conditions: [{ resourceId: 'c1', display: 'overactive bladder', code: null, clinicalStatus: 'active' }],
  };
}

const CONFIG: ServerConfig = {
  vapiApiKey: 'vapi-key',
  vapiAssistantId: 'asst_1',
  vapiPhoneNumberId: 'phone_1',
  webhookSecret: 'webhook-secret',
  startSecret: 'start-secret',
  defaultCustomerNumber: '+15550100',
};

interface Harness {
  deps: ServerDependencies;
  vapiCalls: { url: string; body: any }[];
  extractCalls: string[];
  persisted: { patientId: string | undefined; runId?: string }[];
  redFlagTasks: { patientId: string | undefined; flags: string[] }[];
  snapshots: ReviewSnapshot[];
  settled: { callId: string | undefined; outcome: string }[];
  reads: string[];
  chartLoads: string[];
  waitForSettles(n: number): Promise<void>;
}

function harness(overrides: Partial<ServerDependencies> & {
  patients?: Patient[];
  persistFails?: () => boolean;
  vapiResponse?: { ok?: boolean; status?: number; body?: unknown };
} = {}): Harness {
  const patients = overrides.patients ?? [SYNTHETIC, SYNTHETIC_2, ORDINARY];
  const vapiCalls: Harness['vapiCalls'] = [];
  const extractCalls: string[] = [];
  const persisted: Harness['persisted'] = [];
  const redFlagTasks: Harness['redFlagTasks'] = [];
  const snapshots: ReviewSnapshot[] = [];
  const settled: Harness['settled'] = [];
  const reads: string[] = [];
  const chartLoads: string[] = [];
  const waiters: (() => void)[] = [];
  let callSeq = 0;

  const medplum = {
    readResource: async (_type: string, id: string) => {
      reads.push(id);
      const hit = patients.find((p) => p.id === id);
      if (!hit) throw new Error('not found');
      return hit;
    },
  } as unknown as MedplumClient;

  const deps: ServerDependencies = {
    config: CONFIG,
    sessions: new CallSessionStore(),
    processedCalls: new Set<string>(),
    escalatedCalls: new Set<string>(),
    snapshots: {
      read: () => snapshots[snapshots.length - 1] ?? null,
      save: (snap) => { snapshots.push(snap); },
    },
    getMedplum: async () => medplum,
    loadChart: async (_m, patientId) => {
      chartLoads.push(patientId);
      return chartContext(patientId, patientId === SYNTHETIC.id ? 'Margaret Okonkwo' : 'Ada Nwosu');
    },
    vapiFetch: async (url, init) => {
      vapiCalls.push({ url, body: init.body ? JSON.parse(init.body) : null });
      const response = overrides.vapiResponse ?? {};
      const body = response.body ?? { id: `call_${++callSeq}` };
      return {
        ok: response.ok ?? true,
        status: response.status ?? 201,
        text: async () => JSON.stringify(body),
      };
    },
    extract: async (transcript, options) => {
      extractCalls.push(transcript);
      const aliases = options.chartAliases ?? [];
      const extraction: Extraction = {
        medications: [{
          spoken_as: 'just a Benadryl at night',
          name_guess: 'diphenhydramine',
          strength: null,
          frequency: 'at night',
          stated_indication: 'to help me sleep',
          otc: true,
          confidence: 'high',
        }],
        symptoms: [],
        values: ['stay in my own home'],
        red_flags: [],
        chart_medication_confirmations: aliases.map((chartAlias) => ({
          chartAlias,
          useStatus: 'taking-as-documented' as const,
          reportedStrength: null,
          reportedFrequency: null,
          indication: 'for my bladder',
        })),
        medication_concerns: [],
      };
      return extraction;
    },
    resolveMeds: async (meds: SpokenMed[]): Promise<ResolvedMed[]> => meds.map((m) => ({
      ...m,
      rxcui: m.name_guess ? '1049630' : null,
      ingredient: m.name_guess,
      unresolved: !m.name_guess,
      provenance: 'patient-reported' as const,
    })),
    persistReview: (async (_m: MedplumClient, patient: Patient, _review: unknown, options?: { runId: string }) => {
      if (overrides.persistFails?.()) throw new Error('injected FHIR failure');
      persisted.push({ patientId: patient.id, runId: options?.runId });
      return { meds: [], flags: [], risk: null, cascades: [], goals: [] };
    }) as unknown as ServerDependencies['persistReview'],
    writeRedFlagTask: (async (_m: MedplumClient, patient: Patient, flags: string[]) => {
      redFlagTasks.push({ patientId: patient.id, flags });
      return { resourceType: 'Task', id: 'task-1' } as Task;
    }) as unknown as ServerDependencies['writeRedFlagTask'],
    now: () => new Date('2026-08-01T12:00:00.000Z'),
    onPipelineSettled: (callId, outcome) => {
      settled.push({ callId, outcome });
      waiters.splice(0).forEach((w) => w());
    },
    ...overrides,
  };

  return {
    deps, vapiCalls, extractCalls, persisted, redFlagTasks, snapshots, settled, reads, chartLoads,
    async waitForSettles(n: number) {
      const deadline = Date.now() + 4000;
      while (settled.length < n && Date.now() < deadline) {
        await new Promise<void>((r) => { waiters.push(r); setTimeout(r, 20); });
      }
      assert.ok(settled.length >= n, `expected ${n} pipeline settles, saw ${settled.length}`);
    },
  };
}

async function withApp(app: Express, fn: (origin: string) => Promise<void>): Promise<void> {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

const endOfCall = (callId: string | undefined, transcript: string) => ({
  message: { type: 'end-of-call-report', call: callId ? { id: callId } : undefined, artifact: { transcript } },
});

// ── start route: authentication ─────────────────────────────────────────────
{
  const h = harness();
  await withApp(createLocalApp(h.deps), async (origin) => {
    const missing = await fetch(`${origin}/demo/start-call`, json({ patientId: SYNTHETIC.id }));
    assert.equal(missing.status, 401);

    const wrong = await fetch(`${origin}/demo/start-call`,
      json({ patientId: SYNTHETIC.id }, { Authorization: 'Bearer not-the-secret' }));
    assert.equal(wrong.status, 401);
  });
  // Rejected before any external I/O at all.
  assert.deepEqual(h.reads, []);
  assert.deepEqual(h.vapiCalls, []);
}

// ── start route: input validation ───────────────────────────────────────────
{
  const h = harness();
  const auth = { Authorization: 'Bearer start-secret' };
  await withApp(createLocalApp(h.deps), async (origin) => {
    for (const patientId of ['../etc/passwd', 'has space', 'x'.repeat(65), '']) {
      const res = await fetch(`${origin}/demo/start-call`, json({ patientId }, auth));
      assert.equal(res.status, 400, `patientId ${JSON.stringify(patientId)} should be rejected`);
    }
    for (const customerNumber of ['5550100', '+05550100', '+1555', 'not-a-number']) {
      const res = await fetch(`${origin}/demo/start-call`,
        json({ patientId: SYNTHETIC.id, customerNumber }, auth));
      assert.equal(res.status, 400, `customerNumber ${customerNumber} should be rejected`);
    }
  });
  assert.deepEqual(h.reads, []);
  assert.deepEqual(h.vapiCalls, []);
}

// ── start route: a valid-looking but non-synthetic patient is refused ───────
{
  const h = harness();
  await withApp(createLocalApp(h.deps), async (origin) => {
    const res = await fetch(`${origin}/demo/start-call`,
      json({ patientId: ORDINARY.id }, { Authorization: 'Bearer start-secret' }));
    assert.equal(res.status, 403);
  });
  assert.deepEqual(h.reads, [ORDINARY.id]);
  assert.deepEqual(h.chartLoads, [], 'no chart is loaded for an ineligible patient');
  assert.deepEqual(h.vapiCalls, [], 'no external call is placed for an ineligible patient');
  assert.equal(h.deps.sessions.size, 0);
}

// ── start route: missing Vapi configuration is a lazy 503, not a crash ──────
{
  const h = harness({ config: { ...CONFIG, vapiApiKey: undefined } });
  await withApp(createLocalApp(h.deps), async (origin) => {
    const res = await fetch(`${origin}/demo/start-call`,
      json({ patientId: SYNTHETIC.id }, { Authorization: 'Bearer start-secret' }));
    assert.equal(res.status, 503);
    // The review panel still serves from the same app.
    assert.equal((await fetch(`${origin}/review`)).status, 200);
  });
  assert.deepEqual(h.vapiCalls, []);
}

// ── start route: two eligible synthetic patients stay correctly associated ──
{
  const h = harness();
  await withApp(createLocalApp(h.deps), async (origin) => {
    const auth = { Authorization: 'Bearer start-secret' };
    const [a, b] = await Promise.all([
      fetch(`${origin}/demo/start-call`, json({ patientId: SYNTHETIC.id }, auth)),
      fetch(`${origin}/demo/start-call`, json({ patientId: SYNTHETIC_2.id }, auth)),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const bodyA = await a.json() as { callId: string };
    const bodyB = await b.json() as { callId: string };
    assert.notEqual(bodyA.callId, bodyB.callId);

    assert.equal(h.deps.sessions.size, 2);
    const sessionA = h.deps.sessions.get(bodyA.callId);
    const sessionB = h.deps.sessions.get(bodyB.callId);
    assert.equal(sessionA?.patient.id, SYNTHETIC.id);
    assert.equal(sessionB?.patient.id, SYNTHETIC_2.id);
    assert.equal(sessionA?.context.patientId, SYNTHETIC.id);
    assert.equal(sessionB?.context.patientId, SYNTHETIC_2.id);
    assert.equal(sessionA?.preparedReview, null);
    assert.deepEqual(Object.keys(sessionA?.aliasToChartKey ?? {}), ['M1']);
  });

  // Chart context reaches Vapi per call, in assistantOverrides.
  assert.equal(h.vapiCalls.length, 2);
  for (const call of h.vapiCalls) {
    assert.equal(call.url, 'https://api.vapi.ai/call');
    assert.equal(call.body.assistantId, 'asst_1');
    assert.ok(call.body.assistantOverrides.variableValues.prefill_json.includes('oxybutynin'));
    // No FHIR ids ever reach the voice platform.
    assert.equal(call.body.assistantOverrides.variableValues.prefill_json.includes('mr-1'), false);
  }
  const names = h.vapiCalls.map((c) => c.body.assistantOverrides.variableValues.patient_name).sort();
  assert.deepEqual(names, ['Ada Nwosu', 'Margaret Okonkwo']);
}

// ── webhook authentication ──────────────────────────────────────────────────
{
  const h = harness({ extract: async () => { throw new Error('extraction must not run'); } });
  await withApp(createWebhookApp(h.deps), async (origin) => {
    const missing = await fetch(`${origin}/vapi`, json(endOfCall('call_x', 'Patient: hello')));
    assert.equal(missing.status, 401);

    const wrong = await fetch(`${origin}/vapi`,
      json(endOfCall('call_x', 'Patient: hello'), { Authorization: 'Bearer wrong' }));
    assert.equal(wrong.status, 401);
  });
  assert.deepEqual(h.extractCalls, []);
  assert.deepEqual(h.settled, []);
}

// ── public-surface isolation ────────────────────────────────────────────────
{
  const h = harness();
  await withApp(createWebhookApp(h.deps), async (origin) => {
    assert.equal((await fetch(`${origin}/review`)).status, 404);
    assert.equal((await fetch(`${origin}/review.json`)).status, 404);
    assert.equal((await fetch(`${origin}/demo/start-call`,
      json({ patientId: SYNTHETIC.id }, { Authorization: 'Bearer start-secret' }))).status, 404);

    const health = await fetch(`${origin}/health`);
    assert.equal(health.status, 200);
    // Metadata-free: nothing about the patient, the call, or the build.
    assert.deepEqual(await health.json(), { ok: true });
  });
  await withApp(createLocalApp(h.deps), async (origin) => {
    assert.equal((await fetch(`${origin}/vapi`,
      json(endOfCall('call_x', 'hi'), { Authorization: 'Bearer webhook-secret' }))).status, 404);
    assert.equal((await fetch(`${origin}/review.json`)).status, 200);
  });
  assert.deepEqual(h.extractCalls, []);
}

// ── end of call: writes to the session's patient, then releases the session ─
{
  const h = harness();
  const auth = { Authorization: 'Bearer start-secret' };
  await withApp(createLocalApp(h.deps), async (origin) => {
    const started = await fetch(`${origin}/demo/start-call`, json({ patientId: SYNTHETIC_2.id }, auth));
    const { callId } = await started.json() as { callId: string };

    await withApp(createWebhookApp(h.deps), async (webhookOrigin) => {
      const res = await fetch(`${webhookOrigin}/vapi`,
        json(endOfCall(callId, 'Patient: yes I take them all'), { Authorization: 'Bearer webhook-secret' }));
      assert.equal(res.status, 200);
      await h.waitForSettles(1);
    });

    assert.deepEqual(h.persisted.map((p) => p.patientId), [SYNTHETIC_2.id]);
    assert.equal(h.deps.sessions.get(callId), undefined, 'session released after a clean run');
    assert.equal(h.snapshots.length, 1);
    assert.equal(h.snapshots[0].source, 'live-call');
    // Chart-confirmed oxybutynin survives a plain "yes" without being restated.
    const ingredients = h.snapshots[0].review.meds.map((m) => m.ingredient);
    assert.ok(ingredients.includes('oxybutynin'), 'confirmed chart medication stays in review');
    assert.ok(ingredients.includes('diphenhydramine'), 'newly reported medication is added');
  });
}

// ── webhook/poller race: one pipeline run per call id ───────────────────────
{
  const h = harness();
  const auth = { Authorization: 'Bearer start-secret' };
  await withApp(createLocalApp(h.deps), async (origin) => {
    const started = await fetch(`${origin}/demo/start-call`, json({ patientId: SYNTHETIC.id }, auth));
    const { callId } = await started.json() as { callId: string };

    await withApp(createWebhookApp(h.deps), async (webhookOrigin) => {
      await Promise.all([
        fetch(`${webhookOrigin}/vapi`, json(endOfCall(callId, 'Patient: yes'), { Authorization: 'Bearer webhook-secret' })),
        fetch(`${webhookOrigin}/vapi`, json(endOfCall(callId, 'Patient: yes'), { Authorization: 'Bearer webhook-secret' })),
      ]);
      await h.waitForSettles(1);
      await new Promise((r) => setTimeout(r, 50));
    });
  });
  assert.equal(h.extractCalls.length, 1, 'extraction runs once per call id');
  assert.equal(h.persisted.length, 1);
}

// ── injected failure keeps the session and reuses the frozen review ─────────
{
  let fail = true;
  const h = harness({ persistFails: () => fail });
  const auth = { Authorization: 'Bearer start-secret' };
  await withApp(createLocalApp(h.deps), async (origin) => {
    const started = await fetch(`${origin}/demo/start-call`, json({ patientId: SYNTHETIC.id }, auth));
    const { callId } = await started.json() as { callId: string };

    await withApp(createWebhookApp(h.deps), async (webhookOrigin) => {
      const post = () => fetch(`${webhookOrigin}/vapi`,
        json(endOfCall(callId, 'Patient: yes'), { Authorization: 'Bearer webhook-secret' }));

      await post();
      await h.waitForSettles(1);
      assert.equal(h.settled[0].outcome, 'failed');
      const kept = h.deps.sessions.get(callId);
      assert.ok(kept, 'session is retained after a failed run');
      assert.ok(kept?.preparedReview, 'review is frozen before the first write');
      const preparedAt = kept!.preparedReview!.preparedAt;

      fail = false;
      await post();
      await h.waitForSettles(2);

      assert.equal(h.extractCalls.length, 1, 'a retry never reruns extraction');
      assert.equal(h.persisted.length, 1);
      assert.equal(h.persisted[0].patientId, SYNTHETIC.id);
      assert.equal(h.deps.sessions.get(callId), undefined, 'session released after the retry succeeds');
      assert.ok(preparedAt, 'the frozen review carried its own timestamp');
    });
  });
}

// ── unlinked call: panel may update, patient data may not ──────────────────
{
  const h = harness();
  await withApp(createWebhookApp(h.deps), async (origin) => {
    const res = await fetch(`${origin}/vapi`,
      json(endOfCall('call_never_started', 'Patient: I take a water pill'),
        { Authorization: 'Bearer webhook-secret' }));
    assert.equal(res.status, 200);
    await h.waitForSettles(1);
  });
  assert.deepEqual(h.persisted, [], 'an unlinked call writes no patient-specific FHIR');
  assert.deepEqual(h.redFlagTasks, []);
  assert.equal(h.snapshots.length, 1, 'the panel still shows the transcript-only review');
}

// ── red flags escalate per turn, to the session patient ────────────────────
{
  const h = harness();
  const auth = { Authorization: 'Bearer start-secret' };
  await withApp(createLocalApp(h.deps), async (origin) => {
    const started = await fetch(`${origin}/demo/start-call`, json({ patientId: SYNTHETIC_2.id }, auth));
    const { callId } = await started.json() as { callId: string };

    await withApp(createWebhookApp(h.deps), async (webhookOrigin) => {
      await fetch(`${webhookOrigin}/vapi`, json({
        message: { type: 'transcript', role: 'user', transcript: 'I had chest pain this morning', call: { id: callId } },
      }, { Authorization: 'Bearer webhook-secret' }));
      await new Promise((r) => setTimeout(r, 60));
    });
  });
  assert.equal(h.redFlagTasks.length, 1, 'red flags are checked per turn, not at end of call');
  assert.equal(h.redFlagTasks[0].patientId, SYNTHETIC_2.id);
}

// ── end-to-end idempotency: partial writer failure, then retry ─────────────
{
  // The real writers against a structural Medplum stub, driven through the real
  // end-of-call route: extraction must run once and every identifier stays unique.
  const store = new Map<string, any>();
  const created: any[] = [];
  let seq = 0;
  const keyOf = (r: any) => `${r.resourceType}|${r.identifier?.[0]?.value ?? ''}`;
  const fhir = {
    readResource: async (_t: string, id: string) => (id === SYNTHETIC.id ? SYNTHETIC : SYNTHETIC_2),
    searchResources: async (resourceType: string, query: Record<string, string>) => {
      const found = store.get(`${resourceType}|${(query.identifier ?? '').split('|').slice(1).join('|')}`);
      return found ? [found] : [];
    },
    createResource: async (r: any) => {
      const withId = { ...r, id: `${r.resourceType}-${++seq}` };
      store.set(keyOf(withId), withId);
      created.push(withId);
      return withId;
    },
    updateResource: async (r: any) => { store.set(keyOf(r), r); return r; },
  } as unknown as MedplumClient;

  let failAt: number | null = 2;
  const h = harness({
    getMedplum: async () => fhir,
    persistReview: (async (m: MedplumClient, patient: Patient, review: any, options: any) =>
      realPersistReview(m, patient, review, {
        ...options,
        beforeWrite: (ordinal: number) => {
          if (ordinal === failAt) throw new Error('injected partial FHIR failure');
        },
      })) as unknown as ServerDependencies['persistReview'],
  });

  const auth = { Authorization: 'Bearer start-secret' };
  await withApp(createLocalApp(h.deps), async (origin) => {
    const started = await fetch(`${origin}/demo/start-call`, json({ patientId: SYNTHETIC.id }, auth));
    const { callId } = await started.json() as { callId: string };

    await withApp(createWebhookApp(h.deps), async (webhookOrigin) => {
      const post = () => fetch(`${webhookOrigin}/vapi`,
        json(endOfCall(callId, 'Patient: yes, and a Benadryl at night'),
          { Authorization: 'Bearer webhook-secret' }));

      await post();
      await h.waitForSettles(1);
      assert.equal(h.settled[0].outcome, 'failed');
      const partial = created.length;
      assert.ok(partial >= 1, 'at least one write landed before the failure');

      failAt = null;
      await post();
      await h.waitForSettles(2);
      assert.equal(h.settled[1].outcome, 'processed');
    });

    assert.equal(h.extractCalls.length, 1, 'extraction ran exactly once across the retry');
    const values = [...store.values()].map((r) => r.identifier?.[0]?.value);
    assert.equal(values.filter(Boolean).length, values.length);
    assert.equal(new Set(values).size, values.length, 'no duplicate output identifiers after retry');
    assert.ok(values.every((v: string) => v.startsWith(`${callId}:`)), 'the run id is the Vapi call id');
    assert.equal(h.deps.sessions.get(callId), undefined);
  });
}

console.log('server tests passed');

/**
 * Coordinator tests — offline. No Vapi key, no network: the HTTP call is an
 * injected fetch function, never a globally monkey-patched `fetch`.
 */

import assert from 'node:assert/strict';
import type { Patient } from '@medplum/fhirtypes';
import {
  VAPI_CALL_URL, createOutboundCall, CallSessionStore, type VapiFetch,
} from './callCoordinator.js';
import type { CallSession, InterviewContext } from '../context/types.js';

function recordingFetch(response: { ok?: boolean; status?: number; body?: unknown }): {
  fetchFn: VapiFetch;
  calls: { url: string; init: { method?: string; headers?: Record<string, string>; body?: string } }[];
} {
  const calls: { url: string; init: any }[] = [];
  const fetchFn: VapiFetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 201,
      text: async () => JSON.stringify(response.body ?? {}),
    };
  };
  return { fetchFn, calls };
}

const request = {
  apiKey: 'test-key',
  assistantId: 'asst_1',
  phoneNumberId: 'phone_1',
  customerNumber: '+15550100',
  variableValues: { patient_name: 'Margaret', prefill_json: '{"context_status":"x"}' },
};

// ── exact URL, headers, and body ────────────────────────────────────────────
{
  const { fetchFn, calls } = recordingFetch({ body: { id: 'call_abc' } });
  const result = await createOutboundCall(request, fetchFn);

  assert.equal(result.callId, 'call_abc');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, VAPI_CALL_URL);
  assert.equal(calls[0].url, 'https://api.vapi.ai/call');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers?.Authorization, 'Bearer test-key');
  assert.equal(calls[0].init.headers?.['Content-Type'], 'application/json');

  const body = JSON.parse(calls[0].init.body as string);
  assert.deepEqual(body, {
    assistantId: 'asst_1',
    phoneNumberId: 'phone_1',
    customer: { number: '+15550100' },
    assistantOverrides: {
      variableValues: { patient_name: 'Margaret', prefill_json: '{"context_status":"x"}' },
    },
  });
  // Chart context travels per call (assistantOverrides), never top-level.
  assert.equal('variableValues' in body, false);
}

// ── a response without a usable call id is a failure, not a session ─────────
for (const bad of [{}, { id: '' }, { id: 42 }]) {
  const { fetchFn } = recordingFetch({ body: bad });
  await assert.rejects(() => createOutboundCall(request, fetchFn), /call id/i);
}

// ── non-2xx never yields a call id, and never leaks the key ────────────────
{
  const { fetchFn } = recordingFetch({ ok: false, status: 401, body: { message: 'nope' } });
  await assert.rejects(
    () => createOutboundCall(request, fetchFn),
    (err: Error) => /401/.test(err.message) && !err.message.includes('test-key'),
  );
}

// ── session store: two simultaneous calls stay distinct ────────────────────
function session(patientId: string): CallSession {
  const context: InterviewContext = {
    patientId,
    patientDisplay: `Patient ${patientId}`,
    loadedAt: '2026-08-01T00:00:00.000Z',
    medications: [],
    conditions: [],
  };
  return {
    context,
    patient: { resourceType: 'Patient', id: patientId } as Patient,
    aliasToChartKey: {},
    preparedReview: null,
  };
}

{
  const store = new CallSessionStore();
  store.set('call_a', session('patient-a'));
  store.set('call_b', session('patient-b'));

  assert.equal(store.size, 2);
  assert.equal(store.get('call_a')?.patient.id, 'patient-a');
  assert.equal(store.get('call_b')?.patient.id, 'patient-b');
  assert.equal(store.get('call_missing'), undefined);

  // Failure retention is the default: a session only disappears when deleted
  // by the run that finished successfully.
  store.delete('call_a');
  assert.equal(store.get('call_a'), undefined);
  assert.equal(store.get('call_b')?.patient.id, 'patient-b');
  assert.equal(store.size, 1);
}

console.log('callCoordinator tests passed');

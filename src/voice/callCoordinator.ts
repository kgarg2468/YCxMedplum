/**
 * OUTBOUND CALL COORDINATION.
 *
 * Two jobs, both deliberately free of Express, Medplum, and process.env so they
 * can be tested with no credentials and no network:
 *
 *  1. Build and send the Vapi create-call request. Chart context rides in
 *     `assistantOverrides.variableValues` — per call, never stored on the shared
 *     assistant, because the context belongs to one patient and one call.
 *     Verified against https://docs.vapi.ai/api-reference/calls/create on
 *     2026-08-01: `POST https://api.vapi.ai/call`.
 *  2. Hold the per-call session (chart context + the exact Patient the call was
 *     placed for) so the end-of-call pipeline writes to the right chart, and so
 *     two simultaneous calls can never cross-contaminate.
 *
 * The HTTP client is injected. Nothing here reads a global `fetch`, so tests
 * never monkey-patch one.
 */

import type { CallSession } from '../context/types.js';

/** Verified 2026-08-01 against Vapi's current API reference. */
export const VAPI_CALL_URL = 'https://api.vapi.ai/call';

export interface VapiFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type VapiFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<VapiFetchResponse>;

export interface OutboundCallRequest {
  apiKey: string;
  assistantId: string;
  phoneNumberId: string;
  /** E.164. Never logged in full. */
  customerNumber: string;
  variableValues: { patient_name: string; prefill_json: string };
}

export interface OutboundCallResult {
  callId: string;
}

/** The documented create-call payload. Shape is asserted in the tests. */
export function buildOutboundCallBody(req: OutboundCallRequest): Record<string, unknown> {
  return {
    assistantId: req.assistantId,
    phoneNumberId: req.phoneNumberId,
    customer: { number: req.customerNumber },
    assistantOverrides: { variableValues: req.variableValues },
  };
}

export async function createOutboundCall(
  req: OutboundCallRequest,
  fetchFn: VapiFetch,
): Promise<OutboundCallResult> {
  const res = await fetchFn(VAPI_CALL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildOutboundCallBody(req)),
  });

  const text = await res.text();
  if (!res.ok) {
    // Status and Vapi's own message only — never the key or the number.
    throw new Error(`Vapi call creation failed with ${res.status}: ${text.slice(0, 300)}`);
  }

  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error('Vapi call creation returned a body that is not JSON; no call id');
  }

  const id = (parsed as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !id) {
    // No id means no session key, and a session-less call cannot be associated
    // with a patient later. Fail loudly instead of storing a broken session.
    throw new Error('Vapi call creation returned no usable call id');
  }
  return { callId: id };
}

/**
 * In-memory session lifecycle, keyed by Vapi call id.
 *
 * Retention is the default: a session is removed only by the pipeline run that
 * completed every write. A failed run keeps its session so the retry reuses the
 * same frozen review and the same patient.
 */
export class CallSessionStore {
  private readonly sessions = new Map<string, CallSession>();

  set(callId: string, session: CallSession): void {
    this.sessions.set(callId, session);
  }

  get(callId: string | undefined): CallSession | undefined {
    return callId ? this.sessions.get(callId) : undefined;
  }

  delete(callId: string | undefined): void {
    if (callId) this.sessions.delete(callId);
  }

  get size(): number {
    return this.sessions.size;
  }
}

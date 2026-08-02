/**
 * Anthropic client.
 *
 * Two things that differ from older tutorials and will cost you time if you miss them:
 *
 *  1. Structured outputs are GA via `output_config.format` (the old beta
 *     `output_format` + `structured-outputs-2025-11-13` header still work during a
 *     transition period, but use the new shape).
 *     Docs: https://docs.claude.com/en/docs/build-with-claude/structured-outputs
 *
 *  2. Response prefilling is NOT supported on Claude 4.6+ models. The old
 *     "prefill the assistant turn with `{`" trick to force JSON is dead. Use
 *     structured outputs instead.
 *
 *  3. Current-generation models reject non-default sampling parameters, so do not
 *     pass `temperature`. Determinism comes from the schema + from keeping clinical
 *     logic out of the model entirely (see engine/detect.ts), not from temperature 0.
 *
 * Schema constraints: objects need `additionalProperties: false`, no recursive
 * schemas, and numeric/string-length constraints are not supported.
 */

import Anthropic from '@anthropic-ai/sdk';

let memo: Anthropic | null = null;

/**
 * Lazy + memoised. Constructing the SDK eagerly at import time throws when
 * ANTHROPIC_API_KEY is unset, which would make the offline engine and mapping
 * tests unrunnable just for importing a module that never calls the model.
 * Construction is deferred to the first real request instead.
 */
export function getClient(): Anthropic {
  if (!memo) memo = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return memo;
}

/** Fast model for the live voice loop — latency is the whole UX. */
export const VOICE_MODEL = 'claude-haiku-4-5-20251001';
/** Stronger model for extraction and clinical prose — 2-3s here is invisible. */
export const REASONING_MODEL = 'claude-sonnet-5';

export interface JsonCallOptions {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  model?: string;
  maxTokens?: number;
}

/** Schema-constrained JSON call. Returns parsed output typed as T. */
export async function callJson<T>(opts: JsonCallOptions): Promise<T> {
  const res = await getClient().messages.create({
    model: opts.model ?? REASONING_MODEL,
    max_tokens: opts.maxTokens ?? 4000,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
    // @ts-expect-error — output_config may lag the installed SDK typings.
    output_config: { format: { type: 'json_schema', schema: opts.schema } },
  });

  if (res.stop_reason === 'refusal') {
    throw new Error('Model refused the request');
  }
  if (res.stop_reason === 'max_tokens') {
    throw new Error('Truncated before schema completion — raise max_tokens');
  }

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return JSON.parse(text) as T;
}

/** Plain prose call, for explanation text. */
export async function callText(opts: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const res = await getClient().messages.create({
    model: opts.model ?? REASONING_MODEL,
    max_tokens: opts.maxTokens ?? 1000,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

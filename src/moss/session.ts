/**
 * SENTINEL: Moss lifecycle.
 *
 * This module owns exactly one thing: getting a warm, seeded Moss session into
 * existence, or deciding once and for all that there isn't going to be one.
 *
 * Three measured facts shape every line here:
 *
 *  1. `client.session()` is a CLOUD AUTH call and cost 582ms cold. `addDocs` and
 *     `query` are then 10.8ms and ~2ms, in-process. So the entire cost of Sentinel
 *     is the first construction, which is why `warmSentinel()` exists and is called
 *     at server boot. Nothing on a request path may ever be the thing that builds
 *     the session: a voice turn cannot afford half a second of auth.
 *
 *  2. Failure must be terminal, not retried. If Moss is down, or the keys are
 *     missing, or the model won't load, then retrying on every turn buys nothing
 *     and costs a timeout per turn on the one path where latency is the product.
 *     So: one attempt, one log line, `null` forever after. The caller degrades to
 *     `checkRedFlags` alone, which is exactly today's behaviour.
 *
 *  3. `MOSS_MODE` defaults to `off`, and in `off` we do not construct a client,
 *     do not read the keys, and do not touch the network. Sentinel is opt-in.
 *
 * This file never queries and never reads `.score`. Moss's score is a
 * reciprocal-rank artefact whose tail is byte-identical for a real match and for
 * nonsense (see the header of ./types.ts); the only signal Sentinel takes is which
 * partition the top-1 doc came from, and that read lives in the matcher, not here.
 *
 * `pushIndex()` is never called. It uploads the session to the cloud, and the
 * concept table is a local, versioned, reviewable artefact in ./concepts.ts. The
 * moment it also lives in a mutable cloud index, nobody can say what the detector
 * actually matched against.
 */

import { mkdirSync } from 'node:fs';
import { MossClient, type SessionIndex } from '@moss-dev/moss';
import type { DocumentInfo } from '@moss-dev/moss';
import type { MossMode } from './types.js';
import { CONCEPT_DOCS } from './concepts.js';

// Set before any client is constructed. Moss otherwise persists a per-device id and
// phones home; this is a health context and a hackathon demo, neither wants that.
process.env.MOSS_DISABLE_TELEMETRY ??= '1';

/** Logical name of the session index. Local only, never pushed to the cloud. */
const SESSION_NAME = 'sentinel-redflags';

/**
 * Only used to contain any stray on-disk write (the telemetry device id) under the
 * repo's gitignored `out/` rather than the user's home. We deliberately do NOT
 * `saveToDisk`/`loadFromDisk`: the concept table is a handful of short docs and
 * re-embeds in ~11ms, so a disk cache would add a staleness failure mode (a stale
 * cached copy of a concept table someone has since edited) to save nothing.
 */
const CACHE_PATH = 'out/moss-cache';

/**
 * Ceiling on the whole construction (auth + model warm + seed). Measured cold path
 * is ~600ms, so 8s is "something is genuinely wrong", not "the network is slow".
 */
const BUILD_TIMEOUT_MS = 8_000;

// ─── Mode ──────────────────────────────────────────────────────────────────────

const MODES: readonly string[] = ['off', 'shadow', 'on'];

let warnedBadMode = false;

/**
 * Reads `MOSS_MODE` fresh every call (tests flip it, and it must be cheap enough
 * that nobody is tempted to cache it). Anything unrecognised is `off`: the safe
 * direction for an unknown value is "behave exactly like today".
 */
export function mossMode(): MossMode {
  const raw = (process.env.MOSS_MODE ?? '').trim().toLowerCase();
  if (!raw) return 'off';
  if (MODES.includes(raw)) return raw as MossMode;
  if (!warnedBadMode) {
    warnedBadMode = true;
    console.warn(`[sentinel] MOSS_MODE="${raw}" is not one of off|shadow|on, treating as off`);
  }
  return 'off';
}

// ─── Session lifecycle ─────────────────────────────────────────────────────────

let client: MossClient | null = null;
let session: SessionIndex | null = null;
/** The memo. Resolves to `null` once and stays resolved to `null`. */
let pending: Promise<SessionIndex | null> | null = null;
/** Sticky kill switch: set on any failure so we never attempt construction twice. */
let disabled = false;

/**
 * The memoised accessor. Returns `null` immediately in `off` mode and `null`
 * forever after any failure. Never throws: callers on the request path must be
 * able to write `const s = await getSentinelSession(); if (!s) return;`.
 */
export async function getSentinelSession(): Promise<SessionIndex | null> {
  if (mossMode() === 'off') return null;
  if (disabled) return null;
  pending ??= buildSession();
  return pending;
}

/**
 * Fire-and-forget boot warmer. Call once at server start so the 582ms cold auth is
 * paid while nobody is on the phone. Resolves rather than rejects on failure; the
 * failure has already been logged and latched by then.
 */
export async function warmSentinel(): Promise<void> {
  const mode = mossMode();
  if (mode === 'off') return;
  const t0 = Date.now();
  const s = await getSentinelSession();
  if (s) {
    console.log(
      `[sentinel] moss ready in ${Date.now() - t0}ms (mode=${mode}, ${s.docCount} concept docs, model=${s.modelId})`,
    );
  }
}

/** Test hook: release native handles and clear the memo so mode changes take effect. */
export async function closeSentinel(): Promise<void> {
  const inflight = pending;
  pending = null;
  disabled = false;
  warnedBadMode = false;
  try { await inflight; } catch { /* already logged */ }
  await teardown();
}

// ─── Construction ──────────────────────────────────────────────────────────────

async function buildSession(): Promise<SessionIndex | null> {
  let build: Promise<SessionIndex> | null = null;
  let timer: NodeJS.Timeout | undefined;
  try {
    build = openSession();
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`construction exceeded ${BUILD_TIMEOUT_MS}ms`)),
        BUILD_TIMEOUT_MS,
      );
      // Never let the warm-up hold the process open on its own.
      timer.unref?.();
    });
    return await Promise.race([build, deadline]);
  } catch (err) {
    // One log line, then silence. Latch first so a concurrent caller cannot retry.
    disabled = true;
    console.warn(
      `[sentinel] moss unavailable, falling back to lexical red flags only: ${(err as Error).message}`,
    );
    // The timeout does not cancel the work in flight, so reap whatever lands late.
    void reap(build);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function openSession(): Promise<SessionIndex> {
  const projectId = process.env.MOSS_PROJECT_ID;
  const projectKey = process.env.MOSS_PROJECT_KEY;
  if (!projectId || !projectKey) {
    throw new Error('MOSS_PROJECT_ID / MOSS_PROJECT_KEY are not set');
  }

  mkdirSync(CACHE_PATH, { recursive: true });

  const c = new MossClient(projectId, projectKey, { cachePath: CACHE_PATH });
  client = c;
  const s = await c.session(SESSION_NAME);
  session = s;

  // `session()` already pre-loads the embedding model, but the guarantee is
  // internal and undocumented. Paying it explicitly here is idempotent and keeps
  // the first real query off the cold path even if that behaviour changes.
  await s._warmModel?.();

  // Metadata values must be strings, and are the ONLY thing the matcher reads:
  // `kind` decides red flag vs decoy, `cls` names the flag. Mapped explicitly
  // rather than spread so the string-map constraint is visible at the call site.
  const docs: DocumentInfo[] = CONCEPT_DOCS.map((d) => ({
    id: d.id,
    text: d.text,
    metadata: { kind: d.metadata.kind, cls: d.metadata.cls },
  }));
  await s.addDocs(docs, { upsert: true });

  return s;
}

/** Close a session that arrived after we had already given up on it. */
async function reap(build: Promise<SessionIndex> | null): Promise<void> {
  try { await build; } catch { /* the reason we are here */ }
  await teardown();
}

async function teardown(): Promise<void> {
  const s = session;
  const c = client;
  session = null;
  client = null;
  try { await s?.close(); } catch { /* best effort */ }
  try { await c?.close(); } catch { /* best effort */ }
}

/**
 * SENTINEL: offline safety and baseline test.
 *
 * Runs with MOSS_MODE unset and no API keys. Nothing here touches the network: in
 * `off` mode `runSentinel` never constructs a MossClient and never calls a model, and
 * that is itself one of the properties under test.
 *
 * Two jobs, and they are different in kind:
 *
 *  1. SAFETY. The three invariants that let this ship at all, asserted over all 54
 *     fixtures: `lexical` is always a subset of `escalated`; `off` mode is byte-for-byte
 *     today's behaviour (no candidates, no verdicts, escalated deep-equals lexical); and
 *     the untouched regex path still escalates every phrasing it escalated before.
 *
 *  2. MEASUREMENT. It prints the regex recall on held-out vernacular. That number is
 *     the whole reason Sentinel exists, and printing it means the claim is measured
 *     rather than asserted. It also prints the lexical path's own false-positive count
 *     on NEGATIVES, which is two flat denials that contain the denied word. Sentinel
 *     cannot fix those, because it only ever unions in. Reporting the baseline honestly
 *     including its misses is the point.
 *
 * This is a tsx script in the style of src/test/engine.test.ts, but unlike that one it
 * ASSERTS: node:assert, and a non-zero exit on any failure.
 */

import assert from 'node:assert/strict';
import { normaliseRedFlags, runSentinel } from '../moss/redflags.js';
import { getSentinelSession, mossMode } from '../moss/session.js';
import { classOfLexicalReason } from '../moss/concepts.js';
import { checkRedFlags, RED_FLAG_PATTERNS } from '../voice/prompt.js';
import type { SentinelResult } from '../moss/types.js';
import { POSITIVES, NEGATIVES, LEXICAL_CONTROL } from './fixtures/redflag-phrasings.js';

// The test is about the default. Anything inherited from a shell would invalidate it.
delete process.env.MOSS_MODE;

const isSubset = (a: string[], b: string[]) => a.every((x) => b.includes(x));

let checks = 0;
function check(label: string, fn: () => void) {
  fn();
  checks++;
  console.log(`  ok  ${label}`);
}

async function checkAsync(label: string, fn: () => Promise<void>) {
  await fn();
  checks++;
  console.log(`  ok  ${label}`);
}

async function main() {
  console.log('\nSENTINEL offline test (MOSS_MODE unset, no keys)\n');

  // ─── 1. Mode ───────────────────────────────────────────────────────────────
  check("MOSS_MODE unset resolves to 'off'", () => {
    assert.equal(mossMode(), 'off');
  });

  // The direct proof that off means off: no client is constructed, so there is nothing
  // that could have made a network call or read a key.
  await checkAsync('off mode: no Moss session is ever constructed', async () => {
    assert.equal(await getSentinelSession(), null);
  });

  // ─── 2. Every fixture, in off mode ─────────────────────────────────────────
  // 54 utterances: 18 real red flags phrased indirectly, 32 benign, 4 literal.
  const all: { text: string; group: string }[] = [
    ...POSITIVES.map((p) => ({ text: p.text, group: 'POSITIVES' })),
    ...NEGATIVES.map((t) => ({ text: t, group: 'NEGATIVES' })),
    ...LEXICAL_CONTROL.map((t) => ({ text: t, group: 'LEXICAL_CONTROL' })),
  ];

  // Two preceding turns of realistic filler, so the rolling window is exercised rather
  // than every call getting a single-turn window.
  const PRECEDING = ['Yes, now is a good time.', 'That is the water tablet, forty milligrams.'];

  const results = new Map<string, SentinelResult>();
  for (const { text } of all) {
    results.set(text, await runSentinel(text, PRECEDING));
  }

  check(`off mode: no candidates and no verdicts on any of ${all.length} fixtures`, () => {
    for (const { text, group } of all) {
      const r = results.get(text)!;
      assert.equal(r.mode, 'off', `${group}: mode should be off for "${text}"`);
      assert.deepEqual(r.candidates, [], `${group}: Moss must not run in off mode: "${text}"`);
      assert.deepEqual(r.verdicts, [], `${group}: no verifier in off mode: "${text}"`);
      assert.equal(r.mossMs, null, `${group}: no Moss timing in off mode: "${text}"`);
    }
  });

  check('off mode: escalated deep-equals lexical on every fixture', () => {
    for (const { text, group } of all) {
      const r = results.get(text)!;
      assert.deepEqual(r.escalated, r.lexical, `${group}: off mode changed behaviour on "${text}"`);
    }
  });

  check('INVARIANT: lexical is a subset of escalated on every fixture', () => {
    for (const { text, group } of all) {
      const r = results.get(text)!;
      assert.ok(isSubset(r.lexical, r.escalated), `${group}: lexical escaped escalated on "${text}"`);
    }
  });

  check('the lexical path is byte-identical to calling checkRedFlags directly', () => {
    for (const { text, group } of all) {
      assert.deepEqual(results.get(text)!.lexical, checkRedFlags(text), `${group}: "${text}"`);
    }
  });

  // ─── 2b. Class identity ────────────────────────────────────────────────────
  // Everything downstream (the escalated union, the per-call Flag dedupe, the panel's
  // "caught by" column) keys on RedFlagClass rather than on the reason string, because
  // the suicidality reason in prompt.ts and the one in concepts.ts differ by one
  // character. That only works if every regex reason resolves to a class, so a silent
  // failure of the probe-based mapping would reintroduce the duplicate alarm.
  check(`every one of the ${RED_FLAG_PATTERNS.length} regex reasons resolves to a class`, () => {
    for (const { reason } of RED_FLAG_PATTERNS) {
      assert.ok(classOfLexicalReason(reason), `unmapped lexical reason: "${reason}"`);
    }
    const classes = RED_FLAG_PATTERNS.map((r) => classOfLexicalReason(r.reason));
    assert.equal(new Set(classes).size, RED_FLAG_PATTERNS.length, 'two reasons mapped to one class');
  });

  check('the suicidality reason resolves despite differing from the concept table', () => {
    const suicidal = RED_FLAG_PATTERNS.map((r) => r.reason)
      .find((r) => r.startsWith('Suicidal statement'));
    assert.ok(suicidal, 'the suicidality reason string moved');
    assert.equal(classOfLexicalReason(suicidal), 'suicidality');
  });

  // ─── 3. The untouched regex path still fires ───────────────────────────────
  check(`LEXICAL_CONTROL: all ${LEXICAL_CONTROL.length} still escalate through the regexes`, () => {
    for (const text of LEXICAL_CONTROL) {
      const r = results.get(text)!;
      assert.ok(r.lexical.length > 0, `checkRedFlags stopped matching: "${text}"`);
      assert.ok(r.escalated.length > 0, `escalation was lost: "${text}"`);
    }
  });

  // ─── 4. The measured gap ───────────────────────────────────────────────────
  const caught = POSITIVES.filter((p) => checkRedFlags(p.text).length > 0);
  check(`POSITIVES: the regexes catch none of the ${POSITIVES.length} held-out phrasings`, () => {
    assert.equal(
      caught.length, 0,
      `expected 0 regex hits on held-out vernacular, got ${caught.length}: ` +
      caught.map((c) => `"${c.text}"`).join(', '),
    );
  });

  // Baseline property, not a Sentinel result: two NEGATIVES are flat denials that
  // contain the denied word, so the regexes fire on them. Sentinel only unions in, so
  // it cannot remove them. Asserted so the number cannot drift unnoticed.
  const falsePositives = NEGATIVES.filter((t) => checkRedFlags(t).length > 0);
  check('NEGATIVES: the lexical baseline has exactly 2 known false positives', () => {
    assert.equal(
      falsePositives.length, 2,
      `lexical false positives changed: ${falsePositives.map((t) => `"${t}"`).join(', ')}`,
    );
  });

  check('normaliseRedFlags collapses equivalent source wording by clinical class', () => {
    assert.deepEqual(
      normaliseRedFlags([
        'Fall with head injury',
        'suicidal statement: "The wish I did not wake up this morning."',
        'fall with head injury: "On Sunday, I cracked my head on the bathtub."',
        'Suicidal statement, escalate to a human immediately',
      ]),
      [
        'Fall with head injury',
        'Suicidal statement, escalate to a human immediately',
      ],
    );
  });

  check('normaliseRedFlags preserves an unrecognised warning verbatim', () => {
    assert.deepEqual(
      normaliseRedFlags(['  Caregiver reports a new safety concern  ']),
      ['Caregiver reports a new safety concern'],
    );
  });

  // ─── Measurement ───────────────────────────────────────────────────────────
  const byClass = new Map<string, { hit: number; n: number }>();
  for (const p of POSITIVES) {
    const b = byClass.get(p.cls) ?? { hit: 0, n: 0 };
    b.n++;
    if (checkRedFlags(p.text).length > 0) b.hit++;
    byClass.set(p.cls, b);
  }

  console.log(`\nregex recall on held-out vernacular: ${caught.length}/${POSITIVES.length}`);
  for (const [cls, b] of byClass) console.log(`  ${cls.padEnd(16)} ${b.hit}/${b.n}`);
  console.log(`regex recall on literal phrasings:  ${LEXICAL_CONTROL.length}/${LEXICAL_CONTROL.length}`);
  console.log(`lexical false positives on benign traffic: ${falsePositives.length}/${NEGATIVES.length}`);
  for (const t of falsePositives) console.log(`  "${t}" -> ${checkRedFlags(t).join('; ')}`);
  console.log(
    `\nThat gap is what Sentinel is for. Closing it is measured separately, with Moss`
    + ` running; this test only proves that turning Sentinel off changes nothing.`,
  );

  console.log(`\n${checks} checks passed.\n`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

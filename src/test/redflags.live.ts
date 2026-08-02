/**
 * SENTINEL: the live measurement. Needs real MOSS_* and ANTHROPIC_API_KEY.
 *
 *   MOSS_MODE=on npx tsx --env-file-if-exists=.env src/test/redflags.live.ts
 *
 * This is the number the whole feature stands or falls on, so it is measured rather
 * than asserted, and it is measured at BOTH stages, because the two stages fail in
 * opposite directions and an aggregate hides that:
 *
 *   STAGE 1, Moss. Recall net. Reported as "the correct class was proposed" on
 *   POSITIVES and "any candidate was raised at all" on NEGATIVES. Deliberately
 *   over-generating: a stage-1 hit on a benign turn is not a false positive yet, it is
 *   a question that gets asked.
 *
 *   STAGE 2, the verifier. Precision. Reported as what actually escalates and what
 *   would actually be written to a chart as a FHIR Flag.
 *
 * The lexical baseline is printed alongside, including its two known false positives,
 * because the honest comparison is against what ships today, not against zero.
 *
 * Nothing here reads `.score`. There is no score to read; see src/moss/types.ts.
 */

import { runSentinel } from '../moss/redflags.js';
import { closeSentinel, mossMode } from '../moss/session.js';
import { checkRedFlags } from '../voice/prompt.js';
import type { RedFlagClass, SentinelResult } from '../moss/types.js';
import { POSITIVES, NEGATIVES, LEXICAL_CONTROL } from './fixtures/redflag-phrasings.js';

/**
 * The same two filler turns the offline test uses, and the same two the server
 * produces after turn 2. Measuring with an empty window would flatter the result:
 * this is the configuration that actually runs in production.
 */
const PRECEDING = ['Yes, now is a good time.', 'That is the water tablet, forty milligrams.'];

/** Modest, so a rate limit does not get read as a recall failure. */
const CONCURRENCY = 4;

interface Row {
  text: string;
  group: 'POSITIVES' | 'NEGATIVES' | 'LEXICAL_CONTROL';
  cls?: RedFlagClass;
  res: SentinelResult;
  ms: number;
}

async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]!);
      }
    }),
  );
  return out;
}

/** Classes the verifier actually ran on and confirmed. This is the chart-write gate. */
const confirmedClasses = (r: SentinelResult): RedFlagClass[] =>
  r.verdicts.filter((v) => v.verifierRan && v.confirmed).map((v) => v.candidate.cls);

async function main() {
  const mode = mossMode();
  console.log(`\nSENTINEL live measurement (MOSS_MODE=${mode})\n`);
  if (mode !== 'on') {
    console.log('Set MOSS_MODE=on. In off/shadow nothing escalates and the number is meaningless.\n');
    return;
  }

  const items: { text: string; group: Row['group']; cls?: RedFlagClass }[] = [
    ...POSITIVES.map((p) => ({ text: p.text, group: 'POSITIVES' as const, cls: p.cls })),
    ...NEGATIVES.map((t) => ({ text: t, group: 'NEGATIVES' as const })),
    ...LEXICAL_CONTROL.map((t) => ({ text: t, group: 'LEXICAL_CONTROL' as const })),
  ];

  const t0 = Date.now();
  const rows: Row[] = await mapLimit(items, CONCURRENCY, async (it) => {
    const start = Date.now();
    const res = await runSentinel(it.text, PRECEDING);
    return { ...it, res, ms: Date.now() - start };
  });
  const wall = Date.now() - t0;

  const pos = rows.filter((r) => r.group === 'POSITIVES');
  const neg = rows.filter((r) => r.group === 'NEGATIVES');
  const ctl = rows.filter((r) => r.group === 'LEXICAL_CONTROL');

  // ─── POSITIVES ─────────────────────────────────────────────────────────────
  const posProposed = pos.filter((r) => r.res.candidates.some((c) => c.cls === r.cls));
  const posAnyCandidate = pos.filter((r) => r.res.candidates.length > 0);
  const posEscalated = pos.filter((r) => r.res.escalated.length > 0);
  const posRightClass = pos.filter((r) => confirmedClasses(r.res).includes(r.cls!));
  const posLexical = pos.filter((r) => checkRedFlags(r.text).length > 0);

  console.log(`POSITIVES (n=${pos.length}), real red flags in vernacular the regexes miss`);
  console.log(`  lexical baseline, escalated               ${posLexical.length}/${pos.length}`);
  console.log(`  stage 1 (Moss), any candidate raised      ${posAnyCandidate.length}/${pos.length}`);
  console.log(`  stage 1 (Moss), CORRECT class proposed    ${posProposed.length}/${pos.length}`);
  console.log(`  stage 2 (verifier), escalated at all      ${posEscalated.length}/${pos.length}`);
  console.log(`  stage 2 (verifier), CORRECT class         ${posRightClass.length}/${pos.length}`);

  const byClass = new Map<string, { hit: number; n: number }>();
  for (const r of pos) {
    const b = byClass.get(r.cls!) ?? { hit: 0, n: 0 };
    b.n++;
    if (confirmedClasses(r.res).includes(r.cls!)) b.hit++;
    byClass.set(r.cls!, b);
  }
  for (const [cls, b] of byClass) console.log(`      ${cls.padEnd(16)} ${b.hit}/${b.n}`);

  for (const r of pos.filter((x) => x.res.escalated.length === 0)) {
    console.log(`  MISS  "${r.text}"`);
    console.log(`        proposed: [${r.res.candidates.map((c) => c.cls).join(', ') || 'none'}]`);
  }

  // ─── NEGATIVES ─────────────────────────────────────────────────────────────
  const negLexical = neg.filter((r) => r.res.lexical.length > 0);
  const negCandidates = neg.filter((r) => r.res.candidates.length > 0);
  const negAdded = neg.filter((r) => r.res.escalated.length > r.res.lexical.length);
  const negFlagged = neg.filter((r) => confirmedClasses(r.res).length > 0);

  console.log(`\nNEGATIVES (n=${neg.length}), the traffic a medication review is made of`);
  console.log(`  lexical baseline false positives          ${negLexical.length}/${neg.length}`);
  console.log(`  stage 1 (Moss), candidates raised         ${negCandidates.length}/${neg.length}`);
  console.log(`  stage 2, NEW escalations added by Sentinel ${negAdded.length}/${neg.length}`);
  console.log(`  stage 2, turns that would write a Flag     ${negFlagged.length}/${neg.length}`);
  for (const r of negAdded) {
    console.log(`  ADDED "${r.text}" -> ${r.res.escalated.filter((e) => !r.res.lexical.includes(e)).join('; ')}`);
  }
  for (const r of negFlagged) {
    console.log(`  FLAG  "${r.text}" -> ${confirmedClasses(r.res).join(', ')}`);
  }

  // ─── LEXICAL_CONTROL ───────────────────────────────────────────────────────
  const ctlOk = ctl.filter((r) => r.res.escalated.length > 0);
  const ctlFlag = ctl.filter((r) => confirmedClasses(r.res).length > 0);
  console.log(`\nLEXICAL_CONTROL (n=${ctl.length}), phrasings the regexes already catch`);
  console.log(`  still escalated                           ${ctlOk.length}/${ctl.length}`);
  console.log(`  verifier-confirmed, so a Flag is written  ${ctlFlag.length}/${ctl.length}`);
  for (const r of ctl.filter((x) => confirmedClasses(x.res).length === 0)) {
    console.log(`  NO FLAG "${r.text}" -> escalated: ${r.res.escalated.join('; ') || 'none'}`);
  }

  // ─── Invariants, re-asserted against live data ─────────────────────────────
  const subsetBreaks = rows.filter((r) => !r.res.lexical.every((l) => r.res.escalated.includes(l)));
  const failOpen = rows.filter((r) =>
    r.res.verdicts.some((v) => !v.verifierRan && r.res.escalated.includes(v.candidate.reason)
      && !r.res.lexical.includes(v.candidate.reason)));
  console.log(`\nINVARIANTS over all ${rows.length} fixtures`);
  console.log(`  lexical is a subset of escalated          ${subsetBreaks.length === 0 ? 'HOLDS' : `BROKEN on ${subsetBreaks.length}`}`);
  console.log(`  verifierRan:false never escalated          ${failOpen.length === 0 ? 'HOLDS' : `BROKEN on ${failOpen.length}`}`);

  const lat = rows.map((r) => r.ms).sort((a, b) => a - b);
  const p = (q: number) => lat[Math.min(lat.length - 1, Math.floor(lat.length * q))];
  console.log(`\nlatency per screened turn: p50 ${p(0.5)}ms, p95 ${p(0.95)}ms, max ${lat[lat.length - 1]}ms`);
  console.log(`wall clock for ${rows.length} fixtures at concurrency ${CONCURRENCY}: ${wall}ms\n`);
}

main()
  .catch((err) => {
    console.error(`\nFAILED: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => closeSentinel());

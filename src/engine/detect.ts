/**
 * DETERMINISTIC DETECTION. No LLM anywhere in this file — on purpose.
 *
 * Every clinical judgement (is this a PIM? is this a cascade?) is a table lookup.
 * Consequences:
 *   1. Identical output on every rehearsal — the demo cannot surprise you on stage.
 *   2. No hallucinated drug interactions. This is the single biggest credibility risk
 *      in the build and the reason detection is not a prompt.
 *   3. Every finding carries a real citation, which is also what keeps the product
 *      inside FDA's Non-Device CDS "independently review the basis" criterion.
 */

import {
  PIM_RULES, ACB_SCORES, ACB_THRESHOLD, CASCADES, DUPLICATE_CLASSES,
} from '../data/knowledge.js';
import type { Finding, ResolvedMed, ReviewResult, ExtractedSymptom } from '../types.js';
import { splitCombination } from '../rxnav.js';

/** All ingredient keys present, expanded for combination products. */
function ingredientKeys(meds: ResolvedMed[]): Map<string, ResolvedMed> {
  const map = new Map<string, ResolvedMed>();
  for (const m of meds) {
    if (!m.ingredient) continue;
    for (const part of splitCombination(m.ingredient)) map.set(part, m);
  }
  return map;
}

function symptomMatches(symptoms: ExtractedSymptom[], keywords: string[]): string | null {
  const haystack = symptoms
    .map((s) => `${s.symptom} ${s.patient_words}`.toLowerCase())
    .join(' | ');
  for (const kw of keywords) {
    if (haystack.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

function conditionMatches(conditions: string[], needles: string[]): boolean {
  const hay = conditions.join(' ').toLowerCase();
  return needles.some((n) => hay.includes(n.toLowerCase()));
}

// ─── 1. Potentially inappropriate medications ────────────────────────────────

export function detectPims(
  meds: ResolvedMed[],
  conditions: string[],
  durationsWeeks: Record<string, number> = {},
): Finding[] {
  const keys = ingredientKeys(meds);
  const findings: Finding[] = [];

  for (const rule of PIM_RULES) {
    for (const ing of rule.ingredients) {
      if (!keys.has(ing)) continue;

      if (rule.durationWeeks !== undefined) {
        const used = durationsWeeks[ing];
        // Unknown duration on a duration-gated rule: flag as low severity for review
        // rather than either asserting or silently dropping it.
        if (used !== undefined && used < rule.durationWeeks) continue;
      }
      if (rule.requiresCondition && !conditionMatches(conditions, rule.requiresCondition)) continue;

      findings.push({
        kind: 'pim',
        implicated: [ing],
        severity: rule.severity,
        label: rule.label,
        citation: rule.citation,
      });
    }
  }
  return findings;
}

// ─── 2. Drug with no stated indication ───────────────────────────────────────

export function detectNoIndication(meds: ResolvedMed[], conditions: string[]): Finding[] {
  const out: Finding[] = [];
  for (const m of meds) {
    if (!m.ingredient) continue;
    if (m.stated_indication && m.stated_indication.trim().length > 2) continue;

    // Give the benefit of the doubt if a charted condition plausibly covers it.
    const covered = conditions.some((c) =>
      c.toLowerCase().includes(m.ingredient!.slice(0, 5)));
    if (covered) continue;

    out.push({
      kind: 'no-indication',
      implicated: [m.ingredient],
      severity: 'moderate',
      label: `No indication stated for ${m.ingredient}`,
      citation: 'STOPP/START v3 — any drug prescribed without an evidence-based clinical indication',
    });
  }
  return out;
}

// ─── 3. Cumulative anticholinergic burden ────────────────────────────────────

export function scoreAnticholinergic(meds: ResolvedMed[]) {
  const contributors: { ingredient: string; score: number }[] = [];
  const seen = new Set<string>();

  for (const m of meds) {
    if (!m.ingredient) continue;
    for (const part of splitCombination(m.ingredient)) {
      if (seen.has(part)) continue;
      const score = ACB_SCORES[part];
      if (score) {
        contributors.push({ ingredient: part, score });
        seen.add(part);
      }
    }
  }
  contributors.sort((a, b) => b.score - a.score);
  const total = contributors.reduce((s, c) => s + c.score, 0);
  return { total, contributors };
}

export function detectAnticholinergicBurden(meds: ResolvedMed[]): Finding[] {
  const { total, contributors } = scoreAnticholinergic(meds);
  if (total < ACB_THRESHOLD) return [];
  return [{
    kind: 'anticholinergic',
    implicated: contributors.map((c) => c.ingredient),
    severity: total >= 6 ? 'high' : 'moderate',
    label: `Cumulative anticholinergic burden score ${total}`,
    citation: 'Anticholinergic Cognitive Burden scale; ACB \u2265 3 associated with cognitive decline and falls',
  }];
}

// ─── 4. Prescribing cascades — the headline finding ──────────────────────────

export function detectCascades(meds: ResolvedMed[], symptoms: ExtractedSymptom[]): Finding[] {
  const keys = ingredientKeys(meds);
  const out: Finding[] = [];

  for (const c of CASCADES) {
    const trigger = c.trigger.find((t) => keys.has(t));
    const treater = c.treater.find((t) => keys.has(t));
    if (!trigger || !treater) continue;

    // The treater's stated indication is itself confirmation of the linking
    // symptom: "what do you take the allopurinol for?" — "the gout" IS the
    // patient reporting the symptom, even if it never appears in the symptom list.
    const treaterIndication = (keys.get(treater)?.stated_indication ?? '').toLowerCase();
    const matched = symptomMatches(symptoms, c.symptomKeywords)
      ?? c.symptomKeywords.find((kw) => treaterIndication.includes(kw.toLowerCase()))
      ?? null;

    out.push({
      kind: 'cascade',
      implicated: [trigger, treater],
      // Severity is a property of the CURATED RULE and its citation, never of
      // what happened to come up in one interview. Whether the patient reported
      // the linking symptom is EVIDENCE: it changes confidence and ordering
      // (below), and it is carried separately as `symptomConfirmed` so a
      // clinician can see exactly what supports the finding. Downgrading the
      // rule's severity because a patient did not mention a symptom would make
      // the same clinical concern read differently for a quiet patient.
      severity: c.severity,
      label: c.label,
      citation: c.citation,
      symptomConfirmed: Boolean(matched),
      linkingSymptom: matched ?? c.sideEffect,
    });
  }

  // Ordering, not severity, reflects confidence: within a curated severity band
  // the cascades the patient actually gave evidence for come first.
  const rank = { high: 0, moderate: 1, low: 2 } as const;
  out.sort((a, b) =>
    rank[a.severity] - rank[b.severity]
    || Number(b.symptomConfirmed) - Number(a.symptomConfirmed));
  return out;
}

/** Detects A→B→C chains, e.g. amlodipine → furosemide → allopurinol. */
export function detectCascadeChains(cascades: Finding[]): string[][] {
  const chains: string[][] = [];
  for (const a of cascades) {
    for (const b of cascades) {
      if (a === b) continue;
      if (a.implicated[1] === b.implicated[0]) {
        chains.push([a.implicated[0], a.implicated[1], b.implicated[1]]);
      }
    }
  }
  return chains;
}

// ─── 5. Therapeutic duplication ──────────────────────────────────────────────

export function detectDuplicates(meds: ResolvedMed[]): Finding[] {
  const keys = ingredientKeys(meds);
  const out: Finding[] = [];
  for (const cls of DUPLICATE_CLASSES) {
    const hits = cls.ingredients.filter((i) => keys.has(i));
    if (hits.length >= 2) {
      out.push({
        kind: 'duplicate',
        implicated: hits,
        severity: 'high',
        label: `${cls.label} (${hits.length} agents)`,
        citation: cls.citation,
      });
    }
  }
  return out;
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export function runReview(input: {
  meds: ResolvedMed[];
  symptoms: ExtractedSymptom[];
  conditions: string[];
  values: string[];
  redFlags: string[];
  durationsWeeks?: Record<string, number>;
}): ReviewResult {
  const { meds, symptoms, conditions, values, redFlags, durationsWeeks = {} } = input;

  const acb = scoreAnticholinergic(meds);

  const findings: Finding[] = [
    ...detectCascades(meds, symptoms),
    ...detectDuplicates(meds),
    ...detectPims(meds, conditions, durationsWeeks),
    ...detectAnticholinergicBurden(meds),
    ...detectNoIndication(meds, conditions),
  ];

  const rank = { high: 0, moderate: 1, low: 2 } as const;
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return {
    meds,
    findings,
    symptoms,
    acbScore: acb.total,
    acbContributors: acb.contributors,
    redFlags,
    patientGoals: values,
    unresolvedCount: meds.filter((m) => m.unresolved).length,
  };
}

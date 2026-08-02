/**
 * Panel contract tests. The panel is the only clinician-facing surface, so its
 * WORDING is a safety control, not decoration:
 *   - it may never claim a drug caused a symptom or that a cascade is confirmed;
 *   - it may never imply the medication list is complete when nothing was
 *     confirmed against the chart;
 *   - it may never leak a patient id, a chart id, or a generated resource id;
 *   - it may never label a finding "cross-prescriber" on a guess.
 *
 * Everything here is offline: pure string rendering, no server, no network.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderReviewHtml, type ReviewSnapshot } from './panel.js';
import type { Finding, ResolvedMed, ReviewResult } from '../types.js';

// ── fixtures ────────────────────────────────────────────────────────────────

const med = (ingredient: string, indication: string | null = 'because'): ResolvedMed => ({
  spoken_as: ingredient, name_guess: ingredient, strength: '10 mg', frequency: 'once daily',
  stated_indication: indication, otc: false, confidence: 'high', rxcui: '1',
  ingredient, unresolved: false, provenance: 'chart-confirmed',
});

const cascade = (trigger: string, treater: string, confirmed: boolean): Finding => ({
  kind: 'cascade', implicated: [trigger, treater], severity: 'high',
  label: `${trigger} to ${treater} cascade`,
  citation: 'Savage et al., JAMA Intern Med 2020 — CCB-induced oedema and diuretic prescribing cascade',
  symptomConfirmed: confirmed, linkingSymptom: 'ankle swelling',
});

const review = (findings: Finding[], meds: ResolvedMed[]): ReviewResult => ({
  meds, findings, symptoms: [], acbScore: 8,
  acbContributors: [{ ingredient: 'oxybutynin', score: 3 }],
  redFlags: [], patientGoals: [], unresolvedCount: 0,
});

function snapshot(over: Partial<ReviewSnapshot> = {}): ReviewSnapshot {
  return {
    at: '2026-08-01T15:45:00.000Z',
    source: 'live-call',
    review: review(
      [cascade('amlodipine', 'furosemide', true)],
      [med('amlodipine'), med('furosemide')],
    ),
    chains: [],
    patientDisplay: 'Margaret Okonkwo, 83',
    chart: {
      medications: [
        { display: 'amlodipine 10 mg', ingredient: 'amlodipine', rxcui: '17767', strength: '10 mg',
          frequency: 'once daily', sourceDisplay: 'Cardiology — Dr. Priya Shah', confirmation: 'taking-as-documented' },
        { display: 'furosemide 20 mg', ingredient: 'furosemide', rxcui: '4603', strength: '20 mg',
          frequency: 'every morning', sourceDisplay: 'Primary care — Dr. Jordan Lee', confirmation: 'taking-as-documented' },
      ],
      conditions: ['Essential hypertension'],
    },
    gaps: [{ kind: 'patient-only', display: 'diphenhydramine' }],
    concerns: [{ medicationName: 'lorazepam', patientWords: 'I just want to feel clear again', intent: 'discuss-stopping' }],
    ...over,
  };
}

const idx = (html: string, needle: string) => {
  const i = html.indexOf(needle);
  assert.notEqual(i, -1, `expected the panel to contain ${JSON.stringify(needle)}`);
  return i;
};

// ── 1. Old snapshots still render, and their identifiers are NOT surfaced ────

const legacy = {
  at: '2026-07-31T19:46:59.250Z',
  source: 'canned-demo',
  review: review([{ kind: 'pim', implicated: ['lorazepam'], severity: 'high',
    label: 'Benzodiazepine in an older adult', citation: 'AGS Beers 2023' }], [med('lorazepam')]),
  chains: [['amlodipine', 'furosemide', 'allopurinol']],
  patientLabel: 'Margaret Okonkwo, 83',
  patientId: '966b3619-73b2-4895-b75b-f0ad287119af',
  written: { meds: 11, flags: 6, cascades: 4, goals: 1, risk: true,
    resources: [{ type: 'MedicationStatement', id: 'abc-123', label: 'lorazepam' }] },
} as unknown as ReviewSnapshot;

const legacyHtml = renderReviewHtml(legacy);
assert.ok(legacyHtml.includes('Margaret Okonkwo, 83'), 'a pre-coordination snapshot must still render its patient label');
assert.ok(legacyHtml.includes('Benzodiazepine in an older adult'), 'legacy findings must still render');
assert.ok(!legacyHtml.includes('966b3619'), 'a legacy patientId must never reach the rendered page');
assert.ok(!legacyHtml.includes('abc-123'), 'a legacy resource id must never reach the rendered page');
assert.ok(!legacyHtml.includes('app.medplum.com'), 'the panel must not deep-link into a patient chart');
assert.ok(legacyHtml.includes('unconfirmed medication set'),
  'with no chart confirmations, the panel must say the medication set is unconfirmed');

// Null snapshot: the empty state still renders.
assert.ok(renderReviewHtml(null).includes('No review yet'), 'empty state must render');

// ── 2. Dashboard structure, in order ────────────────────────────────────────
// The panel is a single-screen dashboard: a header strip carrying the review
// basis, then three panels in priority order (what the call picked up ->
// findings -> what was already known), then the written-resource strip.
// "Findings" is matched on its panel label so the header stat of the same name
// does not satisfy the assertion.

const full = renderReviewHtml(snapshot());
const order = [
  'Review based on',
  'Medications the agent picked up',
  'class="lbl">Findings<',
  'Known before the call',
  'FHIR resources written',
];
let previous = -1;
for (const heading of order) {
  const at = idx(full, heading);
  assert.ok(at > previous, `section "${heading}" is out of order`);
  previous = at;
}

// ── 3. Review basis reflects how much was actually confirmed ────────────────

assert.ok(full.includes('partially confirmed medication set') || full.includes('confirmed medication set'),
  'a chart-backed review must state its basis');

const allConfirmed = renderReviewHtml(snapshot());
assert.ok(allConfirmed.includes('Review based on a confirmed medication set'),
  'every chart medication confirmed => confirmed medication set');

const partial = renderReviewHtml(snapshot({
  chart: {
    medications: [
      { display: 'amlodipine 10 mg', ingredient: 'amlodipine', rxcui: '17767', strength: '10 mg',
        frequency: 'once daily', sourceDisplay: 'Cardiology — Dr. Priya Shah', confirmation: 'taking-as-documented' },
      { display: 'omeprazole 20 mg', ingredient: 'omeprazole', rxcui: '7646', strength: '20 mg',
        frequency: 'once daily', sourceDisplay: null, confirmation: 'unclear' },
    ],
    conditions: [],
  },
}));
assert.ok(partial.includes('Review based on a partially confirmed medication set'),
  'some confirmations => partially confirmed medication set');

const none = renderReviewHtml(snapshot({
  chart: {
    medications: [
      { display: 'omeprazole 20 mg', ingredient: 'omeprazole', rxcui: '7646', strength: null,
        frequency: null, sourceDisplay: null, confirmation: 'unclear' },
    ],
    conditions: [],
  },
}));
assert.ok(none.includes('Review based on an unconfirmed medication set'),
  'zero confirmations => unconfirmed medication set');
assert.ok(/class="basis[^"]*unconfirmed/.test(none),
  'the unconfirmed basis must be displayed prominently, not as ordinary body text');

// ── 4. Source relationship is joined, never guessed from the display text ───

const crossHtml = renderReviewHtml(snapshot());
assert.ok(crossHtml.includes('Cross-prescriber'),
  'two implicated drugs with distinct recorded sources are cross-prescriber');

const sameSource = renderReviewHtml(snapshot({
  chart: {
    medications: [
      { display: 'amlodipine 10 mg', ingredient: 'amlodipine', rxcui: '17767', strength: null, frequency: null,
        sourceDisplay: 'Primary care — Dr. Jordan Lee', confirmation: 'taking-as-documented' },
      { display: 'furosemide 20 mg', ingredient: 'furosemide', rxcui: '4603', strength: null, frequency: null,
        sourceDisplay: 'Primary care — Dr. Jordan Lee', confirmation: 'taking-as-documented' },
    ],
    conditions: [],
  },
}));
assert.ok(sameSource.includes('Same recorded source'), 'one shared source is not cross-prescriber');
assert.ok(!sameSource.includes('Cross-prescriber'), 'one shared source must never be labelled cross-prescriber');

const unknownSource = renderReviewHtml(snapshot({
  chart: {
    medications: [
      { display: 'amlodipine 10 mg', ingredient: 'amlodipine', rxcui: '17767', strength: null, frequency: null,
        sourceDisplay: 'Cardiology — Dr. Priya Shah', confirmation: 'taking-as-documented' },
      { display: 'furosemide 20 mg', ingredient: 'furosemide', rxcui: '4603', strength: null, frequency: null,
        sourceDisplay: null, confirmation: 'taking-as-documented' },
    ],
    conditions: [],
  },
}));
assert.ok(unknownSource.includes('Source relationship unknown'),
  'a missing recorded source makes the relationship unknown');
assert.ok(!unknownSource.includes('Cross-prescriber'), 'a null source must never be labelled cross-prescriber');

// Two chart rows for the same ingredient: the join is ambiguous, so unknown.
const ambiguous = renderReviewHtml(snapshot({
  chart: {
    medications: [
      { display: 'amlodipine 10 mg', ingredient: 'amlodipine', rxcui: '17767', strength: null, frequency: null,
        sourceDisplay: 'Cardiology — Dr. Priya Shah', confirmation: 'taking-as-documented' },
      { display: 'amlodipine 5 mg', ingredient: 'amlodipine', rxcui: '17767', strength: null, frequency: null,
        sourceDisplay: 'Primary care — Dr. Jordan Lee', confirmation: 'taking-as-documented' },
      { display: 'furosemide 20 mg', ingredient: 'furosemide', rxcui: '4603', strength: null, frequency: null,
        sourceDisplay: 'Nephrology — Dr. Ade Bello', confirmation: 'taking-as-documented' },
    ],
    conditions: [],
  },
}));
assert.ok(ambiguous.includes('Source relationship unknown'),
  'an ingredient matching two chart rows does not uniquely join to a source');

// No chart at all: no source claim of any kind.
const chartless = renderReviewHtml(snapshot({ chart: undefined }));
assert.ok(!chartless.includes('Cross-prescriber'), 'no chart means no cross-prescriber claim');

// ── 5. Evidence is visible; the forbidden causal phrasings are not ──────────

assert.ok(full.includes('Patient reported the linking symptom'),
  'a cascade with reported evidence must say so explicitly');

const structural = renderReviewHtml(snapshot({
  review: review([cascade('amlodipine', 'furosemide', false)], [med('amlodipine'), med('furosemide')]),
}));
assert.ok(/linking symptom (was )?not reported/i.test(structural),
  'a cascade without evidence must say the linking symptom was not reported');

const heroHtml = renderReviewHtml(snapshot({ chains: [['amlodipine', 'furosemide', 'allopurinol']] }));
assert.ok(heroHtml.includes('may have been added in response to'),
  'the hero must use the non-causal "may have been added in response to" phrasing');
assert.ok(heroHtml.includes('potential cascade for clinician review'),
  'the hero must frame the chain as a potential cascade for clinician review');

const FORBIDDEN = [
  'confirmed cascade',
  'exists only to treat',
  'the previous drug caused',
  'caused by',
  'prescribing error',
];
for (const html of [full, legacyHtml, heroHtml, structural, none]) {
  for (const phrase of FORBIDDEN) {
    assert.ok(!html.toLowerCase().includes(phrase),
      `the panel must never say "${phrase}"`);
  }
}

// Citations ride along with every finding.
assert.ok(full.includes('Savage et al., JAMA Intern Med 2020'), 'every finding renders its citation');

// Severity is text + icon, not colour alone.
assert.ok(/class="fsev"[\s\S]{0,200}High/.test(full), 'severity must carry a text label, not colour alone');

// ── 6. The patient's own ask is prominent ───────────────────────────────────
// On the dashboard the ask is a highlighted block at the top of the "known
// before the call" panel rather than a full-width section, so prominence is
// asserted structurally: the quote must sit inside that highlighted block.

const askAt = idx(full, 'What the patient wants addressed');
const quoteAt = idx(full, 'I just want to feel clear again');
assert.ok(quoteAt > askAt && quoteAt - askAt < 400,
  "the patient's stated concern must sit inside the 'what the patient wants addressed' block");
assert.ok(/class="ask"[\s\S]{0,400}I just want to feel clear again/.test(full),
  "the patient's concern must be visually highlighted, not ordinary body text");
assert.ok(full.includes('discuss stopping'), 'the concern intent must be shown in plain words');

// ── 7. Escaping — every free-text field ─────────────────────────────────────

const XSS = '<script>alert(1)</script>';
const nasty = renderReviewHtml(snapshot({
  patientDisplay: XSS,
  chart: {
    medications: [{ display: XSS, ingredient: XSS, rxcui: XSS, strength: XSS, frequency: XSS,
      sourceDisplay: XSS, confirmation: 'taking-as-documented' }],
    conditions: [XSS],
  },
  gaps: [{ kind: 'patient-only', display: XSS, note: XSS }],
  concerns: [{ medicationName: XSS, patientWords: XSS, intent: 'concern-only' }],
  review: {
    ...review([{ kind: 'pim', implicated: [XSS], severity: 'low', label: XSS, citation: XSS }], [med(XSS)]),
    redFlags: [XSS], patientGoals: [XSS],
  },
  objection: XSS,
  taper: { drug: XSS, steps: [{ week: 1, dose: XSS, note: XSS }] },
  written: { meds: 1, flags: 0, cascades: 0, goals: 0, risk: false,
    resources: [{ type: 'MedicationStatement', label: XSS, note: XSS }] },
}));
const nastyBody = nasty.slice(nasty.indexOf('<body>'));
assert.ok(!nastyBody.includes('<script'), 'no free-text field may emit a raw script tag');
assert.ok(nasty.includes('&lt;script&gt;'), 'free text must be HTML-escaped, not dropped');

// ── 8. No identifiers anywhere in the shipped canned snapshot ───────────────

const canned = readFileSync(new URL('../../demo-assets/canned-review.json', import.meta.url), 'utf8');
const cannedSnap: ReviewSnapshot = JSON.parse(canned);
for (const forbidden of ['Patient/', 'MedicationRequest/', 'MedicationStatement/', 'patientId', 'app.medplum.com']) {
  assert.ok(!canned.includes(forbidden),
    `the canned snapshot must not contain ${JSON.stringify(forbidden)}`);
}
for (const r of cannedSnap.written?.resources ?? []) {
  assert.ok(!('id' in r), 'written resource summaries are presentation-only — no generated ids');
}
// UUID-shaped generated ids.
assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(canned),
  'the canned snapshot must not carry any generated resource id');

// ...and the canned snapshot tells the whole cross-prescriber story.
const cannedHtml = renderReviewHtml(cannedSnap);
assert.ok(cannedHtml.includes('Cross-prescriber'), 'the canned demo must show the cross-prescriber label');
assert.ok(cannedHtml.includes('Savage et al., JAMA Intern Med 2020'), 'the canned demo must show the hero citation');
assert.ok(cannedHtml.includes('Cardiology'), 'the canned demo must show distinct recorded sources');
assert.ok((cannedSnap.gaps ?? []).length >= 2, 'the canned demo must show patient-reported gaps');
assert.ok((cannedSnap.concerns ?? []).length >= 1, 'the canned demo must show what the patient wants addressed');
for (const phrase of FORBIDDEN) {
  assert.ok(!cannedHtml.toLowerCase().includes(phrase), `the canned demo must never say "${phrase}"`);
}

console.log('panel: 8 groups passed — legacy compat, section order, review basis, source joins, ' +
  'evidence wording, concern prominence, escaping, identifier-free canned snapshot');

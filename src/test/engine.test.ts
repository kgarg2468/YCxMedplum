import assert from 'node:assert/strict';
import { runReview, detectCascadeChains } from '../engine/detect.js';
import { DEMO_CONDITIONS, DEMO_DURATIONS, ageOn, DEMO_BIRTHDATE } from '../fhir/seed.js';
import type { ResolvedMed, ExtractedSymptom } from '../types.js';

const mk = (ing: string, ind: string | null, strength = ''): ResolvedMed => ({
  spoken_as: ing, name_guess: ing, strength, frequency: null,
  stated_indication: ind, otc: false, confidence: 'high',
  rxcui: '00000', ingredient: ing, unresolved: false,
});

const meds: ResolvedMed[] = [
  mk('donepezil', 'my memory'), mk('oxybutynin', 'for my bladder'),
  mk('amlodipine', 'blood pressure'), mk('furosemide', 'ankles swelling'),
  mk('allopurinol', 'gout'), mk('lisinopril', 'blood pressure'),
  mk('benzonatate', 'cough'), mk('lorazepam', 'sleep'),
  mk('diphenhydramine', 'sleep'), mk('senna', 'bowels'),
  mk('omeprazole', null),
];

const symptoms: ExtractedSymptom[] = [
  { symptom: 'dry mouth', patient_words: 'terrible dry mouth' },
  { symptom: 'ankle swelling', patient_words: 'ankles were swelling' },
  { symptom: 'constipation', patient_words: 'nothing moves' },
  { symptom: 'cognitive fog', patient_words: 'very foggy' },
  { symptom: 'dry cough', patient_words: 'tickle in my throat' },
  { symptom: 'urinary urgency', patient_words: 'accidents, a lot of urgency' },
  { symptom: 'gout', patient_words: 'gout in my big toe' },
];

const r = runReview({ meds, symptoms, conditions: DEMO_CONDITIONS,
  values: ['I just want to feel clear again'], redFlags: [], durationsWeeks: DEMO_DURATIONS });

console.log(`ACB = ${r.acbScore}  [${r.acbContributors.map(c=>c.ingredient+':'+c.score).join(', ')}]`);
console.log(`\n${r.findings.length} findings`);
for (const f of r.findings) {
  const c = f.kind==='cascade' ? (f.symptomConfirmed?' CONFIRMED':' structural') : '';
  console.log(`  [${f.severity.padEnd(8)}] ${f.kind.padEnd(15)} ${f.implicated.join(' -> ')}${c}`);
}
const chains = detectCascadeChains(r.findings.filter(f=>f.kind==='cascade'));
console.log(`\nCHAINS: ${chains.map(c=>c.join(' -> ')).join(' | ') || 'none'}`);

// ── Assertions — `npm test` must be able to FAIL ─────────────────────────────

// 1. The reference output (demo depends on these exact numbers).
assert.equal(r.acbScore, 8, `ACB expected 8, got ${r.acbScore}`);
assert.equal(r.findings.length, 12, `expected 12 findings, got ${r.findings.length}`);
assert.ok(
  chains.some((c) => c.join('->') === 'amlodipine->furosemide->allopurinol'),
  'hero chain amlodipine -> furosemide -> allopurinol not detected',
);

// 2. Negative control: a clean patient produces ZERO findings. This is the
//    proof the engine measures rather than imagines — nothing is hardcoded.
const clean = runReview({
  meds: [
    mk('atorvastatin', 'cholesterol'),
    mk('levothyroxine', 'thyroid'),
    mk('metformin', 'diabetes'),
  ],
  symptoms: [], conditions: [], values: [], redFlags: [], durationsWeeks: {},
});
assert.equal(clean.findings.length, 0, `clean patient should have 0 findings, got ${clean.findings.length}`);
assert.equal(clean.acbScore, 0, `clean patient should have ACB 0, got ${clean.acbScore}`);

// 3. Red flags pass through the engine to the result (the escalation path
//    in server.ts consumes review.redFlags).
const flagged = runReview({
  meds: [], symptoms: [], conditions: [], values: [],
  redFlags: ['chest pain'], durationsWeeks: {},
});
assert.deepEqual(flagged.redFlags, ['chest pain'], 'red flags must surface in the review result');

// 4. Age is computed from the calendar date, not from a UTC-parsed Date. A
//    date-only string parses as UTC midnight, so local getters would shift it a
//    day earlier west of UTC and under-count the age around the birthday.
const on = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
assert.equal(ageOn(DEMO_BIRTHDATE, on('2026-04-11')), 82, 'day before birthday');
assert.equal(ageOn(DEMO_BIRTHDATE, on('2026-04-12')), 83, 'on birthday');
assert.equal(ageOn(DEMO_BIRTHDATE, on('2026-04-13')), 83, 'day after birthday');
assert.equal(ageOn(DEMO_BIRTHDATE, on('2026-12-31')), 83, 'end of year');

console.log('\nALL ASSERTIONS PASSED — hero chain, negative control (0 findings), red-flag passthrough, age boundary');

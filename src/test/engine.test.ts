import { runReview, detectCascadeChains } from '../engine/detect.js';
import { DEMO_CONDITIONS, DEMO_DURATIONS } from '../fhir/seed.js';
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

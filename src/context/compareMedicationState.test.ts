/**
 * Reconciliation tests: chart facts vs. what the patient actually said.
 *
 * `compareMedicationState` is a pure function, so these tests need no stubs,
 * no clock, and no network.
 */

import assert from 'node:assert/strict';
import { compareMedicationState } from './compareMedicationState.js';
import type {
  ChartMedication, ChartMedicationConfirmation, ChartMedicationUseStatus,
  MedicationGapKind, PatientReportedMedication,
} from './types.js';

function chartMed(overrides: Partial<ChartMedication> & { alias: string }): ChartMedication {
  return {
    resourceType: 'MedicationRequest',
    resourceId: `res-${overrides.alias}`,
    display: 'amlodipine',
    ingredient: 'amlodipine',
    rxcui: '17767',
    strength: '10 mg',
    frequency: 'once daily',
    status: 'active',
    isCurrent: true,
    sourceReference: 'Practitioner/prac-1',
    sourceDisplay: 'Cardiology — Dr. Priya Shah',
    authoredOn: '2026-01-01',
    ...overrides,
  };
}

function confirmation(
  chartAlias: string,
  useStatus: ChartMedicationUseStatus,
  overrides: Partial<ChartMedicationConfirmation> = {},
): ChartMedicationConfirmation {
  return {
    chartAlias,
    useStatus,
    reportedStrength: null,
    reportedFrequency: null,
    indication: 'blood pressure',
    ...overrides,
  };
}

function patientMed(overrides: Partial<PatientReportedMedication> = {}): PatientReportedMedication {
  return {
    chartAlias: null,
    provenance: 'patient-reported',
    name: 'diphenhydramine',
    ingredient: 'diphenhydramine',
    rxcui: '3498',
    strength: '25 mg',
    frequency: 'at bedtime',
    indication: 'sleep',
    patientWords: 'the pink sleeping pill',
    extractionConfidence: 'medium',
    otc: true,
    ...overrides,
  };
}

const kinds = (gaps: { kind: MedicationGapKind }[]) => gaps.map((g) => g.kind);

const tests: Array<[string, () => void]> = [];
function test(name: string, fn: () => void): void {
  tests.push([name, fn]);
}

// ─── Confirmed use ───────────────────────────────────────────────────────────

test('a plain yes keeps the chart medication current with chart-confirmed provenance', () => {
  const chart = [chartMed({ alias: 'M1' })];
  const state = compareMedicationState(chart, [confirmation('M1', 'taking-as-documented')], []);

  assert.deepEqual(state.gaps, []);
  assert.equal(state.current.length, 1);
  assert.deepEqual(state.current[0], {
    chartAlias: 'M1',
    provenance: 'chart-confirmed',
    name: 'amlodipine',
    ingredient: 'amlodipine',
    rxcui: '17767',
    strength: '10 mg',
    frequency: 'once daily',
    indication: 'blood pressure',
    patientWords: null,
    extractionConfidence: null,
    otc: false,
  });
});

test('one blanket affirmative fanned out to several aliases keeps every alias current', () => {
  const chart = [
    chartMed({ alias: 'M1', display: 'amlodipine', ingredient: 'amlodipine', rxcui: '17767' }),
    chartMed({ alias: 'M2', display: 'furosemide', ingredient: 'furosemide', rxcui: '4603' }),
    chartMed({ alias: 'M3', display: 'allopurinol', ingredient: 'allopurinol', rxcui: '519' }),
    chartMed({ alias: 'M4', display: 'donepezil', ingredient: 'donepezil', rxcui: '135447' }),
  ];
  // The patient said "yes, all of those" once; extraction fans that out to one
  // explicit confirmation per alias. None of the names were repeated aloud.
  const confirmations = chart.map((m) => confirmation(m.alias, 'taking-as-documented', { indication: null }));

  const state = compareMedicationState(chart, confirmations, []);

  assert.deepEqual(state.current.map((m) => m.chartAlias), ['M1', 'M2', 'M3', 'M4']);
  for (const med of state.current) {
    assert.equal(med.provenance, 'chart-confirmed');
    assert.equal(med.patientWords, null, 'never fabricate a verbatim quote');
  }
  // Missing indication is the only gap kind here — no use-unclear leakage.
  assert.deepEqual(kinds(state.gaps), [
    'missing-indication', 'missing-indication', 'missing-indication', 'missing-indication',
  ]);
});

// ─── Stopped / unclear ───────────────────────────────────────────────────────

test('an explicit stop becomes a not-taking gap and leaves the current set', () => {
  const chart = [chartMed({ alias: 'M1', display: 'omeprazole' })];
  const state = compareMedicationState(chart, [confirmation('M1', 'not-taking')], []);

  assert.deepEqual(kinds(state.gaps), ['not-taking']);
  assert.equal(state.gaps[0].display, 'omeprazole');
  assert.equal(state.gaps[0].chartMedication?.alias, 'M1');
  assert.equal(state.gaps[0].confirmation?.useStatus, 'not-taking');
  assert.deepEqual(state.current, []);
});

test('an unclear confirmation becomes a use-unclear gap and leaves the current set', () => {
  const chart = [chartMed({ alias: 'M1' })];
  const state = compareMedicationState(chart, [confirmation('M1', 'unclear')], []);

  assert.deepEqual(kinds(state.gaps), ['use-unclear']);
  assert.deepEqual(state.current, []);
});

test('a current chart medication with no confirmation emits exactly one use-unclear gap', () => {
  const chart = [chartMed({ alias: 'M1' }), chartMed({ alias: 'M2', display: 'lorazepam' })];
  const state = compareMedicationState(chart, [], []);

  assert.deepEqual(kinds(state.gaps), ['use-unclear', 'use-unclear']);
  assert.equal(state.gaps.length, 2, 'one gap per chart medication, never a second chart-only gap');
  assert.deepEqual(state.gaps.map((g) => g.chartMedication?.alias), ['M1', 'M2']);
  assert.deepEqual(state.current, []);
});

test('non-current chart history is never reconciled and never becomes current', () => {
  const chart = [chartMed({ alias: 'M1', status: 'completed', isCurrent: false })];
  const state = compareMedicationState(chart, [confirmation('M1', 'taking-as-documented')], []);

  assert.deepEqual(state.gaps, []);
  assert.deepEqual(state.current, []);
});

// ─── Mismatches ──────────────────────────────────────────────────────────────

test('a changed frequency stays current and records a frequency-mismatch gap', () => {
  const chart = [chartMed({ alias: 'M1' })];
  const state = compareMedicationState(
    chart,
    [confirmation('M1', 'taking-differently', { reportedFrequency: 'twice daily' })],
    [],
  );

  assert.deepEqual(kinds(state.gaps), ['frequency-mismatch']);
  assert.equal(state.current.length, 1);
  assert.equal(state.current[0].frequency, 'twice daily', 'the patient report wins');
  assert.equal(state.current[0].strength, '10 mg', 'unreported fields stay charted');
});

test('a changed strength records a strength-mismatch gap', () => {
  const chart = [chartMed({ alias: 'M1' })];
  const state = compareMedicationState(
    chart,
    [confirmation('M1', 'taking-differently', { reportedStrength: '5 mg' })],
    [],
  );

  assert.deepEqual(kinds(state.gaps), ['strength-mismatch']);
  assert.equal(state.current[0].strength, '5 mg');
});

test('a matching report in different casing is not a mismatch', () => {
  const chart = [chartMed({ alias: 'M1' })];
  const state = compareMedicationState(
    chart,
    [confirmation('M1', 'taking-differently', { reportedStrength: '10 MG', reportedFrequency: 'Once Daily' })],
    [],
  );

  assert.deepEqual(state.gaps, []);
});

test('mismatch gaps are independent and can all fire for one medication', () => {
  const chart = [chartMed({ alias: 'M1' })];
  const state = compareMedicationState(
    chart,
    [confirmation('M1', 'taking-differently', {
      reportedStrength: '5 mg',
      reportedFrequency: 'twice daily',
      indication: null,
    })],
    [],
  );

  assert.deepEqual(kinds(state.gaps), ['strength-mismatch', 'frequency-mismatch', 'missing-indication']);
  assert.equal(state.current.length, 1, 'the medication is still under review');
});

test('a stopped medication reports no mismatch noise', () => {
  const chart = [chartMed({ alias: 'M1' })];
  const state = compareMedicationState(
    chart,
    [confirmation('M1', 'not-taking', { reportedFrequency: 'twice daily', indication: null })],
    [],
  );

  assert.deepEqual(kinds(state.gaps), ['not-taking']);
});

// ─── Patient-only medications ────────────────────────────────────────────────

test('patient-only medications are preserved as current with a patient-only gap', () => {
  const chart = [chartMed({ alias: 'M1' })];
  const state = compareMedicationState(
    chart,
    [confirmation('M1', 'taking-as-documented')],
    [patientMed()],
  );

  assert.deepEqual(kinds(state.gaps), ['patient-only']);
  assert.equal(state.gaps[0].display, 'diphenhydramine');
  assert.equal(state.gaps[0].chartMedication, null);
  assert.equal(state.gaps[0].patientMedication?.name, 'diphenhydramine');

  const reported = state.current.find((m) => m.name === 'diphenhydramine');
  assert.ok(reported, 'the newly reported product survives reconciliation');
  assert.equal(reported.provenance, 'patient-reported');
  assert.equal(reported.chartAlias, null);
  assert.equal(reported.patientWords, 'the pink sleeping pill', 'verbatim words are preserved');
  assert.equal(reported.extractionConfidence, 'medium');
  assert.equal(reported.otc, true);
});

// ─── Matching order ──────────────────────────────────────────────────────────

test('matches on the chart alias before anything else', () => {
  const chart = [
    chartMed({ alias: 'M1', display: 'amlodipine', ingredient: 'amlodipine', rxcui: '17767' }),
    chartMed({ alias: 'M2', display: 'lisinopril', ingredient: 'lisinopril', rxcui: '29046' }),
  ];
  const state = compareMedicationState(
    chart,
    [confirmation('M1', 'taking-as-documented'), confirmation('M2', 'taking-as-documented')],
    // Alias says M2 even though the spoken name and RxCUI look like M1.
    [patientMed({ chartAlias: 'M2', name: 'amlodipine', ingredient: 'amlodipine', rxcui: '17767' })],
  );

  assert.deepEqual(state.gaps, [], 'the alias match means this is not a patient-only product');
  assert.equal(state.current.length, 2);
});

test('matches on RxCUI, then ingredient, then normalized name', () => {
  const chart = [
    chartMed({ alias: 'M1', display: 'Amlodipine besylate 10 MG tablet', ingredient: null, rxcui: '17767' }),
    chartMed({ alias: 'M2', display: 'furosemide', ingredient: 'furosemide', rxcui: null }),
    chartMed({ alias: 'M3', display: 'Allopurinol', ingredient: null, rxcui: null }),
  ];
  const state = compareMedicationState(chart, [], [
    patientMed({ name: 'the blood pressure one', ingredient: null, rxcui: '17767', otc: false }),
    patientMed({ name: 'water pill', ingredient: 'furosemide', rxcui: null, otc: false }),
    patientMed({ name: '  ALLOPURINOL ', ingredient: null, rxcui: null, otc: false }),
  ]);

  assert.deepEqual(kinds(state.gaps), ['use-unclear', 'use-unclear', 'use-unclear']);
  assert.equal(state.gaps.filter((g) => g.kind === 'patient-only').length, 0);
  for (const gap of state.gaps) {
    assert.ok(gap.patientMedication, 'the matched patient report is attached to the gap');
  }
  assert.deepEqual(state.current.map((m) => m.chartAlias), ['M1', 'M2', 'M3']);
  for (const med of state.current) {
    assert.equal(med.provenance, 'patient-reported', 'a name match is not an explicit confirmation');
  }
});

test('a second report of the same name does not consume the same chart row twice', () => {
  const chart = [chartMed({ alias: 'M1', display: 'senna', ingredient: 'senna', rxcui: '9473' })];
  const state = compareMedicationState(chart, [], [
    patientMed({ name: 'senna', ingredient: 'senna', rxcui: '9473' }),
    patientMed({ name: 'senna', ingredient: 'senna', rxcui: '9473', patientWords: 'the other senna' }),
  ]);

  assert.deepEqual(kinds(state.gaps), ['use-unclear', 'patient-only']);
  assert.equal(state.current.length, 2);
  assert.deepEqual(state.current.map((m) => m.chartAlias), ['M1', null]);
});

test('a confirmed chart medication absorbs its matching patient report instead of duplicating it', () => {
  const chart = [chartMed({ alias: 'M1' })];
  const state = compareMedicationState(
    chart,
    [confirmation('M1', 'taking-as-documented')],
    [patientMed({ name: 'amlodipine', ingredient: 'amlodipine', rxcui: '17767', otc: false })],
  );

  assert.equal(state.current.length, 1);
  assert.equal(state.current[0].provenance, 'chart-confirmed');
  assert.deepEqual(state.gaps, []);
});

test('confirmations for unknown aliases are ignored', () => {
  const chart = [chartMed({ alias: 'M1' })];
  const state = compareMedicationState(
    chart,
    [confirmation('M9', 'taking-as-documented'), confirmation('M1', 'taking-as-documented')],
    [],
  );

  assert.equal(state.current.length, 1);
  assert.equal(state.current[0].chartAlias, 'M1');
});

test('does not mutate its inputs', () => {
  const chart = [chartMed({ alias: 'M1' })];
  const confirmations = [confirmation('M1', 'taking-differently', { reportedFrequency: 'twice daily' })];
  const reported = [patientMed()];
  const snapshot = JSON.stringify({ chart, confirmations, reported });

  compareMedicationState(chart, confirmations, reported);
  assert.equal(JSON.stringify({ chart, confirmations, reported }), snapshot);
});

// ─── Runner ──────────────────────────────────────────────────────────────────

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(err);
  }
}
if (failed > 0) {
  console.error(`compareMedicationState: ${failed}/${tests.length} tests failed`);
  process.exit(1);
}
console.log(`compareMedicationState: ${tests.length} tests passed`);

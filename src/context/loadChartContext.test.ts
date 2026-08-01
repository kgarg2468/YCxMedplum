/**
 * Offline tests for the Medplum chart loader.
 *
 * No network, no framework: the Medplum client is a structural stub cast
 * `as unknown as MedplumClient`, exactly as Section 5 of the plan requires.
 */

import assert from 'node:assert/strict';
import type { MedplumClient } from '@medplum/core';
import type {
  Condition, MedicationRequest, MedicationStatement, Patient,
} from '@medplum/fhirtypes';
import { loadChartContext, REVIEW_OUTPUT_TAG } from './loadChartContext.js';

const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
const PATIENT_ID = 'pat-1';

const PATIENT: Patient = {
  resourceType: 'Patient',
  id: PATIENT_ID,
  name: [{ given: ['Margaret'], family: 'Okonkwo' }],
};

interface StubCall { op: 'read' | 'search'; resourceType: string; arg: unknown }

interface StubOptions {
  patient?: Patient;
  MedicationRequest?: MedicationRequest[];
  MedicationStatement?: MedicationStatement[];
  Condition?: Condition[];
  /** Resolves only when released — used to prove the searches are issued in parallel. */
  gate?: Promise<void>;
}

function stubMedplum(options: StubOptions): { medplum: MedplumClient; calls: StubCall[] } {
  const calls: StubCall[] = [];
  const medplum = {
    async readResource(resourceType: string, id: string) {
      calls.push({ op: 'read', resourceType, arg: id });
      if (options.gate) await options.gate;
      return options.patient ?? PATIENT;
    },
    async searchResources(resourceType: string, query: unknown) {
      calls.push({ op: 'search', resourceType, arg: query });
      if (options.gate) await options.gate;
      const bag = options as Record<string, unknown>;
      return (bag[resourceType] as unknown[] | undefined) ?? [];
    },
  } as unknown as MedplumClient;
  return { medplum, calls };
}

const tests: Array<[string, () => Promise<void> | void]> = [];
function test(name: string, fn: () => Promise<void> | void): void {
  tests.push([name, fn]);
}

// ─── Patient ─────────────────────────────────────────────────────────────────

test('reads the patient and returns a presentation display name', async () => {
  const { medplum, calls } = stubMedplum({});
  const context = await loadChartContext(medplum, PATIENT_ID);

  assert.equal(context.patientId, PATIENT_ID);
  assert.equal(context.patientDisplay, 'Margaret Okonkwo');
  assert.ok(Date.parse(context.loadedAt) > 0, 'loadedAt is an ISO timestamp');
  assert.deepEqual(
    calls.find((c) => c.op === 'read'),
    { op: 'read', resourceType: 'Patient', arg: PATIENT_ID },
  );
});

test('searches every chart resource type by subject, in parallel', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const { medplum, calls } = stubMedplum({ gate });

  const pending = loadChartContext(medplum, PATIENT_ID);
  // Every request must already be issued while the first one is still unresolved.
  await Promise.resolve();
  assert.equal(calls.length, 4, 'patient read plus three searches issued before any resolves');
  release();
  await pending;

  const searched = calls.filter((c) => c.op === 'search');
  assert.deepEqual(
    searched.map((c) => c.resourceType).sort(),
    ['Condition', 'MedicationRequest', 'MedicationStatement'],
  );
  for (const call of searched) {
    assert.deepEqual(call.arg, { subject: `Patient/${PATIENT_ID}` });
  }
});

// ─── MedicationRequest normalization ─────────────────────────────────────────

test('normalizes a MedicationRequest into a ChartMedication', async () => {
  const { medplum } = stubMedplum({
    MedicationRequest: [{
      resourceType: 'MedicationRequest',
      id: 'mr-1',
      status: 'active',
      intent: 'order',
      subject: { reference: `Patient/${PATIENT_ID}` },
      authoredOn: '2026-01-04',
      requester: { reference: 'Practitioner/prac-1', display: 'Urology — Dr. Samuel Reed' },
      medicationCodeableConcept: {
        coding: [{ system: RXNORM, code: '32675', display: 'Oxybutynin' }],
        text: 'oxybutynin 5 mg',
      },
      dosageInstruction: [{
        timing: { code: { text: 'three times daily' } },
        doseAndRate: [{ doseQuantity: { value: 5, unit: 'mg' } }],
      }],
    }],
  });

  const { medications } = await loadChartContext(medplum, PATIENT_ID);
  assert.equal(medications.length, 1);
  assert.deepEqual(medications[0], {
    alias: 'M1',
    resourceType: 'MedicationRequest',
    resourceId: 'mr-1',
    display: 'oxybutynin 5 mg',
    ingredient: 'oxybutynin',
    rxcui: '32675',
    strength: '5 mg',
    frequency: 'three times daily',
    status: 'active',
    isCurrent: true,
    sourceReference: 'Practitioner/prac-1',
    sourceDisplay: 'Urology — Dr. Samuel Reed',
    authoredOn: '2026-01-04',
  });
});

test('keeps non-active medications but marks them as not current', async () => {
  const { medplum } = stubMedplum({
    MedicationRequest: [{
      resourceType: 'MedicationRequest',
      id: 'mr-old',
      status: 'completed',
      intent: 'order',
      subject: { reference: `Patient/${PATIENT_ID}` },
      medicationCodeableConcept: { text: 'benzonatate' },
    }],
  });

  const { medications } = await loadChartContext(medplum, PATIENT_ID);
  assert.equal(medications.length, 1);
  assert.equal(medications[0].status, 'completed');
  assert.equal(medications[0].isCurrent, false);
});

// ─── MedicationStatement normalization ───────────────────────────────────────

test('normalizes a MedicationStatement, preserving the information source', async () => {
  const { medplum } = stubMedplum({
    MedicationStatement: [{
      resourceType: 'MedicationStatement',
      id: 'ms-1',
      status: 'active',
      subject: { reference: `Patient/${PATIENT_ID}` },
      effectiveDateTime: '2026-02-01T00:00:00.000Z',
      dateAsserted: '2026-03-01T00:00:00.000Z',
      informationSource: { reference: 'Patient/pat-1', display: 'Margaret Okonkwo' },
      medicationCodeableConcept: {
        coding: [{ system: RXNORM, code: '1191', display: 'Aspirin' }],
      },
      dosage: [{
        timing: { code: { text: 'once daily' } },
        doseAndRate: [{ doseQuantity: { value: 81, unit: 'mg' } }],
      }],
    }],
  });

  const { medications } = await loadChartContext(medplum, PATIENT_ID);
  assert.equal(medications[0].resourceType, 'MedicationStatement');
  assert.equal(medications[0].display, 'Aspirin');
  assert.equal(medications[0].ingredient, 'aspirin');
  assert.equal(medications[0].rxcui, '1191');
  assert.equal(medications[0].strength, '81 mg');
  assert.equal(medications[0].frequency, 'once daily');
  assert.equal(medications[0].sourceReference, 'Patient/pat-1');
  assert.equal(medications[0].sourceDisplay, 'Margaret Okonkwo');
  assert.equal(medications[0].authoredOn, '2026-02-01T00:00:00.000Z');
});

test('falls back effectiveDateTime -> effectivePeriod.start -> dateAsserted', async () => {
  const base = {
    resourceType: 'MedicationStatement' as const,
    status: 'active' as const,
    subject: { reference: `Patient/${PATIENT_ID}` },
    medicationCodeableConcept: { text: 'senna' },
  };
  const { medplum } = stubMedplum({
    MedicationStatement: [
      { ...base, id: 'ms-period', effectivePeriod: { start: '2026-02-02' }, dateAsserted: '2026-04-04' },
      { ...base, id: 'ms-asserted', dateAsserted: '2026-05-05' },
      { ...base, id: 'ms-none' },
    ],
  });

  const { medications } = await loadChartContext(medplum, PATIENT_ID);
  const byId = new Map(medications.map((m) => [m.resourceId, m.authoredOn]));
  assert.equal(byId.get('ms-period'), '2026-02-02');
  assert.equal(byId.get('ms-asserted'), '2026-05-05');
  assert.equal(byId.get('ms-none'), null);
});

// ─── Display fallback order and unknown values ───────────────────────────────

test('resolves display as text -> RxNorm display -> first coding -> reference display', async () => {
  const { medplum } = stubMedplum({
    MedicationRequest: [
      {
        resourceType: 'MedicationRequest', id: 'a', status: 'active', intent: 'order',
        subject: { reference: `Patient/${PATIENT_ID}` },
        medicationCodeableConcept: {
          text: 'the text wins',
          coding: [{ system: RXNORM, code: '1', display: 'RxNorm display' }],
        },
      },
      {
        resourceType: 'MedicationRequest', id: 'b', status: 'active', intent: 'order',
        subject: { reference: `Patient/${PATIENT_ID}` },
        medicationCodeableConcept: {
          coding: [
            { system: 'http://snomed.info/sct', code: '99', display: 'Snomed display' },
            { system: RXNORM, code: '2', display: 'RxNorm display' },
          ],
        },
      },
      {
        resourceType: 'MedicationRequest', id: 'c', status: 'active', intent: 'order',
        subject: { reference: `Patient/${PATIENT_ID}` },
        medicationCodeableConcept: {
          coding: [{ system: 'http://snomed.info/sct', code: '98', display: 'Snomed only' }],
        },
      },
      {
        resourceType: 'MedicationRequest', id: 'd', status: 'active', intent: 'order',
        subject: { reference: `Patient/${PATIENT_ID}` },
        medicationReference: { reference: 'Medication/med-1', display: 'Referenced product' },
      },
    ],
  });

  const { medications } = await loadChartContext(medplum, PATIENT_ID);
  const byId = new Map(medications.map((m) => [m.resourceId, m]));
  assert.equal(byId.get('a')!.display, 'the text wins');
  assert.equal(byId.get('b')!.display, 'RxNorm display');
  assert.equal(byId.get('c')!.display, 'Snomed only');
  assert.equal(byId.get('d')!.display, 'Referenced product');
});

test('never guesses: missing RxNorm coding and missing dosing stay null', async () => {
  const { medplum } = stubMedplum({
    MedicationRequest: [{
      resourceType: 'MedicationRequest', id: 'mr-bare', status: 'active', intent: 'order',
      subject: { reference: `Patient/${PATIENT_ID}` },
      medicationCodeableConcept: {
        text: 'the little white pill',
        coding: [{ system: 'http://snomed.info/sct', code: '77', display: 'Something' }],
      },
      dosageInstruction: [{ text: 'as directed' }],
    }],
  });

  const { medications } = await loadChartContext(medplum, PATIENT_ID);
  assert.equal(medications[0].ingredient, null);
  assert.equal(medications[0].rxcui, null);
  assert.equal(medications[0].strength, null);
  assert.equal(medications[0].frequency, null);
  assert.equal(medications[0].sourceReference, null);
  assert.equal(medications[0].sourceDisplay, null);
  assert.equal(medications[0].authoredOn, null);
});

// ─── Filtering ───────────────────────────────────────────────────────────────

test('excludes entered-in-error resources', async () => {
  const { medplum } = stubMedplum({
    MedicationRequest: [
      {
        resourceType: 'MedicationRequest', id: 'mr-bad', status: 'entered-in-error', intent: 'order',
        subject: { reference: `Patient/${PATIENT_ID}` },
        medicationCodeableConcept: { text: 'mistake' },
      },
      {
        resourceType: 'MedicationRequest', id: 'mr-ok', status: 'active', intent: 'order',
        subject: { reference: `Patient/${PATIENT_ID}` },
        medicationCodeableConcept: { text: 'amlodipine' },
      },
    ],
    MedicationStatement: [{
      resourceType: 'MedicationStatement', id: 'ms-bad', status: 'entered-in-error',
      subject: { reference: `Patient/${PATIENT_ID}` },
      medicationCodeableConcept: { text: 'mistake' },
    }],
    Condition: [
      {
        resourceType: 'Condition', id: 'cond-bad',
        subject: { reference: `Patient/${PATIENT_ID}` },
        verificationStatus: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
            code: 'entered-in-error',
          }],
        },
        code: { text: 'typo' },
      },
      {
        resourceType: 'Condition', id: 'cond-ok',
        subject: { reference: `Patient/${PATIENT_ID}` },
        code: { text: 'hypertension' },
      },
    ],
  });

  const { medications, conditions } = await loadChartContext(medplum, PATIENT_ID);
  assert.deepEqual(medications.map((m) => m.resourceId), ['mr-ok']);
  assert.deepEqual(conditions.map((c) => c.resourceId), ['cond-ok']);
});

test('excludes review-output resources so prior review never feeds the next call', async () => {
  const reviewOutput = { meta: { tag: [{ ...REVIEW_OUTPUT_TAG }] } };
  const { medplum } = stubMedplum({
    MedicationStatement: [
      {
        resourceType: 'MedicationStatement', id: 'ms-review', status: 'active', ...reviewOutput,
        subject: { reference: `Patient/${PATIENT_ID}` },
        medicationCodeableConcept: { text: 'diphenhydramine' },
      },
      {
        resourceType: 'MedicationStatement', id: 'ms-real', status: 'active',
        subject: { reference: `Patient/${PATIENT_ID}` },
        medicationCodeableConcept: { text: 'senna' },
      },
    ],
    Condition: [{
      resourceType: 'Condition', id: 'cond-review', ...reviewOutput,
      subject: { reference: `Patient/${PATIENT_ID}` },
      code: { text: 'insomnia' },
    }],
  });

  const { medications, conditions } = await loadChartContext(medplum, PATIENT_ID);
  assert.deepEqual(medications.map((m) => m.resourceId), ['ms-real']);
  assert.deepEqual(conditions, []);
  assert.equal(REVIEW_OUTPUT_TAG.system, 'https://ycxmedplum.dev/tags');
  assert.equal(REVIEW_OUTPUT_TAG.code, 'review-output');
});

// ─── Sorting and aliases ─────────────────────────────────────────────────────

test('sorts by normalized display, then resource type, then id, and aliases after sorting', async () => {
  const mr = (id: string, text: string): MedicationRequest => ({
    resourceType: 'MedicationRequest', id, status: 'active', intent: 'order',
    subject: { reference: `Patient/${PATIENT_ID}` },
    medicationCodeableConcept: { text },
  });
  const ms = (id: string, text: string): MedicationStatement => ({
    resourceType: 'MedicationStatement', id, status: 'active',
    subject: { reference: `Patient/${PATIENT_ID}` },
    medicationCodeableConcept: { text },
  });

  const { medplum } = stubMedplum({
    MedicationRequest: [mr('r-2', 'Furosemide'), mr('r-1', '  furosemide '), mr('r-9', 'zolpidem')],
    MedicationStatement: [ms('s-1', 'furosemide'), ms('s-2', 'Allopurinol')],
  });

  const { medications } = await loadChartContext(medplum, PATIENT_ID);
  assert.deepEqual(
    medications.map((m) => [m.alias, m.resourceType, m.resourceId]),
    [
      ['M1', 'MedicationStatement', 's-2'],   // allopurinol
      ['M2', 'MedicationRequest', 'r-1'],     // furosemide: request sorts before statement
      ['M3', 'MedicationRequest', 'r-2'],
      ['M4', 'MedicationStatement', 's-1'],
      ['M5', 'MedicationRequest', 'r-9'],     // zolpidem
    ],
  );
});

// ─── Conditions ──────────────────────────────────────────────────────────────

test('normalizes conditions with code and clinical status', async () => {
  const { medplum } = stubMedplum({
    Condition: [
      {
        resourceType: 'Condition', id: 'cond-1',
        subject: { reference: `Patient/${PATIENT_ID}` },
        clinicalStatus: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: 'active',
          }],
        },
        code: {
          coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'I10', display: 'Essential hypertension' }],
          text: 'hypertension',
        },
      },
      {
        resourceType: 'Condition', id: 'cond-2',
        subject: { reference: `Patient/${PATIENT_ID}` },
        code: { coding: [{ system: 'http://snomed.info/sct', display: 'Gout' }] },
      },
    ],
  });

  const { conditions } = await loadChartContext(medplum, PATIENT_ID);
  assert.deepEqual(conditions, [
    { resourceId: 'cond-2', display: 'Gout', code: null, clinicalStatus: null },
    { resourceId: 'cond-1', display: 'hypertension', code: 'I10', clinicalStatus: 'active' },
  ]);
});

// ─── Runner ──────────────────────────────────────────────────────────────────

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(err);
  }
}
if (failed > 0) {
  console.error(`loadChartContext: ${failed}/${tests.length} tests failed`);
  process.exit(1);
}
console.log(`loadChartContext: ${tests.length} tests passed`);

/**
 * SEED TESTS — offline, no Medplum, no keys.
 *
 * The Medplum double is a structural stub cast `as unknown as MedplumClient`
 * (Section 5 of the execution plan). It implements only the four methods the
 * seeder uses: createResource, updateResource, searchResources, searchOne.
 */

import assert from 'node:assert/strict';
import type { MedplumClient } from '@medplum/core';
import type {
  Condition, MedicationRequest, MedicationStatement, Patient, Practitioner, Resource,
} from '@medplum/fhirtypes';
import {
  seedDemoPatient,
  DEMO_TRANSCRIPT, DEMO_CONDITIONS, DEMO_DURATIONS,
  DEMO_IDENTIFIER_SYSTEM, DEMO_MEDICATIONS, SYNTHETIC_TAG, REVIEW_OUTPUT_TAG,
} from './seed.js';

// ─── fake Medplum ────────────────────────────────────────────────────────────

type AnyRes = Resource & { id?: string; [k: string]: unknown };

class FakeMedplum {
  readonly store: Record<string, AnyRes[]> = {};
  private counter = 0;

  all<T extends AnyRes>(resourceType: string): T[] {
    return (this.store[resourceType] ?? []) as T[];
  }

  seedExisting<T extends AnyRes>(resource: T): T {
    const withId = { ...resource, id: resource.id ?? `pre-${++this.counter}` } as T;
    (this.store[resource.resourceType] ??= []).push(withId);
    return withId;
  }

  async createResource<T extends AnyRes>(resource: T): Promise<T> {
    const created = { ...resource, id: `${resource.resourceType}-${++this.counter}` } as T;
    (this.store[resource.resourceType] ??= []).push(created);
    return structuredClone(created);
  }

  async updateResource<T extends AnyRes>(resource: T): Promise<T> {
    assert.ok(resource.id, 'updateResource requires an id');
    const list = (this.store[resource.resourceType] ??= []);
    const i = list.findIndex((r) => r.id === resource.id);
    assert.ok(i >= 0, `updateResource on unknown ${resource.resourceType}/${resource.id}`);
    list[i] = structuredClone(resource) as AnyRes;
    return structuredClone(list[i]) as T;
  }

  async searchResources<T extends AnyRes>(
    resourceType: string,
    query?: Record<string, string>,
  ): Promise<T[]> {
    const list = this.all<T>(resourceType);
    const hits = list.filter((r) => matches(r, query ?? {}));
    return structuredClone(hits);
  }

  async searchOne<T extends AnyRes>(
    resourceType: string,
    query?: Record<string, string>,
  ): Promise<T | undefined> {
    return (await this.searchResources<T>(resourceType, query))[0];
  }

  asClient(): MedplumClient {
    return this as unknown as MedplumClient;
  }
}

function matches(resource: AnyRes, query: Record<string, string>): boolean {
  return Object.entries(query).every(([key, value]) => {
    if (key === 'identifier') {
      const [system, id] = value.split('|');
      const identifiers = (resource.identifier ?? []) as { system?: string; value?: string }[];
      return identifiers.some((i) => i.system === system && i.value === id);
    }
    if (key === '_tag') {
      const [system, code] = value.split('|');
      const tags = (resource.meta?.tag ?? []) as { system?: string; code?: string }[];
      return tags.some((t) => t.system === system && t.code === code);
    }
    if (key === 'subject' || key === 'patient') {
      const subject = resource[key === 'patient' ? 'subject' : key] as { reference?: string } | undefined;
      return subject?.reference === value;
    }
    throw new Error(`fake Medplum: unsupported search param "${key}"`);
  });
}

function counts(fake: FakeMedplum) {
  return {
    patients: fake.all('Patient').length,
    practitioners: fake.all('Practitioner').length,
    conditions: fake.all('Condition').length,
    medicationRequests: fake.all('MedicationRequest').length,
    medicationStatements: fake.all('MedicationStatement').length,
  };
}

/** A MedicationStatement enters chart prefill unless it is tagged as review output. */
function prefillEligibleStatements(fake: FakeMedplum): MedicationStatement[] {
  return fake.all<MedicationStatement & AnyRes>('MedicationStatement').filter((s) =>
    !(s.meta?.tag ?? []).some(
      (t) => t.system === REVIEW_OUTPUT_TAG.system && t.code === REVIEW_OUTPUT_TAG.code,
    ));
}

const MARGARET_DEMOGRAPHICS = {
  name: [{ given: ['Margaret'], family: 'Okonkwo' }],
  gender: 'female' as const,
  birthDate: '1943-04-12',
};

// ─── 1. exports preserved ────────────────────────────────────────────────────

assert.ok(DEMO_TRANSCRIPT.includes('Margaret'), 'DEMO_TRANSCRIPT preserved');
assert.equal(DEMO_CONDITIONS.length, 5, 'DEMO_CONDITIONS preserved');
assert.equal(DEMO_DURATIONS.lorazepam, 468, 'DEMO_DURATIONS preserved');

// ─── 2. the exact seeded medication table ────────────────────────────────────

assert.equal(DEMO_MEDICATIONS.length, 9, 'nine authoritative prescriptions');
assert.deepEqual(
  DEMO_MEDICATIONS.map((m) => [m.ingredient, m.rxcui]),
  [
    ['donepezil', '135447'],
    ['oxybutynin', '32675'],
    ['amlodipine', '17767'],
    ['furosemide', '4603'],
    ['allopurinol', '519'],
    ['lisinopril', '29046'],
    ['benzonatate', '18993'],
    ['lorazepam', '6470'],
    ['omeprazole', '7646'],
  ],
  'RxCUIs match the RxNav-verified table',
);
for (const patientOnly of ['diphenhydramine', 'senna']) {
  assert.ok(
    !DEMO_MEDICATIONS.some((m) => m.ingredient === patientOnly),
    `${patientOnly} stays patient-only`,
  );
}

// ─── 3. seeding twice is idempotent ──────────────────────────────────────────

{
  const fake = new FakeMedplum();
  const first = await seedDemoPatient(fake.asClient());
  const afterFirst = counts(fake);

  assert.deepEqual(afterFirst, {
    patients: 1, practitioners: 5, conditions: 5,
    medicationRequests: 9, medicationStatements: 0,
  }, 'first seed creates the exact chart');

  const second = await seedDemoPatient(fake.asClient());
  assert.deepEqual(counts(fake), afterFirst, 'second seed creates no duplicates');
  assert.equal(second.patient.id, first.patient.id, 'same patient is reused');
  assert.deepEqual(
    second.medicationRequests.map((m) => m.id).sort(),
    first.medicationRequests.map((m) => m.id).sort(),
    'same MedicationRequests are reused',
  );

  // Five distinct fictional prescribers, each stably identified.
  const practitioners = fake.all<Practitioner & AnyRes>('Practitioner');
  const practitionerIdentifiers = new Set(
    practitioners.map((p) => p.identifier?.[0]?.value),
  );
  assert.equal(practitionerIdentifiers.size, 5, 'five distinct practitioner identifiers');
  for (const p of practitioners) {
    assert.equal(p.identifier?.[0]?.system, DEMO_IDENTIFIER_SYSTEM);
  }

  // Every resource is marked synthetic and stably identified.
  for (const type of ['Patient', 'Practitioner', 'Condition', 'MedicationRequest']) {
    for (const r of fake.all(type)) {
      const tags = (r.meta?.tag ?? []) as { system?: string; code?: string }[];
      assert.ok(
        tags.some((t) => t.system === SYNTHETIC_TAG.system && t.code === SYNTHETIC_TAG.code),
        `${type} carries the synthetic-demo tag`,
      );
      const identifiers = (r.identifier ?? []) as { system?: string }[];
      assert.ok(
        identifiers.some((i) => i.system === DEMO_IDENTIFIER_SYSTEM),
        `${type} carries a stable demo identifier`,
      );
    }
  }

  const requests = fake.all<MedicationRequest & AnyRes>('MedicationRequest');
  for (const r of requests) {
    assert.equal(r.status, 'active');
    assert.equal(r.intent, 'order');
    assert.equal(r.subject?.reference, `Patient/${first.patient.id}`);
    assert.equal(
      r.medicationCodeableConcept?.coding?.[0]?.system,
      'http://www.nlm.nih.gov/research/umls/rxnorm',
    );
    assert.ok(r.authoredOn, 'authored date recorded');
  }

  const byIngredient = new Map(
    requests.map((r) => [r.medicationCodeableConcept?.coding?.[0]?.display, r]),
  );

  // Structured dosage, not just free text.
  const oxybutynin = byIngredient.get('oxybutynin')!;
  assert.equal(oxybutynin.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity?.value, 5);
  assert.equal(oxybutynin.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity?.unit, 'mg');
  assert.equal(oxybutynin.dosageInstruction?.[0]?.timing?.code?.text, 'three times daily');

  // The hero chain has three distinct recorded sources.
  const chain = ['amlodipine', 'furosemide', 'allopurinol']
    .map((i) => byIngredient.get(i)!.requester?.display);
  assert.equal(new Set(chain).size, 3, 'the hero chain has three distinct sources');
  assert.ok(chain.every(Boolean), 'the hero chain has no missing source');

  // Requester references resolve to seeded Practitioners.
  const practitionerRefs = new Set(practitioners.map((p) => `Practitioner/${p.id}`));
  for (const r of requests) {
    if (!r.requester) continue;
    assert.ok(
      practitionerRefs.has(r.requester.reference!),
      `requester resolves to a seeded Practitioner (${r.requester.reference})`,
    );
  }

  // omeprazole is permanently source-unknown.
  assert.equal(byIngredient.get('omeprazole')!.requester, undefined,
    'omeprazole has no requester');

  assert.equal(fake.all('Condition').length, DEMO_CONDITIONS.length);
}

// ─── 4. an existing patient does not block missing child resources ───────────

{
  const fake = new FakeMedplum();
  const { patient } = await seedDemoPatient(fake.asClient());

  // Simulate a chart where the patient survived but the children were deleted.
  fake.store['Practitioner'] = [];
  fake.store['Condition'] = [];
  fake.store['MedicationRequest'] = [];

  const again = await seedDemoPatient(fake.asClient());
  assert.equal(again.patient.id, patient.id, 'existing patient is reused, not duplicated');
  assert.deepEqual(counts(fake), {
    patients: 1, practitioners: 5, conditions: 5,
    medicationRequests: 9, medicationStatements: 0,
  }, 'missing children are recreated under the existing patient');
}

// ─── 5. pre-feature legacy chart is adopted, not duplicated ──────────────────

{
  const fake = new FakeMedplum();

  // Exactly the chart the old seeder produced: synthetic tag, no stable
  // identifier, five text-only conditions, plus untagged review output.
  const legacyPatient = fake.seedExisting<Patient & AnyRes>({
    resourceType: 'Patient',
    active: true,
    ...MARGARET_DEMOGRAPHICS,
    telecom: [{ system: 'phone', value: '555-0100' }],
    meta: { tag: [SYNTHETIC_TAG] },
  });
  for (const text of DEMO_CONDITIONS) {
    fake.seedExisting<Condition & AnyRes>({
      resourceType: 'Condition',
      clinicalStatus: { coding: [{ code: 'active' }] },
      subject: { reference: `Patient/${legacyPatient.id}` },
      code: { text },
    });
  }
  for (const spoken of ['a water pill', 'the Benadryl']) {
    fake.seedExisting<MedicationStatement & AnyRes>({
      resourceType: 'MedicationStatement',
      status: 'active',
      subject: { reference: `Patient/${legacyPatient.id}` },
      medicationCodeableConcept: { text: spoken },
    });
  }

  const result = await seedDemoPatient(fake.asClient());

  assert.equal(result.patient.id, legacyPatient.id, 'the legacy patient is adopted');
  assert.deepEqual(counts(fake), {
    patients: 1, practitioners: 5, conditions: 5,
    medicationRequests: 9, medicationStatements: 2,
  }, 'adoption adds the missing chart without duplicating patient or conditions');

  const adopted = fake.all<Patient & AnyRes>('Patient')[0];
  assert.ok(
    adopted.identifier?.some((i) => i.system === DEMO_IDENTIFIER_SYSTEM),
    'the adopted patient gains the stable identifier',
  );

  for (const c of fake.all<Condition & AnyRes>('Condition')) {
    assert.ok(
      c.identifier?.some((i) => i.system === DEMO_IDENTIFIER_SYSTEM),
      `legacy condition "${c.code?.text}" gains a stable identifier`,
    );
    assert.ok(
      (c.meta?.tag ?? []).some((t) => t.code === SYNTHETIC_TAG.code),
      'legacy condition gains the synthetic tag',
    );
  }

  assert.deepEqual(prefillEligibleStatements(fake), [],
    'no pre-feature MedicationStatement is eligible for prefill');

  // Re-running over the adopted chart stays stable.
  await seedDemoPatient(fake.asClient());
  assert.deepEqual(counts(fake), {
    patients: 1, practitioners: 5, conditions: 5,
    medicationRequests: 9, medicationStatements: 2,
  }, 'reseeding an adopted chart is idempotent');
}

// ─── 6. a non-synthetic look-alike is never adopted or mutated ───────────────

{
  const fake = new FakeMedplum();
  const lookAlike = fake.seedExisting<Patient & AnyRes>({
    resourceType: 'Patient',
    active: true,
    ...MARGARET_DEMOGRAPHICS,
  });
  const before = structuredClone(lookAlike);

  const { patient } = await seedDemoPatient(fake.asClient());

  assert.notEqual(patient.id, lookAlike.id, 'a name match alone never adopts a patient');
  const after = fake.all<Patient & AnyRes>('Patient').find((p) => p.id === lookAlike.id);
  assert.deepEqual(after, before, 'the non-synthetic patient is left untouched');
  assert.equal(fake.all('Patient').length, 2, 'a fresh synthetic patient is created instead');
}

// ─── 7. a tagged-but-wrong-demographics patient is never adopted ─────────────

{
  const fake = new FakeMedplum();
  const otherSynthetic = fake.seedExisting<Patient & AnyRes>({
    resourceType: 'Patient',
    active: true,
    name: [{ given: ['Margaret'], family: 'Okonkwo' }],
    gender: 'female',
    birthDate: '1955-01-01',           // wrong birth date
    meta: { tag: [SYNTHETIC_TAG] },
  });

  const { patient } = await seedDemoPatient(fake.asClient());
  assert.notEqual(patient.id, otherSynthetic.id,
    'demographics must match exactly before adoption');
}

console.log('seed.test.ts — all assertions passed');

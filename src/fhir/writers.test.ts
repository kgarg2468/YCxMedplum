/**
 * Writer tests — offline. Medplum is a structural stub that indexes resources by
 * their output identifier, so "search by identifier, update or create" is
 * exercised exactly the way the live client behaves.
 */

import assert from 'node:assert/strict';
import type { MedplumClient } from '@medplum/core';
import type { Patient, Resource } from '@medplum/fhirtypes';
import {
  OUTPUT_IDENTIFIER_SYSTEM, outputIdentifier, persistReview, writeTaperPlan,
  writePrescriberMessage, writeRedFlagFlag, writeRedFlagTask,
} from './writers.js';
import { REVIEW_OUTPUT_TAG } from './seed.js';
import type { Finding, ResolvedMed, ReviewResult } from '../types.js';
import type { ReviewWriteOptions } from '../context/types.js';

const PATIENT: Patient = { resourceType: 'Patient', id: 'patient-1' };

interface Fake {
  medplum: MedplumClient;
  created: Resource[];
  updated: Resource[];
  all(): Resource[];
}

function fakeMedplum(): Fake {
  const store = new Map<string, Resource>();
  const created: Resource[] = [];
  const updated: Resource[] = [];
  let seq = 0;

  const keyOf = (r: any) => `${r.resourceType}|${r.identifier?.[0]?.value ?? ''}`;

  const medplum = {
    searchResources: async (resourceType: string, query: Record<string, string>) => {
      const value = (query.identifier ?? '').split('|').slice(1).join('|');
      const found = store.get(`${resourceType}|${value}`);
      return found ? [found] : [];
    },
    createResource: async (resource: any) => {
      const withId = { ...resource, id: `${resource.resourceType}-${++seq}` };
      store.set(keyOf(withId), withId);
      created.push(withId);
      return withId;
    },
    updateResource: async (resource: any) => {
      store.set(keyOf(resource), resource);
      updated.push(resource);
      return resource;
    },
  } as unknown as MedplumClient;

  return { medplum, created, updated, all: () => [...store.values()] };
}

function med(overrides: Partial<ResolvedMed>): ResolvedMed {
  return {
    spoken_as: 'a little white one',
    name_guess: 'oxybutynin',
    strength: '5 mg',
    frequency: 'three times daily',
    stated_indication: 'for my bladder',
    otc: false,
    confidence: 'medium',
    rxcui: '32675',
    ingredient: 'oxybutynin',
    unresolved: false,
    provenance: 'patient-reported',
    ...overrides,
  };
}

const CHART_MED = med({
  ingredient: 'amlodipine', name_guess: 'amlodipine 10 mg', spoken_as: 'amlodipine 10 mg',
  rxcui: '17767', provenance: 'chart-confirmed', confidence: 'high',
});
const SPOKEN_MED = med({
  ingredient: 'diphenhydramine', name_guess: 'diphenhydramine', spoken_as: 'just a Benadryl',
  rxcui: '1049630', confidence: 'high', otc: true,
});
const FURO_MED = med({
  ingredient: 'furosemide', name_guess: 'furosemide', spoken_as: 'a water pill',
  rxcui: '4603', provenance: 'chart-confirmed', confidence: 'high',
});

const PIM: Finding = {
  kind: 'pim', implicated: ['oxybutynin'], severity: 'high',
  label: 'Oxybutynin — anticholinergic', citation: 'Beers 2023, Table 2',
};
const CASCADE: Finding = {
  kind: 'cascade', implicated: ['amlodipine', 'furosemide'], severity: 'moderate',
  label: 'amlodipine → oedema → furosemide',
  citation: 'Savage et al., BMJ 2020;368:m261',
  symptomConfirmed: true, linkingSymptom: 'ankle swelling',
};

function review(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    meds: [CHART_MED, SPOKEN_MED, FURO_MED, med({})],
    findings: [PIM, CASCADE],
    symptoms: [],
    acbScore: 8,
    acbContributors: [{ ingredient: 'oxybutynin', score: 3 }],
    redFlags: [],
    patientGoals: ['stay in my own home'],
    unresolvedCount: 0,
    ...overrides,
  };
}

const identifiersOf = (resources: Resource[]) =>
  resources.map((r) => (r as any).identifier?.[0]?.value as string);

const purposeOf = (value: string) => value.split(':')[1];

// ── identifier shape ────────────────────────────────────────────────────────
{
  const id = outputIdentifier('call_1', 'medication', 'x');
  assert.equal(id.system, OUTPUT_IDENTIFIER_SYSTEM);
  assert.equal(id.system, 'https://ycxmedplum.dev/call-output');
  assert.match(id.value!, /^call_1:medication:[0-9a-f]{64}$/);
  // Same identity hashes the same; different identity does not.
  assert.equal(outputIdentifier('call_1', 'medication', 'x').value, id.value);
  assert.notEqual(outputIdentifier('call_1', 'medication', 'y').value, id.value);
}

// ── every purpose, tagged, uniquely identified ──────────────────────────────
{
  const fake = fakeMedplum();
  const options: ReviewWriteOptions = { runId: 'call_1' };
  const written = await persistReview(fake.medplum, PATIENT, review(), options);

  await writeTaperPlan(fake.medplum, PATIENT, 'lorazepam',
    [{ week: 1, dose: '0.5 mg', note: 'halve the dose' }, { week: 3, dose: 'stop', note: 'stop' }],
    ['sleep quality'], 'Deprescribing.org benzodiazepine algorithm', options);
  await writePrescriberMessage(fake.medplum, PATIENT, 'Pre-visit summary', options);
  await writeRedFlagFlag(fake.medplum, PATIENT, ['Chest pain'], 'Patient said: chest pressure', options);
  await writeRedFlagTask(fake.medplum, PATIENT, ['Chest pain'], options);

  const all = fake.all();
  const values = identifiersOf(all);
  assert.equal(values.filter(Boolean).length, all.length, 'every output resource is identified');
  assert.equal(new Set(values).size, values.length, 'identifiers are unique across families');

  const purposes = new Set(values.map(purposeOf));
  for (const purpose of [
    'medication', 'pim-flag', 'acb-risk', 'cascade-issue', 'goal',
    'taper-care-plan', 'taper-task', 'prescriber-communication', 'red-flag-flag', 'red-flag-task',
  ]) {
    assert.ok(purposes.has(purpose), `missing writer purpose ${purpose}`);
  }

  for (const resource of all) {
    const tags = resource.meta?.tag ?? [];
    assert.ok(
      tags.some((t) => t.system === REVIEW_OUTPUT_TAG.system && t.code === REVIEW_OUTPUT_TAG.code),
      `${resource.resourceType} is missing the review-output tag`,
    );
    assert.equal((resource as any).identifier[0].system, OUTPUT_IDENTIFIER_SYSTEM);
    assert.ok(values.every((v) => v.startsWith('call_1:')), 'run id prefixes every identifier');
  }

  // Deliberate statuses survive.
  assert.equal(written.cascades[0].status, 'preliminary');
  assert.equal(written.risk?.status, 'preliminary');
  const communication = all.find((r) => r.resourceType === 'Communication') as any;
  assert.equal(communication.status, 'preparation');
  const carePlan = all.find((r) => r.resourceType === 'CarePlan') as any;
  assert.equal(carePlan.status, 'draft');
}

// ── cross-family uniqueness for identical clinical identity ────────────────
{
  const same = { implicated: ['amlodipine'], severity: 'high' as const, label: 'same label', citation: 'c' };
  const fake = fakeMedplum();
  await persistReview(fake.medplum, PATIENT, review({
    findings: [{ kind: 'pim', ...same }, { kind: 'cascade', ...same, linkingSymptom: 'x' }],
    meds: [], patientGoals: [], acbScore: 0, acbContributors: [],
  }), { runId: 'call_1' });

  const values = identifiersOf(fake.all());
  assert.equal(new Set(values).size, values.length);
  assert.ok(values.some((v) => purposeOf(v) === 'pim-flag'));
  assert.ok(values.some((v) => purposeOf(v) === 'cascade-issue'));
}

// ── semantic stability under reordered arrays, and update-not-duplicate ────
{
  const first = fakeMedplum();
  await persistReview(first.medplum, PATIENT, review(), { runId: 'call_1' });
  const baseline = identifiersOf(first.all()).sort();

  // Same call, same clinical content, arrays in a different order.
  const reordered = review({
    meds: [SPOKEN_MED, med({}), CHART_MED, FURO_MED],
    findings: [CASCADE, PIM],
    acbContributors: [{ ingredient: 'oxybutynin', score: 3 }],
  });
  reordered.findings[0] = { ...CASCADE, implicated: ['furosemide', 'amlodipine'] };

  const createdBefore = first.created.length;
  await persistReview(first.medplum, PATIENT, reordered, { runId: 'call_1' });

  assert.deepEqual(identifiersOf(first.all()).sort(), baseline, 'identities are position-independent');
  assert.equal(first.created.length, createdBefore, 'nothing new was created on the second pass');
  assert.ok(first.updated.length > 0, 'existing resources were updated in place');
}

// ── honest provenance wording ───────────────────────────────────────────────
{
  const fake = fakeMedplum();
  const written = await persistReview(fake.medplum, PATIENT, review({
    meds: [CHART_MED, SPOKEN_MED], findings: [], patientGoals: [], acbScore: 0, acbContributors: [],
  }), { runId: 'call_1' });

  const chart = written.meds.find((m) => m.medicationCodeableConcept?.coding?.[0]?.code === '17767')!;
  const notes = (chart.note ?? []).map((n) => n.text);
  assert.ok(notes.includes('Chart record confirmed by patient; not restated verbatim'));
  assert.ok(!notes.some((n) => n?.includes('Patient said')), 'never fabricate a quote for a chart record');
  assert.ok(!notes.some((n) => n?.includes('Extraction confidence')), 'match confidence is not extraction confidence');

  const spoken = written.meds.find((m) => m.medicationCodeableConcept?.coding?.[0]?.code === '1049630')!;
  const spokenNotes = (spoken.note ?? []).map((n) => n.text);
  assert.ok(spokenNotes.includes('Patient said: "just a Benadryl"'), 'the genuine quote is kept verbatim');
  assert.ok(spokenNotes.includes('Extraction confidence: high'));
  assert.ok(spokenNotes.includes('Reported as over-the-counter / supplement'));
}

// ── rule-specific citation, kept separate from linking-symptom evidence ────
{
  const fake = fakeMedplum();
  const written = await persistReview(fake.medplum, PATIENT, review(), { runId: 'call_1' });

  const issue = written.cascades[0];
  const citation = issue.extension?.find((e) => e.url.endsWith('/citation'))?.valueString;
  assert.equal(citation, 'Savage et al., BMJ 2020;368:m261');
  const evidence = issue.evidence?.[0]?.code?.[0]?.text ?? '';
  assert.match(evidence, /Patient reported the linking symptom: ankle swelling/);
  assert.ok(!evidence.includes('Savage'), 'evidence is not the citation');
  // Causal order is preserved: trigger drug first.
  assert.deepEqual(issue.implicated?.map((i) => i.reference?.split('/')[0]), ['MedicationStatement', 'MedicationStatement']);

  const flag = written.flags[0];
  assert.equal(flag.extension?.find((e) => e.url.endsWith('/citation'))?.valueString, 'Beers 2023, Table 2');
}

// ── partial failure, then retry with the same run id ───────────────────────
{
  const fake = fakeMedplum();
  let ordinalToFail: number | null = 2;
  const failing: ReviewWriteOptions = {
    runId: 'call_1',
    beforeWrite: (ordinal) => {
      if (ordinal === ordinalToFail) throw new Error('injected write failure');
    },
  };

  await assert.rejects(() => persistReview(fake.medplum, PATIENT, review(), failing), /injected/);
  const partial = identifiersOf(fake.all());
  assert.equal(partial.length, 1, 'exactly one write landed before the failure');

  ordinalToFail = null;
  await persistReview(fake.medplum, PATIENT, review(), { runId: 'call_1' });

  const values = identifiersOf(fake.all());
  assert.equal(new Set(values).size, values.length, 'the retry created no duplicates');
  assert.ok(values.includes(partial[0]), 'the surviving identifier is unchanged');
  assert.equal(fake.updated.length, 1, 'only the already-written resource was updated');
}

// ── a different run writes its own resources ───────────────────────────────
{
  const fake = fakeMedplum();
  await persistReview(fake.medplum, PATIENT, review(), { runId: 'call_1' });
  const firstRun = identifiersOf(fake.all());
  await persistReview(fake.medplum, PATIENT, review(), { runId: 'call_2' });

  const secondRun = identifiersOf(fake.all()).filter((v) => !firstRun.includes(v));
  assert.equal(secondRun.length, firstRun.length);
  assert.ok(secondRun.every((v) => v.startsWith('call_2:')));
  // The canned demo uses a stable offline run id, so re-running it never duplicates.
  const canned = fakeMedplum();
  await persistReview(canned.medplum, PATIENT, review(), { runId: 'offline-demo' });
  const before = canned.created.length;
  await persistReview(canned.medplum, PATIENT, review(), { runId: 'offline-demo' });
  assert.equal(canned.created.length, before);
}

console.log('writers tests passed');

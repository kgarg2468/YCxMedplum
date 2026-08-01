/**
 * SEED — the demo patient. Run this first, before anything else.
 *
 * Margaret is engineered so the engine finds, deterministically:
 *   4 cascades:
 *     donepezil  -> oxybutynin        (cholinesterase inhibitor -> antimuscarinic)
 *     amlodipine -> furosemide        (CCB oedema -> diuretic)
 *     furosemide -> allopurinol       (diuretic -> gout)   [chains off the previous one]
 *     lisinopril -> benzonatate       (ACE cough -> antitussive)
 *   5+ Beers hits: lorazepam, diphenhydramine, oxybutynin, omeprazole >8wk, and
 *     the sedative duplication
 *   ACB score ~8: oxybutynin 3 + diphenhydramine 3 + furosemide 1 + lorazepam 1
 *
 * The amlodipine -> furosemide -> allopurinol chain is the strongest on-stage
 * moment: three of her eleven drugs exist only to treat side effects of the others.
 *
 * ⚠️ Entirely synthetic. Never put real PHI in a hackathon demo.
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MedplumClient } from '@medplum/core';
import type {
  Coding, Condition, Identifier, MedicationRequest, MedicationStatement,
  Patient, Practitioner, Resource,
} from '@medplum/fhirtypes';

/** Stable identifiers make every seeded resource find-or-create-able. */
export const DEMO_IDENTIFIER_SYSTEM = 'https://ycxmedplum.dev/demo';

/** The existing synthetic marker — never mistake this chart for PHI. */
export const SYNTHETIC_TAG: Coding = { system: 'https://example.org/tags', code: 'synthetic-demo' };

/** Review-generated resources carry this tag so they never feed the next call. */
export const REVIEW_OUTPUT_TAG: Coding = { system: 'https://ycxmedplum.dev/tags', code: 'review-output' };

const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
const UCUM = 'http://unitsofmeasure.org';

/** The one stable key for the demo patient. */
const PATIENT_IDENTIFIER_VALUE = 'patient-margaret-okonkwo';

/** Exact demographics required before a legacy synthetic patient may be adopted. */
const MARGARET = {
  family: 'Okonkwo',
  given: 'Margaret',
  gender: 'female',
  birthDate: '1943-04-12',   // 82 years old
} as const;

export const DEMO_CONDITIONS = [
  'Alzheimer disease, mild',
  'Essential hypertension',
  'Gout',
  'Urge urinary incontinence',
  'Insomnia',
];

/** Approximate durations of use, in weeks — drives the duration-gated PIM rules. */
export const DEMO_DURATIONS: Record<string, number> = {
  lorazepam: 468,   // ~9 years
  omeprazole: 364,  // ~7 years, no current indication
  oxybutynin: 104,
  diphenhydramine: 156,
};

/**
 * The transcript. In the real demo this comes from the live voice call — keep this
 * as your deterministic fallback so you can rehearse without burning voice minutes,
 * and so a wifi failure on stage does not end the run.
 */
export const DEMO_TRANSCRIPT = `
Agent: Good afternoon Margaret. Before your appointment I'd like to go through your medications with you. Do you have your bottles nearby?
Patient: I do, I've got them all here in a bag.
Agent: Wonderful. Let's take them one at a time. What's the first one?
Patient: This is the donepezil, ten milligrams, once a day. That's for my memory.
Agent: Thank you. And the next?
Patient: Oxybutynin. Five milligrams, three times a day. That one's for my bladder — I was having accidents, a lot of urgency.
Agent: I appreciate you telling me. Next one?
Patient: Amlodipine, ten milligrams, for my blood pressure.
Agent: And the next?
Patient: A water pill. Furosemide I think. Twenty milligrams in the morning. My ankles were swelling up something awful, so they gave me that.
Agent: Thank you. What else is in the bag?
Patient: Allopurinol, a hundred milligrams. I got the gout in my big toe, terrible pain.
Agent: Anything else?
Patient: Lisinopril, ten milligrams. Also for the blood pressure.
Agent: And?
Patient: Benzonatate, I take that when the cough gets bad. I've had this dry cough for, oh, two years now. Just a tickle in my throat that won't quit.
Agent: Thank you for that. Do you take anything to help you sleep?
Patient: Lorazepam. One milligram at bedtime. I've been on that a long while, maybe nine years.
Agent: Anything else at night?
Patient: I take a Benadryl too, if the lorazepam isn't doing it.
Agent: Is there anything you buy at the drugstore without a prescription?
Patient: The Benadryl. And senna, for my bowels, I take that every day now.
Agent: And is there anything else in the bag, even something you've had a long time?
Patient: Oh — omeprazole. Twenty milligrams. I've taken that for years, since about 2019. I honestly don't know what it's for anymore. My old doctor started it.
Agent: Thank you, that's very helpful. Now I'd like to ask about how you've been feeling. Any dry mouth?
Patient: Terrible dry mouth, all the time.
Agent: Any dizziness when you stand up?
Patient: Sometimes, yes.
Agent: Any falls or near-falls?
Patient: I caught myself on the counter last month. Didn't fall, but it was close.
Agent: Any swelling in your ankles or legs?
Patient: Still a bit, yes, even with the water pill.
Agent: Any trouble with constipation?
Patient: That's why I take the senna. Nothing moves without it.
Agent: Any feeling foggy or forgetful during the day?
Patient: Very foggy. Especially the mornings. My daughter's noticed it too.
Agent: Thank you. If you could stop taking one of these, which would it be?
Patient: The sleeping pill. I don't think it even works anymore, and I hate feeling like this in the mornings. I just want to feel clear again.
Agent: That's very helpful, Margaret. Let me read the list back to you.
`.trim();

// ─── The authoritative cross-prescriber chart ────────────────────────────────

/**
 * Five fictional prescribers. The demo's whole point is that no single one of
 * them can see the whole list, so the cascade is invisible from any one chart.
 */
export const DEMO_PRACTITIONERS = [
  { key: 'neurology-elena-park',        given: 'Elena',  family: 'Park',     display: 'Neurology — Dr. Elena Park' },
  { key: 'urology-samuel-reed',         given: 'Samuel', family: 'Reed',     display: 'Urology — Dr. Samuel Reed' },
  { key: 'cardiology-priya-shah',       given: 'Priya',  family: 'Shah',     display: 'Cardiology — Dr. Priya Shah' },
  { key: 'primary-care-jordan-lee',     given: 'Jordan', family: 'Lee',      display: 'Primary care — Dr. Jordan Lee' },
  { key: 'rheumatology-sofia-martinez', given: 'Sofia',  family: 'Martinez', display: 'Rheumatology — Dr. Sofia Martinez' },
] as const;

export interface DemoMedication {
  ingredient: string;
  /** Verified against the live RxNav API (rxcui.json?name=…) on 2026-08-01. */
  rxcui: string;
  doseValue: number | null;
  doseUnit: string | null;
  frequency: string;
  sig: string;
  /** null = source not recorded; the MedicationRequest omits `requester`. */
  practitionerKey: string | null;
  authoredOn: string;
}

/**
 * Nine active prescriptions. Authored dates run in causal order so the hero
 * chain reads correctly: amlodipine -> furosemide -> allopurinol.
 * diphenhydramine and senna are deliberately absent — they exist only in the
 * patient's own account, which is exactly what the interview is for.
 */
export const DEMO_MEDICATIONS: DemoMedication[] = [
  { ingredient: 'donepezil',    rxcui: '135447', doseValue: 10,   doseUnit: 'mg', frequency: 'once daily',          sig: '10 mg once daily',        practitionerKey: 'neurology-elena-park',        authoredOn: '2022-03-14' },
  { ingredient: 'oxybutynin',   rxcui: '32675',  doseValue: 5,    doseUnit: 'mg', frequency: 'three times daily',   sig: '5 mg three times daily',  practitionerKey: 'urology-samuel-reed',         authoredOn: '2023-06-02' },
  { ingredient: 'amlodipine',   rxcui: '17767',  doseValue: 10,   doseUnit: 'mg', frequency: 'once daily',          sig: '10 mg once daily',        practitionerKey: 'cardiology-priya-shah',       authoredOn: '2021-09-08' },
  { ingredient: 'furosemide',   rxcui: '4603',   doseValue: 20,   doseUnit: 'mg', frequency: 'every morning',       sig: '20 mg every morning',     practitionerKey: 'primary-care-jordan-lee',     authoredOn: '2022-11-17' },
  { ingredient: 'allopurinol',  rxcui: '519',    doseValue: 100,  doseUnit: 'mg', frequency: 'once daily',          sig: '100 mg once daily',       practitionerKey: 'rheumatology-sofia-martinez', authoredOn: '2023-02-21' },
  { ingredient: 'lisinopril',   rxcui: '29046',  doseValue: 10,   doseUnit: 'mg', frequency: 'once daily',          sig: '10 mg once daily',        practitionerKey: 'cardiology-priya-shah',       authoredOn: '2021-09-08' },
  { ingredient: 'benzonatate',  rxcui: '18993',  doseValue: null, doseUnit: null, frequency: 'as needed for cough', sig: 'as needed for cough',     practitionerKey: 'primary-care-jordan-lee',     authoredOn: '2024-01-15' },
  { ingredient: 'lorazepam',    rxcui: '6470',   doseValue: 1,    doseUnit: 'mg', frequency: 'at bedtime',          sig: '1 mg at bedtime',         practitionerKey: 'primary-care-jordan-lee',     authoredOn: '2017-05-03' },
  // Source not recorded — the permanently source-unknown fixture.
  { ingredient: 'omeprazole',   rxcui: '7646',   doseValue: 20,   doseUnit: 'mg', frequency: 'once daily',          sig: '20 mg once daily',        practitionerKey: null,                          authoredOn: '2019-04-11' },
];

// ─── find-or-create plumbing ─────────────────────────────────────────────────

function demoIdentifier(value: string): Identifier {
  return { system: DEMO_IDENTIFIER_SYSTEM, value };
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function hasTag(resource: Resource, tag: Coding): boolean {
  return (resource.meta?.tag ?? []).some((t) => t.system === tag.system && t.code === tag.code);
}

function hasDemoIdentifier(resource: { identifier?: Identifier[] }): boolean {
  return (resource.identifier ?? []).some((i) => i.system === DEMO_IDENTIFIER_SYSTEM);
}

async function findByIdentifier<T extends Resource>(
  medplum: MedplumClient,
  resourceType: T['resourceType'],
  value: string,
): Promise<T | undefined> {
  return medplum.searchOne(
    resourceType as never,
    { identifier: `${DEMO_IDENTIFIER_SYSTEM}|${value}` },
  ) as Promise<T | undefined>;
}

/** Search by stable identifier, create only when genuinely absent. */
async function findOrCreate<T extends Resource>(
  medplum: MedplumClient,
  resourceType: T['resourceType'],
  identifierValue: string,
  build: () => T,
): Promise<T> {
  const existing = await findByIdentifier<T>(medplum, resourceType, identifierValue);
  if (existing) return existing;
  return medplum.createResource<T>(build());
}

// ─── legacy adoption (synthetic charts only) ─────────────────────────────────

function isMargaret(patient: Patient): boolean {
  const name = patient.name?.[0];
  return (
    name?.family === MARGARET.family &&
    (name?.given ?? []).includes(MARGARET.given) &&
    patient.gender === MARGARET.gender &&
    patient.birthDate === MARGARET.birthDate
  );
}

/**
 * Charts seeded before stable identifiers existed must be adopted rather than
 * duplicated — but only when the record is unambiguously the synthetic demo
 * patient. A name match alone never adopts or mutates anything.
 */
async function adoptLegacyPatient(medplum: MedplumClient): Promise<Patient | undefined> {
  const tagged = await medplum.searchResources('Patient', {
    _tag: `${SYNTHETIC_TAG.system}|${SYNTHETIC_TAG.code}`,
  });
  const candidates = tagged.filter((p) => isMargaret(p) && !hasDemoIdentifier(p));
  if (candidates.length !== 1) return undefined;

  return medplum.updateResource<Patient>({
    ...candidates[0],
    identifier: [...(candidates[0].identifier ?? []), demoIdentifier(PATIENT_IDENTIFIER_VALUE)],
  });
}

/** Give legacy conditions their stable identity instead of creating twins. */
async function adoptLegacyConditions(medplum: MedplumClient, patient: Patient): Promise<void> {
  const existing = await medplum.searchResources('Condition', {
    subject: `Patient/${patient.id}`,
  });
  for (const text of DEMO_CONDITIONS) {
    const legacy = existing.find((c) => c.code?.text === text && !hasDemoIdentifier(c));
    if (!legacy) continue;
    await medplum.updateResource<Condition>({
      ...legacy,
      identifier: [...(legacy.identifier ?? []), demoIdentifier(`condition-${slug(text)}`)],
      meta: { ...legacy.meta, tag: [...(legacy.meta?.tag ?? []), SYNTHETIC_TAG] },
    });
  }
}

/**
 * Pre-feature review output was written untagged. Tag it now so a prior review's
 * MedicationStatements can never be replayed back into the next call's prefill.
 */
async function tagLegacyReviewOutput(medplum: MedplumClient, patient: Patient): Promise<void> {
  const statements = await medplum.searchResources('MedicationStatement', {
    subject: `Patient/${patient.id}`,
  });
  for (const s of statements) {
    if (hasTag(s, REVIEW_OUTPUT_TAG)) continue;
    await medplum.updateResource<MedicationStatement>({
      ...s,
      meta: { ...s.meta, tag: [...(s.meta?.tag ?? []), REVIEW_OUTPUT_TAG] },
    });
  }
}

// ─── the seeder ──────────────────────────────────────────────────────────────

export async function seedDemoPatient(medplum: MedplumClient) {
  // 1. Patient — stable identifier first, synthetic-only adoption second.
  let patient = await findByIdentifier<Patient>(medplum, 'Patient', PATIENT_IDENTIFIER_VALUE);
  if (!patient) {
    const adopted = await adoptLegacyPatient(medplum);
    if (adopted) {
      patient = adopted;
      await adoptLegacyConditions(medplum, adopted);
      await tagLegacyReviewOutput(medplum, adopted);
    }
  }
  patient ??= await medplum.createResource<Patient>({
    resourceType: 'Patient',
    active: true,
    identifier: [demoIdentifier(PATIENT_IDENTIFIER_VALUE)],
    name: [{ given: [MARGARET.given], family: MARGARET.family }],
    gender: MARGARET.gender,
    birthDate: MARGARET.birthDate,
    telecom: [{ system: 'phone', value: '555-0100' }],
    // Marks the record as synthetic so nobody mistakes it for PHI.
    meta: { tag: [SYNTHETIC_TAG] },
  });
  const subject = { reference: `Patient/${patient.id}` };

  // 2. Practitioners — the five recorded sources.
  const practitioners: Practitioner[] = [];
  const practitionerByKey = new Map<string, Practitioner>();
  for (const p of DEMO_PRACTITIONERS) {
    const practitioner = await findOrCreate<Practitioner>(
      medplum, 'Practitioner', `practitioner-${p.key}`, () => ({
        resourceType: 'Practitioner',
        active: true,
        identifier: [demoIdentifier(`practitioner-${p.key}`)],
        name: [{ given: [p.given], family: p.family, prefix: ['Dr.'] }],
        meta: { tag: [SYNTHETIC_TAG] },
      }));
    practitioners.push(practitioner);
    practitionerByKey.set(p.key, practitioner);
  }

  // 3. Conditions — the recorded indications.
  const conditions: Condition[] = [];
  for (const text of DEMO_CONDITIONS) {
    conditions.push(await findOrCreate<Condition>(
      medplum, 'Condition', `condition-${slug(text)}`, () => ({
        resourceType: 'Condition',
        identifier: [demoIdentifier(`condition-${slug(text)}`)],
        clinicalStatus: { coding: [{ code: 'active' }] },
        subject,
        code: { text },
        meta: { tag: [SYNTHETIC_TAG] },
      })));
  }

  // 4. MedicationRequests — the authoritative nine.
  const medicationRequests: MedicationRequest[] = [];
  for (const m of DEMO_MEDICATIONS) {
    const identifierValue = `medication-request-${m.ingredient}`;
    const prescriber = m.practitionerKey ? practitionerByKey.get(m.practitionerKey) : undefined;
    const display = m.practitionerKey
      ? DEMO_PRACTITIONERS.find((p) => p.key === m.practitionerKey)!.display
      : undefined;

    medicationRequests.push(await findOrCreate<MedicationRequest>(
      medplum, 'MedicationRequest', identifierValue, () => ({
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        identifier: [demoIdentifier(identifierValue)],
        subject,
        authoredOn: m.authoredOn,
        medicationCodeableConcept: {
          coding: [{ system: RXNORM, code: m.rxcui, display: m.ingredient }],
          text: m.ingredient,
        },
        // Omitted entirely when the source was never recorded (omeprazole).
        requester: prescriber && display
          ? { reference: `Practitioner/${prescriber.id}`, display }
          : undefined,
        dosageInstruction: [{
          text: m.sig,
          timing: { code: { text: m.frequency } },
          doseAndRate: m.doseValue !== null && m.doseUnit
            ? [{ doseQuantity: { value: m.doseValue, unit: m.doseUnit, system: UCUM, code: m.doseUnit } }]
            : undefined,
        }],
        meta: { tag: [SYNTHETIC_TAG] },
      })));
  }

  console.log(
    `Seeded Patient/${patient.id}: ${practitioners.length} practitioners, ` +
    `${conditions.length} conditions, ${medicationRequests.length} medication requests.`,
  );
  return { patient, practitioners, conditions, medicationRequests };
}

// Run directly: `npx tsx src/fhir/seed.ts`
// pathToFileURL, not string concatenation — this repository path contains a space.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const medplum = new MedplumClient({ baseUrl: process.env.MEDPLUM_BASE_URL });
  await medplum.startClientLogin(
    process.env.MEDPLUM_CLIENT_ID!,
    process.env.MEDPLUM_CLIENT_SECRET!,
  );
  await seedDemoPatient(medplum);
}

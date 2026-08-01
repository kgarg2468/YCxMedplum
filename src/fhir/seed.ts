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

import { MedplumClient } from '@medplum/core';
import type { Patient, Condition } from '@medplum/fhirtypes';

export const DEMO_CONDITIONS = [
  'Alzheimer disease, mild',
  'Essential hypertension',
  'Gout',
  'Urge urinary incontinence',
  'Insomnia',
];

/**
 * ICD-10-CM codings for the seeded conditions. Each code verified against the
 * CMS FY2026 code set (in effect 2026-08-01, HIPAA-valid). "mild" has no ICD-10
 * axis for G30, so severity stays in the CodeableConcept text.
 */
const ICD10CM = 'http://hl7.org/fhir/sid/icd-10-cm';
const CONDITION_CODINGS: Record<string, { code: string; display: string }> = {
  'Alzheimer disease, mild':    { code: 'G30.9',  display: "Alzheimer's disease, unspecified" },
  'Essential hypertension':     { code: 'I10',    display: 'Essential (primary) hypertension' },
  'Gout':                       { code: 'M10.9',  display: 'Gout, unspecified' },
  'Urge urinary incontinence':  { code: 'N39.41', display: 'Urge incontinence' },
  'Insomnia':                   { code: 'G47.00', display: 'Insomnia, unspecified' },
};

export const DEMO_BIRTHDATE = '1943-04-12';

/** Whole-year age on a given date (defaults to today). */
export function ageOn(birthDate: string, on = new Date()): number {
  const b = new Date(birthDate);
  let age = on.getFullYear() - b.getFullYear();
  if (on.getMonth() < b.getMonth() || (on.getMonth() === b.getMonth() && on.getDate() < b.getDate())) age--;
  return age;
}

/** "Margaret Okonkwo, 83" — computed from the FHIR resource, never hardcoded. */
export function patientLabel(p?: Patient): string {
  const n = p?.name?.[0];
  const name = n ? [n.given?.join(' '), n.family].filter(Boolean).join(' ') : 'Margaret Okonkwo';
  return `${name}, ${ageOn(p?.birthDate ?? DEMO_BIRTHDATE)}`;
}

/**
 * SYNTHETIC prescriber/practice per drug — the cross-practice fragmentation
 * dimension. Real deployments would derive this from MedicationRequest.requester;
 * for the demo it is labeled synthetic everywhere it renders.
 */
export const DEMO_PRESCRIBERS: Record<string, string> = {
  amlodipine: 'Cardiology',
  lisinopril: 'Cardiology',
  furosemide: 'Primary care',
  allopurinol: 'Primary care',
  omeprazole: 'Primary care',
  donepezil: 'Neurology',
  oxybutynin: 'Urology',
  lorazepam: 'Primary care',
  benzonatate: 'Urgent care',
  diphenhydramine: 'Self (OTC)',
  senna: 'Self (OTC)',
};

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

export async function seedDemoPatient(medplum: MedplumClient) {
  // Idempotent: re-running the seed (or restarting the server) must not create
  // another Margaret. Search by the stable demographics before creating.
  const existing = await medplum.searchOne('Patient', `name=Okonkwo&birthdate=${DEMO_BIRTHDATE}`);
  if (existing) {
    console.log(`Reusing existing Patient/${existing.id} (idempotent seed).`);
    return { patient: existing, conditions: [] as Condition[] };
  }

  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    active: true,
    name: [{ given: ['Margaret'], family: 'Okonkwo' }],
    gender: 'female',
    birthDate: DEMO_BIRTHDATE,
    telecom: [{ system: 'phone', value: '555-0100' }],
    // Marks the record as synthetic so nobody mistakes it for PHI.
    meta: { tag: [{ system: 'https://example.org/tags', code: 'synthetic-demo' }] },
  });

  const conditions: Condition[] = [];
  for (const text of DEMO_CONDITIONS) {
    const coding = CONDITION_CODINGS[text];
    conditions.push(await medplum.createResource<Condition>({
      resourceType: 'Condition',
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
      },
      subject: { reference: `Patient/${patient.id}` },
      code: coding
        ? { coding: [{ system: ICD10CM, code: coding.code, display: coding.display }], text }
        : { text },
    }));
  }

  console.log(`Seeded Patient/${patient.id} with ${conditions.length} conditions.`);
  return { patient, conditions };
}

// Run directly: `npx tsx src/fhir/seed.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  const medplum = new MedplumClient({ baseUrl: process.env.MEDPLUM_BASE_URL });
  await medplum.startClientLogin(
    process.env.MEDPLUM_CLIENT_ID!,
    process.env.MEDPLUM_CLIENT_SECRET!,
  );
  await seedDemoPatient(medplum);
}

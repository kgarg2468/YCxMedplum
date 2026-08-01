/**
 * STAGE 2 — messy speech to structured data. This is the ONLY place the LLM
 * touches medication identity, and even here it is allowed to say "I don't know"
 * (name_guess: null) rather than guess. RxNav does the actual resolution.
 */

import { callJson, REASONING_MODEL } from './client.js';
import type { Extraction } from '../types.js';

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['medications', 'symptoms', 'values', 'red_flags'],
  properties: {
    medications: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['spoken_as', 'name_guess', 'strength', 'frequency',
                   'stated_indication', 'otc', 'confidence'],
        properties: {
          spoken_as: {
            type: 'string',
            description: 'Exactly what the patient said, verbatim, including vague phrases like "the little white pill"',
          },
          name_guess: {
            type: ['string', 'null'],
            description: 'Best guess at the generic drug name. null if you genuinely cannot tell. Never invent a plausible drug.',
          },
          strength: { type: ['string', 'null'], description: 'e.g. "5 mg". null if not stated.' },
          frequency: { type: ['string', 'null'], description: 'e.g. "once daily", "three times a day", "only at night". null if not stated.' },
          stated_indication: {
            type: ['string', 'null'],
            description: 'Why the PATIENT said they take it, in their words. null if they did not say or did not know. Never infer.',
          },
          otc: { type: 'boolean', description: 'True for over-the-counter, supplements, vitamins, herbals.' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    symptoms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['symptom', 'patient_words'],
        properties: {
          symptom: { type: 'string', description: 'Normalised symptom term, e.g. "ankle swelling"' },
          patient_words: { type: 'string', description: 'Verbatim quote from the patient' },
        },
      },
    },
    values: {
      type: 'array',
      items: { type: 'string' },
      description: 'What the patient said matters to them, or which medication they would most like to stop and why. Verbatim or close paraphrase.',
    },
    red_flags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Only: fall with head injury, syncope, chest pain, sudden confusion change, suicidal statements. Empty array if none.',
    },
  },
} as const;

const SYSTEM = `You extract structured data from a medication-review transcript.

RULES
- If you cannot confidently identify a drug, set name_guess to null and confidence
  to "low". Do NOT output a plausible-sounding drug name. A null is useful; a wrong
  guess is dangerous, and downstream code resolves names properly.
- Never infer an indication the patient did not state. If they said "I don't know
  what that one's for", stated_indication is null. That null is itself a finding.
- Preserve spoken_as verbatim, including vague descriptions.
- Include EVERY medication mentioned, including over-the-counter products,
  supplements, eye drops, inhalers, creams, and patches.
- If the patient mentions the same drug twice, output it once.
- Do not identify drug interactions, inappropriate medications, or causes of
  symptoms. That is not your job and separate code handles it.`;

const FEW_SHOT = `Here is an example of the messiness to expect and how to handle it.

TRANSCRIPT
Patient: I take the donepezil, ten milligrams, that's for my memory.
Agent: Anything else?
Patient: There's a little white one, three times a day, for my bladder. Oxy-something.
Agent: And anything you take at night?
Patient: Just a Benadryl to help me sleep. And there's a water pill, I don't really
know what that one does, my other doctor started it.

CORRECT EXTRACTION
- donepezil, 10 mg, spoken_as "the donepezil, ten milligrams", indication "my memory", confidence high
- oxybutynin, null strength, three times a day, spoken_as "a little white one ... Oxy-something",
  indication "for my bladder", confidence medium
- diphenhydramine, spoken_as "just a Benadryl", indication "to help me sleep", otc true, confidence high
- name_guess NULL, spoken_as "a water pill", indication null, confidence low
  (do NOT guess furosemide — RxNav and the clinician handle this)`;

export async function extract(transcript: string): Promise<Extraction> {
  return callJson<Extraction>({
    model: REASONING_MODEL,
    system: SYSTEM,
    user: `${FEW_SHOT}\n\nNow extract from this transcript.\n\nTRANSCRIPT\n${transcript}`,
    schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 4000,
  });
}

/**
 * Degraded fallback. If extraction fails twice, we still write something to FHIR
 * so the demo never dies on stage — just a bare list for the clinician.
 */
export function minimalFallback(transcript: string): Extraction {
  const lines = transcript
    .split('\n')
    .filter((l) => /^patient:/i.test(l))
    .map((l) => l.replace(/^patient:\s*/i, '').trim());
  return {
    medications: lines.map((l) => ({
      spoken_as: l, name_guess: null, strength: null, frequency: null,
      stated_indication: null, otc: false, confidence: 'low' as const,
    })),
    symptoms: [], values: [], red_flags: [],
  };
}

export async function extractWithRetry(transcript: string): Promise<Extraction> {
  try {
    return await extract(transcript);
  } catch (err) {
    console.warn('[extract] first attempt failed, retrying:', err);
    try {
      return await extract(transcript);
    } catch (err2) {
      console.error('[extract] both attempts failed, using fallback:', err2);
      return minimalFallback(transcript);
    }
  }
}

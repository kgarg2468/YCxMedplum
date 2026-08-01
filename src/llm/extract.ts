/**
 * STAGE 2 — messy speech to structured data. This is the ONLY place the LLM
 * touches medication identity, and even here it is allowed to say "I don't know"
 * (name_guess: null) rather than guess. RxNav does the actual resolution.
 */

import { callJson, REASONING_MODEL, type JsonCallOptions } from './client.js';
import type { Extraction, SpokenMed, ExtractedSymptom } from '../types.js';
import type {
  ChartMedicationConfirmation,
  ChartMedicationUseStatus,
  PatientConcernIntent,
  PatientMedicationConcern,
} from '../context/types.js';

const USE_STATUSES: ChartMedicationUseStatus[] =
  ['taking-as-documented', 'taking-differently', 'not-taking', 'unclear'];
const CONCERN_INTENTS: PatientConcernIntent[] =
  ['concern-only', 'discuss-changing', 'discuss-stopping'];

/**
 * What the model returns, before alias fan-out. It answers per RESPONSE, not per
 * medication: one "yes, all of those" covers several aliases at once, and
 * forcing the model to duplicate that answer itself is where models start
 * inventing per-drug detail the patient never said.
 */
export interface RawExtraction {
  medications: SpokenMed[];
  symptoms: ExtractedSymptom[];
  values: string[];
  red_flags: string[];
  chart_medication_confirmations: {
    chart_aliases: string[];
    use_status: ChartMedicationUseStatus;
    reported_strength: string | null;
    reported_frequency: string | null;
    indication: string | null;
  }[];
  medication_concerns: {
    chart_alias: string | null;
    medication_name: string | null;
    patient_words: string;
    intent: PatientConcernIntent;
  }[];
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['medications', 'symptoms', 'values', 'red_flags',
             'chart_medication_confirmations', 'medication_concerns'],
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
    chart_medication_confirmations: {
      type: 'array',
      description: 'One entry per ANSWER the patient gave about medications already on the chart. Empty array if no chart aliases were provided or the patient never addressed them.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['chart_aliases', 'use_status', 'reported_strength', 'reported_frequency', 'indication'],
        properties: {
          chart_aliases: {
            type: 'array',
            items: { type: 'string' },
            description: 'Every chart alias this one answer covers. If the agent named M1, M2 and M3 together and the patient said "yes", list all three here. Use ONLY aliases from the provided list.',
          },
          use_status: {
            type: 'string',
            enum: ['taking-as-documented', 'taking-differently', 'not-taking', 'unclear'],
            description: 'taking-as-documented = confirmed as charted. taking-differently = still taking but a different dose or schedule. not-taking = stopped or never started. unclear = they did not really answer.',
          },
          reported_strength: { type: ['string', 'null'], description: 'Only if they stated a strength different from the chart. Otherwise null.' },
          reported_frequency: { type: ['string', 'null'], description: 'Only if they stated a schedule different from the chart, e.g. "twice daily now". Otherwise null.' },
          indication: { type: ['string', 'null'], description: 'Why the PATIENT said they take it, in their words. null if they did not say.' },
        },
      },
    },
    medication_concerns: {
      type: 'array',
      description: 'Things the patient wants raised about a medication: side effects they dislike, cost, burden, or a wish to change or stop something. Record what they want discussed. Do NOT record a causal claim, and do not decide anything is a side effect.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['chart_alias', 'medication_name', 'patient_words', 'intent'],
        properties: {
          chart_alias: { type: ['string', 'null'], description: 'Chart alias the concern is about, from the provided list. null if it is about something not on the chart or is unclear.' },
          medication_name: { type: ['string', 'null'], description: 'Medication name if the patient named one and it is not a chart alias. Otherwise null.' },
          patient_words: { type: 'string', description: 'The patient\'s own words, verbatim. Do not paraphrase, soften, or clinicalise.' },
          intent: {
            type: 'string',
            enum: ['concern-only', 'discuss-changing', 'discuss-stopping'],
            description: 'concern-only = they mentioned it bothers them. discuss-changing = they want the dose or schedule discussed. discuss-stopping = they said they would like to stop it.',
          },
        },
      },
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
  symptoms. That is not your job and separate code handles it.

CHART ALIASES
- You may be given a list of chart aliases (M1, M2, ...) with the medication each
  one refers to. They are the assistant's private handles for medications already
  on the chart. Use ONLY aliases from that list; never invent one.
- Record each ANSWER once, listing every alias that answer covered. If the agent
  named three medications together and the patient said "yes, all of those", that
  is ONE entry with three aliases — do not split it into three invented answers.
- If the patient never addressed an alias, simply omit it. Silence is handled
  downstream as "unclear"; it is never confirmation.
- A medication the patient reports that is NOT on the chart belongs in
  "medications", not in a confirmation.
- Keep concern wording verbatim in "medication_concerns" and never turn it into a
  claim that a medication caused something.`;

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

export interface ExtractOptions {
  /**
   * Aliases of the CURRENT chart medications presented to the patient during the
   * call. Empty (the default) for canned runs with no chart behind them.
   */
  chartAliases?: string[];
  /**
   * Injection seam for the schema-constrained JSON call. Tests pass a local stub
   * so the mapping rules below are exercised offline, with no Anthropic
   * credentials and no network.
   */
  callJsonFn?: <T>(opts: JsonCallOptions) => Promise<T>;
}

/**
 * Fan out per-answer confirmations to exactly one confirmation per alias.
 *
 * Two invariants live here, and both are safety properties rather than
 * conveniences:
 *
 *  1. An alias the model never mentioned resolves to `unclear`. Never current.
 *     Deterministic review then excludes it while the gap stays visible to the
 *     clinician — silence must not keep a drug alive in the review.
 *  2. An alias the model invented is dropped. The model cannot widen the set of
 *     chart medications under discussion.
 */
function fanOutConfirmations(
  raw: RawExtraction['chart_medication_confirmations'],
  chartAliases: string[],
): ChartMedicationConfirmation[] {
  const known = new Set(chartAliases);
  const answered = new Map<string, ChartMedicationConfirmation>();

  for (const entry of raw ?? []) {
    const status: ChartMedicationUseStatus =
      USE_STATUSES.includes(entry?.use_status) ? entry.use_status : 'unclear';
    for (const alias of entry?.chart_aliases ?? []) {
      // First answer wins: a later contradictory entry is the model
      // re-litigating one exchange, not the patient answering twice.
      if (!known.has(alias) || answered.has(alias)) continue;
      answered.set(alias, {
        chartAlias: alias,
        useStatus: status,
        reportedStrength: entry.reported_strength ?? null,
        reportedFrequency: entry.reported_frequency ?? null,
        indication: entry.indication ?? null,
      });
    }
  }

  return chartAliases.map((alias) => answered.get(alias) ?? {
    chartAlias: alias,
    useStatus: 'unclear' as const,
    reportedStrength: null,
    reportedFrequency: null,
    indication: null,
  });
}

function mapConcerns(
  raw: RawExtraction['medication_concerns'],
  chartAliases: string[],
): PatientMedicationConcern[] {
  const known = new Set(chartAliases);
  return (raw ?? [])
    .filter((c) => typeof c?.patient_words === 'string' && c.patient_words.trim())
    .map((c) => ({
      // An alias outside the presented set is not a chart medication we can
      // point at, so it degrades to null rather than mislabelling a resource.
      chartAlias: c.chart_alias && known.has(c.chart_alias) ? c.chart_alias : null,
      medicationName: c.medication_name ?? null,
      patientWords: c.patient_words,
      intent: CONCERN_INTENTS.includes(c?.intent) ? c.intent : 'concern-only',
    }));
}

function toExtraction(raw: RawExtraction, chartAliases: string[]): Extraction {
  return {
    medications: raw?.medications ?? [],
    symptoms: raw?.symptoms ?? [],
    values: raw?.values ?? [],
    red_flags: raw?.red_flags ?? [],
    chart_medication_confirmations: fanOutConfirmations(raw?.chart_medication_confirmations, chartAliases),
    medication_concerns: mapConcerns(raw?.medication_concerns, chartAliases),
  };
}

function aliasBlock(chartAliases: string[]): string {
  if (!chartAliases.length) {
    return '\n\nNo chart aliases were presented on this call. chart_medication_confirmations must be an empty array.';
  }
  return `\n\nCHART ALIASES PRESENTED ON THIS CALL\n${chartAliases.join(', ')}\n` +
    'Use only these aliases. Omit any the patient did not address.';
}

export async function extract(transcript: string, options: ExtractOptions = {}): Promise<Extraction> {
  const chartAliases = options.chartAliases ?? [];
  const call = options.callJsonFn ?? callJson;
  const raw = await call<RawExtraction>({
    model: REASONING_MODEL,
    system: SYSTEM,
    user: `${FEW_SHOT}${aliasBlock(chartAliases)}\n\nNow extract from this transcript.\n\nTRANSCRIPT\n${transcript}`,
    schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 4000,
  });
  return toExtraction(raw, chartAliases);
}

/**
 * Degraded fallback. If extraction fails twice, we still write something to FHIR
 * so the demo never dies on stage — just a bare list for the clinician. Every
 * chart medication comes back `unclear`: a failed extraction is the last place
 * that should be assuming a patient is still taking anything.
 */
export function minimalFallback(transcript: string, chartAliases: string[] = []): Extraction {
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
    chart_medication_confirmations: fanOutConfirmations([], chartAliases),
    medication_concerns: [],
  };
}

export async function extractWithRetry(
  transcript: string,
  options: ExtractOptions = {},
): Promise<Extraction> {
  try {
    return await extract(transcript, options);
  } catch (err) {
    console.warn('[extract] first attempt failed, retrying:', err);
    try {
      return await extract(transcript, options);
    } catch (err2) {
      console.error('[extract] both attempts failed, using fallback:', err2);
      return minimalFallback(transcript, options.chartAliases ?? []);
    }
  }
}

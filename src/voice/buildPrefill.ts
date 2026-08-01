/**
 * Chart context -> Vapi dynamic variables.
 *
 * This is the only place chart data crosses the boundary into a third-party
 * voice LLM, so it is deliberately narrow:
 *
 *  - Only CURRENT medications. History is background for the clinician, not
 *    something to read to a patient, and it must never re-enter review.
 *  - Only alias, name, strength, frequency, source. No FHIR ids, no references,
 *    no patient id — the alias is the only handle the assistant gets, and the
 *    server keeps the alias -> resource mapping privately (`aliasToChartKey`).
 *  - Chart free text is sanitised for Liquid: Vapi substitutes `{{var}}`, so a
 *    medication display containing braces could otherwise close the template.
 *    Braces become their full-width twins — visually identical when read aloud,
 *    inert as syntax.
 *  - Size is bounded. Oversized context throws; a silently truncated JSON blob
 *    is worse than no prefill, because the assistant would confidently work
 *    from half a medication list.
 *
 * `context_status` is stamped into the payload so the prompt can keep saying the
 * one thing that matters: this is unverified background, the patient is the
 * authority on what they actually take.
 */

import type {
  ChartMedication,
  ChartMedicationResourceType,
  InterviewContext,
} from '../context/types.js';

/** Every display field is capped at this many characters. */
export const MAX_FIELD_CHARS = 200;
/** Hard ceiling for the serialised prefill. Exceeding it throws. */
export const MAX_PREFILL_CHARS = 12_000;
/** The only value `context_status` ever takes. */
export const CONTEXT_STATUS = 'unverified_chart_background';

export interface PrefillMedication {
  alias: string;
  name: string;
  strength: string | null;
  frequency: string | null;
  source: string | null;
}

export interface PrefillCondition {
  name: string;
}

export interface VoicePrefill {
  context_status: typeof CONTEXT_STATUS;
  medications: PrefillMedication[];
  conditions: PrefillCondition[];
}

export interface VoicePrefillResult {
  variableValues: { patient_name: string; prefill_json: string };
  aliasToChartKey: Record<string, `${ChartMedicationResourceType}/${string}`>;
}

/**
 * Neutralise Liquid delimiters and cap length. Full-width braces (U+FF5B/U+FF5D)
 * survive JSON, read the same to a human, and are not template syntax.
 */
export function sanitizeChartText(value: string): string {
  const inert = value.replace(/\{/g, '｛').replace(/\}/g, '｝');
  // Slice by code point so a cap can never leave a lone surrogate behind.
  const points = Array.from(inert);
  return points.length > MAX_FIELD_CHARS ? points.slice(0, MAX_FIELD_CHARS).join('') : inert;
}

function safeField(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed ? sanitizeChartText(trimmed) : null;
}

/** `M2` before `M10`: aliases are ordinal, so compare the number, not the string. */
function compareAlias(a: string, b: string): number {
  const num = (s: string) => {
    const m = /(\d+)\s*$/.exec(s);
    return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
  };
  const diff = num(a) - num(b);
  return diff !== 0 && Number.isFinite(diff) ? diff : a.localeCompare(b);
}

function isCurrent(med: ChartMedication): boolean {
  return med.isCurrent && med.status === 'active';
}

function isActiveCondition(status: string | null): boolean {
  return status === null || (status !== 'resolved' && status !== 'inactive' && status !== 'remission');
}

export function buildVoicePrefill(context: InterviewContext): VoicePrefillResult {
  const current = context.medications
    .filter(isCurrent)
    .slice()
    .sort((a, b) => compareAlias(a.alias, b.alias));

  const medications: PrefillMedication[] = current.map((med) => ({
    alias: sanitizeChartText(med.alias),
    name: safeField(med.display) ?? 'unnamed medication',
    strength: safeField(med.strength),
    frequency: safeField(med.frequency),
    source: safeField(med.sourceDisplay),
  }));

  const conditions: PrefillCondition[] = context.conditions
    .filter((c) => isActiveCondition(c.clinicalStatus))
    .map((c) => ({ name: safeField(c.display) ?? 'unnamed condition' }));

  const prefill: VoicePrefill = { context_status: CONTEXT_STATUS, medications, conditions };
  const prefill_json = JSON.stringify(prefill);

  if (prefill_json.length > MAX_PREFILL_CHARS) {
    throw new Error(
      `Voice prefill is ${prefill_json.length} characters, over the ${MAX_PREFILL_CHARS} limit ` +
      `(${medications.length} current medications). Refusing to truncate — a partial ` +
      `medication list would be read to the patient as if it were complete.`,
    );
  }

  const aliasToChartKey: Record<string, `${ChartMedicationResourceType}/${string}`> = {};
  for (const med of current) {
    aliasToChartKey[med.alias] = `${med.resourceType}/${med.resourceId}`;
  }

  return {
    variableValues: {
      patient_name: safeField(context.patientDisplay) ?? 'there',
      prefill_json,
    },
    aliasToChartKey,
  };
}

/**
 * Defaults for a dashboard/test call with no chart behind it. The assistant then
 * falls back to the full spoken inventory, which is the pre-chart behaviour.
 */
export const EMPTY_PREFILL: VoicePrefillResult['variableValues'] = {
  patient_name: 'there',
  prefill_json: JSON.stringify({ context_status: CONTEXT_STATUS, medications: [], conditions: [] }),
};

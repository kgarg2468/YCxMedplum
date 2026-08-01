/**
 * CHART LOADER — Medplum is the longitudinal source of truth.
 *
 * Before an outbound call we read the patient's chart and normalize it into a
 * compact `InterviewContext`. Two rules matter more than anything else here:
 *
 *   1. Nothing this repository generated may feed the next call. Review output
 *      carries the `review-output` tag and is filtered out, so a chart load
 *      after ten reviews still contains exactly the clinician-authored records.
 *   2. Unknown stays `null`. RxCUI and ingredient come only from an explicit
 *      RxNorm coding; we never infer a code from free text.
 */

import type { MedplumClient } from '@medplum/core';
import type {
  CodeableConcept, Condition, Dosage, MedicationRequest, MedicationStatement,
  Patient, Reference,
} from '@medplum/fhirtypes';
import type {
  ChartCondition, ChartMedication, ChartMedicationResourceType, InterviewContext,
} from './types.js';

const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';

/** Resources this system writes back. They are chart noise on the next load. */
export const REVIEW_OUTPUT_TAG = {
  system: 'https://ycxmedplum.dev/tags',
  code: 'review-output',
} as const;

/** Lowercase, whitespace-collapsed form used for sorting and joining. */
export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function hasReviewOutputTag(resource: { meta?: { tag?: { system?: string; code?: string }[] } }): boolean {
  return (resource.meta?.tag ?? []).some(
    (t) => t.system === REVIEW_OUTPUT_TAG.system && t.code === REVIEW_OUTPUT_TAG.code,
  );
}

function rxnormCoding(concept: CodeableConcept | undefined) {
  return concept?.coding?.find((c) => c.system === RXNORM);
}

/** text -> RxNorm coding display -> first coding display -> reference display. */
function medicationDisplay(
  concept: CodeableConcept | undefined,
  reference: Reference | undefined,
): string {
  return (
    concept?.text
    ?? rxnormCoding(concept)?.display
    ?? concept?.coding?.find((c) => c.display)?.display
    ?? reference?.display
    ?? 'Unknown medication'
  );
}

/** Strength from the first `doseAndRate[].doseQuantity` that carries a value. */
function doseStrength(dosage: Dosage[] | undefined): string | null {
  for (const d of dosage ?? []) {
    for (const rate of d.doseAndRate ?? []) {
      const q = rate.doseQuantity;
      if (q?.value === undefined) continue;
      const unit = q.unit ?? q.code;
      return unit ? `${q.value} ${unit}` : `${q.value}`;
    }
  }
  return null;
}

/** Frequency from the first `timing.code.text`. Never synthesized from structure. */
function doseFrequency(dosage: Dosage[] | undefined): string | null {
  for (const d of dosage ?? []) {
    const text = d.timing?.code?.text;
    if (text) return text;
  }
  return null;
}

function fromMedicationRequest(r: MedicationRequest): Omit<ChartMedication, 'alias'> {
  const concept = r.medicationCodeableConcept;
  const coding = rxnormCoding(concept);
  return {
    resourceType: 'MedicationRequest',
    resourceId: r.id ?? '',
    display: medicationDisplay(concept, r.medicationReference),
    ingredient: coding?.display ? coding.display.trim().toLowerCase() : null,
    rxcui: coding?.code ?? null,
    strength: doseStrength(r.dosageInstruction),
    frequency: doseFrequency(r.dosageInstruction),
    status: r.status ?? 'unknown',
    isCurrent: r.status === 'active',
    sourceReference: r.requester?.reference ?? null,
    sourceDisplay: r.requester?.display ?? null,
    authoredOn: r.authoredOn ?? null,
  };
}

function fromMedicationStatement(s: MedicationStatement): Omit<ChartMedication, 'alias'> {
  const concept = s.medicationCodeableConcept;
  const coding = rxnormCoding(concept);
  return {
    resourceType: 'MedicationStatement',
    resourceId: s.id ?? '',
    display: medicationDisplay(concept, s.medicationReference),
    ingredient: coding?.display ? coding.display.trim().toLowerCase() : null,
    rxcui: coding?.code ?? null,
    strength: doseStrength(s.dosage),
    frequency: doseFrequency(s.dosage),
    status: s.status ?? 'unknown',
    isCurrent: s.status === 'active',
    sourceReference: s.informationSource?.reference ?? null,
    sourceDisplay: s.informationSource?.display ?? null,
    authoredOn: s.effectiveDateTime ?? s.effectivePeriod?.start ?? s.dateAsserted ?? null,
  };
}

function fromCondition(c: Condition): ChartCondition {
  const coding = c.code?.coding?.find((x) => x.code) ?? c.code?.coding?.[0];
  return {
    resourceId: c.id ?? '',
    display: c.code?.text ?? coding?.display ?? 'Unknown condition',
    code: coding?.code ?? null,
    clinicalStatus: c.clinicalStatus?.coding?.[0]?.code ?? null,
  };
}

function isEnteredInErrorCondition(c: Condition): boolean {
  return (c.verificationStatus?.coding ?? []).some((x) => x.code === 'entered-in-error');
}

/** Deterministic order so aliases are stable across loads: display, type, id. */
function compareChartMedications(
  a: Omit<ChartMedication, 'alias'>,
  b: Omit<ChartMedication, 'alias'>,
): number {
  const byDisplay = normalizeText(a.display).localeCompare(normalizeText(b.display));
  if (byDisplay !== 0) return byDisplay;
  const byType = orderOf(a.resourceType) - orderOf(b.resourceType);
  if (byType !== 0) return byType;
  return a.resourceId.localeCompare(b.resourceId);
}

function orderOf(resourceType: ChartMedicationResourceType): number {
  return resourceType === 'MedicationRequest' ? 0 : 1;
}

function patientDisplayOf(patient: Patient, fallbackId: string): string {
  const name = patient.name?.[0];
  if (!name) return `Patient ${fallbackId}`;
  const spelled = [...(name.given ?? []), name.family].filter(Boolean).join(' ').trim();
  return spelled || name.text || `Patient ${fallbackId}`;
}

/**
 * Read the patient and their medication/condition history from Medplum and
 * normalize it into the compact context the voice interview and reconciler use.
 */
export async function loadChartContext(
  medplum: MedplumClient,
  patientId: string,
): Promise<InterviewContext> {
  const subject = `Patient/${patientId}`;
  const [patient, requests, statements, conditions] = await Promise.all([
    medplum.readResource('Patient', patientId),
    medplum.searchResources('MedicationRequest', { subject }),
    medplum.searchResources('MedicationStatement', { subject }),
    medplum.searchResources('Condition', { subject }),
  ]);

  const usable = <T extends { meta?: { tag?: { system?: string; code?: string }[] } }>(r: T) =>
    !hasReviewOutputTag(r);

  const normalized: Omit<ChartMedication, 'alias'>[] = [
    ...requests
      .filter((r) => r.status !== 'entered-in-error' && usable(r))
      .map(fromMedicationRequest),
    ...statements
      .filter((s) => s.status !== 'entered-in-error' && usable(s))
      .map(fromMedicationStatement),
  ].sort(compareChartMedications);

  // Aliases are assigned only after sorting, so `M3` means the same chart row
  // on every load and can be spoken back by the voice agent.
  const medications: ChartMedication[] = normalized.map((m, i) => ({ alias: `M${i + 1}`, ...m }));

  const chartConditions = conditions
    .filter((c) => !isEnteredInErrorCondition(c) && usable(c))
    .map(fromCondition)
    .sort((a, b) => normalizeText(a.display).localeCompare(normalizeText(b.display))
      || a.resourceId.localeCompare(b.resourceId));

  return {
    patientId,
    patientDisplay: patientDisplayOf(patient, patientId),
    loadedAt: new Date().toISOString(),
    medications,
    conditions: chartConditions,
  };
}

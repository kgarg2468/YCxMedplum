/**
 * FHIR WRITERS — the Medplum-facing differentiator.
 *
 * The deep cut is `DetectedIssue`. Its spec has an `implicated` array of references
 * and a `mitigation` element; it was designed for exactly "these two resources
 * interact badly". Almost nobody uses it. Using it correctly signals you read the
 * spec rather than a tutorial.
 *
 * Resource map:
 *   MedicationStatement  what the patient is actually taking (vs. what's prescribed)
 *   Condition            indications
 *   Flag                 one per PIM hit, with citation
 *   RiskAssessment       computed anticholinergic burden
 *   DetectedIssue        prescribing cascade, with implicated[] in causal order
 *   Goal                 patient values as a first-class clinical object
 *   CarePlan + Task      the taper schedule as real scheduled activities
 *   Communication        the message to the prescriber
 */

import type { MedplumClient } from '@medplum/core';
import type {
  Patient, MedicationStatement, Flag, RiskAssessment, DetectedIssue,
  Goal, CarePlan, Task, Communication, Reference, Resource,
} from '@medplum/fhirtypes';
import type { Finding, ResolvedMed, ReviewResult } from '../types.js';

const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';

/** Generic so Medplum's narrowed Reference<T> targets typecheck. */
function ref<T extends Resource>(r: T): Reference<T> {
  return { reference: `${r.resourceType}/${r.id}` } as Reference<T>;
}

// ─── MedicationStatement ─────────────────────────────────────────────────────

export async function writeMedications(
  medplum: MedplumClient,
  patient: Patient,
  meds: ResolvedMed[],
): Promise<MedicationStatement[]> {
  const out: MedicationStatement[] = [];

  for (const m of meds) {
    const created = await medplum.createResource<MedicationStatement>({
      resourceType: 'MedicationStatement',
      status: 'active',
      subject: ref(patient),
      dateAsserted: new Date().toISOString(),
      medicationCodeableConcept: m.rxcui
        ? { coding: [{ system: RXNORM, code: m.rxcui, display: m.ingredient ?? undefined }],
            text: m.spoken_as }
        // Unresolved: we keep the patient's own words rather than guessing a code.
        : { text: m.spoken_as },
      dosage: m.strength || m.frequency
        ? [{ text: [m.strength, m.frequency].filter(Boolean).join(' ') }]
        : undefined,
      reasonCode: m.stated_indication
        ? [{ text: m.stated_indication }]
        : undefined,
      note: [
        { text: `Patient said: "${m.spoken_as}"` },
        { text: `Extraction confidence: ${m.confidence}` },
        ...(m.unresolved ? [{ text: 'UNRESOLVED — could not be matched to RxNorm. Requires clinician confirmation.' }] : []),
        ...(m.otc ? [{ text: 'Reported as over-the-counter / supplement' }] : []),
      ],
    });
    out.push(created);
  }
  return out;
}

// ─── Flag (one per PIM) ──────────────────────────────────────────────────────

export async function writePimFlags(
  medplum: MedplumClient,
  patient: Patient,
  findings: Finding[],
): Promise<Flag[]> {
  const pims = findings.filter((f) => f.kind === 'pim' || f.kind === 'duplicate');
  return Promise.all(pims.map((f) =>
    medplum.createResource<Flag>({
      resourceType: 'Flag',
      status: 'active',
      category: [{ text: 'Medication review' }],
      code: { text: f.label },
      subject: ref(patient),
      period: { start: new Date().toISOString() },
      author: { display: 'Deprescribing review agent' },
      // The citation is not decoration: FDA's Non-Device CDS criterion 4 requires
      // the clinician be able to independently review the basis.
      extension: [{
        url: 'https://example.org/fhir/StructureDefinition/citation',
        valueString: f.citation,
      }],
    })));
}

// ─── RiskAssessment (anticholinergic burden) ─────────────────────────────────

export async function writeAcbRisk(
  medplum: MedplumClient,
  patient: Patient,
  review: ReviewResult,
): Promise<RiskAssessment | null> {
  if (!review.acbScore) return null;

  return medplum.createResource<RiskAssessment>({
    resourceType: 'RiskAssessment',
    status: 'preliminary',      // preliminary: computed score awaits clinician confirmation
    subject: ref(patient),
    occurrenceDateTime: new Date().toISOString(),
    method: { text: 'Anticholinergic Cognitive Burden (ACB) scale' },
    code: { text: 'Cumulative anticholinergic burden' },
    prediction: [{
      outcome: { text: 'Cognitive impairment, falls, and delirium risk' },
      qualitativeRisk: {
        text: review.acbScore >= 6 ? 'high' : review.acbScore >= 3 ? 'moderate' : 'low',
      },
      rationale:
        `ACB score ${review.acbScore} from: ` +
        review.acbContributors.map((c) => `${c.ingredient} (${c.score})`).join(', '),
    }],
    note: [{ text: 'ACB \u2265 3 is associated with measurable cognitive decline and increased fall risk.' }],
  });
}

// ─── DetectedIssue (prescribing cascade) — the deep cut ──────────────────────

export async function writeCascades(
  medplum: MedplumClient,
  patient: Patient,
  findings: Finding[],
  medRefs: Map<string, MedicationStatement>,
): Promise<DetectedIssue[]> {
  const cascades = findings.filter((f) => f.kind === 'cascade');

  return Promise.all(cascades.map((f) => {
    const implicated = f.implicated
      .map((ing) => medRefs.get(ing))
      .filter((m): m is MedicationStatement => Boolean(m))
      .map(ref);

    return medplum.createResource<DetectedIssue>({
      resourceType: 'DetectedIssue',
      status: 'preliminary',       // preliminary: awaiting clinician confirmation
      code: { text: 'Prescribing cascade' },
      severity: f.severity,
      patient: ref(patient),
      identifiedDateTime: new Date().toISOString(),
      author: { display: 'Deprescribing review agent' },
      // implicated[] in causal order: trigger drug first, treating drug second.
      implicated,
      detail: f.explanation ?? f.label,
      reference: 'https://deprescribing.org/resources/deprescribing-guidelines-algorithms/',
      evidence: [{
        code: [{ text: f.symptomConfirmed
          ? `Patient reported the linking symptom: ${f.linkingSymptom}`
          : `Linking symptom (${f.linkingSymptom}) NOT reported by patient — structural cascade only` }],
      }],
      mitigation: [{
        action: { text: 'Review whether the trigger medication can be reduced or switched before continuing the treating medication' },
        date: new Date().toISOString(),
      }],
    });
  }));
}

// ─── Goal (patient values) ───────────────────────────────────────────────────

export async function writeGoals(
  medplum: MedplumClient,
  patient: Patient,
  values: string[],
): Promise<Goal[]> {
  return Promise.all(values.map((v) =>
    medplum.createResource<Goal>({
      resourceType: 'Goal',
      lifecycleStatus: 'proposed',   // proposed: captured from the patient, not yet accepted into a care plan
      subject: ref(patient),
      description: { text: v },
      // Patient-stated, not clinician-inferred. This distinction matters.
      expressedBy: ref(patient),
      note: [{ text: 'Patient-stated during voice medication review' }],
    })));
}

// ─── CarePlan + Task (the taper schedule) ───────────────────────────────────

export async function writeTaperPlan(
  medplum: MedplumClient,
  patient: Patient,
  drug: string,
  steps: { week: number; dose: string; note: string }[],
  monitoring: string[],
  citation: string,
): Promise<{ carePlan: CarePlan; tasks: Task[] }> {
  const start = new Date();

  const carePlan = await medplum.createResource<CarePlan>({
    resourceType: 'CarePlan',
    status: 'draft',            // draft: requires clinician sign-off before active
    intent: 'proposal',
    title: `${drug} taper`,
    subject: ref(patient),
    created: start.toISOString(),
    description: `Stepwise reduction of ${drug} per published deprescribing algorithm. ${citation}`,
    note: monitoring.map((m) => ({ text: `Monitor: ${m}` })),
  });

  const tasks = await Promise.all(steps.map((s) => {
    const due = new Date(start);
    due.setDate(due.getDate() + s.week * 7);
    return medplum.createResource<Task>({
      resourceType: 'Task',
      status: 'requested',
      intent: 'proposal',
      for: ref(patient),
      basedOn: [ref(carePlan)],
      description: `Week ${s.week}: ${drug} ${s.dose}`,
      note: [{ text: s.note }],
      restriction: { period: { start: due.toISOString() } },
    });
  }));

  return { carePlan, tasks };
}

// ─── Task (red-flag escalation) ─────────────────────────────────────────────

/**
 * Urgent Task created the moment a red flag is detected (per-turn, not end-of-call).
 * This is the escalation the review panel claims — a real FHIR artifact a clinician
 * queue can pick up, not a console line.
 */
export async function writeRedFlagTask(
  medplum: MedplumClient,
  patient: Patient,
  flags: string[],
): Promise<Task> {
  return medplum.createResource<Task>({
    resourceType: 'Task',
    status: 'requested',
    intent: 'order',
    priority: 'urgent',
    for: ref(patient),
    code: { text: 'Red-flag escalation — voice medication review' },
    description: `Patient reported during the call: ${flags.join('; ')}. Immediate clinician attention required.`,
    authoredOn: new Date().toISOString(),
    note: [{ text: 'Created automatically at first red-flag detection during the call (per-turn check).' }],
  });
}

// ─── Communication (message to prescriber) ──────────────────────────────────

export async function writePrescriberMessage(
  medplum: MedplumClient,
  patient: Patient,
  body: string,
): Promise<Communication> {
  return medplum.createResource<Communication>({
    resourceType: 'Communication',
    status: 'preparation',      // preparation: drafted, awaiting human send
    subject: ref(patient),
    sent: undefined,
    payload: [{ contentString: body }],
    note: [{ text: 'Draft generated by deprescribing review agent. Requires clinician review before sending.' }],
  });
}

/**
 * Flatten what persistReview wrote into per-resource rows for the review panel —
 * including the note/comment text, which the Medplum console UI tends to bury.
 */
export function summarizeWritten(w: {
  meds: MedicationStatement[]; flags: Flag[]; risk: RiskAssessment | null;
  cascades: DetectedIssue[]; goals: Goal[];
}): { type: string; id: string; label: string; note?: string }[] {
  const rows: { type: string; id: string; label: string; note?: string }[] = [];
  for (const m of w.meds) {
    rows.push({
      type: 'MedicationStatement', id: m.id!,
      label: m.medicationCodeableConcept?.coding?.[0]?.display ?? m.medicationCodeableConcept?.text ?? '',
      note: m.note?.map((n) => n.text).filter(Boolean).join(' · '),
    });
  }
  for (const f of w.flags) {
    rows.push({
      type: 'Flag', id: f.id!, label: f.code?.text ?? '',
      note: f.extension?.find((e) => e.url.endsWith('/citation'))?.valueString,
    });
  }
  for (const d of w.cascades) {
    rows.push({
      type: 'DetectedIssue', id: d.id!, label: d.detail ?? 'Prescribing cascade',
      note: [
        d.evidence?.[0]?.code?.[0]?.text,
        d.mitigation?.[0]?.action?.text ? `Mitigation: ${d.mitigation[0].action.text}` : undefined,
      ].filter(Boolean).join(' · '),
    });
  }
  if (w.risk) {
    rows.push({
      type: 'RiskAssessment', id: w.risk.id!, label: w.risk.code?.text ?? 'Risk assessment',
      note: w.risk.prediction?.[0]?.rationale,
    });
  }
  for (const g of w.goals) {
    rows.push({
      type: 'Goal', id: g.id!, label: g.description?.text ?? '',
      note: 'expressedBy = the patient',
    });
  }
  return rows;
}

/** Convenience: write everything and return a summary for the demo UI. */
export async function persistReview(
  medplum: MedplumClient,
  patient: Patient,
  review: ReviewResult,
) {
  const meds = await writeMedications(medplum, patient, review.meds);

  const byIngredient = new Map<string, MedicationStatement>();
  review.meds.forEach((m, i) => {
    if (m.ingredient) byIngredient.set(m.ingredient, meds[i]);
  });

  const [flags, risk, cascades, goals] = await Promise.all([
    writePimFlags(medplum, patient, review.findings),
    writeAcbRisk(medplum, patient, review),
    writeCascades(medplum, patient, review.findings, byIngredient),
    writeGoals(medplum, patient, review.patientGoals),
  ]);

  return { meds, flags, risk, cascades, goals };
}

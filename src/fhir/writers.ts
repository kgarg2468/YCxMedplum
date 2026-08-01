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
 *
 * IDEMPOTENCY. Every resource written here carries the `review-output` tag (so a
 * later chart load never feeds review output back into the next call) and a
 * deterministic identifier:
 *
 *     https://ycxmedplum.dev/call-output  |  runId:writerPurpose:sha256(identity)
 *
 * The identity is the resource's stable CLINICAL identity — never its position in
 * an array — so a retry of a partially failed call updates the same resources
 * instead of duplicating them. `writerPurpose` is unique per writer, so two
 * families can never collide on the same identity string.
 */

import { createHash } from 'node:crypto';
import type { MedplumClient } from '@medplum/core';
import type {
  Patient, MedicationStatement, Flag, RiskAssessment, DetectedIssue,
  Goal, CarePlan, Task, Communication, Reference, Resource, Identifier,
} from '@medplum/fhirtypes';
import type { Finding, ResolvedMed, ReviewResult } from '../types.js';
import type { ReviewWriteOptions } from '../context/types.js';
import { REVIEW_OUTPUT_TAG } from './seed.js';

const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
const CITATION_URL = 'https://example.org/fhir/StructureDefinition/citation';

export const OUTPUT_IDENTIFIER_SYSTEM = 'https://ycxmedplum.dev/call-output';

/** Unique across every resource-producing path. */
export type WriterPurpose =
  | 'medication'
  | 'pim-flag'
  | 'acb-risk'
  | 'cascade-issue'
  | 'goal'
  | 'taper-care-plan'
  | 'taper-task'
  | 'prescriber-communication'
  | 'red-flag-flag'
  | 'red-flag-task';

/** Note attached to a medication the chart already knew and the patient confirmed. */
export const CHART_CONFIRMED_NOTE = 'Chart record confirmed by patient; not restated verbatim';

/** Generic so Medplum's narrowed Reference<T> targets typecheck. */
function ref<T extends Resource>(r: T): Reference<T> {
  return { reference: `${r.resourceType}/${r.id}` } as Reference<T>;
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Hashed so the identifier stays bounded and presentation-safe. */
export function outputIdentifier(
  runId: string,
  purpose: WriterPurpose,
  identity: string,
): Identifier {
  const digest = createHash('sha256').update(identity).digest('hex');
  return { system: OUTPUT_IDENTIFIER_SYSTEM, value: `${runId}:${purpose}:${digest}` };
}

const outputMeta = () => ({ tag: [REVIEW_OUTPUT_TAG] });

/**
 * Write ordinals are shared across every writer that receives the same options
 * object, so `beforeWrite(n)` can name one specific write in a persistReview run
 * (that is how the retry test injects a partial failure).
 */
const ordinals = new WeakMap<ReviewWriteOptions, { n: number }>();

function nextOrdinal(options: ReviewWriteOptions): number {
  let counter = ordinals.get(options);
  if (!counter) {
    counter = { n: 0 };
    ordinals.set(options, counter);
  }
  counter.n += 1;
  return counter.n;
}

/** Search by identifier, update when found, create only when absent. */
async function upsert<T extends Resource>(
  medplum: MedplumClient,
  options: ReviewWriteOptions,
  purpose: WriterPurpose,
  identity: string,
  build: (identifier: Identifier) => T,
): Promise<T> {
  const identifier = outputIdentifier(options.runId, purpose, identity);
  const resource = build(identifier);

  const existing = (await medplum.searchResources(resource.resourceType, {
    identifier: `${OUTPUT_IDENTIFIER_SYSTEM}|${identifier.value}`,
    _count: '1',
  }))[0];

  options.beforeWrite?.(nextOrdinal(options));

  if (existing?.id) {
    return await medplum.updateResource<T>({ ...resource, id: existing.id });
  }
  return await medplum.createResource<T>(resource);
}

/** Sort by canonical identity so write order — and beforeWrite — is deterministic. */
function inIdentityOrder<T>(items: T[], identity: (item: T) => string): { item: T; identity: string }[] {
  return items
    .map((item) => ({ item, identity: identity(item) }))
    .sort((a, b) => a.identity.localeCompare(b.identity));
}

/** Findings: kind + sorted implicated ingredients + rule label. Never array index. */
function findingIdentity(f: Finding): string {
  return `${f.kind}|${[...f.implicated].map(normalize).sort().join('+')}|${normalize(f.label)}`;
}

/**
 * Medications: provenance + ingredient (falling back to the patient's own words
 * when RxNav could not resolve it) + occurrence, so two genuinely separate
 * entries for the same ingredient stay separate without depending on position.
 */
function medicationIdentities(meds: ResolvedMed[]): string[] {
  const seen = new Map<string, number>();
  return meds.map((m) => {
    const base = `${m.provenance}|${normalize(m.ingredient ?? m.name_guess ?? m.spoken_as)}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return `${base}|${occurrence}`;
  });
}

const subjectIdentity = (patient: Patient) => `Patient/${patient.id ?? 'unknown'}`;

// ─── MedicationStatement ─────────────────────────────────────────────────────

function medicationNotes(m: ResolvedMed): { text: string }[] {
  const notes: { text: string }[] = m.provenance === 'chart-confirmed'
    // The chart is the source and the patient said "yes". Inventing a verbatim
    // quote here would be a fabrication; the confidence we have is MATCH
    // confidence, not extraction confidence, so neither is presented as one.
    ? [{ text: CHART_CONFIRMED_NOTE }]
    : [
      { text: `Patient said: "${m.spoken_as}"` },
      { text: `Extraction confidence: ${m.confidence}` },
    ];
  if (m.unresolved) {
    notes.push({ text: 'UNRESOLVED — could not be matched to RxNorm. Requires clinician confirmation.' });
  }
  if (m.otc) notes.push({ text: 'Reported as over-the-counter / supplement' });
  return notes;
}

export async function writeMedications(
  medplum: MedplumClient,
  patient: Patient,
  meds: ResolvedMed[],
  options: ReviewWriteOptions,
): Promise<MedicationStatement[]> {
  const identities = medicationIdentities(meds);
  const ordered = meds
    .map((m, i) => ({ med: m, identity: identities[i], index: i }))
    .sort((a, b) => a.identity.localeCompare(b.identity));

  // Callers join findings to these by array position, so the returned array
  // keeps the caller's order even though the writes are identity-ordered.
  const out = new Array<MedicationStatement>(meds.length);

  for (const { med: m, identity, index } of ordered) {
    out[index] = await upsert<MedicationStatement>(medplum, options, 'medication', identity, (identifier) => ({
      resourceType: 'MedicationStatement',
      identifier: [identifier],
      meta: outputMeta(),
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
      note: medicationNotes(m),
    }));
  }
  return out;
}

// ─── Flag (one per PIM) ──────────────────────────────────────────────────────

export async function writePimFlags(
  medplum: MedplumClient,
  patient: Patient,
  findings: Finding[],
  options: ReviewWriteOptions,
): Promise<Flag[]> {
  const pims = findings.filter((f) => f.kind === 'pim' || f.kind === 'duplicate');
  const out: Flag[] = [];

  for (const { item: f, identity } of inIdentityOrder(pims, findingIdentity)) {
    out.push(await upsert<Flag>(medplum, options, 'pim-flag', identity, (identifier) => ({
      resourceType: 'Flag',
      identifier: [identifier],
      meta: outputMeta(),
      status: 'active',
      category: [{ text: 'Medication review' }],
      code: { text: f.label },
      subject: ref(patient),
      period: { start: new Date().toISOString() },
      author: { display: 'Deprescribing review agent' },
      // The citation is not decoration: FDA's Non-Device CDS criterion 4 requires
      // the clinician be able to independently review the basis.
      extension: [{ url: CITATION_URL, valueString: f.citation }],
    })));
  }
  return out;
}

// ─── RiskAssessment (anticholinergic burden) ─────────────────────────────────

export async function writeAcbRisk(
  medplum: MedplumClient,
  patient: Patient,
  review: ReviewResult,
  options: ReviewWriteOptions,
): Promise<RiskAssessment | null> {
  if (!review.acbScore) return null;

  // One burden assessment per run and patient. The score itself is deliberately
  // NOT part of the identity: a retry must correct the resource, not add a second.
  return upsert<RiskAssessment>(medplum, options, 'acb-risk', `acb|${subjectIdentity(patient)}`, (identifier) => ({
    resourceType: 'RiskAssessment',
    identifier: [identifier],
    meta: outputMeta(),
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
    note: [{ text: 'ACB ≥ 3 is associated with measurable cognitive decline and increased fall risk.' }],
  }));
}

// ─── DetectedIssue (prescribing cascade) — the deep cut ──────────────────────

export async function writeCascades(
  medplum: MedplumClient,
  patient: Patient,
  findings: Finding[],
  medRefs: Map<string, MedicationStatement>,
  options: ReviewWriteOptions,
): Promise<DetectedIssue[]> {
  const cascades = findings.filter((f) => f.kind === 'cascade');
  const out: DetectedIssue[] = [];

  for (const { item: f, identity } of inIdentityOrder(cascades, findingIdentity)) {
    // implicated[] in causal order: trigger drug first, treating drug second.
    const implicated = f.implicated
      .map((ing) => medRefs.get(ing))
      .filter((m): m is MedicationStatement => Boolean(m))
      .map(ref);

    out.push(await upsert<DetectedIssue>(medplum, options, 'cascade-issue', identity, (identifier) => ({
      resourceType: 'DetectedIssue',
      identifier: [identifier],
      meta: outputMeta(),
      status: 'preliminary',       // preliminary: awaiting clinician confirmation
      code: { text: 'Prescribing cascade' },
      severity: f.severity,
      patient: ref(patient),
      identifiedDateTime: new Date().toISOString(),
      author: { display: 'Deprescribing review agent' },
      implicated,
      detail: f.explanation ?? f.label,
      reference: /^https?:\/\//.test(f.citation)
        ? f.citation
        : 'https://deprescribing.org/resources/deprescribing-guidelines-algorithms/',
      // The rule's own citation, kept separate from the linking-symptom evidence
      // below: one is why the rule exists, the other is what this patient said.
      extension: [{ url: CITATION_URL, valueString: f.citation }],
      evidence: [{
        code: [{ text: f.symptomConfirmed
          ? `Patient reported the linking symptom: ${f.linkingSymptom}`
          : `Linking symptom (${f.linkingSymptom}) NOT reported by patient — structural cascade only` }],
      }],
      mitigation: [{
        action: { text: 'Review whether the trigger medication can be reduced or switched before continuing the treating medication' },
        date: new Date().toISOString(),
      }],
    })));
  }
  return out;
}

// ─── Goal (patient values) ───────────────────────────────────────────────────

export async function writeGoals(
  medplum: MedplumClient,
  patient: Patient,
  values: string[],
  options: ReviewWriteOptions,
): Promise<Goal[]> {
  const out: Goal[] = [];
  for (const { item: v, identity } of inIdentityOrder(values, normalize)) {
    out.push(await upsert<Goal>(medplum, options, 'goal', identity, (identifier) => ({
      resourceType: 'Goal',
      identifier: [identifier],
      meta: outputMeta(),
      lifecycleStatus: 'proposed',   // proposed: captured from the patient, not yet accepted into a care plan
      subject: ref(patient),
      description: { text: v },
      // Patient-stated, not clinician-inferred. This distinction matters.
      expressedBy: ref(patient),
      note: [{ text: 'Patient-stated during voice medication review' }],
    })));
  }
  return out;
}

// ─── CarePlan + Task (the taper schedule) ───────────────────────────────────

export async function writeTaperPlan(
  medplum: MedplumClient,
  patient: Patient,
  drug: string,
  steps: { week: number; dose: string; note: string }[],
  monitoring: string[],
  citation: string,
  options: ReviewWriteOptions,
): Promise<{ carePlan: CarePlan; tasks: Task[] }> {
  const start = new Date();

  const carePlan = await upsert<CarePlan>(medplum, options, 'taper-care-plan', `taper|${normalize(drug)}`,
    (identifier) => ({
      resourceType: 'CarePlan',
      identifier: [identifier],
      meta: outputMeta(),
      status: 'draft',            // draft: requires clinician sign-off before active
      intent: 'proposal',
      title: `${drug} taper`,
      subject: ref(patient),
      created: start.toISOString(),
      description: `Stepwise reduction of ${drug} per published deprescribing algorithm. ${citation}`,
      note: monitoring.map((m) => ({ text: `Monitor: ${m}` })),
    }));

  const tasks: Task[] = [];
  const ordered = [...steps].sort((a, b) => a.week - b.week);
  for (const s of ordered) {
    const due = new Date(start);
    due.setDate(due.getDate() + s.week * 7);
    tasks.push(await upsert<Task>(medplum, options, 'taper-task',
      `taper|${normalize(drug)}|week-${s.week}`, (identifier) => ({
        resourceType: 'Task',
        identifier: [identifier],
        meta: outputMeta(),
        status: 'requested',
        intent: 'proposal',
        for: ref(patient),
        basedOn: [ref(carePlan)],
        description: `Week ${s.week}: ${drug} ${s.dose}`,
        note: [{ text: s.note }],
        restriction: { period: { start: due.toISOString() } },
      })));
  }

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
  options: ReviewWriteOptions,
): Promise<Task> {
  return upsert<Task>(medplum, options, 'red-flag-task', `red-flag|${subjectIdentity(patient)}`,
    (identifier) => ({
      resourceType: 'Task',
      identifier: [identifier],
      meta: outputMeta(),
      status: 'requested',
      intent: 'order',
      priority: 'urgent',
      for: ref(patient),
      code: { text: 'Red-flag escalation — voice medication review' },
      description: `Patient reported during the call: ${flags.join('; ')}. Immediate clinician attention required.`,
      authoredOn: new Date().toISOString(),
      note: [{ text: 'Created automatically at first red-flag detection during the call (per-turn check).' }],
    }));
}

/** Evidence-bearing urgent Flag for a verifier-confirmed Sentinel class. */
export async function writeRedFlagFlag(
  medplum: MedplumClient,
  patient: Patient,
  reasons: string[],
  detail: string,
  options: ReviewWriteOptions,
): Promise<Flag> {
  const identity = `red-flag|${subjectIdentity(patient)}|${reasons.map(normalize).sort().join('+')}`;
  return upsert<Flag>(medplum, options, 'red-flag-flag', identity, (identifier) => ({
    resourceType: 'Flag',
    identifier: [identifier],
    meta: outputMeta(),
    status: 'active',
    category: [{ text: 'Urgent clinical review' }],
    code: { text: reasons.length ? reasons.join('; ') : 'Red flag reported during medication review' },
    subject: ref(patient),
    period: { start: new Date().toISOString() },
    author: { display: 'Deprescribing review agent (Sentinel)' },
    extension: [{
      url: 'https://ycxmedplum.dev/fhir/StructureDefinition/red-flag-audit',
      valueString: detail,
    }],
  }));
}

// ─── Communication (message to prescriber) ──────────────────────────────────

export async function writePrescriberMessage(
  medplum: MedplumClient,
  patient: Patient,
  body: string,
  options: ReviewWriteOptions,
): Promise<Communication> {
  return upsert<Communication>(medplum, options, 'prescriber-communication',
    `prescriber-message|${subjectIdentity(patient)}`, (identifier) => ({
      resourceType: 'Communication',
      identifier: [identifier],
      meta: outputMeta(),
      status: 'preparation',      // preparation: drafted, awaiting human send
      subject: ref(patient),
      sent: undefined,
      payload: [{ contentString: body }],
      note: [{ text: 'Draft generated by deprescribing review agent. Requires clinician review before sending.' }],
    }));
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
        d.extension?.find((e) => e.url.endsWith('/citation'))?.valueString,
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

/**
 * Write everything for one review and return a summary for the demo UI.
 *
 * Sequential on purpose: the write order follows sorted canonical identities, so
 * a `beforeWrite` ordinal always names the same write for the same input.
 */
export async function persistReview(
  medplum: MedplumClient,
  patient: Patient,
  review: ReviewResult,
  options: ReviewWriteOptions,
) {
  const meds = await writeMedications(medplum, patient, review.meds, options);

  const byIngredient = new Map<string, MedicationStatement>();
  review.meds.forEach((m, i) => {
    if (m.ingredient) byIngredient.set(m.ingredient, meds[i]);
  });

  const flags = await writePimFlags(medplum, patient, review.findings, options);
  const risk = await writeAcbRisk(medplum, patient, review, options);
  const cascades = await writeCascades(medplum, patient, review.findings, byIngredient, options);
  const goals = await writeGoals(medplum, patient, review.patientGoals, options);

  return { meds, flags, risk, cascades, goals };
}

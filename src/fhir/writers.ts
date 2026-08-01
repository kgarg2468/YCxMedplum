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
  Goal, CarePlan, Task, Communication, Composition, Narrative, Reference, Resource,
} from '@medplum/fhirtypes';
import type { Finding, ResolvedMed, ReviewResult } from '../types.js';
import { DEMO_PRESCRIBERS } from './seed.js';
import { detectCascadeChains } from '../engine/detect.js';

const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';

/** Generic so Medplum's narrowed Reference<T> targets typecheck. */
function ref<T extends Resource>(r: T): Reference<T> {
  return { reference: `${r.resourceType}/${r.id}` } as Reference<T>;
}

// ─── FHIR narratives — what the Medplum console actually renders ────────────
// Without text.div the console falls back to a raw field dump. Narratives are
// the spec's own mechanism for human display (status: "generated"), so every
// resource we write gets one. Keep to plain XHTML (b/i/p/table) — console
// sanitizers strip fancy styling.

const escX = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function xhtml(inner: string): Narrative {
  return { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${inner}</div>` };
}

/** Synthetic practice tag for the cross-practice story. Always labeled as such. */
function practice(ingredient: string | null): string {
  return (ingredient && DEMO_PRESCRIBERS[ingredient]) || 'Unknown practice';
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
      text: xhtml(
        `<p><b>${escX(m.ingredient ?? 'UNRESOLVED MEDICATION')}</b>` +
        `${m.strength || m.frequency ? ` — ${escX([m.strength, m.frequency].filter(Boolean).join(', '))}` : ''}</p>` +
        (m.unresolved ? `<p><b>&#9888; UNRESOLVED — could not match to RxNorm. Needs clinician confirmation.</b></p>` : '') +
        `<p>Patient said: <i>&#8220;${escX(m.spoken_as)}&#8221;</i></p>` +
        `<p>Why they take it: ${m.stated_indication ? escX(m.stated_indication) : '<b>&#9888; none stated</b>'}</p>` +
        `<p>Prescribed by: <b>${escX(practice(m.ingredient))}</b> <i>(synthetic demo attribution)</i>` +
        ` &#183; Extraction confidence: ${m.confidence}${m.otc ? ' &#183; OTC/self-administered' : ''}</p>`,
      ),
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
      text: xhtml(
        `<p><b>${escX(f.label)}</b> &#183; severity: ${f.severity}</p>` +
        `<p>Implicated: ${f.implicated.map((i) => `<b>${escX(i)}</b> (${escX(practice(i))})`).join(' &#183; ')}</p>` +
        `<p><i>Citation: ${escX(f.citation)}</i></p>`,
      ),
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
    text: xhtml(
      `<p>Anticholinergic burden (ACB): <b>${review.acbScore}</b> — threshold for clinical significance is 3</p>` +
      `<table><tr><th>Contributor</th><th>Score</th></tr>` +
      review.acbContributors.map((c) => `<tr><td>${escX(c.ingredient)}</td><td>${c.score}</td></tr>`).join('') +
      `</table>` +
      `<p><i>ACB &#8805; 3 is associated with cognitive decline and falls (ACB scale).</i></p>`,
    ),
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

    const [trigger, treater] = f.implicated;
    return medplum.createResource<DetectedIssue>({
      resourceType: 'DetectedIssue',
      status: 'preliminary',       // preliminary: awaiting clinician confirmation
      text: xhtml(
        `<p><b>${escX(trigger)}</b> <i>(${escX(practice(trigger))})</i> &#10230; ` +
        `<b>${escX(treater)}</b> <i>(${escX(practice(treater))})</i></p>` +
        `<p>${escX(f.label)} &#183; severity: ${f.severity}</p>` +
        (f.symptomConfirmed
          ? `<p><b>&#10003; Patient reported the linking symptom</b>${f.linkingSymptom ? ` (&#8220;${escX(f.linkingSymptom)}&#8221;)` : ''}</p>`
          : `<p>&#9675; Structural only — linking symptom not reported by the patient</p>`) +
        `<p>Different prescribers, one root cause — visible only with the whole regimen in one place. <i>(Practice attribution is synthetic demo data.)</i></p>` +
        `<p><i>Citation: ${escX(f.citation)}</i></p>`,
      ),
      code: { text: `Prescribing cascade: ${trigger} → ${treater}` },
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
      text: xhtml(
        `<p><b>&#8220;${escX(v)}&#8221;</b></p>` +
        `<p>The patient's own stated priority, captured verbatim during the voice review ` +
        `(<i>expressedBy = the patient</i>). This is a stated preference, not a prediction.</p>`,
      ),
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

// ─── Summary Composition — the "open one resource, see everything" view ─────

/**
 * The console equivalent of the panel's above-the-fold: one Composition whose
 * narrative holds the stats, the cascade chain with practice tags, the
 * patient's stated priority, and the concerns strip. Open THIS in the console
 * during the demo instead of scrolling a resource list.
 */
export async function writeSummary(
  medplum: MedplumClient,
  patient: Patient,
  review: ReviewResult,
): Promise<Composition> {
  const cascades = review.findings.filter((f) => f.kind === 'cascade');
  const chains = detectCascadeChains(cascades);
  const high = review.findings.filter((f) => f.severity === 'high').length;

  const chainHtml = chains.length
    ? chains.map((c) =>
        `<p><b>${c.map((d) => `${escX(d)} <i>(${escX(practice(d))})</i>`).join(' &#10230; ')}</b></p>`,
      ).join('') +
      `<p>Drugs prescribed to treat the side effects of other drugs — different practices, one root cause. <i>(Practice attribution synthetic.)</i></p>`
    : '<p>No chained cascades detected.</p>';

  return medplum.createResource<Composition>({
    resourceType: 'Composition',
    status: 'preliminary',
    type: { coding: [{ system: 'http://loinc.org', code: '34133-9' }], text: 'Pre-visit medication review summary' },
    subject: ref(patient),
    date: new Date().toISOString(),
    author: [{ display: 'Deprescribe review agent' }],
    title: 'Pre-visit medication review — summary',
    text: xhtml(
      `<p><b>${review.meds.length} medications &#183; ${review.findings.length} findings (${high} high) &#183; ` +
      `ACB ${review.acbScore} (threshold 3) &#183; ${cascades.length} cascades &#183; ` +
      `${review.unresolvedCount} unresolved &#8594; clinician</b></p>` +
      `<p><b>CHAINED PRESCRIBING CASCADE</b></p>` + chainHtml +
      (review.patientGoals.length
        ? `<p><b>WHAT THE PATIENT WOULD STOP</b></p>` +
          review.patientGoals.map((g) => `<p><i>&#8220;${escX(g)}&#8221;</i></p>`).join('') +
          `<p>Stated verbatim by the patient — a preference, not a prediction.</p>`
        : '') +
      (review.symptoms.length
        ? `<p><b>PATIENT CONCERNS</b>: ${review.symptoms.map((s) => escX(s.symptom)).join(' &#183; ')}</p>`
        : '') +
      (review.redFlags.length
        ? `<p><b>&#9888; RED FLAGS: ${escX(review.redFlags.join('; '))}</b></p>`
        : '') +
      `<p><i>Every finding carries a citation (Beers 2023 / STOPP v3 / named trials). ` +
      `All resources are drafts pending clinician sign-off. Synthetic data only.</i></p>`,
    ),
  });
}

/**
 * Flatten what persistReview wrote into per-resource rows for the review panel —
 * including the note/comment text, which the Medplum console UI tends to bury.
 */
export function summarizeWritten(w: {
  meds: MedicationStatement[]; flags: Flag[]; risk: RiskAssessment | null;
  cascades: DetectedIssue[]; goals: Goal[]; summary?: Composition;
}): { type: string; id: string; label: string; note?: string }[] {
  const rows: { type: string; id: string; label: string; note?: string }[] = [];
  if (w.summary) {
    rows.push({
      type: 'Composition', id: w.summary.id!,
      label: 'Pre-visit review summary — open this one in the console first',
      note: 'Stats, chain with practice tags, patient priority, concerns — one screen',
    });
  }
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

  const [flags, risk, cascades, goals, summary] = await Promise.all([
    writePimFlags(medplum, patient, review.findings),
    writeAcbRisk(medplum, patient, review),
    writeCascades(medplum, patient, review.findings, byIngredient),
    writeGoals(medplum, patient, review.patientGoals),
    writeSummary(medplum, patient, review),
  ]);

  return { meds, flags, risk, cascades, goals, summary };
}

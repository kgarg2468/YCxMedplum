/**
 * RECONCILIATION — chart facts vs. what the patient actually said.
 *
 * Pure function, no I/O, no model calls. The safety posture is deliberate:
 * silence is never consent. A medication the chart calls active but the patient
 * never explicitly confirmed becomes exactly one `use-unclear` gap and does not
 * enter the deterministic current-medication review. Nothing is dropped: every
 * disagreement stays visible to the clinician as a gap.
 */

import type {
  ChartMedication, ChartMedicationConfirmation, MedicationGap,
  PatientReportedMedication, ReconciledMedicationState,
} from './types.js';

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function differs(reported: string | null, charted: string | null): boolean {
  if (!reported) return false;
  return normalize(reported) !== normalize(charted);
}

/**
 * Join a patient-reported medication to a chart row.
 * Order is fixed: chart alias, RxCUI, ingredient, then normalized exact name.
 * Only current chart rows are candidates — history is never re-opened by speech.
 */
function findChartMatch(
  reported: PatientReportedMedication,
  byAlias: Map<string, ChartMedication>,
  candidates: ChartMedication[],
  claimed: Set<string>,
): ChartMedication | undefined {
  const open = (m: ChartMedication) => !claimed.has(m.alias);

  if (reported.chartAlias) {
    const aliased = byAlias.get(reported.chartAlias);
    if (aliased && aliased.isCurrent && open(aliased)) return aliased;
  }
  if (reported.rxcui) {
    const hit = candidates.find((m) => open(m) && m.rxcui === reported.rxcui);
    if (hit) return hit;
  }
  const ingredient = normalize(reported.ingredient);
  if (ingredient) {
    const hit = candidates.find((m) => open(m) && !!m.ingredient && normalize(m.ingredient) === ingredient);
    if (hit) return hit;
  }
  const name = normalize(reported.name);
  if (name) {
    const hit = candidates.find((m) => open(m)
      && (normalize(m.display) === name || (!!m.ingredient && normalize(m.ingredient) === name)));
    if (hit) return hit;
  }
  return undefined;
}

function gap(
  kind: MedicationGap['kind'],
  display: string,
  chartMedication: ChartMedication | null,
  patientMedication: PatientReportedMedication | null,
  confirmation: ChartMedicationConfirmation | null,
): MedicationGap {
  return { kind, display, chartMedication, patientMedication, confirmation };
}

export function compareMedicationState(
  chart: ChartMedication[],
  confirmations: ChartMedicationConfirmation[],
  newlyReported: PatientReportedMedication[],
): ReconciledMedicationState {
  const byAlias = new Map(chart.map((m) => [m.alias, m]));
  const current = chart.filter((m) => m.isCurrent);

  // First explicit confirmation per alias wins; confirmations for aliases that
  // are not in the chart (or that refer to history) are ignored, never invented.
  const confirmed = new Map<string, ChartMedicationConfirmation>();
  for (const c of confirmations) {
    const target = byAlias.get(c.chartAlias);
    if (!target || !target.isCurrent) continue;
    if (!confirmed.has(c.chartAlias)) confirmed.set(c.chartAlias, c);
  }

  // Join what the patient volunteered to the chart before judging anything.
  const claimed = new Set<string>();
  const matches = new Map<PatientReportedMedication, ChartMedication>();
  for (const reported of newlyReported) {
    const match = findChartMatch(reported, byAlias, current, claimed);
    if (match) {
      claimed.add(match.alias);
      matches.set(reported, match);
    }
  }
  const matchedByAlias = new Map<string, PatientReportedMedication>();
  for (const [reported, match] of matches) matchedByAlias.set(match.alias, reported);

  const gaps: MedicationGap[] = [];
  const reconciled: PatientReportedMedication[] = [];

  for (const med of current) {
    const confirmation = confirmed.get(med.alias) ?? null;
    const spoken = matchedByAlias.get(med.alias) ?? null;

    if (!confirmation) {
      // Exactly one gap. There is no separate `chart-only` category: an
      // unconfirmed active medication is simply of unclear current use.
      gaps.push(gap('use-unclear', med.display, med, spoken, null));
      continue;
    }

    if (confirmation.useStatus === 'not-taking') {
      gaps.push(gap('not-taking', med.display, med, spoken, confirmation));
      continue;
    }
    if (confirmation.useStatus === 'unclear') {
      gaps.push(gap('use-unclear', med.display, med, spoken, confirmation));
      continue;
    }

    // Taking, as documented or differently. Mismatches are independent checks.
    if (differs(confirmation.reportedStrength, med.strength)) {
      gaps.push(gap('strength-mismatch', med.display, med, spoken, confirmation));
    }
    if (differs(confirmation.reportedFrequency, med.frequency)) {
      gaps.push(gap('frequency-mismatch', med.display, med, spoken, confirmation));
    }
    if (!confirmation.indication || !confirmation.indication.trim()) {
      gaps.push(gap('missing-indication', med.display, med, spoken, confirmation));
    }

    // A confirmed chart medication is described by the chart plus the structured
    // confirmation — never by a fabricated verbatim quote. Task 6 attaches the
    // fixed "Chart record confirmed by patient; not restated verbatim" note.
    reconciled.push({
      chartAlias: med.alias,
      provenance: 'chart-confirmed',
      name: med.display,
      ingredient: med.ingredient,
      rxcui: med.rxcui,
      strength: confirmation.reportedStrength ?? med.strength,
      frequency: confirmation.reportedFrequency ?? med.frequency,
      indication: confirmation.indication ?? null,
      patientWords: null,
      extractionConfidence: null,
      otc: spoken?.otc ?? false,
    });
  }

  for (const reported of newlyReported) {
    const match = matches.get(reported);
    // A medication the patient reported that the chart also lists, but that was
    // never explicitly confirmed, stays in review on the patient's word alone.
    if (match && confirmed.has(match.alias)) continue;

    if (!match) {
      gaps.push(gap('patient-only', reported.name, null, reported, null));
    }
    reconciled.push({
      ...reported,
      chartAlias: match ? match.alias : null,
      provenance: 'patient-reported',
    });
  }

  return { gaps, current: reconciled };
}

/**
 * Reset the synthetic demo chart.
 *
 *   npx tsx --env-file-if-exists=.env scripts/clean-demo-chart.ts          # dry run
 *   npx tsx --env-file-if-exists=.env scripts/clean-demo-chart.ts --delete
 *
 * The FHIR writers are create-only by design, so every rehearsal adds another full set
 * of resources. After an afternoon of testing the demo patient carried 26 Flags and 35
 * Tasks, including four identical suicidality Flags and twenty-odd lorazepam taper
 * steps from earlier runs. A judge who opens that chart sees a system that cannot
 * count, which costs more than the rehearsal was worth.
 *
 * SAFETY. This deletes patient data, so it is deliberately awkward:
 *   - dry run by default, `--delete` is required to remove anything
 *   - it refuses to touch a Patient that is not tagged `synthetic-demo`
 *   - it never deletes the Patient or its Conditions, so the seed stays idempotent and
 *     `Patient/<id>` links in your notes keep working
 * If it ever refuses, believe it rather than removing the check.
 */

import { MedplumClient } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';

const SYNTHETIC_TAG = 'synthetic-demo';

/** Everything a review run creates. Patient and Condition are deliberately absent. */
const REVIEW_OUTPUT = [
  'Flag', 'Task', 'DetectedIssue', 'RiskAssessment',
  'MedicationStatement', 'Goal', 'CarePlan', 'Communication', 'Composition',
] as const;

const doDelete = process.argv.includes('--delete');

async function main() {
  const medplum = new MedplumClient({ baseUrl: process.env.MEDPLUM_BASE_URL });
  await medplum.startClientLogin(process.env.MEDPLUM_CLIENT_ID!, process.env.MEDPLUM_CLIENT_SECRET!);

  const patients = await medplum.searchResources('Patient', {
    _tag: SYNTHETIC_TAG,
    _count: '50',
  });

  if (!patients.length) {
    console.log(`No Patient tagged "${SYNTHETIC_TAG}". Nothing to clean.`);
    return;
  }

  let total = 0;

  for (const patient of patients as Patient[]) {
    // Belt and braces: the search filtered on the tag, but this deletes patient data,
    // so re-check the resource in hand rather than trusting the query.
    const tagged = patient.meta?.tag?.some((t) => t.code === SYNTHETIC_TAG);
    if (!tagged) {
      console.warn(`REFUSING Patient/${patient.id}: not tagged ${SYNTHETIC_TAG}`);
      continue;
    }

    const name = [patient.name?.[0]?.given?.join(' '), patient.name?.[0]?.family]
      .filter(Boolean).join(' ') || '(unnamed)';
    console.log(`\nPatient/${patient.id}  ${name}`);

    for (const resourceType of REVIEW_OUTPUT) {
      // Flag and RiskAssessment use `patient`; the rest use `subject`. Try the common
      // one and fall back, rather than hard-coding a table that drifts.
      let found: any[] = [];
      for (const param of ['subject', 'patient']) {
        try {
          found = await medplum.searchResources(resourceType as any, {
            [param]: `Patient/${patient.id}`,
            _count: '200',
          });
          if (found.length) break;
        } catch { /* that search param is not valid for this type */ }
      }
      if (!found.length) continue;

      total += found.length;
      console.log(`  ${String(found.length).padStart(3)}  ${resourceType}`);

      if (doDelete) {
        for (const r of found) {
          try {
            await medplum.deleteResource(resourceType as any, r.id!);
          } catch (err) {
            console.warn(`       could not delete ${resourceType}/${r.id}: ${(err as Error).message}`);
          }
        }
      }
    }
  }

  console.log(
    doDelete
      ? `\nDeleted ${total} review-output resources. Patients and Conditions kept.`
      : `\n${total} review-output resources would be deleted. Re-run with --delete.`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });

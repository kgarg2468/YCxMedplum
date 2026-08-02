/**
 * Post-run chart check:  npm run demo:inspect
 *
 * Answers exactly one rehearsal question — did review output leak back into the
 * next call's prefill? — using the PRODUCTION loader, so the numbers printed are
 * the numbers the next call would see.
 *
 * Counts only. No patient id, no resource id, no medication list: this output is
 * pasted into the rehearsal report.
 */

import { MedplumClient } from '@medplum/core';
import { seedDemoPatient, REVIEW_OUTPUT_TAG } from '../fhir/seed.js';
import { loadChartContext } from '../context/loadChartContext.js';

async function main() {
  if (!process.env.MEDPLUM_CLIENT_ID || !process.env.MEDPLUM_CLIENT_SECRET) {
    console.error('MEDPLUM_CLIENT_ID / MEDPLUM_CLIENT_SECRET missing from .env');
    process.exit(1);
  }

  const medplum = new MedplumClient({ baseUrl: process.env.MEDPLUM_BASE_URL });
  await medplum.startClientLogin(
    process.env.MEDPLUM_CLIENT_ID,
    process.env.MEDPLUM_CLIENT_SECRET,
  );

  const { patient } = await seedDemoPatient(medplum);
  const context = await loadChartContext(medplum, patient.id!);

  const current = context.medications.filter((m) => m.isCurrent && m.status === 'active');
  const requests = current.filter((m) => m.resourceType === 'MedicationRequest');
  const statements = current.filter((m) => m.resourceType === 'MedicationStatement');
  const sources = new Set(current.map((m) => m.sourceDisplay).filter(Boolean));

  // What the loader deliberately kept out of the prefill.
  const excluded = await medplum.searchResources('MedicationStatement', {
    subject: `Patient/${patient.id}`,
    _tag: `${REVIEW_OUTPUT_TAG.system}|${REVIEW_OUTPUT_TAG.code}`,
  });

  console.log('Chart as the NEXT call would see it');
  console.log(`  current MedicationRequests (clinician-authored): ${requests.length}`);
  console.log(`  current MedicationStatements entering prefill:   ${statements.length}`);
  console.log(`  review-output MedicationStatements excluded:     ${excluded.length}`);
  console.log(`  conditions:                                      ${context.conditions.length}`);
  console.log(`  distinct recorded sources:                       ${sources.size}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

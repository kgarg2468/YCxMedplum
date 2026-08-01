/**
 * Place the demo call:  npm run demo:call
 *
 * Resolves the stable synthetic patient (seeding is idempotent, so this both
 * finds and, on a fresh project, creates it), then asks the LOCAL server to
 * start the call. The server — not this script — holds the Vapi key, loads the
 * chart, and owns the call session.
 *
 * Nothing here prints the customer number or either secret.
 */

import { MedplumClient } from '@medplum/core';
import { seedDemoPatient, patientLabel } from '../fhir/seed.js';

const REVIEW_PORT = process.env.REVIEW_PORT ?? '3001';
const START_URL = `http://127.0.0.1:${REVIEW_PORT}/demo/start-call`;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is missing from .env — see .env.example`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const startSecret = required('DEMO_START_SECRET');
  const customerNumber = required('DEMO_CUSTOMER_NUMBER');
  required('MEDPLUM_CLIENT_ID');
  required('MEDPLUM_CLIENT_SECRET');

  const medplum = new MedplumClient({ baseUrl: process.env.MEDPLUM_BASE_URL });
  await medplum.startClientLogin(
    process.env.MEDPLUM_CLIENT_ID!,
    process.env.MEDPLUM_CLIENT_SECRET!,
  );

  const { patient } = await seedDemoPatient(medplum);
  console.log(`Patient: ${patientLabel(patient)}`);

  const res = await fetch(START_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${startSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ patientId: patient.id, customerNumber }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Start call failed: ${res.status} ${text}`);
    console.error(`Is the server running? npm run server  (local app on ${REVIEW_PORT})`);
    process.exit(1);
  }

  const { callId } = JSON.parse(text) as { callId: string };
  console.log(`Call ${callId} placed. Answer the phone.`);
  console.log(`Review panel: http://127.0.0.1:${REVIEW_PORT}/review`);
}

main().catch((e) => { console.error(e); process.exit(1); });

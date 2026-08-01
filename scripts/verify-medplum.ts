/**
 * QA: verify the FHIR resources on the server actually carry the statuses the
 * review panel claims. Run after `npm run demo`:
 *   npx tsx --env-file-if-exists=.env scripts/verify-medplum.ts <patientId>
 */
import { MedplumClient } from '@medplum/core';

const EXPECTED: Record<string, string> = {
  RiskAssessment: 'preliminary',
  DetectedIssue: 'preliminary',
  CarePlan: 'draft',
  Communication: 'preparation',
  Goal: 'proposed',
};

async function main() {
  const pid = process.argv[2];
  if (!pid) throw new Error('usage: verify-medplum.ts <patientId>');

  const m = new MedplumClient({ baseUrl: process.env.MEDPLUM_BASE_URL });
  await m.startClientLogin(process.env.MEDPLUM_CLIENT_ID!, process.env.MEDPLUM_CLIENT_SECRET!);

  let fail = 0;
  for (const [type, expect] of Object.entries(EXPECTED)) {
    const param = type === 'DetectedIssue' ? 'patient' : 'subject';
    const rs = await m.searchResources(type as any, `${param}=Patient/${pid}&_count=30`);
    const got = rs.map((r: any) => (type === 'Goal' ? r.lifecycleStatus : r.status));
    const bad = got.filter((g) => g !== expect);
    if (!rs.length) { console.log(`--   ${type.padEnd(15)} none written`); continue; }
    if (bad.length) { fail++; console.log(`FAIL ${type.padEnd(15)} expected '${expect}', got ${JSON.stringify([...new Set(got)])}`); }
    else console.log(`ok   ${type.padEnd(15)} n=${String(rs.length).padStart(2)}  all '${expect}'`);
  }

  const conds = await m.searchResources('Condition', `subject=Patient/${pid}&_count=30`);
  const coded = conds.filter((c: any) => c.code?.coding?.length);
  console.log(`\nConditions: ${conds.length} total, ${coded.length} coded`);
  for (const c of coded.slice(0, 6) as any[]) {
    const cd = c.code.coding[0];
    console.log(`  ${String(cd.code).padEnd(7)} ${cd.system}  "${cd.display}"`);
  }
  if (conds.length && !coded.length) { fail++; console.log('FAIL: Conditions carry no codings'); }

  console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nALL SERVER-SIDE CHECKS PASSED');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

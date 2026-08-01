/**
 * END-TO-END RUNNER. Run this the moment the pieces exist:
 *   npx tsx src/demo/run.ts
 *
 * It uses the canned transcript, so you can rehearse the whole pipeline without a
 * live voice call. Get this printing correct findings BEFORE you touch the voice
 * layer — otherwise you will be debugging two systems at once at 3pm.
 *
 * Flags:
 *   --no-fhir   skip Medplum writes (fast iteration on the engine)
 *   --explain   run the LLM explanation pass (slower, costs tokens)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { MedplumClient } from '@medplum/core';
import { DEMO_TRANSCRIPT, DEMO_CONDITIONS, DEMO_DURATIONS, seedDemoPatient } from '../fhir/seed.js';
import { extractWithRetry } from '../llm/extract.js';
import { resolveAll } from '../rxnav.js';
import { runReview, detectCascadeChains } from '../engine/detect.js';
import { explainFinding, buildTaper, challenge } from '../llm/agents.js';
import { persistReview, writeTaperPlan, writePrescriberMessage } from '../fhir/writers.js';
import { checkRedFlags } from '../voice/prompt.js';
import type { ReviewSnapshot } from '../ui/panel.js';

/** Snapshot for the review panel (src/ui/panel.ts, served at /review). */
function saveSnapshot(snap: ReviewSnapshot) {
  mkdirSync('out', { recursive: true });
  writeFileSync('out/last-review.json', JSON.stringify(snap, null, 2));
  console.log('\n(review panel snapshot → out/last-review.json — view at http://localhost:3000/review)');
}

const noFhir = process.argv.includes('--no-fhir');
const doExplain = process.argv.includes('--explain');

function hr(label: string) {
  console.log(`\n${'─'.repeat(70)}\n${label}\n${'─'.repeat(70)}`);
}

async function main() {
  hr('1. EXTRACT');
  const extraction = await extractWithRetry(DEMO_TRANSCRIPT);
  console.log(`${extraction.medications.length} medications, ${extraction.symptoms.length} symptoms`);
  for (const m of extraction.medications) {
    console.log(`  · ${m.name_guess ?? '(unidentified)'}  ← "${m.spoken_as}"  [${m.confidence}]` +
      (m.stated_indication ? `  for: ${m.stated_indication}` : '  ⚠ no indication stated'));
  }

  const regexFlags = checkRedFlags(DEMO_TRANSCRIPT);
  if (regexFlags.length || extraction.red_flags.length) {
    console.log('\n⚠ RED FLAGS:', [...regexFlags, ...extraction.red_flags].join('; '));
  }

  hr('2. RESOLVE (RxNav)');
  const meds = await resolveAll(extraction.medications);
  for (const m of meds) {
    console.log(`  · ${m.spoken_as.slice(0, 40).padEnd(42)} → ` +
      (m.ingredient ? `${m.ingredient} (rxcui ${m.rxcui})` : 'UNRESOLVED → clinician review'));
  }

  hr('3. DETECT (deterministic — no LLM)');
  const review = runReview({
    meds,
    symptoms: extraction.symptoms,
    conditions: DEMO_CONDITIONS,
    values: extraction.values,
    redFlags: [...regexFlags, ...extraction.red_flags],
    durationsWeeks: DEMO_DURATIONS,
  });

  console.log(`\nAnticholinergic burden: ${review.acbScore} ` +
    `(${review.acbContributors.map((c) => `${c.ingredient} ${c.score}`).join(', ')})`);

  console.log(`\n${review.findings.length} findings:`);
  for (const f of review.findings) {
    const conf = f.kind === 'cascade'
      ? (f.symptomConfirmed ? ' ✓ symptom confirmed' : ' ○ structural only')
      : '';
    console.log(`  [${f.severity.toUpperCase().padEnd(8)}] ${f.kind.padEnd(16)} ${f.label}${conf}`);
    console.log(`             ${f.implicated.join(' → ')}`);
  }

  const chains = detectCascadeChains(review.findings.filter((f) => f.kind === 'cascade'));
  if (chains.length) {
    console.log('\n★ CHAINED CASCADES (the on-stage moment):');
    for (const c of chains) console.log(`    ${c.join(' → ')}`);
  }

  if (doExplain) {
    hr('4. EXPLAIN (LLM, one finding at a time)');
    const symptoms = extraction.symptoms.map((s) => s.symptom);
    for (const f of review.findings.slice(0, 4)) {
      f.explanation = await explainFinding(f, symptoms);
      console.log(`\n${f.label}\n  ${f.explanation}`);
    }
  }

  hr('5. TAPER');
  const taper = await buildTaper('lorazepam', '1 mg', 'at bedtime', 9);
  if (taper.error) {
    console.log(`  ${taper.error}`);
  } else {
    for (const s of taper.steps ?? []) {
      console.log(`  Week ${String(s.week).padStart(2)}: ${s.dose.padEnd(14)} ${s.note}`);
    }
  }

  hr('6. CHALLENGER (peer review)');
  const objection = await challenge(review,
    `Taper lorazepam per algorithm. Stop diphenhydramine. Reduce or switch amlodipine ` +
    `to address oedema rather than continuing furosemide. Reassess oxybutynin as ` +
    `cascade reversal. Trial stopping omeprazole.`);
  console.log(`  ${objection}`);

  const snapshot: ReviewSnapshot = {
    at: new Date().toISOString(),
    source: 'canned-demo',
    review,
    chains,
    objection,
    taper: !taper.error && taper.steps?.length ? { drug: 'lorazepam', steps: taper.steps } : null,
  };

  if (noFhir) {
    saveSnapshot(snapshot);
    console.log('\n(--no-fhir: skipped Medplum writes)');
    return;
  }

  hr('7. PERSIST TO MEDPLUM');
  const medplum = new MedplumClient({ baseUrl: process.env.MEDPLUM_BASE_URL });
  await medplum.startClientLogin(
    process.env.MEDPLUM_CLIENT_ID!,
    process.env.MEDPLUM_CLIENT_SECRET!,
  );
  const { patient } = await seedDemoPatient(medplum);
  const written = await persistReview(medplum, patient, review);

  console.log(`  MedicationStatement × ${written.meds.length}`);
  console.log(`  Flag × ${written.flags.length}`);
  console.log(`  DetectedIssue × ${written.cascades.length}`);
  console.log(`  Goal × ${written.goals.length}`);
  console.log(`  RiskAssessment: ${written.risk ? 'yes' : 'none'}`);

  if (!taper.error && taper.steps?.length) {
    const { carePlan, tasks } = await writeTaperPlan(
      medplum, patient, 'lorazepam', taper.steps,
      taper.monitoring ?? [], taper.citation ?? '');
    console.log(`  CarePlan ${carePlan.id} + Task × ${tasks.length}`);
  }

  await writePrescriberMessage(medplum, patient,
    `Pre-visit medication review for Margaret Okonkwo (82).\n\n` +
    `Anticholinergic burden ${review.acbScore}. ${review.findings.length} findings, ` +
    `${chains.length} chained prescribing cascade(s).\n\n` +
    review.findings.slice(0, 5).map((f) => `• ${f.label} — ${f.citation}`).join('\n') +
    `\n\nPatient's stated priority: ${review.patientGoals[0] ?? 'not recorded'}\n\n` +
    `Reviewer objection to consider: ${objection}`);
  console.log('  Communication: drafted (status=preparation, not sent)');

  snapshot.patientId = patient.id;
  snapshot.written = {
    meds: written.meds.length, flags: written.flags.length,
    cascades: written.cascades.length, goals: written.goals.length,
    risk: Boolean(written.risk),
  };
  saveSnapshot(snapshot);

  console.log(`\n→ Open the Medplum console at Patient/${patient.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

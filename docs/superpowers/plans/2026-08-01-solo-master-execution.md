# YCxMedplum Solo Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task in one continuous session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and demonstrate a patient-centered cross-prescriber medication review in which the patient tells their medication story once, YCxMedplum combines it with Medplum chart history, and the authorized care team receives one evidence-linked coordination view.

**Architecture:** Medplum is the longitudinal source of truth. Before an outbound call, the server loads the synthetic patient's chart, converts it into a compact context, and passes it to Vapi using dynamic variables; Vapi continues to use Deepgram Nova-3 for transcription and Deepgram Aura for speech. After the call, structured extraction reconciles chart-confirmed and newly reported medications, the existing deterministic engine identifies potential medication concerns and cascade patterns, and idempotent FHIR writers plus the review panel present the result for clinician review.

**Tech Stack:** TypeScript 5.9, Node.js, Express, Medplum/FHIR R4, Vapi, Deepgram Nova-3 and Aura through Vapi, Anthropic structured extraction, RxNorm/RxNav, server-rendered HTML, bare `tsx` tests using `node:assert/strict`.

**Planning baseline:** `main` commit `6e2110d` on 2026-08-01, with PR [#1](https://github.com/kgarg2468/YCxMedplum/pull/1) open, clean, mergeable, and passing its current Greptile check. Task 0 re-verifies this state before changing code.

## Global Constraints

- Execute this plan alone, in order, on one feature branch after merging PR #1.
- Do not parallelize tasks, create per-component branches, or hand work to separate developers.
- Do not continue past a failing gate. Diagnose and repair the current task before starting the next task.
- Use TDD for every new pure function, API payload, reconciliation rule, writer behavior, and panel behavior.
- Use only synthetic data. Never place real PHI, personal phone numbers, API keys, or client secrets in Git, logs, fixtures, screenshots, or rehearsal notes.
- Vapi remains the call orchestrator. Deepgram remains the Vapi transcriber and voice provider. Do not add a direct Deepgram Voice Agent integration.
- The system never tells a patient to stop, start, or change a medication or dose.
- The system never claims a medication caused a symptom or that a prescriber made an error.
- Patient-reported symptoms affect confidence and supporting evidence, not the curated clinical severity of a deterministic rule.
- Every clinical finding remains a potential concern for clinician review and retains its rule-specific citation.
- The coordination view is for clinicians already authorized to participate in the patient's care. The MVP does not grant cross-practice access or claim that external EHRs are synchronized.
- HHS states that treatment-related provider disclosures may be permitted without patient authorization, but reasonable safeguards still apply. Production deployment still requires verified care relationships, role-based access, audit logging, applicable agreements, and legal/compliance review. Reference: [HHS treatment disclosures guidance](https://www.hhs.gov/hipaa/for-professionals/faq/treatment-payment-and-health-care-operations-disclosures/index.html).
- Do not add Moss, Stedi, payer eligibility, claims adjudication, e-prescribing, automatic prescriber messaging, or new clinical rules during this build.
- Do not add a test framework or a runtime dependency unless this plan explicitly requires it.
- Use `apply_patch` for code and documentation edits, stage explicit files, and make the commits specified below.

---

## 1. Final product behavior

The completed demo must execute this exact story:

1. A synthetic Medplum patient has nine active prescription records from five fictional practitioners.
2. The hero `amlodipine -> furosemide -> allopurinol` chain has three distinct recorded sources.
3. The server reads the patient's chart before creating the Vapi call.
4. The Vapi assistant receives only current, compact, presentation-safe chart context.
5. For known medications, the assistant confirms current use and asks only about gaps, changes, indications, concerns, symptoms, non-prescription products, and what the patient wants discussed.
6. A simple “yes” confirmation keeps a chart medication in deterministic review even when the patient never repeats its name.
7. A contradiction such as “I stopped that” or “I take it twice daily now” becomes a visible reconciliation gap.
8. Newly reported products such as diphenhydramine and senna are resolved through RxNorm and added to the review.
9. The deterministic engine identifies potential concerns and cascade patterns using the reconciled current-medication set.
10. FHIR resources are written to the exact patient associated with the call.
11. Retrying a partially completed call reuses the same output resources rather than duplicating them.
12. Review-generated `MedicationStatement` resources never feed back into the next call's chart prefill.
13. The panel clearly separates chart facts, patient confirmations, discrepancies, patient priorities, and clinical review findings.
14. The live and canned demonstrations tell the same core story.

## 2. Definition of done

- [ ] PR #1 is merged and `main` is clean.
- [ ] The solo feature branch contains all implementation commits in this plan, in order.
- [ ] `npm ci`, `npm run typecheck`, and `npm test` succeed from a clean checkout.
- [ ] Seeding twice produces one patient, five practitioners, five conditions, and nine medication requests without duplicates.
- [ ] An authenticated outbound call receives chart context through `assistantOverrides.variableValues`.
- [ ] The assistant does not restart a full medication inventory when chart context exists.
- [ ] Patient-only, stopped, unclear-use, strength-mismatch, frequency-mismatch, and missing-indication states are tested; medication present only in the chart is represented as `use-unclear`, not a duplicate gap category.
- [ ] Two simultaneous call IDs remain associated with different patient IDs under test.
- [ ] An unlinked call cannot write clinical data to the seeded demo patient.
- [ ] A simulated partial FHIR failure followed by retry creates no duplicate output identifiers.
- [ ] Two consecutive live calls complete successfully.
- [ ] A third chart load contains exactly the nine clinician-authored medication requests and excludes prior review output.
- [ ] The potential cascade displays the Savage et al. citation and distinct source labels.
- [ ] The panel contains no unsupported causal wording.
- [ ] The canned demo works without Medplum, Vapi, Anthropic, or RxNav access.
- [ ] The rehearsal report records the tested implementation commit and every required scenario.

---

## 3. Single-operator Git workflow

There is one implementation branch and one final merge.

### 3.1 Merge the prerequisite PR

Run from the repository root:

```bash
git switch main
git pull --ff-only origin main
gh pr view 1 --json state,mergeable,mergeStateStatus,statusCheckRollup,reviews
```

Proceed only when PR #1 is open, mergeable, clean, and all required checks succeed. Resolve actionable review comments on `defect-sweep-and-voice`, then run:

```bash
git fetch origin
gh pr checkout 1
git rebase origin/main
npm ci
npm run typecheck
npm test
git diff --check origin/main...HEAD
git push --force-with-lease origin defect-sweep-and-voice
gh pr merge 1 --merge --delete-branch
```

After GitHub reports the merge complete:

```bash
git switch main
git pull --ff-only origin main
git status --short --branch
```

Expected: clean `main`, synchronized with `origin/main`.

### 3.2 Create the one implementation branch

```bash
git switch -c feat/cross-prescriber-master
```

Stay on this branch through Tasks 1-10. Do not create another branch.

### 3.3 Commit discipline

- Complete one task and its full verification gate before committing.
- Stage only the files named by that task.
- Do not use `git add .`.
- Do not amend a completed task commit after starting the next task.
- If a later task reveals an earlier defect, make a new focused fix commit and rerun every affected gate.
- Push the branch after every two successful task commits so work is recoverable.

---

## 4. File map

### New files

| File | Responsibility |
|---|---|
| `src/context/types.ts` | Chart context, confirmations, concerns, gaps, and reconciled-state contracts. |
| `src/context/loadChartContext.ts` | Read and normalize patient, MedicationRequest, MedicationStatement, and Condition resources. |
| `src/context/loadChartContext.test.ts` | Offline FHIR normalization and filtering tests. |
| `src/context/compareMedicationState.ts` | Pure chart-confirmation/new-medication reconciliation. |
| `src/context/compareMedicationState.test.ts` | Matching, discrepancy, alias, and provenance tests. |
| `src/voice/buildPrefill.ts` | Safe compact Vapi dynamic-variable serialization. |
| `src/voice/buildPrefill.test.ts` | Prefill size, alias, escaping, and history-filter tests. |
| `src/llm/extract.test.ts` | Chart-confirmation, concern, and degraded-fallback extraction fixtures. |
| `src/voice/callCoordinator.ts` | Outbound-call payload creation and in-memory call-session lifecycle. |
| `src/voice/callCoordinator.test.ts` | Authentication-independent payload and session tests. |
| `src/fhir/seed.test.ts` | Idempotent synthetic chart tests. |
| `src/fhir/writers.test.ts` | Output tags, identifiers, citations, provenance, and retry tests. |
| `src/ui/panel.test.ts` | Snapshot compatibility, escaping, source labels, and causal-copy tests. |
| `src/server.test.ts` | HTTP authentication, validation, correct-patient, dedupe, and unlinked-call tests. |
| `src/demo/startCall.ts` | Resolve the synthetic patient and call the authenticated local start endpoint. |
| `src/demo/inspectChart.ts` | Print presentation-safe post-run chart counts for the retry/re-ingestion rehearsal. |
| `docs/DEMO_CROSS_PRESCRIBER.md` | Exact live/canned operator runbook and sponsor explanation. |
| `docs/reports/cross-prescriber-rehearsal.md` | Rehearsal evidence and tested implementation commit record. |

### Modified files

| File | Change |
|---|---|
| `src/fhir/seed.ts` | Idempotent patient, practitioner, condition, and MedicationRequest seeding. |
| `src/types.ts` | Extraction, resolved-medication provenance, and patient-concern fields. |
| `src/llm/extract.ts` | Chart-alias confirmations and patient-concern extraction. |
| `src/llm/client.ts` | Lazy Anthropic client construction so offline imports need no key. |
| `src/rxnav.ts` | Preserve explicit patient-reported provenance through resolution. |
| `src/voice/prompt.ts` | Gap-only chart-aware interview instructions and safe language. |
| `src/voice/createAssistant.ts` | Dynamic variables while preserving Vapi + Deepgram configuration. |
| `src/server.ts` | Dependency-injected app, authenticated start route, associated context, correct-patient pipeline. |
| `src/fhir/writers.ts` | Idempotent tagged writes with rule-specific citations and honest provenance wording. |
| `src/engine/detect.ts` | Keep deterministic rule severity independent from symptom-report confidence. |
| `src/test/engine.test.ts` | Assert the severity/confidence distinction and existing engine behavior. |
| `src/ui/panel.ts` | Chart/patient/gap/source/concern presentation and safe cascade wording. |
| `src/demo/run.ts` | New extraction defaults, stable offline run ID, cross-prescriber canned snapshot. |
| `demo-assets/canned-review.json` | Network-free final story with no stale patient ID. |
| `.env.example` | Vapi IDs and authenticated demo-start secret; remove Retell. |
| `package.json` | Full test suite, start-call script, and clean canned-panel script. |
| `package-lock.json` | Mechanical script metadata only if changed. |
| `README.md`, `docs/DEMO.md`, `docs/RUNBOOK.md`, `docs/SETUP.md` | Point primary instructions to the cross-prescriber flow. |

---

## 5. Fixed contracts

Create `src/context/types.ts` with these public contracts before implementing behavior:

```ts
import type { Patient } from '@medplum/fhirtypes';
import type { ReviewResult } from '../types.js';

export type ChartMedicationResourceType = 'MedicationRequest' | 'MedicationStatement';

export interface ChartMedication {
  alias: string;
  resourceType: ChartMedicationResourceType;
  resourceId: string;
  display: string;
  ingredient: string | null;
  rxcui: string | null;
  strength: string | null;
  frequency: string | null;
  status: string;
  isCurrent: boolean;
  sourceReference: string | null;
  sourceDisplay: string | null;
  authoredOn: string | null;
}

export interface ChartCondition {
  resourceId: string;
  display: string;
  code: string | null;
  clinicalStatus: string | null;
}

export interface InterviewContext {
  patientId: string;
  patientDisplay: string;
  loadedAt: string;
  medications: ChartMedication[];
  conditions: ChartCondition[];
}

export type ChartMedicationUseStatus =
  | 'taking-as-documented'
  | 'taking-differently'
  | 'not-taking'
  | 'unclear';

export interface ChartMedicationConfirmation {
  chartAlias: string;
  useStatus: ChartMedicationUseStatus;
  reportedStrength: string | null;
  reportedFrequency: string | null;
  indication: string | null;
}

export interface PatientReportedMedication {
  chartAlias: string | null;
  provenance: 'chart-confirmed' | 'patient-reported';
  name: string;
  ingredient: string | null;
  rxcui: string | null;
  strength: string | null;
  frequency: string | null;
  indication: string | null;
  patientWords: string | null;
  extractionConfidence: 'high' | 'medium' | 'low' | null;
  otc: boolean;
}

export type MedicationGapKind =
  | 'patient-only'
  | 'strength-mismatch'
  | 'frequency-mismatch'
  | 'missing-indication'
  | 'not-taking'
  | 'use-unclear';

export interface MedicationGap {
  kind: MedicationGapKind;
  display: string;
  chartMedication: ChartMedication | null;
  patientMedication: PatientReportedMedication | null;
  confirmation: ChartMedicationConfirmation | null;
}

export interface ReconciledMedicationState {
  gaps: MedicationGap[];
  current: PatientReportedMedication[];
}

export type PatientConcernIntent =
  | 'concern-only'
  | 'discuss-changing'
  | 'discuss-stopping';

export interface PatientMedicationConcern {
  chartAlias: string | null;
  medicationName: string | null;
  patientWords: string;
  intent: PatientConcernIntent;
}

export interface CallSession {
  context: InterviewContext;
  patient: Patient;
  aliasToChartKey: Record<string, `${ChartMedicationResourceType}/${string}`>;
  preparedReview: PreparedReview | null;
}

export interface PreparedReview {
  review: ReviewResult;
  reconciled: ReconciledMedicationState;
  concerns: PatientMedicationConcern[];
  preparedAt: string;
}

export interface ReviewWriteOptions {
  runId: string;
  beforeWrite?: (ordinal: number) => void;
}
```

Public seams (documentation-only signatures; do not paste these bodiless declarations into a runtime `.ts` file):

```ts
export async function loadChartContext(
  medplum: MedplumClient,
  patientId: string,
): Promise<InterviewContext>;

export function compareMedicationState(
  chart: ChartMedication[],
  confirmations: ChartMedicationConfirmation[],
  newlyReported: PatientReportedMedication[],
): ReconciledMedicationState;

export function buildVoicePrefill(context: InterviewContext): {
  variableValues: { patient_name: string; prefill_json: string };
  aliasToChartKey: Record<string, `${ChartMedicationResourceType}/${string}`>;
};
```

Contract rules:

- The loader assigns aliases only after stable sorting: `M1`, `M2`, and so on.
- RxCUI comes only from explicit RxNorm coding or RxNav resolution.
- Ingredient comes from explicit RxNorm display, normalized to lowercase.
- Current means `active`; completed records may display as history but never enter Vapi prefill or deterministic current-medication review.
- Matching order is chart alias, RxCUI, ingredient, then normalized exact name.
- Unknown remains `null`; do not guess.
- A chart medication with no explicit confirmation becomes `use-unclear`, not automatically current.
- A stopped or unclear chart medication is excluded from deterministic review but retained in visible gaps.
- Raw chart IDs and generated output-resource IDs never enter the Vapi prompt or panel snapshot. The panel stores `patientDisplay` and presentation-only resource summaries, never `patientId` or resource links.
- `PatientReportedMedication` converts losslessly to `ResolvedMed`: `spoken_as = patientWords ?? name`, `name_guess = name`, `stated_indication = indication`, and strength/frequency/OTC/confidence/provenance/RxCUI/ingredient are copied. For an explicit chart-alias confirmation, use `confidence: 'high'` as match confidence and the fixed Task 6 chart-confirmed note; never present it as verbatim extraction confidence.
- A current chart medication without an explicit confirmation emits exactly one `use-unclear` gap. There is no separate `chart-only` gap.
- Tests use no additional framework: Medplum doubles are structural stubs cast `as unknown as MedplumClient`; HTTP tests call the applicable app factory and `.listen(0)`, use Node's global `fetch`, and close the listener in `finally`; external HTTP is supplied as an injected fetch function and is never monkey-patched globally.

---

## Task 0: Merge and verify the prerequisite work

**Files:** Existing PR #1 files only.

- [ ] Rebase PR #1 on current `main` using the commands in Section 3.1.
- [ ] Confirm the UTC age calculation, concurrency-safe red-flag dedupe, retry behavior, and idempotent seed fixes remain intact.
- [ ] Run `npm ci`.
- [ ] Run `npm run typecheck`; expected exit code `0`.
- [ ] Run `npm test`; expected existing engine assertions pass.
- [ ] Run `git diff --check origin/main...HEAD`; expected no output.
- [ ] Merge PR #1.
- [ ] Pull the merged `main` and create `feat/cross-prescriber-master`.

**Gate:** Do not begin Task 1 until `git status --short --branch` shows a clean feature branch based on merged `main`.

---

## Task 1: Establish the full test harness and shared contracts

**Files:**

- Create: `src/context/types.ts`
- Create: empty runnable test shells for the nine new `*.test.ts` files listed in Section 4
- Modify: `package.json`

**Interfaces:** Produces every shared type in Section 5 and a test command that later tasks fill in.

- [ ] Add the contracts from Section 5 to `src/context/types.ts`.
- [ ] Create each new test file with only `node:assert/strict` plus one passing smoke assertion. Do not import any module scheduled for Tasks 2-7 until the task that creates that module.
- [ ] Replace the `test` script with:

```json
"test": "tsx src/fhir/seed.test.ts && tsx src/test/engine.test.ts && tsx src/context/loadChartContext.test.ts && tsx src/context/compareMedicationState.test.ts && tsx src/voice/buildPrefill.test.ts && tsx src/llm/extract.test.ts && tsx src/voice/callCoordinator.test.ts && tsx src/fhir/writers.test.ts && tsx src/ui/panel.test.ts && tsx src/server.test.ts"
```

- [ ] Run `npm run typecheck`; expected exit code `0`.
- [ ] Run `npm test`; expected all smoke tests and current engine test pass.
- [ ] Run `git diff --check`.
- [ ] Commit:

```bash
git add package.json src/context/types.ts src/fhir/seed.test.ts src/context/loadChartContext.test.ts src/context/compareMedicationState.test.ts src/voice/buildPrefill.test.ts src/llm/extract.test.ts src/voice/callCoordinator.test.ts src/fhir/writers.test.ts src/ui/panel.test.ts src/server.test.ts
git commit -m "test: establish cross-prescriber contracts and harness"
```

---

## Task 2: Seed the authoritative synthetic cross-prescriber chart

**Files:**

- Modify: `src/fhir/seed.ts`
- Test: `src/fhir/seed.test.ts`

**Interfaces:** Produces one idempotently seeded patient, five practitioners, five conditions, and nine active MedicationRequests.

Seed these exact medications:

| Medication | RxCUI | Dosage | Practitioner display |
|---|---:|---|---|
| donepezil | 135447 | 10 mg once daily | Neurology — Dr. Elena Park |
| oxybutynin | 32675 | 5 mg three times daily | Urology — Dr. Samuel Reed |
| amlodipine | 17767 | 10 mg once daily | Cardiology — Dr. Priya Shah |
| furosemide | 4603 | 20 mg every morning | Primary care — Dr. Jordan Lee |
| allopurinol | 519 | 100 mg once daily | Rheumatology — Dr. Sofia Martinez |
| lisinopril | 29046 | 10 mg once daily | Cardiology — Dr. Priya Shah |
| benzonatate | 18993 | as needed for cough | Primary care — Dr. Jordan Lee |
| lorazepam | 6470 | 1 mg at bedtime | Primary care — Dr. Jordan Lee |
| omeprazole | 7646 | 20 mg once daily | Source not recorded; omit requester |

Use identifier system `https://ycxmedplum.dev/demo`, existing synthetic tag, RxNorm system `http://www.nlm.nih.gov/research/umls/rxnorm`, `status: 'active'`, `intent: 'order'`, structured dosage fields, requester reference/display, and authored dates. Keep diphenhydramine and senna patient-only.

- [ ] Write a failing fake-client test that runs seeding twice and expects stable counts.
- [ ] Verify every listed RxCUI against the current official RxNav API before writing fixtures; record corrections in this task commit, with special attention to benzonatate.
- [ ] Run `npx tsx src/fhir/seed.test.ts`; expected failure because practitioners and MedicationRequests are absent.
- [ ] Implement identifier-based find-or-create for patient, practitioners, conditions, and medication requests.
- [ ] Add a synthetic-only legacy adoption path: if the stable patient identifier is absent, adopt the one existing patient only when both the current synthetic-demo tag and exact Margaret demographics match, then add the stable identifier. Never match or mutate a non-synthetic patient by name alone.
- [ ] For that adopted demo patient only, identify legacy conditions by exact seeded coding/text, add stable identifiers/tags rather than creating duplicates, and tag every pre-feature untagged `MedicationStatement` as `review-output` before the first chart load.
- [ ] Add a pre-feature fake-client fixture and assert adoption yields one patient, five conditions, nine authoritative MedicationRequests, and zero legacy MedicationStatements eligible for prefill.
- [ ] Ensure an existing patient does not prevent missing child resources from being created.
- [ ] Replace the space-unsafe `import.meta.url === "file://" + process.argv[1]` direct-execution check with `pathToFileURL(resolve(process.argv[1])).href`; this repository path contains a space, so the current string comparison prevents `npm run seed` from running.
- [ ] Preserve `DEMO_TRANSCRIPT`, `DEMO_CONDITIONS`, and `DEMO_DURATIONS` exports.
- [ ] Run `npx tsx src/fhir/seed.test.ts`; expected pass with exact counts and no duplicates.
- [ ] Run `npm run typecheck && npm test`.
- [ ] Commit:

```bash
git add src/fhir/seed.ts src/fhir/seed.test.ts
git commit -m "feat: seed cross-prescriber medication history"
```

---

## Task 3: Load and reconcile Medplum chart context

**Files:**

- Create: `src/context/loadChartContext.ts`
- Test: `src/context/loadChartContext.test.ts`
- Create: `src/context/compareMedicationState.ts`
- Test: `src/context/compareMedicationState.test.ts`

**Interfaces:** Implements `loadChartContext` and `compareMedicationState` exactly as defined in Section 5.

Loader behavior:

- Read the Patient and search MedicationRequest, MedicationStatement, and Condition in parallel by subject.
- Exclude entered-in-error resources.
- Exclude meta tag `{ system: 'https://ycxmedplum.dev/tags', code: 'review-output' }`.
- Map display from concept text, RxNorm coding display, first coding display, then reference display.
- Map strength from `doseAndRate[].doseQuantity` and frequency from `timing.code.text`.
- Map MedicationStatement date from effectiveDateTime, effectivePeriod.start, then dateAsserted.
- Preserve requester/information-source reference and display.
- Stable-sort by normalized display, resource type, then resource ID; assign aliases after sorting.

Reconciliation behavior:

- Chart alias is the strongest join.
- Emit `not-taking` for explicit stop, `use-unclear` for missing/unclear confirmation, and mismatch gaps independently.
- Preserve patient-only medications.
- Set chart entries to `chart-confirmed` provenance and new entries to `patient-reported`.
- Exclude stopped/unclear chart items from `current`.

- [ ] Write failing loader tests for MedicationRequest, MedicationStatement, Condition, missing values, output-tag filtering, stable sorting, and aliases.
- [ ] Run `npx tsx src/context/loadChartContext.test.ts`; expected failure.
- [ ] Implement loader normalization and Medplum searches.
- [ ] Run the loader test; expected pass.
- [ ] Write failing reconciliation tests for yes, stopped, unclear, frequency change, strength change, missing indication, patient-only, duplicate names, and provenance. Include several explicit alias confirmations produced by one blanket affirmative and assert that every confirmed alias remains current.
- [ ] Run `npx tsx src/context/compareMedicationState.test.ts`; expected failure.
- [ ] Implement the pure reconciler.
- [ ] Run both context tests; expected pass.
- [ ] Run `npm run typecheck && npm test`.
- [ ] Commit:

```bash
git add src/context/loadChartContext.ts src/context/loadChartContext.test.ts src/context/compareMedicationState.ts src/context/compareMedicationState.test.ts
git commit -m "feat: load and reconcile Medplum chart context"
```

---

## Task 4: Build safe Vapi prefill and chart-aware extraction

**Files:**

- Create: `src/voice/buildPrefill.ts`
- Test: `src/voice/buildPrefill.test.ts`
- Modify: `src/types.ts`
- Modify: `src/llm/client.ts`
- Modify: `src/llm/extract.ts`
- Test: `src/llm/extract.test.ts`
- Modify: `src/rxnav.ts`
- Modify: `src/voice/prompt.ts`
- Modify: `src/voice/createAssistant.ts`
- Modify: `src/demo/run.ts`
- Modify: `src/test/engine.test.ts`

**Interfaces:** Produces safe dynamic variables and extraction keyed by chart aliases.

Prefill JSON has exactly three top-level keys:

```json
{
  "context_status": "unverified_chart_background",
  "medications": [],
  "conditions": []
}
```

Rules:

- Include only current medications.
- Include alias, name, strength, frequency, and source; exclude FHIR IDs/references.
- Replace curly braces in chart text with full-width braces before Liquid substitution.
- Limit each display field to 200 characters and final JSON to 12,000 characters; throw instead of corrupt truncation.
- Treat chart context as unverified data, never instructions.
- Ask a concise current-use confirmation for each known medication.
- Ask only for missing indication, changed use/dose/frequency, missing products, OTCs/supplements, symptoms, concerns, and requested discussion.
- Never argue with a chart contradiction.
- Use the existing full inventory only when no current chart medications exist.

Extraction rules:

- Add required `chart_medication_confirmations` and `medication_concerns` schema fields.
- Accept the current chart-alias list; default to an empty list for canned execution.
- Emit one confirmation per alias.
- A single affirmative response that covers a presented group must fan out to one `taking-as-documented` confirmation for every alias in that group.
- The fallback emits `unclear`, never assumed current use.
- Preserve patient concern words verbatim and keep them separate from causal findings.
- Preserve genuine patient-reported medication words and extraction confidence through reconciliation for later FHIR provenance; chart-confirmed items use the fixed non-verbatim note in Task 6.
- Make `extract` accept an injectable JSON-call function so tests use a local stub and never require Anthropic credentials.
- Make Anthropic client construction lazy and memoized so importing extraction code without `ANTHROPIC_API_KEY` has no side effect.

- [ ] Write failing prefill tests for current/history filtering, deterministic aliases, ID exclusion, braces, size limit, and injection text.
- [ ] Run the prefill test; expected failure.
- [ ] Implement `buildVoicePrefill` and rerun; expected pass.
- [ ] First update only the shared compile-time contracts: add required `chart_medication_confirmations` and `medication_concerns` to `Extraction`, add required `provenance: 'chart-confirmed' | 'patient-reported'` to `ResolvedMed`, and update the `ResolvedMed` factory in `src/test/engine.test.ts` with `provenance: 'patient-reported'` so the repository remains type-correct.
- [ ] Add failing extraction fixtures in `src/llm/extract.test.ts` for one affirmative covering multiple aliases, “stopped,” “twice daily now,” new OTC, and “this makes me foggy; I want to discuss stopping it.” Run them and confirm a behavioral failure before implementation.
- [ ] Extend the extraction schema, prompt, fan-out mapping, and minimal fallback; update RxNav resolution to mark newly resolved speech as `patient-reported` and preserve the lossless conversion fields from Section 5.
- [ ] Run `npx tsx src/llm/extract.test.ts`; expected failure before the schema/fallback change and pass afterward.
- [ ] Update the voice prompt with the delimited `{{patient_name}}` and `{{prefill_json}}` context block.
- [ ] Preserve Vapi with Deepgram Nova-3 and Aura in `createAssistant.ts`.
- [ ] Update canned runner calls to pass an empty chart-alias list.
- [ ] Run `env -u ANTHROPIC_API_KEY npm test`; expected pass with no network call or SDK-constructor failure.
- [ ] Run `npm run typecheck && npm test`.
- [ ] Commit:

```bash
git add src/voice/buildPrefill.ts src/voice/buildPrefill.test.ts src/types.ts src/llm/client.ts src/llm/extract.ts src/llm/extract.test.ts src/rxnav.ts src/voice/prompt.ts src/voice/createAssistant.ts src/demo/run.ts src/test/engine.test.ts
git commit -m "feat: make voice interviews chart aware"
```

---

## Task 5: Add authenticated outbound calls and correct call association

**Files:**

- Create: `src/voice/callCoordinator.ts`
- Test: `src/voice/callCoordinator.test.ts`
- Modify: `src/server.ts`
- Test: `src/server.test.ts`
- Modify: `src/voice/createAssistant.ts`
- Modify: `.env.example`
- Create: `src/demo/startCall.ts`
- Create: `src/demo/inspectChart.ts`
- Modify: `package.json`

**Interfaces:** Adds authenticated `POST /demo/start-call`, per-call sessions, and correct-patient pipeline execution.

Environment variables:

```text
VAPI_API_KEY=
VAPI_ASSISTANT_ID=
VAPI_PHONE_NUMBER_ID=
VAPI_SERVER_CREDENTIAL_ID=
VAPI_WEBHOOK_SECRET=
DEMO_START_SECRET=
DEMO_CUSTOMER_NUMBER=
REVIEW_PORT=3001
```

Remove `RETELL_API_KEY` and the “whichever platform” wording.

Start endpoint behavior:

- Require bearer authentication and compare SHA-256 digests with `timingSafeEqual`.
- Validate patient ID with `/^[A-Za-z0-9.-]{1,64}$/` and customer number with `/^\+[1-9]\d{7,14}$/`.
- Read the exact patient and reject before external I/O unless it has both an identifier in system `https://ycxmedplum.dev/demo` and the `synthetic-demo` tag; a syntactically valid arbitrary Patient ID is never enough. This admits multiple explicitly synthetic test patients while excluding ordinary records.
- Load chart context only after that authorization check and before calling Vapi.
- Build and send the documented `/call/phone` payload with assistant ID, phone-number ID, customer number, and `assistantOverrides.variableValues`, following Vapi's [dynamic variables documentation](https://docs.vapi.ai/assistants/dynamic-variables).
- Before implementing the request, verify the create-call path and payload against Vapi's current official API reference; change only the path if Vapi moved it, preserve the payload contract, and record the verification date/path in the final PR body.
- Verify a non-empty response ID before storing a session.
- Never log the bearer token, authorization header, full phone number, or complete chart context.
- Store `{ context, patient, aliasToChartKey, preparedReview: null }` by call ID.

Public-surface isolation and webhook authentication:

- Export `createWebhookApp(dependencies)` for the tunneled port and `createLocalApp(dependencies)` for the operator-only port.
- The tunneled app exposes only authenticated `POST /vapi` and a metadata-free `/health`; it never mounts `/demo/start-call`, `/review`, or `/review.json`.
- Bind the local app to `127.0.0.1:${REVIEW_PORT:-3001}` and mount the authenticated start route plus `/review` and `/review.json` there. The runbook and browser use port 3001.
- Create a Vapi Bearer Token Custom Credential whose secret equals runtime `VAPI_WEBHOOK_SECRET`; place only its ID in `VAPI_SERVER_CREDENTIAL_ID`, and configure the assistant server with `server.credentialId` as documented in Vapi's [server authentication guidance](https://docs.vapi.ai/server-url/server-authentication).
- Require `Authorization: Bearer <VAPI_WEBHOOK_SECRET>` on `/vapi`, compare digests with `timingSafeEqual`, and reject missing/wrong credentials before acknowledgment or any processing.
- Never put the webhook secret itself in assistant JSON, logs, Git, or the rehearsal report.

Pipeline behavior:

- Resolve new medications first, reconcile with chart confirmations, then build `ResolvedMed[]` using the lossless Section 5 mapping.
- Reuse explicit chart RxCUI/ingredient for confirmed chart medications.
- Run deterministic review on current reconciled medications.
- Use chart conditions and no invented durations.
- Use the exact session patient for every final or red-flag FHIR write.
- An unlinked call may update the local panel from transcript-only data but performs no patient-specific FHIR write.
- Mark a call processed only after all writes and snapshot save succeed.
- Keep context after failure; remove it after success.
- On the first end-of-call attempt, create and freeze `preparedReview` in the session before any FHIR write. Every retry for that call ID reuses the same normalized review and never reruns extraction or reassigns stable writer identities.

Testable server structure:

- Export both app factories and inject Medplum, Vapi fetch, extraction, clock, snapshot store, and session store dependencies.
- Start both listeners and the poller only under direct execution.
- Importing `src/server.ts` in tests opens no port and starts no interval.
- Missing Vapi/start-call environment variables are checked lazily by `POST /demo/start-call`, which returns `503`; they never prevent the server, `/review`, or canned fallback from starting.
- HTTP route tests bind each app to port `0`, call the returned local origin with global `fetch`, and close listeners in `finally`.

- [ ] Write failing coordinator tests for exact URL/headers/body, invalid response ID, two simultaneous sessions, failure retention, and success deletion.
- [ ] Implement coordinator and rerun; expected pass.
- [ ] Write failing server tests for missing/wrong start bearer, missing/wrong webhook bearer, valid-looking non-synthetic patient rejection before I/O, invalid inputs, two eligible synthetic patients with simultaneous calls that remain correctly associated, public-route isolation, webhook/poller race, injected pipeline failure retaining/reusing the frozen review, and unlinked-call safety.
- [ ] Refactor server into injected public/local apps and direct-execution startup.
- [ ] Implement the route and reconciled pipeline.
- [ ] Create `src/demo/startCall.ts` to locate the synthetic patient by stable identifier, read `DEMO_CUSTOMER_NUMBER`, and call the local endpoint with `DEMO_START_SECRET`.
- [ ] Create `src/demo/inspectChart.ts` to load the stable synthetic patient with the production loader and print only counts: current authoritative MedicationRequests, excluded review-output MedicationStatements, conditions, and distinct sources.
- [ ] Add `"demo:call": "tsx --env-file-if-exists=.env src/demo/startCall.ts"`.
- [ ] Add `"demo:inspect": "tsx --env-file-if-exists=.env src/demo/inspectChart.ts"`.
- [ ] Run coordinator and server tests.
- [ ] Run `npm run typecheck && npm test`.
- [ ] Commit:

```bash
git add src/voice/callCoordinator.ts src/voice/callCoordinator.test.ts src/server.ts src/server.test.ts src/voice/createAssistant.ts src/demo/startCall.ts src/demo/inspectChart.ts .env.example package.json package-lock.json
git commit -m "feat: coordinate authenticated chart-prefilled calls"
```

---

## Task 6: Make FHIR output idempotent, attributable, and evidence-linked

**Files:**

- Modify: `src/fhir/writers.ts`
- Test: `src/fhir/writers.test.ts`
- Modify: `src/server.ts`
- Test: `src/server.test.ts`
- Modify: `src/demo/run.ts`

**Interfaces:** All writers accept `ReviewWriteOptions`; live `runId` is Vapi call ID and canned `runId` is `offline-demo`.

Every output resource receives:

```ts
meta: {
  tag: [{ system: 'https://ycxmedplum.dev/tags', code: 'review-output' }],
}
```

Every output resource receives a deterministic, writer-specific identifier:

```text
system = https://ycxmedplum.dev/call-output
value  = runId + ':' + writerPurpose + ':' + sha256(canonicalSemanticIdentity)
```

Writer rules:

- `writerPurpose` is unique across every resource-producing path (`medication`, `pim-flag`, `acb-risk`, `cascade-issue`, `goal`, `taper-care-plan`, `taper-task`, `prescriber-communication`, `red-flag-task`), so two Task writers can never collide.
- Canonical semantic identity comes from stable clinical identity rather than array position: medication alias/provenance/ingredient occurrence; finding kind plus sorted implicated ingredients plus rule label; normalized goal text; or task/care-plan purpose plus normalized subject. Hash the canonical string to keep identifiers bounded and presentation-safe.
- Search by identifier, update existing when found, create only when absent.
- Sort canonical identities before writing and invoke optional `beforeWrite` immediately before each write.
- Chart-confirmed medication note: `Chart record confirmed by patient; not restated verbatim`.
- Patient-reported medication retains the genuine verbatim quote and extraction confidence.
- Never fabricate a `Patient said` quote for a chart-confirmed medication.
- `DetectedIssue` keeps the rule's specific `Finding.citation`; use the existing citation extension for non-URL citations.
- Keep linking-symptom evidence separate from citation.
- Patient concern may become a proposed patient-expressed Goal or note, never an order or sent message.

- [ ] Write failing tests covering every writer purpose, cross-family identifier uniqueness, semantic stability under reordered arrays, tags, chart/patient wording, citation, partial failure, retry, and distinct run IDs.
- [ ] Run writer test; expected failure.
- [ ] Implement idempotent create-or-update helper and update every writer.
- [ ] Make `persistReview` require `ReviewWriteOptions`.
- [ ] Pass call ID from live server and `offline-demo` from canned runner.
- [ ] Inject `beforeWrite` failure after the first successful write, retry the same frozen `PreparedReview`, and assert no duplicate or changed identifier.
- [ ] Add a server-level test that drives an end-of-call through extraction and reconciliation, injects a partial writer failure, retries the same call, proves extraction ran once, and proves all final identifiers are unique.
- [ ] Run writer test; expected pass.
- [ ] Run `npm run typecheck && npm test`.
- [ ] Commit:

```bash
git add src/fhir/writers.ts src/fhir/writers.test.ts src/server.ts src/server.test.ts src/demo/run.ts
git commit -m "feat: make review FHIR writes idempotent"
```

---

## Task 7: Correct severity semantics and build the coordination panel

**Files:**

- Modify: `src/engine/detect.ts`
- Modify: `src/test/engine.test.ts`
- Modify: `src/ui/panel.ts`
- Test: `src/ui/panel.test.ts`
- Modify: `src/server.ts`
- Modify: `demo-assets/canned-review.json`
- Modify: `package.json`

**Interfaces:** Extends `ReviewSnapshot` with presentation-safe chart context, gaps, concerns, source relationship, and written-resource summaries.

Panel sections, in order:

1. Patient, review timestamp, and review basis (`confirmed medication set`, `partially confirmed medication set`, or `unconfirmed medication set`).
2. `What the patient wants addressed`.
3. `Known before the call`.
4. `Patient-reported changes or gaps`.
5. Potential cascade hero.
6. Other findings with citations.
7. Medication reconciliation table.
8. FHIR resources written.

Snapshot chart summaries may contain patient display, medication display, ingredient, RxCUI, strength, frequency, source display, confirmation state, gap kind, generated resource type/label/note, and counts. They may not contain patient IDs, chart-source IDs, generated output IDs, links, or complete FHIR resources.

Copy rules:

- Use `Patient reported the linking symptom`, not `confirmed cascade`.
- Use `may have been added in response to`, not `exists only to treat`.
- Use `potential cascade for clinician review`, not `the previous drug caused`.
- When zero chart aliases are confirmed, display `Review based on unconfirmed medication set` prominently and do not imply the medication review is complete.
- Label `Cross-prescriber` only when every implicated ingredient uniquely joins to a non-null and distinct source display.
- Otherwise label `Same recorded source` or `Source relationship unknown`.
- Never infer source by display substring.
- Severity uses text/icon plus color.
- Escape every patient, medication, source, concern, and citation string.

- [ ] Write a failing engine assertion that symptom presence does not change curated severity.
- [ ] Modify cascade detection so confidence and ordering can change without severity mutation.
- [ ] Run existing engine test and verify ACB 8, 12 findings, and hero chain remain.
- [ ] Treat cascade severity-label/order drift from the corrected confidence logic as expected, assert the intended labels, and regenerate `demo-assets/canned-review.json` from the corrected output.
- [ ] Write failing panel tests for old snapshot compatibility, new sections, escaping, source labels, concern prominence, evidence visibility, and forbidden phrases.
- [ ] Implement snapshot fields and panel rendering.
- [ ] Remove `patientId` and generated-resource `id` from `ReviewSnapshot`; replace them with `patientDisplay` and presentation-only `{ type, label, note }` summaries. Assert serialized snapshots contain no `Patient/`, `MedicationRequest/`, or generated resource IDs.
- [ ] Regenerate canned JSON with the full cross-prescriber story, no stale patient ID, and no live Medplum link.
- [ ] Run `npm run panel:canned`; it must create `out/` first. Update script to `mkdir -p out && cp ...` if needed.
- [ ] Run `npm run typecheck && npm test`.
- [ ] Commit:

```bash
git add src/engine/detect.ts src/test/engine.test.ts src/ui/panel.ts src/ui/panel.test.ts src/server.ts demo-assets/canned-review.json package.json
git commit -m "feat: present the cross-prescriber coordination view"
```

---

## Task 8: Update the runbook and all primary documentation

**Files:**

- Create: `docs/DEMO_CROSS_PRESCRIBER.md`
- Create: `docs/reports/cross-prescriber-rehearsal.md`
- Modify: `README.md`
- Modify: `docs/DEMO.md`
- Modify: `docs/RUNBOOK.md`
- Modify: `docs/SETUP.md`
- Modify: `.env.example`

The runbook must include:

- exact environment variable names without values;
- Medplum client creation and seed command;
- public webhook server, local review server, and tunnel commands with their distinct ports;
- Vapi Custom Credential creation, `VAPI_SERVER_CREDENTIAL_ID`, webhook bearer verification, and assistant update command;
- `npm run demo:call` command;
- the exact patient role-play lines for yes, frequency change, stopped medication, OTC additions, symptoms, and priority concern;
- expected server logs without secrets;
- expected panel sections and wording;
- exact Medplum resource types to inspect;
- offline canned fallback;
- live-versus-canned capability table;
- sixty-second sponsor explanation;
- privacy statement using the Global Constraints wording;
- explicit statement that Deepgram is used through Vapi;
- explicit statement that the system generates review prompts, not diagnoses or medication orders.

Rehearsal report header:

```text
Run | commit | mode | call ID | prefill correct | no redundant inventory | correct patient | pipeline once | panel correct | FHIR correct | defects
```

- [ ] Write `docs/DEMO_CROSS_PRESCRIBER.md` from start to finish using only copyable commands.
- [ ] Update existing primary docs so none presents full inventory as the primary live path.
- [ ] Remove Retell references from active setup instructions.
- [ ] Add the HHS link and carefully scoped privacy language.
- [ ] Create the empty rehearsal table.
- [ ] Run `git diff --check`.
- [ ] Manually read every command in sequence and confirm its corresponding script/route exists.
- [ ] Commit:

```bash
git add README.md docs/DEMO.md docs/RUNBOOK.md docs/SETUP.md docs/DEMO_CROSS_PRESCRIBER.md docs/reports/cross-prescriber-rehearsal.md .env.example
git commit -m "docs: add solo cross-prescriber runbook"
```

---

## Task 9: Run the complete automated gate

Do this from a clean worktree on the feature branch:

```bash
git status --short
npm ci
npm run typecheck
npm test
git diff --check origin/main...HEAD
```

Expected:

- `git status --short` is empty.
- TypeScript exits `0`.
- Every test script exits `0`.
- Engine assertions still report ACB 8, 12 findings, and the expected three-medication chain.
- Diff check produces no whitespace errors.

Then inspect for secrets and unsafe language:

```bash
git grep -n -E 'sk-ant-[A-Za-z0-9_-]{12,}|Bearer [A-Za-z0-9_-]{12,}|CLIENT_SECRET=.+|DEMO_START_SECRET=.+|VAPI_WEBHOOK_SECRET=.+' -- .env.example README.md src docs ':!src/**/*.test.ts' ':!docs/superpowers/**'
git grep -n -E '\+[1-9][0-9]{7,14}' -- README.md docs/DEMO.md docs/RUNBOOK.md docs/SETUP.md docs/DEMO_CROSS_PRESCRIBER.md docs/reports demo-assets
git grep -n -E 'confirmed cascade|exist only to treat|previous drug caused|automatically deprescribe|notify every doctor' -- README.md docs/DEMO.md docs/RUNBOOK.md docs/SETUP.md src/ui/panel.ts src/voice/prompt.ts demo-assets/canned-review.json
```

Expected: no real secret, checked-in E.164 phone number, or unsupported product-language hit. Placeholder variable names in `.env.example` are allowed only with an empty value.

- [ ] Repair every failure before continuing.
- [ ] Commit only if repairs were necessary, with message `fix: close cross-prescriber verification gaps`.
- [ ] Push:

```bash
git push -u origin feat/cross-prescriber-master
```

---

## Task 10: Rehearse live, contradiction, retry, and offline scenarios

### Scenario A: Happy-path live call — run twice consecutively

- [ ] Run `npm run seed`.
- [ ] Run `npm run server`.
- [ ] Start the documented tunnel in a second terminal.
- [ ] Copy the temporary tunnel origin into shell variable `PUBLIC_VAPI_ORIGIN`, then run `npm run vapi:setup -- "$PUBLIC_VAPI_ORIGIN/vapi"`; do not write the value to Git.
- [ ] Run `npm run demo:call`.
- [ ] Confirm known medications are verified rather than inventoried from scratch.
- [ ] Report one changed frequency, one OTC medication, relevant symptoms, and one medication priority.
- [ ] Complete the call.
- [ ] Confirm one pipeline run, correct patient ID, panel update, rule-specific citation, and FHIR output.
- [ ] Repeat the entire live call once more without reseeding.
- [ ] Record both rows in the rehearsal report.

### Scenario B: Contradiction and missing source

- [ ] Use the permanently source-unknown omeprazole fixture from Task 2.
- [ ] Report that omeprazole was stopped and another medication's frequency changed.
- [ ] Confirm neutral acceptance in voice behavior.
- [ ] Confirm `not-taking`, `frequency-mismatch`, and `Source relationship unknown` appear.
- [ ] Confirm no prescriber-error or causality claim.
- [ ] Record the row.

### Scenario C: Retry/idempotency

- [ ] Run the writer test case that injects failure after one successful FHIR write.
- [ ] Confirm retry with the same run ID reuses identifiers.
- [ ] After the two live calls, load chart context again.
- [ ] Run `npm run demo:inspect` and save its count-only output in the rehearsal row.
- [ ] Confirm exactly nine clinician-authored current MedicationRequests enter prefill.
- [ ] Confirm review-generated MedicationStatements are excluded.
- [ ] Record the row.

### Scenario D: Offline fallback

- [ ] Stop both live server listeners from Scenario A before starting the offline shell.
- [ ] Stop the tunnel and omit live service credentials in a separate shell.
- [ ] Run `npm run panel:canned`.
- [ ] Run `npm run server`.
- [ ] Open `http://127.0.0.1:3001/review`; confirm the tunneled port does not serve review routes.
- [ ] Confirm the same patient concern, chart/patient distinction, potential cascade, distinct source labels, and evidence citation appear.
- [ ] Confirm the panel identifies the data as canned.
- [ ] Record the row.

### Rehearsal gate

- [ ] Two Scenario A runs pass consecutively.
- [ ] Scenario B passes once.
- [ ] Scenario C passes once.
- [ ] Scenario D passes once.
- [ ] No high-severity unresolved defect remains.
- [ ] Before editing the report, run `git rev-parse HEAD` and record that exact tested implementation commit in every applicable row. The later rehearsal-document commit is intentionally not self-referenced.
- [ ] Commit rehearsal evidence:

```bash
git add docs/reports/cross-prescriber-rehearsal.md
git commit -m "docs: record cross-prescriber rehearsal"
git push
```

---

## Task 11: Final review, merge, and freeze

- [ ] Open one PR:

```bash
gh pr create \
  --base main \
  --head feat/cross-prescriber-master \
  --title "Cross-prescriber chart-prefilled medication review" \
  --body-file docs/reports/cross-prescriber-rehearsal.md
```

- [ ] Wait for every automated review/check to finish.
- [ ] Address every actionable comment on the same branch.
- [ ] Rerun Task 9 after the final fix.
- [ ] Rerun the affected rehearsal scenario and one happy-path live call after any runtime fix.
- [ ] Merge only when the branch is clean and all checks pass:

```bash
gh pr merge --merge --delete-branch
git switch main
git pull --ff-only origin main
npm ci
npm run typecheck
npm test
git status --short --branch
```

Expected final state: clean `main`, synchronized with `origin/main`, with every test passing.

After merge, freeze the demo. Make no new dependency, rule, integration, or design change. Only fix a defect reproduced in `docs/reports/cross-prescriber-rehearsal.md`, and rerun its scenario plus one happy-path call.

---

## Failure and fallback table

| Failure | Detection | Required action | Demo fallback |
|---|---|---|---|
| PR #1 becomes conflicted | GitHub merge state is not clean | Rebase and rerun prerequisite gate | Do not start feature branch. |
| Seed duplicates resources | Second seed increases stable counts | Repair identifier find-or-create | Use existing clean synthetic project only after verification. |
| Legacy synthetic chart is not adopted cleanly | Patient/condition counts increase or an untagged old MedicationStatement enters prefill | Stop and repair the synthetic-only adoption/tagging migration | Use a verified clean synthetic project; never delete or mutate an uncertain patient. |
| Medplum authentication fails | Seed/start route returns 401 | Correct runtime credentials without logging them | Canned snapshot. |
| Start bearer fails | `/demo/start-call` returns 401 before I/O | Correct secret/header; never weaken check | Canned snapshot. |
| Webhook bearer fails | `/vapi` returns 401 before acknowledgment | Repair the Vapi Custom Credential ID/secret pair | Poller may process the ended call; otherwise canned snapshot. |
| Public tunnel exposes a review/start route | Route-isolation test returns anything except 404 | Stop the tunnel and repair app mounting/bind addresses | Local canned snapshot only. |
| Vapi call creation fails | Non-2xx or missing call ID | Verify IDs, number, and current documented endpoint | Canned snapshot. |
| Extraction fallback yields zero confirmations | Every chart item is `use-unclear` and deterministic review has no chart medications | Mark the panel `Review based on unconfirmed medication set`; do not imply a complete review | Switch to the approved canned snapshot for the demo. |
| Prefill exceeds 12,000 characters | Serializer throws | Reduce synthetic current context; never truncate invalid JSON | Canned snapshot. |
| Tunnel fails | Webhook absent | Poller processes ended call | Canned snapshot if poller also fails. |
| Call has no session | `unlinked call` log | Perform no patient-specific FHIR write | Start through authenticated demo path. |
| Pipeline partially fails | Context remains and call is not processed | Retry same call ID | Canned snapshot if external service remains unavailable. |
| Duplicate output appears | Same run ID has duplicate identifiers | Stop rehearsal and repair writer idempotency | Canned snapshot. |
| Prior review meds appear in prefill | Current prefill count exceeds nine | Repair tag/filter path; do not manually delete to hide defect | Canned snapshot. |
| Potential cascade absent | Expected deterministic rule missing | Inspect reconciliation, symptoms, and rule inputs | Approved canned snapshot. |
| Panel contains causal copy | Forbidden-language test fails | Repair copy/test before rehearsal | Last known-good canned snapshot. |

Rollback is commit-based. Revert the smallest task commit that introduced the failure, rerun Task 9, and do not rewrite `main` history.

---

## Sponsor explanation

Use this exact explanation:

> The patient tells their medication story once—what they take, what concerns them, and what they want changed. YCxMedplum combines that account with existing Medplum chart history, including which clinicians prescribed which medicines. Vapi orchestrates the phone call while Deepgram transcribes and speaks. After the call, a deterministic, evidence-linked review identifies possible cross-prescriber medication cascades and creates one coordination view for the authorized care team. It does not diagnose, automatically deprescribe, or grant external practices access.

Do not say:

- “Deepgram decides which drugs are dangerous.”
- “The AI proves a prescribing cascade.”
- “We automatically stop harmful medications.”
- “Every prescriber automatically receives the record.”
- “HIPAA means we can share everything.”

The finished product is a patient-centered reconciliation and clinician-review workflow, not an autonomous medication-management system.

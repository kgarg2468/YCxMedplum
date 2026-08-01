# Deprescribe — rules for AI coding assistants

Voice-first medication review on Medplum. A voice agent interviews an older adult,
a deterministic engine finds inappropriate medications and prescribing cascades,
and everything is written to Medplum as FHIR resources for clinician review.

## The one rule that must never break

`src/engine/detect.ts` and `src/data/knowledge.ts` contain **zero LLM calls** and
must stay that way. Every clinical judgement (is this a PIM? is this a cascade?)
is a hand-curated table lookup with a real citation. Do not "improve" detection
with model calls, do not let a model add rows to the knowledge tables, and do not
remove citations. This is the credibility and regulatory core of the project
(FDA Non-Device CDS: the clinician must be able to independently review the basis).

LLMs are used in exactly two places:
- `src/llm/extract.ts` — messy speech → structured data (may return `name_guess: null`; never invent a drug)
- `src/llm/agents.ts` — structured findings → prose (explain, taper instantiation, challenger)

## Pipeline

```
transcript → llm/extract.ts → rxnav.ts (RxNorm ingredient) → engine/detect.ts → fhir/writers.ts → Medplum
```

The join key everywhere is the **lowercase RxNorm ingredient name** (e.g. "oxybutynin").

## FHIR / Medplum

- **FHIR R4 only.** Types come from `@medplum/fhirtypes`; do not hand-write resource shapes.
- Writes go through `MedplumClient` from `@medplum/core` (client-credentials login, see `.env.example`).
- Deliberate statuses — do not "fix" them: `DetectedIssue.status = preliminary`,
  `CarePlan.status = draft`, `Communication.status = preparation`. Nothing is final
  without a human.
- `DetectedIssue.implicated` is populated **in causal order**: trigger drug first,
  treating drug second. `evidence` records whether the patient reported the linking
  symptom. Preserve this.
- Unresolved medications keep the patient's verbatim words as `text` — never guess a code.
- Docs: https://medplum.com/docs (searchable). For deep source questions, clone
  https://github.com/medplum/medplum and symlink it as `medplum-link/` (gitignored).

## Anthropic API notes (verified against current docs — older patterns are stale)

- Structured outputs are GA via `output_config.format` (see `src/llm/client.ts`).
  Schemas need `additionalProperties: false`; no recursive schemas.
- Response prefilling is NOT supported on Claude 4.6+ — never prefill `{`.
- Do not pass `temperature`; current models reject non-default sampling params.
- Models: `claude-haiku-4-5-20251001` for the live voice loop (latency),
  `claude-sonnet-5` for extraction and clinical prose.

## Commands

```bash
npm test              # pure-logic engine test, offline, no keys needed
npm run typecheck     # tsc --noEmit against @medplum/fhirtypes
npm run demo:fast     # extract + resolve + detect, no Medplum writes (needs ANTHROPIC_API_KEY)
npm run demo          # full pipeline incl. FHIR writes (needs Medplum credentials)
npm run seed          # create the synthetic demo patient
npm run server        # Vapi webhook on :3000 (expose with npx localtunnel --port 3000)
                      # review panel: http://127.0.0.1:3001/review (src/ui/panel.ts)
```

Before claiming any change works: `npm run typecheck && npm test`. The engine test
must keep printing ACB = 8, 12 findings, and the
`amlodipine -> furosemide -> allopurinol` chain — that output is the demo.

## Safety and scope

- Synthetic data only (Margaret Okonkwo is fictional, tagged `synthetic-demo`). Never real PHI.
- The voice agent never tells a patient to stop, start, or change a dose — see the
  hard rules in `src/voice/prompt.ts`. Red flags escalate immediately (`checkRedFlags`,
  checked per turn in `src/server.ts`, not only at end of call).
- Every recommendation surface must show its citation next to the finding.

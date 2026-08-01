# Deprescribe — voice-first medication review on Medplum

Every AI health company is building tools that **add**: more diagnosis, more research,
more documentation. The highest-return intervention in geriatric medicine is
**subtraction**, and there is no agent for it.

A voice agent interviews an older adult about their medications, then a deterministic
engine finds potentially inappropriate medications, cumulative anticholinergic burden,
and **prescribing cascades** — drugs prescribed to treat the side effects of other drugs.
Everything is written to Medplum as real FHIR resources for clinician review.

## The architectural rule

Three categories of work, prompted differently:

| Stage | Who does it | Why |
|---|---|---|
| Messy speech → structured data | LLM | This is what LLMs are for |
| **Is this a PIM? Is this a cascade?** | **Deterministic code** | Never let the model decide this |
| Structured findings → human prose | LLM | Explanation, taper, prescriber note |

`src/engine/detect.ts` contains **no LLM calls**. This is the single most important
design decision in the repo:

1. **Identical output every rehearsal.** The demo cannot surprise you on stage.
2. **No hallucinated drug interactions.** Ask a model "is this an inappropriate
   medication?" and it will invent a plausible-sounding cascade at the worst possible
   moment. A judge with an MD will catch it.
3. **Every finding carries a real citation**, which is also what keeps this inside
   FDA's Non-Device CDS "independently review the basis" criterion.

## Setup

```bash
npm install
cp .env.example .env      # fill in ANTHROPIC_API_KEY + Medplum client credentials
npm run demo:fast         # engine only, no Medplum, no cost — start here
npm run demo              # full pipeline including FHIR writes
npm run demo:full         # adds the LLM explanation pass
npx tsx src/test/engine.test.ts   # pure logic test, no network
```

Get `demo:fast` printing correct findings **before** touching the voice layer.
Otherwise you will be debugging two systems at once at 3pm.

## Verified working

```
ACB = 8  [oxybutynin:3, diphenhydramine:3, furosemide:1, lorazepam:1]

12 findings
  [high    ] cascade         donepezil -> oxybutynin CONFIRMED
  [high    ] cascade         amlodipine -> furosemide CONFIRMED
  [high    ] duplicate       lorazepam -> diphenhydramine
  [high    ] pim             lorazepam
  [moderate] cascade         furosemide -> allopurinol CONFIRMED
  [moderate] cascade         lisinopril -> benzonatate CONFIRMED
  [moderate] no-indication   omeprazole

CHAINS: amlodipine -> furosemide -> allopurinol
```

That last line is the demo. Three of Margaret's eleven drugs exist only to treat side
effects of the others.

## FHIR resource map — the Medplum differentiator

| Conversation output | Resource | Note |
|---|---|---|
| Current regimen | `MedicationStatement` | What she's *actually* taking vs. what's prescribed |
| PIM hits | `Flag` | One per Beers/STOPP violation, citation in an extension |
| Anticholinergic burden | `RiskAssessment` | Computed, auditable, with contributors listed |
| **Prescribing cascade** | **`DetectedIssue`** | **The deep cut — see below** |
| "I want to feel clear again" | `Goal` | `expressedBy` = patient, not clinician |
| Taper schedule | `CarePlan` (draft) + `Task` | Real scheduled activities with due dates |
| Prescriber note | `Communication` (preparation) | Drafted, never auto-sent |

`DetectedIssue` is the one almost nobody uses. Its spec has an `implicated` array of
references and a `mitigation` element — it was designed for exactly "these two
resources interact badly." We populate `implicated` **in causal order** (trigger drug
first, treating drug second) and use `evidence` to record whether the patient actually
reported the linking symptom. Using it correctly signals you read the spec rather than
a tutorial.

Note the deliberate statuses: `DetectedIssue.status = preliminary`,
`CarePlan.status = draft`, `Communication.status = preparation`. Nothing is presented
as final without a human. That is both honest and the regulatory posture.

## Division of labor (4 people)

| Owner | Files | First deliverable |
|---|---|---|
| **A — Voice** | `src/voice/prompt.ts` + Vapi/Retell dashboard | A call that completes and returns a transcript |
| **B — Extraction** | `src/llm/extract.ts`, `src/rxnav.ts` | Transcript → resolved ingredient list |
| **C — Engine + data** | `src/data/knowledge.ts`, `src/engine/detect.ts` | `demo:fast` printing findings |
| **D — FHIR + UI** | `src/fhir/*` | Resources visible in the Medplum console |

These barely touch each other's files. C can work entirely offline against the canned
transcript in `src/fhir/seed.ts`.

## Hour-by-hour

- **10:00–10:45** Medplum project, ClientApplication credentials, `npm run seed`
- **10:45–12:15** Voice loop working *ugly*. Don't build turn-taking yourself.
- **12:15–13:45** Extraction → `MedicationStatement` appearing live in the console
- **13:45–14:45** Engine + cascade table (this is the differentiator — don't rush it)
- **14:45–15:45** `CarePlan` taper + prescriber `Communication`
- **15:45–16:30** Thin review panel. Use Medplum's React components; don't hand-roll.
- **16:30–17:00** Rehearse three times. **Record a backup video at 16:35.**

## Before Saturday

1. **Spot-check `src/data/knowledge.ts`.** It's a curated high-yield subset, not the
   complete criteria. Verify against AGS Beers 2023 (doi 10.1111/jgs.18372) and
   download the actual tapering PDFs from
   [deprescribing.org](https://deprescribing.org/resources/deprescribing-guidelines-algorithms/)
   (free, reuse permitted with credit).
2. **Read the mechanism for the two headline cascades** — donepezil→oxybutynin
   (Gill 2005) and amlodipine→furosemide (Savage, JAMA Intern Med 2020) — closely
   enough to explain them when a judge with an MD asks. That question *will* come,
   and answering it fluently is what separates first from second.
3. **Run extraction against five recordings of you deliberately mumbling drug names**
   and check what RxNav returns. That path is where the demo breaks, and it's the only
   part you can't fix at 16:45.
4. Read Medplum's Bots docs. Moving the rule engine into a Bot triggered on
   `MedicationStatement` creation is the platform-native design and a strong line in
   the pitch.

## API notes that will cost you time if you miss them

Verified against current docs — several widely-copied patterns are now stale:

- **Structured outputs are GA** via `output_config.format` (the old beta
  `output_format` + `structured-outputs-2025-11-13` header still work during a
  transition period). Objects need `additionalProperties: false`; no recursive schemas.
- **Response prefilling is not supported on Claude 4.6+ models.** The old "prefill the
  assistant turn with `{`" trick to force JSON is dead — use structured outputs.
- **Current-generation models reject non-default sampling parameters**, so don't pass
  `temperature`. Determinism here comes from the schema plus keeping clinical logic out
  of the model entirely, not from `temperature: 0`.
- Models used: `claude-haiku-4-5-20251001` for the live voice loop (latency is the
  whole UX), `claude-sonnet-5` for extraction and clinical prose.

## Safety and scope

- **Synthetic data only.** Margaret Okonkwo is fictional and tagged `synthetic-demo`.
  Never put real PHI in a hackathon demo.
- **Clinician-in-the-loop, always.** The agent gathers and proposes; it never directs.
  It is explicitly instructed never to tell a patient to stop, start, or change a dose.
- **Ranked options with visible citations**, never a single directive. FDA's Non-Device
  CDS criteria (21st Century Cures Act §520(o)(1)(E)) require that the clinician can
  independently review the basis, so the UI must show the citation and reasoning next
  to every recommendation. Patient-facing autonomous tapering would be a regulated
  device.
- **Not time-critical.** Software driving time-critical decisions is a device
  regardless of framing.
- Red flags (fall with head injury, syncope, chest pain, acute confusion change) halt
  the review and escalate — see `checkRedFlags` in `src/voice/prompt.ts`. Check these
  against the running transcript on every turn, not only at the end.

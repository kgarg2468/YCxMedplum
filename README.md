# Deprescribe — voice-first medication review on Medplum

Every AI health company is building tools that **add**: more diagnosis, more
research, more documentation. The highest-return intervention in geriatric
medicine is **subtraction**. Medication review is a funded category — CMS
mandates it, analytics vendors fire 40M+ recommendations a year at pharmacist
call centers — yet 18.8% of seniors are *still* on an inappropriate med, because
the paid version is a compliance checkbox. The conversation that actually finds
a prescribing cascade is the part no one's system does. That's what we built.

## The problem

**42% of US adults over 65 take five or more daily medications**, and 18.8% are on
at least one potentially inappropriate medication (2023 ambulatory cohort,
n=81,295). A structured deprescribing conversation takes thirty minutes and isn't
reimbursed — so it rarely happens, even though the STOPPFrail trial measured a
**−2.6 medications per patient and lower drug costs, with no detected harm** in a randomized trial of doing it (STOPPFrail RCT, Curtin 2020, JAGS; see docs/EVIDENCE.bib).

The most invisible version of the problem is the **prescribing cascade**: a drug
prescribed to treat the side effect of another drug. Our demo patient's chart
contains a real, literature-documented chain —

> amlodipine (blood pressure) → causes ankle swelling → **furosemide** added →
> raises uric acid → causes gout → **allopurinol** added

Three drugs; one root cause. Each prescriber acted reasonably; nobody ever asked
*why each drug was started*. You can only find a cascade by having that
conversation — which is exactly what makes it agent-shaped work.

## What this does

A voice agent phones the patient before their visit and goes through their pill
bag with them — names, doses, and critically, *"what do you take that one for?"*,
where "I don't know" is a recorded answer, not a failure. Then:

```
  voice call (Vapi · Deepgram STT/TTS · Claude Haiku)
        │  transcript
        ▼
  llm/extract.ts ────────────► SpokenMed[]      LLM, schema-constrained,
        │                                        allowed to answer "I don't know"
        ▼
  rxnav.ts ──────────────────► ResolvedMed[]    NIH RxNorm → canonical ingredient
        │                                        unresolved ≠ guessed
        ▼
  engine/detect.ts ──────────► Finding[]        ★ ZERO LLM CALLS
        │                                        PIMs · cascades · anticholinergic
        │                                        burden · duplicates — every finding
        │                                        carries a real citation
        ├──► llm/agents.ts     explain / taper / challenger
        ▼
  fhir/writers.ts ───────────► Medplum          MedicationStatement, Flag,
                                                RiskAssessment, DetectedIssue,
                                                Goal, CarePlan+Task, Communication
```

Results render on a live review panel (`/review`) and land in Medplum as draft
FHIR resources for a clinician to approve.

## The architectural rule

Three kinds of work, three owners:

| Stage | Who does it | Why |
|---|---|---|
| Messy speech → structured data | LLM | This is what LLMs are for |
| **Is this a PIM? Is this a cascade?** | **Deterministic code** | Never let the model decide this |
| Structured findings → human prose | LLM | Explanation, taper, prescriber note |

`src/engine/detect.ts` contains **no LLM calls**. Detection is a hand-curated,
citation-backed table lookup (AGS Beers 2023, STOPP/START v3, the ACB scale,
published cascade literature), so the system **cannot hallucinate a drug
interaction** — and every recommendation shows the clinician its basis. The full
reasoning behind every design decision is in
[docs/DECISIONS.md](docs/DECISIONS.md).

## Status: working end to end

**☎️ Try it — call the live demo line: +1 (603) 457-8331** and role-play a patient
(name a few medications, mumble one on purpose, answer "I don't know" to something).
The agent is live 24/7; the pipeline runs when the reviewing server is up.

Tested over a **real phone call**: telephony audio garbled drug names
("Jonipezil", "Burosemide") and the pipeline still resolved them, confirmed the
cascade chain from the patient's own words, and wrote the FHIR resources to
Medplum ~15 seconds after hangup. Engine output on the reference case:

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
  ...

CHAINS: amlodipine -> furosemide -> allopurinol
```

## Quickstart

No keys needed to see it work:

```bash
./run.sh                  # then open http://localhost:3000/review
```

`run.sh` does the whole local bring-up: preflight, `npm install`, typecheck,
engine test, seeds the canned panel dataset, starts the server and waits for it
to answer `/health`. Every command it runs is logged with its exit code and
duration to `out/run-<timestamp>.log`. Useful flags: `--demo` (live extraction,
needs `ANTHROPIC_API_KEY`), `--full-demo` (adds Medplum writes), `--no-serve`,
`--port N`, `-v`. See `./run.sh --help`.

The same steps by hand:

```bash
npm install
npm test                  # deterministic engine, offline — findings above
mkdir -p out && npm run panel:canned   # load the demo dataset for the panel
npm run server            # then open http://localhost:3000/review
```

With credentials (`cp .env.example .env` — see [docs/SETUP.md](docs/SETUP.md)):

```bash
npm run demo:fast         # live extraction + RxNorm resolution, no FHIR writes
npm run seed              # create the synthetic demo patient in Medplum
npm run demo              # full pipeline including Medplum writes
npm run vapi:setup <url>  # create/update the voice assistant from code
```

## The FHIR mapping

| Conversation output | Resource | Note |
|---|---|---|
| Current regimen | `MedicationStatement` | What she's *actually* taking; unresolved meds keep her verbatim words |
| PIM hits | `Flag` | One per Beers/STOPP violation, citation in an extension |
| Anticholinergic burden | `RiskAssessment` | Computed, auditable, contributors listed |
| **Prescribing cascade** | **`DetectedIssue`** | `implicated[]` in **causal order**; `evidence` records whether the patient reported the linking symptom |
| "I want to feel clear again" | `Goal` | `expressedBy` = the patient, not the clinician |
| Taper schedule | `CarePlan` (draft) + `Task` | Real scheduled activities with due dates |
| Prescriber note | `Communication` (preparation) | Drafted, never auto-sent |

Statuses are deliberate: `preliminary`, `draft`, `preparation`. Nothing is
presented as final without a human — that is both honest and the regulatory
posture.

## Safety and scope

- **Synthetic data only.** The demo patient is fictional and tagged
  `synthetic-demo`. No real PHI.
- **Clinician-in-the-loop, always.** The agent gathers and proposes; it never
  directs. It is explicitly instructed never to tell a patient to stop, start, or
  change a dose.
- **Designed against FDA's Non-Device CDS criteria** (21st Century Cures
  §520(o)(1)(E)): clinician-facing, ranked options with a visible citation on
  every finding, nothing time-critical. A patient-facing autonomous taper would
  be a regulated device — this isn't that.
- **Red flags** (fall with head injury, syncope, chest pain, acute confusion,
  suicidality) halt the review and escalate, checked on every turn.

## Roadmap

- Rule engine as a **Medplum Bot** triggered on `MedicationStatement` creation —
  the platform-native design; the engine is already a pure function
- **Cost & coverage surface** — every stopped drug has a price; deprescribing is
  the rare intervention that *saves* money (eligibility via Stedi)
- Grow the knowledge tables toward full STOPP/START coverage with pharmacist
  review
- Formal extraction benchmark against real-world med-rec conversations
- Prescription-history ingestion so cascades can be suspected from records even
  before the conversation

## Docs

- [TEAM.md](TEAM.md) — quick orientation and where to plug in
- [docs/DECISIONS.md](docs/DECISIONS.md) — every design decision and why
- [docs/SETUP.md](docs/SETUP.md) — Medplum + voice platform credentials
- [docs/DEMO.md](docs/DEMO.md) — presentation scripts

# DECISIONS.md — know your own system

Read this until you can say it without reading it. Every section is a decision a
judge might poke at, why it went the way it did, and the honest answer. File paths
point at the proof.

---

## The system in one paragraph

A voice agent (Vapi: Deepgram speech, Claude Haiku conversation) interviews an older
adult about their medications before a visit. After the call, a pipeline runs:
Claude Sonnet extracts structured data from the messy transcript → RxNorm's public
API resolves whatever the patient said into canonical drug ingredients → a
deterministic rule engine (zero LLM calls) detects inappropriate medications,
anticholinergic burden, therapeutic duplication, and prescribing cascades → results
are written to Medplum as FHIR resources (draft/preliminary status) and rendered on
a review panel. LLMs re-enter only at the edges: explaining findings in prose,
instantiating a published taper algorithm, and a "challenger" agent that argues
against the plan before a clinician sees it.

---

## Decision 1 — the LLM never decides what is clinically wrong

The single most important decision in the repo. Three kinds of work, three owners:

| Work | Owner | Where |
|---|---|---|
| Messy speech → structured data | LLM (Sonnet) | `src/llm/extract.ts` |
| Is this a PIM? Is this a cascade? | **Deterministic tables** | `src/engine/detect.ts`, `src/data/knowledge.ts` |
| Structured findings → prose | LLM (Sonnet) | `src/llm/agents.ts` |

**Why:** three reasons, in order of importance.
1. **It cannot hallucinate an interaction.** Ask a model "is this medication
   inappropriate?" and it will eventually invent a plausible-sounding one. A judge
   with an MD will catch it, and in a real product it's dangerous.
2. **Every finding carries a real citation** (Beers 2023, STOPP/START v3, or a named
   trial), because a human curated the table row. That's also the FDA regulatory
   posture (see Decision 10).
3. **Identical output every run.** The demo cannot surprise you.

**If asked "so what's the AI for?":** the hard part was never deciding whether
lorazepam is on the Beers list — that's a lookup. The hard parts are (a) getting an
82-year-old to accurately tell you what she takes, which needs a patient,
adaptive conversation, and (b) turning "there's a water pill, I don't know what it
does" into `furosemide, indication unknown`. That's what LLMs are for.

**If asked "why not RAG over the guidelines?":** retrieval still ends with a model
deciding what applies. Our tables are ~30 hand-checked rules — small enough to
curate, and curation is the point: the output has to be *defensible*, not just
plausible. Scaling this is a data-entry problem (a good one — it means adding
STOPP rules, not retraining anything).

---

## Decision 2 — extraction is allowed to say "I don't know"

`src/llm/extract.ts`. The schema forces every medication into a fixed shape, and
`name_guess` is explicitly nullable. The system prompt orders the model to output
`null` rather than a plausible drug name, and never to infer an indication the
patient didn't state.

**Why:** a null is useful — it becomes a clinician-review item and, for indications,
a real finding ("no stated indication for omeprazole" is a STOPP criterion). A wrong
guess is dangerous and invisible. This was validated live: on our real test call the
patient said only "the sleeping pills," and the system wrote an UNRESOLVED
MedicationStatement in her exact words instead of guessing zolpidem or lorazepam.

Reliability plumbing: `extractWithRetry` retries once, then falls back to
`minimalFallback` (a bare list of the patient's utterances) so the pipeline never
dies — degraded output goes to a human either way.

**API facts you should know** (they're in `src/llm/client.ts`):
- Structured outputs via `output_config.format` with a JSON schema — the API
  guarantees schema-valid JSON, no parsing tricks.
- No `temperature` — current Anthropic models reject non-default sampling params.
  Determinism here comes from the schema plus keeping clinical logic out of the
  model, not from temperature 0.
- Two models: `claude-haiku-4-5` in the voice loop (latency is the UX),
  `claude-sonnet-5` for extraction and prose (2–3s is invisible after a call).

---

## Decision 3 — RxNorm resolves drug identity, not the LLM

`src/rxnav.ts`. The LLM's `name_guess` is only a *candidate*. The NIH RxNorm API
(free, no key) maps it to a canonical ingredient + RxCUI code, and that ingredient
string is the join key into every knowledge table.

**Why:** the model might normalize "Benadryl" to diphenhydramine correctly 99 times
and invent something the 100th. RxNorm either resolves or it doesn't — it never
invents. And the RxCUI lands in the FHIR resource, so downstream systems get a real
code, not a string.

**The war story (tell this one — it's a great "what was hard" answer):** the
widely-copied pattern for RxNav uses `approximateTerm` and filters on `score < 50`,
assuming a 0–100 scale. The API now returns raw Lucene scores — a *perfect* match
scores about 12 — so that filter silently rejected everything. Worse, without a
guard the fuzzy matcher returns confident garbage: "a water pill" resolves to the
ingredient *water*, and the phonetic "fur-oh-se-mide" matches **Ultra Mide — a urea
skin cream**. Our fix, in order:
1. **Normalized name lookup first** (`/rxcui.json?search=2`) — handles generics,
   brands (Benadryl→diphenhydramine, Lasix→furosemide), and misspellings, and
   correctly returns nothing for non-drugs.
2. **Fuzzy matching only on the LLM's `name_guess`** (never whole sentences), and
   the candidate is only accepted if its resolved ingredient is string-similar to
   what was said (bigram Dice ≥ 0.5). "Ultra Mide" fails that check → unresolved →
   clinician review, which is the correct outcome for a garbled name.
3. **A hardcoded offline map** of the demo drugs with verified RxCUIs, used only if
   the network path fails entirely.

---

## Decision 4 — cascades are the product, and "confirmed" is earned

`src/engine/detect.ts` + the `CASCADES` table in `src/data/knowledge.ts`.

A prescribing cascade = drug B was prescribed to treat a side effect of drug A.
Each table row is: trigger drug class → known side effect → treater drug class,
with the mechanism and a citation. Detection = both drugs present.

**The credibility detail:** a structurally-present cascade is only *suspicion*. We
mark it **CONFIRMED** only when the patient actually reported the linking symptom —
and we downgrade severity when they didn't. Confirmation comes from two places:
1. The neutral symptom review ("any swelling in your ankles?" — asked without
   explaining why, so the agent never leads the witness).
2. **The treater drug's own stated indication.** This was a real bug found in live
   testing: patients report linking symptoms as *reasons* — "allopurinol? I got the
   gout" — which extraction correctly files under indication, not symptoms. The
   engine now checks both. Clinically that's right: the reason the treater was
   prescribed IS the linking symptom.

**Chains** (A→B→C) are found by joining cascades where one's treater is another's
trigger. Margaret's chain: amlodipine → furosemide → allopurinol.

**"Isn't this a drug-interaction checker?"** No. Interaction checkers fire on pairs
from a static list, at prescribing time, and clinicians ignore them (alert fatigue).
A cascade is a *prescribing history* problem — you can only find it by knowing why
each drug was started, which is why it needs a conversation.

---

## Decision 5 — the other detectors

All in `src/engine/detect.ts`, all table lookups:

- **PIMs** (`PIM_RULES`): curated high-yield subset of AGS Beers 2023 + STOPP/START
  v3. Rules can be duration-gated (PPI > 8 weeks) or condition-gated (antipsychotics
  only flagged with dementia). Say "curated subset, not the complete criteria" if
  asked — honesty beats overclaiming.
- **Anticholinergic burden** (`ACB_SCORES`): the ACB scale — each drug scores 1–3,
  the sum is the burden, ≥ 3 associated with cognitive decline and falls. Margaret:
  oxybutynin 3 + diphenhydramine 3 + furosemide 1 + lorazepam 1 = **8**. This is why
  "foggy mornings" matters: it's not eleven separate drugs, it's one cumulative dose
  of anticholinergic load.
- **Therapeutic duplication** (`DUPLICATE_CLASSES`): ≥ 2 drugs doing the same job
  (lorazepam + Benadryl = two sedative-hypnotics; STOPP flags duplicates).
- **No stated indication**: the null from extraction becomes a finding directly.

---

## Decision 6 — LLM agents get deliberately narrow briefs

`src/llm/agents.ts`. Three agents, each fenced in:

- **explainFinding** — explains ONE finding, is handed the mechanism from the table,
  and is *forbidden from identifying additional problems*. Given a wide brief, a
  model volunteers a fourth interaction it invented — that's the failure mode, so
  the prompt bans it.
- **buildTaper** — *instantiates* a published deprescribing.org algorithm (we pass
  the reduction %, interval, and guardrails as parameters); it never designs a
  taper. It rounds to real tablet strengths and respects a `NEVER_ABRUPT` set
  (benzos are on it — abrupt discontinuation risks seizures).
- **challenge** — a geriatrician-persona reviewer that names the strongest objection
  to the plan. This is the "peer review" the hackathon prompt asked for, and it's
  honest: it runs *before* the clinician, as input to them, not as a second opinion
  that overrides anything.

---

## Decision 7 — the FHIR mapping is the Medplum differentiator

`src/fhir/writers.ts`. Each conversation output maps to the FHIR resource actually
designed for it:

| Output | Resource | The detail that shows we read the spec |
|---|---|---|
| Her regimen | `MedicationStatement` | What she's *actually taking* vs prescribed; unresolved meds keep her verbatim words, no guessed code |
| PIM hits | `Flag` | One per violation, citation in an extension |
| ACB score | `RiskAssessment` | Computed + auditable, contributors listed in `rationale` |
| **Cascades** | **`DetectedIssue`** | `implicated[]` in **causal order** (trigger first); `evidence` records whether the linking symptom was reported; `mitigation` = review the trigger drug |
| "I want to feel clear again" | `Goal` | `expressedBy` = **the patient** — her values as a first-class clinical object |
| Taper | `CarePlan` (draft) + `Task` | Real dated activities |
| Prescriber note | `Communication` | status `preparation` — drafted, never auto-sent |

**The statuses are deliberate:** `preliminary`, `draft`, `preparation`. Nothing the
agent produces is final without a human. That's both the honest posture and the
regulatory one.

`DetectedIssue` is the line to say out loud: almost nobody uses it, its spec has an
`implicated` reference array and a `mitigation` element, and it was designed for
exactly "these resources interact badly."

---

## Decision 8 — the webhook has a poller behind it

`src/server.ts`. Vapi delivers events to a webhook (needs a public tunnel), which
gives per-turn red-flag checking. But free tunnels die at will — we watched
localtunnel and localhost.run both drop in one afternoon. So the server *also polls
the Vapi API* every 10s for ended calls and runs the pipeline on the stored
transcript, deduped against the webhook path.

**Why it matters:** the phone call runs phone → Vapi cloud (venue wifi can't touch
it), and the poller needs only *outbound* https. The demo has no inbound network
dependency at all. Extraction always runs after the call, never in the reply path —
blocking a conversation on a 3-second extraction feels broken.

Red flags (`src/voice/prompt.ts`): regex patterns for fall-with-head-injury,
syncope, chest pain, GI bleed, suicidality — checked per-turn via webhook when
available, plus extraction reports them at end of call. The voice prompt also hard-
codes: never tell the patient to stop/start/change a dose; escalate and end the
review on red flags.

---

## Decision 9 — the review panel is server-rendered HTML with zero dependencies

`src/ui/panel.ts`, served at `/review`. No framework, no CDN, no external fonts —
one HTML string. **Why:** it must render on venue wifi that barely works, and it's
~600 lines we fully control. It reads a snapshot file (`out/last-review.json`)
written by both the live pipeline and the canned demo runner; the page polls and
reloads only when a *new* review lands (a naive auto-refresh resets scroll — found
that the annoying way). The server re-reads the file on mtime change so
`npm run demo` or `npm run panel:canned` repaints an open panel in ~3s without a
restart. Severity is never color-alone (icon + label), and every finding renders its
citation — that's Decision 10 made visible.

---

## Decision 10 — the regulatory answer

Designed against FDA's **Non-Device CDS criteria** (21st Century Cures §520(o)(1)(E)):

1. **Clinician-facing**, not patient-directing — the agent gathers and proposes,
   a clinician decides. Everything lands as draft/preliminary.
2. **Ranked options with the basis visible** — every finding shows its citation so
   the clinician can independently review the basis. That's why citations are in
   the UI and in FHIR extensions, not buried in code.
3. **Not time-critical** — pre-visit medication review, not acute care.

A *patient-facing autonomous taper* would be a regulated device — we deliberately
don't do that. Also: synthetic data only (Margaret is fictional, records tagged
`synthetic-demo`); no real PHI anywhere.

---

## The two mechanisms — cold, for the MD judge

**Donepezil → oxybutynin** (Gill 2005, the archetypal cascade): donepezil treats
dementia by *raising* acetylcholine. Acetylcholine also drives the bladder's
detrusor muscle → urinary urgency. Oxybutynin treats urgency by *blocking*
acetylcholine — pharmacologically opposing the dementia drug, and adding
anticholinergic load that worsens the cognition donepezil was meant to help.
The pair is self-cancelling and the patient ends up with both drugs' side effects.

**Amlodipine → furosemide** (Savage, JAMA Intern Med 2020): amlodipine (a
dihydropyridine calcium-channel blocker) causes ankle oedema by *dilating
arterioles* — fluid shifts into tissue from a pressure gradient. It is **not volume
overload**, so a loop diuretic doesn't fix the mechanism; it just dehydrates her,
disturbs electrolytes, raises fall risk — and raises uric acid, which is how she
got gout, which is why she's on allopurinol. Correct move: reduce/switch the CCB
(or add an ACE/ARB which normalizes the gradient), not add a diuretic.

**ACB in one line:** anticholinergic effects are *cumulative across the whole
regimen* — ACB ≥ 3 is associated with measurable cognitive decline and falls, and
Margaret sits at 8.

---

## Questions you might get, with honest answers

**"How accurate is extraction?"** — On our live telephony test it captured 8/8
mentioned medications, including "Jonipezil" and "Burosemide" garbled by phone
audio, and correctly refused to guess a drug the patient only called "the sleeping
pills." We haven't run a formal benchmark; that's the first thing we'd validate.

**"What if the patient lies or forgets?"** — Same as a human med rec: you work from
what they report. The design mitigates it: the agent separately prompts for OTC,
supplements, drops, patches, and sleep meds (people don't volunteer these), reads
the list back, and everything is marked patient-reported for the clinician.

**"Why Medplum?"** — Headless FHIR-native platform: real resources, real codes,
auth, audit, and a console UI for free. The rule engine could ship as a Medplum
**Bot** triggered on MedicationStatement creation — that's the platform-native
next step and we designed the engine as a pure function so it drops in.

**"What's next technically?"** — (1) Engine as a Medplum Bot. (2) Cost surface:
every stopped drug has a price; Stedi's eligibility API covers coverage checks.
(3) Grow the tables toward full STOPP/START with pharmacist review. (4) Formal
extraction benchmark against transcribed real-world med-rec conversations.

**"What breaks at scale?"** — The knowledge tables are the easy part (data entry +
clinical review). The hard parts are conversation quality across accents/hearing
loss/cognitive impairment, and integrating prescription history (surescripts/EHR)
so cascades can be detected from records even before the conversation.

**If you don't know:** "I don't know — that's the next thing we'd validate." Never
invent a clinical claim in front of a physician.

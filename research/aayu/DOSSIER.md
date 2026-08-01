# DOSSIER.md — Judge & Sponsor Intelligence, and the Moves That Make Winning Boring

> CEO briefing, 11:05am PT. Companion to EXECUTE.md. EXECUTE.md owns the clock;
> this file owns the *people* and the *exact technical moves*. Nothing here is vibes —
> every claim below traces to a primary source fetched this morning.

The operating principle: judges don't score projects, they score **recognition**.
Each judge walks in with a worldview; we win by being the project that *confirms
each judge's worldview back to them with evidence*. Six judges, six recognitions,
one demo. Here is each lock and each key.

---

## 1. The judges, decomposed

### Diana Hu — YC Managing Partner (the one who awards the YC interview)
**Source:** ycombinator.com/people/diana-hu, her YC Library talks.

- Ex-CTO of Escher Reality (YC S17, AR backend, acquired by Niantic). CMU ECE,
  computer vision/ML. 1,700+ office hours across 5 batches. A *technical*
  evaluator — she reads architecture, not slideware.
- Her published thesis, verbatim title: **"Vertical AI Agents Could Be 10X Bigger
  Than SaaS."** Also: "Why Vertical LLM Agents Are The New $1 Billion SaaS
  Opportunities."
- **What she is looking for today:** a vertical AI agent with a wedge — a narrow,
  unsexy, economically real workflow that incumbents ignore, executed by a team
  that clearly understands the domain's constraints.

**The recognition we hand her:** Deprescribe *is* her thesis, instantiated.
Vertical: geriatric medication management. Agent: does a 30-minute unreimbursed
clinical workflow autonomously, ends in human sign-off. Wedge: the funded
version of medication review is a completion-metric checkbox; the cascade-
finding conversation itself is unautomated. *(Correction per VERDICT.md: MTM/CMR
is a real funded category with incumbents — Arine, 40M recs/yr. Frame as
funded-category-bad-execution, never "no incumbents.")*

**The line (say it in Q&A, not the pitch):** *"This is a vertical agent for the
conversation the checkbox economy skips. The 30 minutes the CMR call center
doesn't spend is exactly where an agent belongs — RCT-proven med reduction, on a
billing rail that already exists."*

**Her trap question:** "Why won't Epic/an EHR just do this?" Answer: EHRs monetize
documentation volume, not subtraction; deprescribing *reduces* billable events
downstream. The buyer is the payer (MTM under Part D, CMS polypharmacy quality
measures), not the EHR. Misaligned incentives are the moat.

### Cody Ebberson — Medplum co-founder/CTO (the technical conscience of the room)
**Source:** medplum.com/docs/ai — which reads as his personal philosophy doc.

His published positions, near-verbatim:
- "The barrier to production isn't the AI model; it's the lack of a secure,
  auditable foundation."
- The canonical safe pattern is **"can suggest, but not act"** — AI drafts, human
  remains responsible for the final action.
- Every AI action should land in a FHIR **`AuditEvent`** log.
- "FHIR provides the predictable, semantically rich structure that allows LLMs
  to reason about clinical data" — he believes structure beats cleverness.

**The recognition we hand him:** our architecture is his blog post, built. Draft
FHIR resources awaiting approval = "can suggest, but not act." Deterministic
citation-table detection = his "explicit guardrails." We should say his phrase
*before he does*.

**Two upgrades that make this lock certain (see §3):**
1. Write an **`AuditEvent`** resource per pipeline run (what the agent read, what
   it suggested). ~30 min of work; it's the exact artifact his doc calls
   "critical for clinical safety." No hackathon team will have one.
2. Do the Stedi seam **through Medplum's own integration pattern** —
   `CoverageEligibilityRequest` → Stedi 270/271 → `CoverageEligibilityResponse`
   (documented at medplum.com/docs/integration/stedi). Using his platform's blessed
   billing path instead of a bolted-on REST call is the difference between "used
   Medplum" and "understood Medplum."

**His trap question:** "Why MedicationStatement and not MedicationRequest?"
Have the answer cold: Statement = what the patient *says they take* (source:
patient, pill-bag interview); Request = an order. Our input is attested usage,
so Statement is the semantically correct resource — and the review step is where
a clinician would issue new Requests. That answer, delivered fast, ends the exam.

### Ana Yoon Faria de Lima — Pavoot co-founder (YC P26)
**Source:** Medplum blog judge bio.

- 20+ Scientific Olympiad medals, ranked #1 in CS at USP, MSc AI at ETH Zurich,
  built AI/data systems at Itaú and BTG (LatAm's largest banks — i.e., systems
  where being wrong costs money).
- **What she rewards:** rigor. Sourced numbers, honest error handling, the team
  that knows the difference between a claim and a measurement.

**The recognition we hand her:** the numbers are already on the slide — n=81,295
cohort, 18.8% PIM rate, STOPPFrail RCT effect (−2.6 meds, p<.001), ACB 8 on the demo patient. Add
one honesty beat: *"RxNorm resolved 11 of 12 spoken names; the 12th is surfaced
as unresolved, not guessed."* Olympiad brains trust systems that show their
failure paths.

### Naomi Carrigan & Victor Wang — Deepgram (community lead; staff engineer, ex-AWS)
**What they reward:** Deepgram surviving *hard* conditions, and feedback they can
take home. Demos of Deepgram on a clean laptop mic are table stakes; **telephony
audio from an 80-year-old naming drugs is the hardest STT scenario in the
building.**

**The recognition we hand them:** the "Jonipezil"/"Burosemide" war story — Deepgram
heard a garbled drug name over phone audio and our RxNorm layer resolved it. Frame
it as *layered* robustness: "Deepgram got us close enough that deterministic
resolution could finish the job. That's the right division of labor." Then give
Victor one concrete piece of platform feedback (he's partner-platform engineering;
feedback is his job). Winners in our corpus did exactly this — the ArvinH16
winner README has a whole "feedback on the tools" section.

### Sri Raghu Malireddi — Moss co-founder (YC F25), ex-ML lead Grammarly/Microsoft
**Source:** moss.dev + docs.moss.dev (fetched in full).

What Moss actually is, precisely: a **real-time semantic search runtime** —
sub-10ms retrieval, no vector DB, runs **in-process** (browser/edge/device/cloud).
Published P50 latency: **3.1ms vs Pinecone's 597ms**. Their own cookbook patterns:
"Live-Call Context" (query a persistent index during a conversation) and a
**documented Vapi integration** (Custom Knowledge Base webhook) — *we use Vapi*.
Their JS SDK has `SessionIndex`: local-first, in-process, no per-query network call.

**What he rewards:** retrieval on the critical path of a live conversation —
that's the entire company thesis. A Moss index sitting beside the app as a
glorified FAQ store would *insult* the product; Moss inside the conversational
loop honors it.

**The recognition we hand him (see §3 for the build):** patient vernacular →
canonical clinical vocabulary, resolved in-process *mid-call*, with the
deterministic engine still making every clinical call. **The line:** *"Moss is
the layer between what patients say and what the literature calls it. 'Puffy
ankles' is peripheral edema; retrieval has to happen inside the conversation, so
it runs in-process — and the clinical decision still never touches a model."*

**His trap question:** "Why not just have Claude map the phrase?" Answer: an LLM
round-trip is 500–1500ms and probabilistic in a place we promised determinism-
adjacent behavior; Moss is <10ms, local, and returns a *ranked vocabulary match
we can threshold*. Latency and auditability, same answer.

---

## 2. Sponsor-company intelligence (what each company's own docs reveal)

### Medplum — the platform IS the thesis
Their `/docs/ai` page: healthcare AI fails on infrastructure, not models; FHIR is
the substrate LLMs already understand; guardrails via AccessPolicy + AuditEvent;
"can suggest, but not act." Their flagship AI customers (Rad AI, Unity AI) are
both *agents operating inside clinical workflows with human oversight* — the
pattern we mirror. Also relevant: Medplum ships an **`$ai` operation** and an
**MCP server**; knowing they exist (and saying why we didn't need them — our
agent writes through the standard REST/FHIR path under the same policies) shows
we read the whole shelf.

### Stedi — the empty lane, with a paved Medplum on-ramp
- **Test mode is free** and PHI-free: mock 270/271 eligibility checks return
  realistic benefits payloads (copays, deductibles, active coverage) for Aetna,
  Cigna, UHC, Humana, Kaiser, **CMS** (docs: /docs/healthcare/test-mode).
- Mock requests demand **exact canned subscriber values** (name/DOB/member-ID
  must match their fixtures) — budget 10 minutes for copying those verbatim, not
  improvising. Insurance discovery and COB are *not* in test mode; don't promise them.
- **Medplum documents the exact FHIR pattern:** `CoverageEligibilityRequest` →
  Stedi → `CoverageEligibilityResponse` (medplum.com/docs/integration/stedi).
- Our demo patient is 83 (born 1943-04-12, per `src/fhir/seed.ts`) → the **CMS/Medicare mock** is the thematically perfect
  payer. MBI lookup even exists in test mode if we want a flourish.

### Moss — the integration is smaller than it looks
- JS SDK, `SessionIndex`: create → add docs → query, all in-process. Their
  quickstart is genuinely minutes, not hours.
- What we index: our **symptom/side-effect vocabulary** (~100 short docs: each
  canonical term + colloquial variants + the drug-cascade edges it participates
  in, with metadata `{system: "cascade-vocab", canonical: "peripheral-edema"}`).
- Hybrid search with an alpha knob and metadata filtering = we can threshold and
  filter matches deterministically after retrieval. The engine stays the decider.

### Deepgram — already load-bearing, just narrate it correctly
STT+TTS via Vapi is live. The upgrade is rhetorical, not technical: present
Deepgram as the first stage of a resolution *ladder* (Deepgram → RxNorm →
deterministic engine), with the war story as evidence the ladder holds under
telephony conditions.

---

## 3. The three commits that convert research into scoreboard

Priority-ordered. Each names its judge, its source, and its demo beat.

### Commit A — AuditEvent per run (~30 min) → Cody
Every pipeline run writes one FHIR `AuditEvent`: agent identity, resources read,
resources drafted, timestamp. Render one line on the review panel: *"This run is
logged as AuditEvent/xyz."*
Demo beat: "Every suggestion this agent makes is itself a FHIR-audited event —
the agent is governed like a user, not bolted on beside the chart."

### Commit B — Stedi eligibility via Medplum's native pattern (~60 min) → Stedi lane + Cody + Diana
1. Stedi sandbox account → test API key (5 min, self-serve).
2. CMS (or Cigna) mock 270/271 with their exact fixture values.
3. Store as `CoverageEligibilityRequest`/`CoverageEligibilityResponse` in Medplum.
4. Panel renders: coverage active ✓, plus **annual cost of the deprescribed
   meds** (public generic prices, cited) as "what subtraction is worth."
Demo beat: *"She's covered — and here's the annual spend that disappears when the
doctor approves these three discontinuations. Subtraction has a dollar value, and
we compute it before the visit."* (This is also the People's-Choice-video money shot.)

### Commit C — Moss in-loop vocabulary retrieval (~45 min) → Sri Raghu
`SessionIndex` over the symptom vocabulary; the extract step queries it for each
symptom phrase; matched canonical terms feed the cascade detector; below-threshold
matches fall back to the existing synonym table (so the demo cannot regress).
README one-liner + panel badge: "vocab match via Moss, 4ms."
Demo beat: the "puffy ankles" utterance resolving live.

**Order: A, then B, then C** (A is the cheapest lock; B has account-signup risk —
do it while energy is high; C has a built-in fallback so it can't hurt us).
All three carry EXECUTE.md's hard freeze at 15:30 and its timebox law: any commit
that isn't demo-ready at its deadline ships as an honestly-labeled branch instead.

---

## 4. Pitch choreography — one beat per judge

| # | Beat | Duration | Whose lock it turns |
|---|---|---|---|
| 1 | The pill bag & the cascade story (amlodipine → furosemide → allopurinol) | 0:40 | Everyone — the hook |
| 2 | Live call: patient says "puffy ankles," says "I don't know" to a drug | 1:30 | Deepgram (hard audio), Moss (in-loop retrieval badge) |
| 3 | Panel repaint: 12 findings, citations visible, ACB 8, unresolved med shown *as* unresolved | 1:00 | Ana (rigor), Sri Raghu (4ms badge) |
| 4 | Medplum: draft resources + AuditEvent + eligibility, in the actual Medplum app | 1:00 | Cody (his blog, built) |
| 5 | The dollar line: coverage ✓, annual cost of subtracted meds | 0:30 | Diana + Stedi (vertical agent with a P&L) |
| 6 | Close: quote both judging criteria verbatim, then the thesis line | 0:20 | The scorecard itself |

Total 5:00, leaving buffer. The close, scripted: *"The criteria ask for agents
that enhance clinicians without adding to their workload. Everything you saw was
drafted by the agent and decided by literature — the only thing we ask a
clinician to do is approve a subtraction. Every other tool in this room adds.
We're the only one that takes away."*

---

## 5. Updated probability ledger

- Top-3 with commits A+B+C landed and beats rehearsed: **~70%** (from 60%).
- First place: **~40–45%** (from 35%). The residual is irreducible: an unknown
  team could have something spectacular, and live demos carry ~10% self-destruct
  risk no matter how well drilled — which is why the canned path rehearses twice.
- If only A+B land (Moss slips to a branch): top-3 **~62%** — C has a fallback
  and an honest story either way.

### ⚠️ Where this dossier is most likely wrong
- **Reading judges from public writing has error bars.** Diana may delegate to
  gut feel; Cody may care more about UI polish than AuditEvents. Hedge: every
  beat is also just a good demo beat on its own merits.
- **Stedi sandbox signup could have friction** (approval delay, missing test-mode
  feature). Mitigation: the fixture values are documented publicly; if the
  account stalls, render the documented mock response shape, label it
  "Stedi test-mode fixture," and say so out loud. Honest beats fake, always.
- **Moss `SessionIndex` cold-start (model download) could exceed the timebox.**
  Fallback is pre-warming at server boot, and the synonym table backstop means
  the demo never breaks.

---

*Every claim above: ycombinator.com/people/diana-hu · medplum.com/docs/ai ·
medplum.com/docs/integration/stedi · stedi.com/docs/healthcare/test-mode ·
stedi.com/docs/healthcare/api-reference/mock-requests-eligibility-checks ·
moss.dev · docs.moss.dev/llms.txt · medplum.com blog (judge bios). Fetched
2026-08-01 ~11:00 PT.*

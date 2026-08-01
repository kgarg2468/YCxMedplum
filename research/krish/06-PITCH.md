# 06 — The pitch: claims that survive scrutiny

Two of the judges are professional claim-checkers. Ana Yoon Faria de Lima's entire profile is the
difference between a claim and a measurement; Cody Ebberson publishes a rubric for exactly this.
Every number below is either sourced or marked as unverified.

> **Use [`../aayu/RESEARCH.md`](../aayu/RESEARCH.md) and `docs/EVIDENCE.bib` as the single source
> for every clinical number said out loud.** They're built from PubMed primaries with abstracts
> read in full. In particular: **"33:1 STOPPFrail return" is dead** — it isn't in the primary RCT.
> Say Curtin 2020 instead: −2.6 medications per patient, −$62/month, no detected harm, p<.001.
> Anyone still carrying the 33:1 line in a slide or a script needs to drop it.

---

## Two claims to stop making

### ❌ "Nobody is paid to take a medication away" / "there are no incumbents"

**False.** Medication review is a funded category: CMS mandates Comprehensive Medication Reviews
under Part D, plans are Star-rated on completion, and Arine alone touches 30M+ lives across 45+
health plans with 40M+ recommendations a year. Diana Hu has done 1,700+ office hours — the odds
she can name an incumbent from memory are high, and one unsourced absolute ends your credibility
for the rest of the session.

**✅ Use the funded-category-bad-execution frame instead** (from `VERDICT.md`, and it is a
*stronger* claim than the one it replaces):

> "Medication review is a funded category — CMS mandates CMRs, plans are Star-rated on completion,
> and vendors like Arine push 40 million recommendations a year at pharmacist call centers. And
> 18.8% of seniors are *still* on an inappropriate medication. The paid version of this is a
> compliance checkbox. The conversation that actually finds a prescribing cascade — going through
> the pill bag, asking *why* each drug was started — is the part nobody's system does, because it
> took a human 30 minutes and the checkbox pays the same either way. That 30-minute conversation
> is now agent-shaped work."

An empty market is usually empty for a reason. A full market executing badly for a documented
incentive reason is the setup Diana's own vertical-agents thesis describes.

### ❌ "MTM is billed for 0.02% of Part D beneficiaries"

**This conflates two different things** — Part B MTM CPT codes and the Part D CMR completion
measure. Actual CMR completion is roughly **10–16%**, with Star-Ratings cut-points now in the
48–89% range. The line will not survive a knowledgeable question. Delete it.

---

## The counterpunch to prepare for

A judge who knows the literature can attack the impact claim with one sentence: **the same
JAMA 2016 paper that supplies the ADE burden numbers reports that Beers "always avoid" drugs cause
only 1.8% of ADE-related emergency-department visits.**

Two defences, use both:

1. **The wedge doesn't rest on that statistic.** The funded-category frame above carries the
   impact argument without leaning on the contested ADE number.
2. **Cascades aren't the Beers list.** The claim is about *prescribing cascades* — one root cause
   generating three prescriptions — which is a different and larger phenomenon than "this drug is
   on a list." Say cascade more often than you say Beers.

---

## Describe the engine narrowly and accurately

It is **12 PIM rules, 8 cascades, 3 duplicate classes, and an ACB table** — approximately 30
hand-curated rules with ~30 citations. It is **not** an implementation of all of Beers 2023 or all
of STOPP/START v3. Say the real numbers; the curation *is* the argument.

Similarly: the amlodipine → oedema → furosemide → urate → gout → allopurinol finding is a
**potential cascade, with patient-reported history supporting the sequence.** It is not confirmed
causality — one affirmative answer to "did the swelling start after?" doesn't establish that.
Saying "potential, history-supported" costs you nothing and buys you every clinically literate
person in the room.

**Disclosing your own limits is a credibility instrument you can buy in one afternoon.** Almost
nothing else about clinical credibility is purchasable that fast.

---

## The three sentences that do the most work

**On the architecture** (this is the one no competitor can say):

> "`src/engine/detect.ts` contains zero LLM calls. The model never decides what is dangerous —
> it only helps a patient describe what they take, and explains what the table found. Our agent
> **cannot** hallucinate a drug interaction."

**On the theme** (quote the criterion, then land on it):

> "The criteria ask for agents that enhance clinicians rather than adding to their workload.
> Everything you saw was drafted by the agent and decided by the literature. The only thing we ask
> a clinician to do is approve a subtraction. Every other tool in this room adds. We take away."

**On the omitted sponsor** (winners name what they refuse to do):

> "Stedi's one honest job in a deprescribing demo is a coverage checkmark. We chose depth on the
> three sponsors whose depth is load-bearing — and we can tell you exactly what a 270/271 can and
> cannot say about a drug someone is *stopping*."

---

## Q&A ammunition

**"Why won't Epic just build this?"**
EHRs monetize documentation volume, not subtraction — deprescribing *reduces* billable events
downstream. The buyer is the payer (Part D MTM, CMS polypharmacy quality measures), not the EHR.
Misaligned incentives are the moat.

**"Isn't Arine going to crush you?"**
Arine is an analytics layer bolted onto call centers, sold in enterprise cycles to plans. We are
the conversation itself, FHIR-native inside the provider's stack. When the interview costs cents,
the analytics layer becomes a feature. Incumbents optimized for the checkbox economy don't
cannibalize their own call-center contracts.

**"Why not just let Claude check the drug list?"**
A model that's right 95% of the time about drug harm is a liability engine, not a product.
Detection is a citation table; the LLM is only allowed to explain.

**"Why not RAG over the guidelines?"**
Retrieval still ends with a model deciding what applies. ~30 hand-checked rules is small enough to
curate, and curation is the point — the output has to be defensible, not just plausible. Scaling
is a data-entry problem, which is the good kind.

**"Why moss and not a vector database?"**
The mapping happens mid-conversation on live speech. moss runs in-process, so retrieval sits
inside the conversational loop rather than beside it — and the decider stays deterministic. moss
maps *language*; the table makes the *clinical* call. ⚠️ Only say a latency number you measured on
the demo machine — the co-founder wrote the real ones.

**"Why `MedicationStatement` and not `MedicationRequest`?"**
Statement is what the patient *says they take* — source: patient, pill-bag interview. Request is
an order. Our input is attested usage; the review step is where a clinician would issue Requests.

**"Who's liable when it's wrong?"**
The clinician — which is why everything we write is preliminary or draft, awaiting sign-off. We
never touch the chart autonomously. *(Only say this once defect D1 is fixed. Right now
`RiskAssessment.status` is `final` and it is not true.)*

**"How do I know that isn't hardcoded?"**
Point at the negative-control test: a second patient without the symptom does not get the cascade.
*(Only say this once defects D4 and D8 are fixed. Right now every live caller gets Margaret's
conditions.)*

**"What breaks at 10,000 patients?"**
Nothing interesting — the engine is a table lookup, RxNorm is a public API with caching, calls
parallelize. The real constraint is clinician review throughput, which is why findings arrive
ranked with citations.

**"What did you build today?"**
Answer with the commit log, not adjectives.

---

## The video (People's Choice)

Separate prize, separate mechanics, ~90 minutes of parallel work for a ~25–35% shot at it.

- **Make it a YouTube Short.** Shorts count a view on every playback start with **no minimum watch
  time** (policy change 2025-03-31); long-form needs ~30 seconds.
- **Public by 13:30.** Views are counted at 17:00. A 16:35 upload has 25 minutes of accumulation;
  13:30 has three and a half hours. This single decision very nearly determines the prize.
- **≤60 seconds:** the pill bag → the garbled drug name recovering → the panel repainting with
  three drugs and one root cause → drafts waiting in Medplum for a doctor.
- **Do not narrate the tech stack.** Nobody shares an architecture diagram.
- Rough targets: **~400 views competitive, ~800 comfortable.**

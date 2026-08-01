# EXECUTE.md — The War Plan

> Channeling Musk's thinking framework, distilled from public statements — not the real person.
>
> Written 10:52am PT, Aug 1 2026. Submissions close 17:00. Presentations 18:00. Awards 19:00.
> **We have 6 hours and 8 minutes. This document is the only plan. Everything not in it is deleted.**

---

## 0. Conclusion first, then the math

We are going to win this hackathon, and not because we're lucky. We built the only
project in the field with a thesis. Everyone else built a better clipboard. But right
now we are at **~55% for top-3 and ~30% for first**, and the gap between 30% and 60%
is exactly four fixable failures listed in §3. Fix them in order. Touch nothing else.

Who's asking us to be humble? Nobody on the judging panel. Diana Hu funds people who
say "everyone else is wrong and here is the arithmetic." So here's the arithmetic.

---

## 1. The physics of this event (facts, not vibes)

Decompose the win condition to first principles. A hackathon is not a engineering
contest. It is a **7-minute attention market** with two scoring axes:

1. **Impact** — "meaningfully improve patient care / clinician experience…
   *enhancing clinicians rather than adding to their workload*" (medplum.com blog, 2026)
2. **Use of provided tech** — "Deepgram, Medplum, moss.dev, and/or Stedi"

That's the entire law. Everything else is a recommendation.

**The judge market, decomposed (6 judges):**

| Judge | What they reward | Our current score |
|---|---|---|
| Diana Hu (YC Partner) | A fundable company, a founder with a spiky POV | 8/10 — thesis is genuinely contrarian |
| Cody Ebberson (Medplum CTO) | Correct FHIR. He will know in 10 seconds if we faked it | 9/10 — 8 resource types, drafts for clinician approval |
| Ana Yoon Faria de Lima (Pavoot) | Rigor, numbers, olympiad-brain | 8/10 — 33:1 STOPPFrail, n=81,295, ACB scale |
| Naomi Carrigan (Deepgram) | Deepgram doing something hard | 7/10 — real telephony, garbled-name recovery story |
| Victor Wang (Deepgram) | Same | 7/10 |
| Sri Raghu Malireddi (Moss cofounder) | **Moss in the loop** | **2/10 — we mention Moss in a Q&A doc. That's it.** |

One-sixth of the panel co-founded a product we used zero times. What do you call
shipping a rocket with five engines lit and one intentionally off? You call it a
mistake, not a design decision.

**The evidence base (14 winner repos vs 11 non-winner repos, scraped this morning —
see `/Users/aayu/yc-hackathon-analysis.md`):**

- Winners solve **judgment** problems; losers solve **transcription** problems.
  The most instructive loss in the corpus: ClearPath, a voice intake-form filler,
  technically flawless, Pipecat + Nemotron + evals + diagrams — didn't place.
  It is literally the demo described in this hackathon's own prompt. The prompt
  describes the crowded lane. We are not in it. Good.
- Winners median 29 commits; losers median 8. We have 17 and climbing. Fine.
- Every winner made sponsor tech **load-bearing** and could say *why the obvious
  alternative fails*. The 2nd-place Moss-hackathon team's exact line: "This is not
  five tools sitting side by side." Memorize that sentence, because a judge in this
  room wrote the tool it refers to.

---

## 2. Why we deserve to win (the narcissism section, as ordered)

We did the thing that wins before most teams finished their `npm create vite`:

- **We have the only subtraction thesis in the building.** 42% of US adults over 65
  take 5+ daily meds; 18.8% are on a potentially inappropriate one (2023 ambulatory
  cohort, n=81,295). A deprescribing conversation returns 33:1 (STOPPFrail) and
  nobody does it because nobody is paid to. Every other team is building "more" —
  more scribing, more research, more documentation. The judging criteria literally
  say "enhancing clinicians rather than adding to their workload," and we are the
  only team whose product **is** the criterion.
- **We have the only architecture with a refusal in it.** `src/engine/detect.ts`
  contains zero LLM calls. The system *cannot* hallucinate a drug interaction,
  because clinical claims come from a citation-backed table (Beers 2023,
  STOPP/START v3, ACB scale) and the LLM is only allowed to talk about them.
  Winners name the thing they refuse to do. Ours: **the model never decides what
  is dangerous.**
- **We have the prescribing cascade** — amlodipine → edema → furosemide → gout →
  allopurinol. Three drugs, one root cause, real literature. It demos like a
  magic trick and it's true.
- **It already works over a real phone call.** Deepgram heard "Jonipezil" and
  "Burosemide" through telephony audio and the RxNorm layer still resolved
  donepezil and furosemide. That's not a feature, that's a war story, and war
  stories beat features in a 7-minute market.
- **FHIR that the FHIR author will respect.** MedicationStatement, Flag,
  RiskAssessment, DetectedIssue, Goal, CarePlan+Task, Communication — written as
  drafts for a human to approve. We didn't stuff JSON in a table like the tourists.

If that reads as arrogant, good. It's also *sourced*, which is the only kind of
arrogance that survives Q&A.

---

## 3. Where we currently lose (the ruthless section — 4 failure modes)

Run the numbers honestly. Four ways we walk out with swag and nothing else:

### Failure 1 — The Moss judge asks "why didn't you use Moss?" and we recite a paragraph. `P(asked) ≈ 0.9`
Our current answer lives in a Q&A doc. A paragraph is what losers have. Winners
have a commit. Moss's pitch is <10ms in-runtime semantic retrieval; our symptom
vocabulary matching in the cascade detector is string/synonym matching today.
That is a 1-to-1 fit and we know it — we wrote it in DECISIONS.md and then didn't
do it. Which physics law prevented us? None. It was merely unscheduled.

### Failure 2 — People's Choice is a YouTube view-count race that ends at 17:00, and our own DEMO.md says record the video "TONIGHT." `P(loss by default) = 1.0 if not fixed`
Views are counted **when submissions close at 5pm**. A video posted at 4:35pm has
25 minutes of view accumulation. A video posted at 13:30 has 3.5 hours and every
group chat we collectively touch. This is a separate, winnable prize whose
mechanism is completely independent of judge opinion, and our plan file schedules
us to lose it. Delete that instruction. (Deadpan aside: we wrote an operational
runbook with a scheduled failure in it. Very thorough of us.)

### Failure 3 — The subtraction story has no dollar sign on stage. Stedi is the dollar sign. `P(impact score decays without it) ≈ 0.5`
"We stop unnecessary drugs" is a clinical claim. "We stopped 3 drugs and here is
the annual cost that disappears, from a real (test-mode) coverage check" is an
economic claim. Judges fund economic claims. Stedi test mode exists precisely so
you can do eligibility/coverage without real payers. Zero repos in the entire
scraped corpus ever used Stedi — the lane is empty. Even a thin, honest
integration (coverage check on the demo patient, price the deprescribed meds)
converts our thesis into a number on a projector.

### Failure 4 — We demo the pipeline instead of the moment. `P(self-inflicted) ≈ 0.3`
The pitch rhythm that wins is: cascade story (30s) → live call where the patient
says "I don't know what that one's for" (90s) → panel repaints with the chain +
citations (60s) → FHIR drafts in Medplum (30s) → the two criteria quoted back
verbatim (30s). The failure mode is not a bad answer; it's spending 3 minutes on
architecture while the room's attention amortizes to zero. Nobody ever bought a
car because the assembly line was beautiful.

---

## 4. The 5-Step Algorithm, applied (in order, no skipping)

**Step 1 — Question every requirement.** Named owner or it dies:
- "Integrate all four sponsor techs deeply" — owner: nobody. The blog says
  "and/or." Two deep + two honest beats four thin. **Rejected as stated;**
  replaced by: Deepgram deep (done), Medplum deep (done), Moss *real but narrow*,
  Stedi *real but narrow*.
- "More detection rules before 5pm" — owner: our anxiety. 12 findings already
  demo. **Rejected.**
- "Polish the review panel further" — owner: vanity. It already repaints in ~3s
  on a projector-friendly layout. **Rejected.**

**Step 2 — Delete.** The kill list, effective immediately:
- ❌ Any new features not in §5. All of them. Yes, that one too.
- ❌ The "record video tonight" instruction in DEMO.md — replaced by 13:30 upload.
- ❌ Refactors, renames, dependency bumps, README restructures beyond §5 edits.
- ❌ Live-call-during-presentation as the *only* path (keep it as path A, but the
  canned snapshot is path B and gets rehearsed too).
- If we aren't slightly nervous we deleted too much, we didn't delete enough.

**Step 3 — Simplify what remains.** Moss integration = one narrow, honest seam:
symptom-vocabulary retrieval inside cascade matching (patient says "my ankles were
puffy," Moss maps it to `peripheral edema` in-runtime). Not a rewrite. One module,
one demo beat, one sentence to the judge: *"Your runtime is the layer between what
patients say and what the literature calls it."* Stedi = one call: coverage/
eligibility for the demo patient in test mode, priced meds on the panel.

**Step 4 — Accelerate.** Parallelize: one person owns Moss+Stedi seams, one owns
the video + distribution, one owns pitch rehearsal + canned-path drills. If solo,
the order is strictly: video (13:30) → Stedi seam → Moss seam → rehearse.

**Step 5 — Automate.** Already done where it matters (`panel:canned` restore,
`demo:fast`, offline test). Do not automate anything new today.

**Idiot Index of the remaining work:** value of Moss+Stedi seams to the two judges
who score them ≈ decisive; cost ≈ 2–3 focused hours against 6 available. Index
comfortably under 1. Anything else we could build today has an index over 5 —
which is why it's dead. When the ratio is that lopsided, hesitation is the only
way to lose money.

---

## 5. The clock (PT). Deviate only with a named reason.

| Time | Action | Done when |
|---|---|---|
| **10:55–11:40** | **Stedi seam.** Test-mode eligibility/coverage for demo patient; annual $ of deprescribed meds renders on `/review` + lands as `Coverage`-adjacent context in the FHIR bundle. Honest scope: test mode, one patient. | Panel shows a dollar figure with a Stedi attribution. |
| **11:40–12:25** | **Moss seam.** Symptom phrase → canonical vocabulary retrieval inside `engine` input path. Keep the deterministic table as the decider — Moss maps language, never makes clinical calls (this preserves our refusal). | One demo utterance ("puffy ankles") resolves via Moss; README one-liner updated. |
| **12:25–12:30** | Commit. Push. Eat something. Non-negotiable on all three. | — |
| **12:30–13:15** | **Shoot the video.** ≤60s. Script: cascade story → real call clip (the "Jonipezil" moment) → panel repaint → "drafts in Medplum, doctor approves." No narration of the tech stack. | Uploaded to YouTube, **public**, by 13:30. |
| **13:15–13:45** | **Distribution blitz.** Every group chat, class Discord, team LinkedIn/X, the hackathon Discord (allowed channels). Ask for 30 seconds, give the link, stop. | Link posted in ≥10 places. |
| **13:45–14:30** | **Full dress rehearsal ×2.** Once live-call path, once canned path. Time both. Cut until ≤ 6:30. | Two clean runs, timed. |
| **14:30–15:30** | **Q&A drills.** The six questions in §6, answered out loud, ≤20s each. Then fix whatever the rehearsal exposed — and nothing else. | Answers memorized, not read. |
| **15:30–16:15** | Freeze. `npm test`, `typecheck`, `panel:canned` verified offline. Re-record backup screen capture only if the panel changed. | Green, frozen, backed up. |
| **16:15–16:50** | **Submit the form.** Repo URL, video link, description = README's first paragraph verbatim. Do not write new prose at 4:45pm; 4:45pm prose is how you ship typos to a YC partner. | Submission confirmed. |
| **17:00–18:00** | Dinner. Watch the room. Count how many teams built the intake-form demo. Smile. | — |

**Hard freeze at 15:30.** A feature landed at 16:20 has negative expected value:
`P(it breaks the demo) × cost(demo dies on stage)` dwarfs `P(a judge notices) ×
value(marginal feature)`. This is the same reason you don't hot-swap an engine on
the pad.

---

## 6. Q&A live-fire (the exact six, with the winning shape)

1. **"Why didn't you just let Claude check the drug list?"** — Because a model
   that's right 95% of the time about drug harm is a liability engine, not a
   product. Detection is a citation table; the LLM is only allowed to *explain*.
   The system cannot hallucinate an interaction. Next question.
2. **"Why Moss and not a vector DB?"** — The mapping happens mid-conversation on
   live speech; Moss's in-runtime retrieval sits inside the loop, not beside it.
   And the decider stays deterministic — Moss maps language, the table makes the
   clinical call.
3. **"Who's liable when it's wrong?"** — The clinician, which is why everything we
   write is a **draft** FHIR resource requiring approval. We never touch the chart
   autonomously. Flag, DetectedIssue, CarePlan — all staged for human sign-off.
4. **"What breaks at 10k patients?"** — Nothing interesting: the engine is a table
   lookup, RxNorm is a public API with caching, calls parallelize per patient.
   The real scaling question is clinician review throughput — which is why
   findings arrive ranked with citations, so review is minutes, not thirty.
5. **"Business model? Nobody pays for deprescribing."** — Today, correct — that's
   why the problem exists. But Medicare pays for MTM (Part D) and CMS quality
   measures penalize polypharmacy outcomes; the payer is the buyer, 33:1 is the
   pitch. We sell subtraction to the entity that eats the cost of addition.
6. **"What did you build *today*?"** — Answer with the commit log, not adjectives.

---

## 7. Probability ledger (numbers, not mush)

- Top-3 with §5 executed: **~60%.** First place: **~35%.**
- Top-3 if we skip Moss/Stedi and polish instead: **~40%**, and we forfeit the two
  judges we're currently losing. Polishing the strong parts of a pitch is how
  engineers procrastinate.
- People's Choice with a 13:30 upload + real blitz: **~25–40%** (variance is
  distribution reach, which is a group-chat problem, not an engineering problem).
  With a 16:35 upload: **~0%.** This prize is decided by a `sort` on view counts;
  be on the right side of the sort key.

### ⚠️ Where this plan is most likely wrong
- **Moss integration friction is unknown.** If the seam isn't demo-ready by 12:25,
  ship it as a feature-flagged branch demoed locally and say exactly that — a
  half-real integration honestly labeled beats a fake one and beats a paragraph.
  Timebox is the law: 45 minutes, then decide.
- **The thesis could be too clinical for a general room.** Hedge: the video and
  the first 30 seconds are the grandmother's pill bag, not the ACB scale.
- **Another team may also be running an analysis-driven playbook.** Fine. Plans
  don't win; execution rate does. Ours is written down and theirs probably isn't.
- **Musk-framework caveat, honestly applied:** this schedule is calibrated
  optimistic. Everything in §5 has slack except the 13:30 video upload, which has
  none. If anything slips, the video eats first.

---

## 8. The one rule

Every 30 minutes, read the two judging criteria out loud and ask: *does the thing
I am doing right now move either number?* If not, stop doing it. The criteria are
the physics. Everything else — including this document — is a recommendation.

**"The best part is no part. The best process is no process."** (source: Tesla earnings call, 2021)

# VERDICT.md — Should We Stick With Deprescribe? (Adversarial Review)

> 11:10am PT. I attacked our own thesis the way the room's smartest judge would.
> Two of our claims are factually wrong. The idea survives anyway — here is the
> arithmetic, the corrections, and why pivoting now would be malpractice.

---

## 0. Wait — why does this question exist at all?

Because it should. Sunk cost is not a reason to keep an idea; six hours from
submission, the *only* admissible reasons are physics and evidence. So run the
math both ways before answering.

**The pivot math.** A pivot at 11:10am buys: a fresh idea with zero code, zero
rehearsal, zero war stories, competing against our own current state — a
working end-to-end system tested over a real phone call. Winner-corpus median is
29 commits over ~2 days; we'd be attempting a from-scratch build in ~5 hours
while also shooting a video by 13:30. Probability a pivot produces a stronger
5pm artifact than what already runs: **<10%.** You don't blow up the rocket on
the pad because someone found a scratch in the paint. You check whether the
scratch is structural.

So the real question is not "pivot or stay." It is: **are the scratches
structural?** Two of them looked structural this morning. Let's inspect.

---

## 1. Finding 1 — "Nobody is paid to take a medication away" is FALSE as stated

**Evidence (fetched 11:05am, arine.io + cms.gov):**

- **Arine** exists and is not small: 45+ health plans, **30M+ lives touched,
  40M+ medication recommendations per year**, five national plans, seven Blues,
  two national PBMs. Their tagline is literally "medication intelligence." They
  sell MTM programs. A customer quote on their homepage brags about a **"92%
  CMR completion rate for MTM."** (source: arine.io, fetched today)
- **CMS runs a formal MTM program** under Part D. Comprehensive Medication
  Reviews (CMRs) are a defined, annually required, Star-rated activity. Plans
  are literally graded on completion rates. (source: cms.gov MTM page, fetched today)
- Others in the space we didn't even fetch: Tabula Rasa/MedWise, FeelBetter,
  Cureatr's ancestry. This is a *funded category*, not a void.

**Impact if uncorrected:** Diana Hu has done 1,700+ office hours; the odds she
has seen a medication-optimization deck are ~100%. If we say "nobody gets paid
for this and there are no incumbents," and she names Arine from memory, our
credibility dies in one sentence — and credibility is the only currency a
hackathon pitch has. Ana, the banking-systems olympiad brain, will smell the
unsourced absolute even without knowing the company.

**But here's what the evidence actually shows when you read it closely:**

Arine's 40M recommendations are **analytics fired at pharmacist call centers**,
sold top-down to health plans. The CMR that gets "completed" at 92% is a
checkbox phone call performed by a pharmacy tech reading a script — completion
is the metric *because completion is what's paid*, not outcomes. Notice what is
nowhere in Arine's product: **the patient's own voice, the pill bag, the "what
do you take that one for?" question, and the point of care.** Their system
never learns that the answer is "I don't know" — which is precisely the datum
that finds a prescribing cascade.

**The corrected claim (stronger than the original, because it's true):**

> "Medication review is a funded category — CMS mandates CMRs, plans are
> Star-rated on completion, and analytics vendors like Arine push 40 million
> recommendations a year at pharmacist call centers. And 18.8% of seniors are
> *still* on an inappropriate medication. The paid version of this is a
> compliance checkbox. The conversation that actually finds a prescribing
> cascade — going through the pill bag, asking *why* each drug was started —
> is the part nobody's system does, because it took a human 30 minutes and the
> checkbox pays the same either way. That 30-minute conversation is now
> agent-shaped work. We built that agent, FHIR-native, at the point of care."

This is the classic incumbent-as-tailwind reframe, and it happens to be
accurate: **the existence of a $-funded category with bad execution is better
evidence for the wedge than an empty market.** Empty markets are usually empty
for a reason. This one is full of people doing it badly for a well-documented
incentive reason. That's the setup Diana's vertical-agents thesis describes.

## 2. Finding 2 — "No incumbents" must die everywhere it appears

Sweep README.md, TEAM.md, docs/, the pitch script, and the video script for any
absolute of the form "nobody / no one / no agent exists." Replace with the
funded-category-bad-execution frame above. Estimated cost: 15 minutes. Value:
survives the one question that could kill us. This is now a pre-freeze task in
EXECUTE.md's 14:30–15:30 window.

Note the deadpan irony: our pitch about *auditing overconfident prescriptions*
contained two overconfident unsourced claims. The treatment is the same one we
sell — deterministic checking against the literature.

## 3. Finding 3 — the competitive field today (re-scanned 11:05am) is soft

All Medplum-hackathon repos pushed today, latest scan:

| Repo | State at 11:05am |
|---|---|
| TarunYadgirkar/Medplum-Hackathon | A zip file, a LANE_PROMPTS.md, 9 commits, no README description |
| Kiwis01/Helt | 1 commit, empty |
| seze23/YC-Medplum-Hack | "Add initial project context" |
| kgarg2468/YCxMedplum | **us** |
| Kakar13/yc-medplum-hackathon | Docs/skills scaffold, no product |
| EtahmBell/lamina | Physician-directory data pipeline, no voice, no agent loop |

No visible team has a working voice→FHIR loop. Obviously the dangerous
competitors are the ones who don't push until 16:45 — treat this as weak
positive evidence, not comfort. It changes nothing about the plan except to
confirm that abandoning a working system to join the scramble would be insane.

## 4. Finding 4 — the MTM discovery is a business-model *upgrade*, not a wound

Before today our answer to "who pays?" was a hand-wave at "the payer,
eventually." Now it's concrete, sourced, and mechanical:

- **The billing rail already exists:** CMS-mandated CMRs, Star-rating pressure
  on completion *and* on polypharmacy quality measures.
- **The buyer already budgets for this:** plans currently pay vendors +
  pharmacist call centers per completed CMR.
- **Our unit economics story:** an agent that conducts the interview turns a
  ~30-minute human task into a phone call that costs cents, *and* produces a
  clinically deeper artifact (cascade detection, ACB burden, citations) than
  the checkbox call it replaces. Same rail, 10x the payload, ~100x cheaper
  delivery. That is a real answer to Diana's "who pays" — better than anything
  we had this morning.

If a judge asks "isn't Arine going to crush you?": Arine is an analytics layer
bolted onto call centers, sold in enterprise cycles to plans. We are the
conversation itself, FHIR-native inside the provider's stack. When the
interview costs cents, the analytics layer becomes a feature. Incumbents
optimized for the checkbox economy don't cannibalize their own call-center
contracts — that's the innovator's-dilemma moat, and it's the honest version.

## 5. Alternatives, dispatched (so nobody reopens this at 2pm)

- **Pivot to a Stedi-first cost/eligibility product:** the empty-lane logic was
  real, but it's an *ingredient*, not a meal — and it's already scheduled as
  Commit B. Standalone, it's a feature, not a thesis. Rejected.
- **Pivot to clinician-inbox automation:** decent thesis, zero code, 5 hours.
  See pivot math in §0. Rejected.
- **Broaden Deprescribe into general "medication AI":** that direction is where
  Arine lives and where differentiation goes to die. The narrowness *is* the
  product. Rejected — and if anything, today taught us to get narrower and
  say "prescribing cascades" more often, since it's the one artifact no
  checkbox process can produce.

## 6. Updated ledger

- **Stick with Deprescribe, corrected pitch: top-3 ~70%, first ~40–45%**
  (unchanged from DOSSIER — the corrections don't add capability, they remove
  a detonation risk that was silently pricing in).
- Stick with *uncorrected* pitch: subtract ~10–15 points for the nonzero chance
  a judge knows the MTM landscape and pulls the thread on stage.
- Any pivot: **top-3 <15%.** Not a decision, a coin flip with worse odds.

### ⚠️ Where this verdict is most likely wrong
- **I only fetched Arine.** FeelBetter, MedWise, or a stealth startup may do
  something closer to patient-facing voice review. Mitigation: our claim no
  longer depends on *nobody* doing it — the corrected frame survives any
  incumbent short of "FHIR-native voice deprescribing agent at point of care,"
  and if that exists, it validates the category on the same slide.
- **The CMR framing could over-index the pitch toward payors** when the room's
  emotional center is patient care. Mitigation: business model stays in Q&A
  ammunition, not in the 5-minute demo. The demo remains the pill bag and the
  cascade.

---

## The order

1. **Now–11:25:** sweep all repo prose and scripts; kill every "nobody/no
   incumbent" absolute; install the funded-category frame (§1) in README + pitch.
2. Resume EXECUTE.md clock exactly as written (Commits A → B → C, video 13:30).
3. Add one Q&A drill card: "What about Arine / MTM vendors?" — answer is §4,
   last paragraph, out loud, twice.

The idea was never the risk. The overclaim was. It's fixed for the price of a
prose sweep, which is the cheapest structural repair anyone will make today.

**"Constantly seek criticism. A well thought out critique of whatever you're doing is as valuable as gold."** (source: Musk, various interviews, incl. SXSW 2018)

---

## 7. "What do we uniquely have?" — the Kahlus / external-data question (11:12am)

Asked directly: can we fold in Kahlus, other repos, or EEG/fMRI/medical data as a
moat? Verdict after reading Kahlus-V1 on disk: **no on the data, yes on the method.**

- **Kahlus-V1 code/data: rejected.** It's a leakage-controlled neural-translation
  benchmark (fMRI/EEG future-state forecasting under held-out splits). Zero honest
  bridge to a FHIR deprescribing agent. Forcing EEG into the demo is the exact
  integration theater EXECUTE.md bans — Ana would ask "what does the EEG *do* here?"
  and there is no answer. A fake edge is worse than no edge.
- **Other repos (robot arms, pupillometry, sites): rejected**, no overlap.
- **"Todd Comlean" research: not found on disk** (searched whole workspace). If it's
  external neural-interface work, it's Kahlus-adjacent, not Deprescribe-adjacent.

**What we actually, uniquely have (the real answer to "what does no one else have"):**
1. A **working voice→FHIR loop tested over a real phone call** — field re-scan at
   11:05 shows no other team has this yet.
2. A **refusal in the architecture** — `src/engine/detect.ts` is deterministic; the
   clinical decision never touches an LLM. "Our agent cannot hallucinate a drug
   interaction" is a sentence no GPT-in-a-chart team can say.
3. The **Kahlus rigor *method*, ported to healthcare** — claim gates, "not science"
   labels, explicit competitor registry, honest-scope discipline. That method is
   what caught our own Arine overclaim before a judge could. The edge is not
   proprietary data; it's that we build like people burned by leakage, in a domain
   where almost no one does.

**The trap named:** reaching for "unique proprietary data" feels safe but hackathons
are won on a working demo that lands one emotional beat and survives Q&A — which we
have (pill bag, cascade, live call, deterministic refusal). Data moats are a
different company. Don't let sunk cost drag fMRI into this room.

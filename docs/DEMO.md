# DEMO.md — everything for the last 30 minutes

Print this. Do not rely on scrolling anything at 16:50.

---

## SCRIPT A — live presentation (3:00, cuttable to 2:00)

### Pre-flight, done BEFORE you're called up (~5 min, at your seat)

```
cd project
npm run server           # leave running — poller catches calls, no tunnel needed
npm run panel:canned     # panel shows the full 13-finding dataset instantly
```

- Browser tab 1: http://localhost:3000/review — scrolled to the TOP. This goes on
  the projector. It needs no internet.
- Browser tab 2: Medplum console, open on your most recent demo patient's resource
  list (this one does need internet — load it while wifi works, don't reload on stage).
- Terminal visible-ish with `npm run panel:canned` already typed (your panic button —
  Enter repaints the panel in 3 seconds, zero network).
- Phone in pocket, charged. Demo line: **+1 (603) 457-8331** (calls run phone→Vapi
  cloud; venue wifi cannot break the call itself).
- DECIDE NOW, not on stage: doing the 45-second live call insert, or not.
  Default: do it if you've had one clean test call today.

### The talk track

**0:00 — Panel on screen, top of page. The frame:**

> Every AI health company is building tools that add. More diagnosis, more research,
> more documentation. The highest-return intervention in geriatric medicine is
> subtraction. Medication review is a mandated, funded category — and it's done as
> a compliance checkbox, which is why one in five seniors is still on an
> inappropriate med. The conversation that finds the cascade is what we automated.
> This is Deprescribe, on Medplum.

**0:20 — FORK.**

*WITH live call (45s):* phone on speaker, dial. Say "Before her visit, Margaret gets
a call." Answer as Margaret, three meds only:
- "Donepezil, ten milligrams — for my memory."
- "Oxybutynin, five milligrams, three times a day — for my bladder."
- "And there's a water pill... furosemide I think? My ankles were swelling something awful."

Hang up mid-interview, deliberately:

> It keeps going like this for eleven medications. That's live telephony — it heard
> me garble "Burosemide" and still resolved it. We ran the full interview earlier;
> here's everything it found.

*WITHOUT live call (say instead, 15s):*

> A voice agent interviews her before the visit — every medication, what she thinks
> each is for, and her symptoms, captured neutrally. The voice layer is live; I'm
> showing our full run for reliability. Here's what came back.

**1:05 — Scroll the panel slowly through the tiles:**

> Eleven medications in her own words. Anticholinergic burden eight — three is the
> threshold for cognitive risk. Thirteen findings, every one with a citation — Beers,
> STOPP, or a published trial. Detection is deterministic: table lookups, zero LLM
> calls. It cannot hallucinate an interaction.

**1:25 — Stop on the red chain diagram. Slow down. 20 seconds minimum:**

> Here's the one that matters. She takes amlodipine for blood pressure. Amlodipine
> causes ankle swelling — vasodilation, not fluid overload. So someone added
> furosemide, a diuretic — which does nothing for that mechanism. Furosemide raises
> uric acid. So she got gout. So she's on allopurinol.
>
> Three of her eleven medications exist only to treat side effects of the others —
> and she told us the story herself. Look at the quotes under each drug. You can only
> find a cascade by asking why each drug was started. That's why it needs a
> conversation, not a database query.

**2:05 — ⌘-Tab to the Medplum console:**

> It's all real FHIR in Medplum. And the cascades go in as DetectedIssue with the
> implicated drugs in causal order — the resource nobody uses, doing exactly what it
> was designed for. Note the statuses: preliminary, draft. Nothing is final without
> a clinician.

**2:25 — Back to panel, scroll to taper + objection:**

> It drafts a lorazepam taper from the published algorithm as a draft CarePlan with
> dated Tasks — and before any clinician sees it, a reviewer agent argues against it.

**2:40 — Stop scrolling. The company:**

> Nineteen percent of older adults in ambulatory care are on a potentially
> inappropriate medication. Medicare Advantage plans are graded on exactly this, and
> the STOPPFrail trial showed a thirty-three-to-one return. A structured medication
> review takes thirty minutes and isn't reimbursed — which is why it doesn't happen,
> and why it should be an agent — one that enhances the clinician instead of adding
> to their workload. Thank you.

### If squeezed to 2:00
Skip the call insert (use the WITHOUT line) and skip the 2:25 taper beat. Never cut
the chain (1:25) or the close (2:40).

### If anything breaks mid-talk
Hit Enter on the panic button (`npm run panel:canned`) — panel repaints in 3s — and
keep talking. If the console tab is dead, skip 2:05 entirely and add at the end:
"and everything you saw is written to Medplum as FHIR — happy to show any judge after."

---

## SCRIPT B — backup video (record TONIGHT, ≤3:00)

Setup: `npm run demo` first (fresh full data). QuickTime → New Screen Recording →
Options → Microphone ON (check the level meter). Panel tab + Medplum console tab
open. Do Not Disturb on. Save the file LOCALLY.

Same talk track as Script A with these changes:

- Use the WITH-call fork if you can get a quiet room — retakes are free tonight.
  Phone on speaker next to the mic.
- Replace the 0:00 line's ending with "...This is Deprescribe, built on Medplum" —
  the video may be watched without you there to introduce it.
- After recording: watch it back once. Checks: audio audible start to finish, the
  chain section took ≥ 20 seconds, total under 3:05, plays offline.

If a take dies, restart it. Do not ship a take where the chain was rushed.

---

## Judging criteria — say their words back

Official criteria, and where your pitch hits each. Weave the **bold phrases** in —
judges score against rubric language.

**1. Potential impact** — *"intelligent, standards compliant, automated, even voice
enabled, enhancing clinicians rather than adding to their workload"*:
- **Standards compliant** → seven FHIR resource types, `DetectedIssue` used per spec,
  draft/preliminary statuses (say "real FHIR, standards-compliant" at the console flip)
- **Voice enabled** → the live call / Deepgram end-to-end
- **Automated** → the whole pipeline runs unattended from hangup to chart
- **Enhancing clinicians, not adding workload** → the close (now word-for-word), plus:
  the 30-minute unreimbursed review arrives *done*, as drafts to approve
- **Patient care impact** → 18.8% on a PIM, ACB→falls/cognition, STOPPFrail 33:1

**2. Effective use of provided technologies** (*"Deepgram, Medplum, moss.dev, and/or
Stedi"* — "and/or": two used deeply beats four used thinly, say that with confidence):
- **Medplum** — system of record; the FHIR mapping IS the differentiator
- **Deepgram** — 100% of speech: Nova-3 in, Aura out, on our own Deepgram account
- **moss.dev** — named next step (see new Q&A below): semantic symptom matching
  *under* the deterministic layer
- **Stedi** — named next step: eligibility/coverage = the cost surface

## Numbers for the pitch

| Claim | Figure | Source |
|---|---|---|
| Polypharmacy in US adults 65+ | **42.0%** | 2023 nationally representative ambulatory cohort, n=81,295 (PMC10491561) |
| On a potentially inappropriate medication | **18.8%** | same cohort |
| Deprescribing ROI | **33.2:1 cost–benefit**, net €85,909 across 69 patients | STOPPFrail trial, frail nursing-home residents |
| Drug-cost savings alone | Covered the intervention **5×** even with zero adverse events avoided | same |
| ACB threshold | **≥ 3** associated with cognitive decline and falls | Anticholinergic Cognitive Burden scale |

**Cite the cohort, not a generic number.** PIM prevalence runs 45–57% in some
multi-site samples; if you say "58% of seniors" a clinician judge will ask which
population and you need the answer.

**Competitive read, in one sentence:** MDI Health, FeelBetter, and Arine all exist —
they are pharmacist-facing risk-stratification dashboards. Nobody has shipped a
*conversational* deprescribing agent. Say this proactively; it's a strength.

**Buyer:** Medicare Advantage plans and health systems, graded on CMS Star medication
measures. **Why now:** 2026 MA Star pressure plus voice quality finally crossing the
usability threshold for an 82-year-old.

---

## Judge Q&A — rehearse these

**"The prompt asked for cost transparency and data visualization. Where are those?"**
> We deliberately went deep on one vertical instead of shallow on eight. The prompt's
> through-line is doing the work before the visit — this is the highest-dollar version
> of that, and it's the one nobody's built. Cost is the natural next surface, and
> Stedi is exactly how we'd build it: every medication we stop has a price, an
> eligibility check tells you what her plan covers, and deprescribing is the only
> intervention here that *saves* money rather than spending it.

**"Why didn't you use moss.dev / how would you?"**
> Our clinical detection is deterministic on purpose — semantic search doesn't belong
> *in* that layer. Where moss fits is right below it: today symptom matching is
> substring-based, so "my legs puff up at night" wouldn't match "peripheral oedema."
> Moss's in-runtime semantic search maps patient language onto our symptom vocabulary
> in sub-ten milliseconds — fast enough for the live voice loop — and the
> deterministic rules still make every clinical call. That's the next integration.

**"Isn't this just a drug interaction checker?"**
> Interaction checkers fire on pairs from a static list and clinicians ignore them —
> that's alert fatigue. A cascade isn't an interaction. It's a *prescribing history*
> problem: drug B was added because drug A caused a symptom. You can only find it by
> knowing why each drug was started, which is why it needs a conversation and not a
> database query.

**"How do you know it won't hallucinate an interaction?"**
> It can't. Detection is deterministic — a hand-curated table lookup with zero LLM
> calls in `engine/detect.ts`. The model handles speech-to-structure and
> structure-to-prose. It never decides what's clinically wrong.

**"Is this a regulated device?"**
> We designed against the Non-Device CDS criteria. Clinician-facing, ranked options
> with a visible citation on every finding so the basis can be independently reviewed,
> nothing time-critical, and every resource written as draft or preliminary pending
> human sign-off. A patient-facing autonomous taper *would* be a device — we don't do
> that.

**If asked something you don't know:** "I don't know, that's the next thing we'd
validate." Do not invent a clinical claim in front of a physician.

---

## Cut list

Cut in this order if behind at 15:00:

1. The review panel UI → demo from the Medplum console instead. It's *better* for
   Medplum judges anyway.
2. The challenger pass.
3. The taper `CarePlan`.
4. Two of the four cascades — one confirmed chain is enough.

**Never cut:** the Medplum FHIR write-back, or the cascade chain detection. Those are
the only two things nobody else in the room will have.

---

## Failure modes

| If this breaks | Do this |
|---|---|
| Anything at all, mid-presentation | `npm run panel:canned` — full 13-finding dataset back on the panel in 3 seconds, zero network. This is the panic button; have it pre-typed. |
| Voice call fails / pipeline doesn't fire after hangup | The call itself is phone→Vapi cloud (wifi can't break it). Pickup is via the API **poller** — needs only outbound https, no tunnel. If nothing lands in ~30s: panic button + "the voice layer is live, I'm showing our full run for reliability." Nobody penalizes this. |
| RxNav times out or rate-limits | Already built — `OFFLINE_MAP` in `rxnav.ts` covers the demo drugs with verified RxCUIs, fires automatically as last resort. |
| Extraction returns malformed JSON | Already handled — `extractWithRetry` retries once then falls back to `minimalFallback`. |
| Medplum auth fails | Panel doesn't touch Medplum — demo from it. Keep the console tab loaded from the morning run; don't reload it on stage. |
| Anthropic rate limit | Only affects live-call processing, not the panel or fixture. Pre-run in the morning; panic button covers the rest. |
| Laptop dies / projector fails | The backup video (recorded the night before; re-record at 16:35 if anything changed). |

**Record the backup video at 16:35 regardless of how well things are going.**

---

## Rehearsal checklist

Three full run-throughs, out loud, standing up. After each, check:

- [ ] Did you say the amlodipine→furosemide→allopurinol chain **slowly enough** that a
      non-clinician followed it? This is the whole demo. Time it — it should take 20
      seconds, not 8.
- [ ] Did you flip to the Medplum console, or just talk about it?
- [ ] Did you finish under 3:00 without rushing the last 15 seconds?
- [ ] Does whoever presents know the STOPPFrail number and the 18.8% figure cold?
- [ ] Is the backup video recorded and playable offline?
- [ ] Is the terminal font big enough to read from the back of the room? (Check this
      at the actual venue, not on your desk.)

---

## Submission

Check the submission form the moment it opens — don't discover a required field at
16:55. Typical asks: repo URL, ≤3 min video, one-paragraph description, team names.

Draft description now:

> A voice agent interviews an older adult about their medications, then a deterministic
> rule engine detects potentially inappropriate medications, cumulative anticholinergic
> burden, and prescribing cascades — drugs prescribed to treat the side effects of
> other drugs. Findings are written to Medplum as FHIR MedicationStatement, Flag,
> RiskAssessment, and DetectedIssue resources with `implicated` in causal order, plus a
> draft CarePlan taper and a prescriber Communication awaiting clinician sign-off.
> Detection contains no LLM calls: every finding is a citation-backed table lookup, so
> the system cannot hallucinate an interaction. Synthetic data only.

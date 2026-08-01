# 04 — Diagnosis: `EXECUTE.md`, `DOSSIER.md`, `VERDICT.md`, `RESEARCH.md`

Written after reading them in full, plus the commit history, and diffing every claim in them
against the repo they describe.

> **Addendum, added after `RESEARCH.md` + `EVIDENCE.bib` landed at 11:22–11:24.** These are the
> best documents in the set and they resolve a criticism I was about to make. Three claims killed
> against PubMed primaries, each replaced by a *sourced* number: **"33:1 STOPPFrail return"** is
> dead (not in the primary RCT — replaced with Curtin 2020: −2.6 meds/patient, −$62/mo, no
> detected harm, p<.001); "nobody is paid to deprescribe" is dead; and the implied
> "deprescribing prevents falls" is dead (Phelan 2024 and Herrinton 2023 are null on falls).
> Reading abstracts in full rather than trusting secondary summaries is exactly the discipline
> this pitch needed, and the corrections log is the artifact to show Ana. **Everything in the
> "audits the pitch, not the system" diagnosis below still stands** — but the pitch half is now
> in good shape, and `EVIDENCE.bib` should be the single source for every clinical number
> anyone says out loud.

**Summary judgement:** these are good documents with one structural blind spot and one scheduling
error that would have cost the first 45 minutes of the day. The blind spot is not carelessness —
it is a specific, nameable gap: **all three audit the pitch, and none audits the system.**

---

## What these documents get right

**The Arine / MTM correction is the best single piece of thinking in the three files, and it
corrects an error I also made.** `VERDICT.md` §1 kills "nobody is paid to take a medication away"
with primary sources — Arine (45+ health plans, 30M+ lives, 40M+ recommendations/yr), CMS-mandated
CMRs, Star-rated completion — and replaces it with *funded category, bad execution*. That is a
**stronger** claim than the one it replaces, and it is true. An empty market is usually empty for
a reason; a full market executing badly for a documented incentive reason is exactly the setup
Diana Hu's vertical-agents thesis describes.

My own earlier draft had the mirror-image error: an "MTM billed for 0.02% of Part D
beneficiaries" line that **conflates Part B CPT codes with the Part D CMR completion measure**
(actually 10–16%, with Star-Ratings cut-points now 48–89%). Both of us found the same class of
defect from opposite directions. Use the `VERDICT.md` frame; drop mine.

**The "why won't Epic do this" answer is the best sentence in either corpus:**
*EHRs monetize documentation volume, not subtraction.* Keep it exactly as written.

**The People's Choice catch is the best operational call of the day.** `DEMO.md` scheduled the
video for "tonight," in a contest decided by a `sort` on view counts at 17:00. Moving to a 13:30
upload is free points. `EXECUTE.md` Failure 2 is correct and the deadpan about writing an
operational runbook with a scheduled failure in it is deserved.

**Also right:** the hard freeze at 15:30 with the negative-expected-value argument; the
one-beat-per-judge choreography; quoting the criteria verbatim in the close; Commit C's design
(moss with a synonym-table fallback so the demo cannot regress — the best-engineered of the three
commits); the Q&A drill cards; and the decision not to pivot, which two independent frontier
models later confirmed.

---

## The structural blind spot

`VERDICT.md` is a genuinely rigorous adversarial review — **of the narrative**. It states the
principle exactly right:

> "The idea was never the risk. The overclaim was."

And then applies it only to prose. **Nobody adversarially reviewed the system.** As of the last
commit, the repo still contains — all **[verified]** by direct read, details and fixes in
[02-DEFECTS.md](02-DEFECTS.md):

| Location | The problem |
|---|---|
| `panel.ts:285` vs `writers.ts:109` | UI says "nothing is final"; `RiskAssessment.status = 'final'` |
| `panel.ts:340` vs `server.ts:147` | UI says "review halted & escalated"; the handling is `console.warn` |
| `server.ts:98,101` | Every live caller gets `DEMO_CONDITIONS` / `DEMO_DURATIONS` |
| `server.ts:88` | `processedCalls.add` fires before the pipeline — a failed call never retries |
| `seed.ts:104` | Conditions created as `code: { text }` — **no codings at all** |
| `engine.test.ts` | **Zero assertions** |
| `seed.ts:92` / `panel.ts:292` / `DOSSIER.md` §2 | The patient is 83, 82, and 78 |

`EXECUTE.md` §3 enumerates four failure modes and misses the largest one:
**the technical-conscience judge opens the panel or the repo and catches the product lying.**

That risk is larger than the Arine overclaim the morning was spent fixing, because it is
*discoverable without asking a question*. And it is aimed at the two judges with the strongest
stated positions on honesty: the Medplum CTO who led an FDA Class II clearance and publishes FHIR
guidance, and the Deepgram community lead who publishes a project checklist.

Note the irony `VERDICT.md` half-noticed: a project about auditing overconfident prescriptions,
whose UI overstates what its own code does.

---

## Three errors that will cost you

### 1. Commit B is aimed at a locked door, in the first slot on the clock

`DOSSIER.md` Commit B (~60 min) routes Stedi "through Medplum's own integration pattern" at
`medplum.com/docs/integration/stedi`. That operation — `$stedi-check-eligibility` — runs on the
Medplum **Insurance Eligibility Bot**, and **Bots are not enabled on the free tier**; they require
contacting Medplum **[researched]**.

Scheduled at 10:55–11:40, this burns the freshest 45 minutes of the day against a paywall,
stacked on account-signup risk, for a sponsor with **no judge in the room**, to produce a dollar
figure that Commit B's own spec sources from *public generic prices, cited*.

If you keep Stedi at all, call it directly and write `CoverageEligibilityRequest` /
`CoverageEligibilityResponse` through `MedplumClient` yourself — same FHIR shape, same demo beat,
no gate. The adjudicated recommendation is to **cut it entirely and narrate the omission** — see
[01-PLAN.md](01-PLAN.md).

### 2. The dollar line fails the deletion test

Beat 5 is "coverage ✓, plus annual cost of the deprescribed meds," and it's the People's-Choice
money shot. But **a 271 returns no drug-level pricing.** The number is computed offline from
public generic prices and merely *displayed next to* a Stedi check. Delete Stedi and the number
is unchanged.

**Keep the beat, drop the sponsor attribution.** Price it from public data and say so. It is the
strongest line in the pitch and it never needed Stedi.

### 3. The headline probabilities are advocacy

| Document | Time | P(1st) | P(top-3) |
|---|---|---|---|
| `EXECUTE.md` | 10:53 | 35% | 60% |
| `DOSSIER.md` | 10:59 | 40–45% | 70% |
| `VERDICT.md` | 11:05 | 40–45% | ~70% |
| Fable 5 (independent) | — | ~31% best case | — |
| GPT-5.6-Sol (independent) | — | ~31% best case | — |

The estimate rose ten points across twelve minutes and three documents that added **zero
capability** — `VERDICT.md` concedes this explicitly ("the corrections don't add capability").
That is a morale ratchet, not evidence.

Two frontier models, adjudicating independently and then debating, both landed at ~31% for the
*best available option* and both explicitly labeled anything above 35% as advocacy. For scale: a
~35-team field means the average team is at ~3%, so 40–45% claims roughly **14×** the field —
with two false UI claims still live in the build.

**Why this matters operationally, not just intellectually:** a team that believes 45% protects a
lead that doesn't exist. A team that believes 24–31% keeps fixing detonation risks.

---

## Smaller corrections

**The Deepgram score is generous.** `EXECUTE.md` §1 gives Naomi and Victor 7/10. Deepgram is
reached *through Vapi*, which is **not a sponsor**, and `nova-3-medical`, keyterm prompting,
Aura-2 and Flux are all unused. The proudest beat — "Deepgram heard 'Burosemide' and RxNorm
recovered it" — reads to a Deepgram engineer as *you skipped keyterm prompting*, the documented
feature for that exact problem (their doc shows a drug name going 0.71 → 0.97). **Turn keyterms
on, then tell the story as before/after.** That converts a liability into the platform feedback
Victor is employed to collect.

**The Naomi intel is thin, and she is the cheapest lock in the room.** `DOSSIER.md` lumps her with
Victor as "rewards hard conditions." She judged Berkeley 2026 (141 voice projects) and blogged
that the winners won in *"the 24 hours before"* judging — she walks the floor to teams who reach
out. She publishes a checklist: live deployed app, complete README with setup + demo link +
screenshots, secrets in env vars, no debug code, **accessibility met**. And she forked
`medplum-patient-intake-demo` and filed a PR on 2026-07-30 — she has *run* the reference demo.
**The clock contains zero minutes for talking to judges.** That is the highest-ROI omission in it.

**"We are not in [the crowded lane]. Good."** — the most dangerous belief in the three documents.
The *thesis* isn't in the crowded lane; the *opening* is. ~30–40% of the field is predicted to
build pre-visit voice intake → FHIR, and P(≥5 teams look indistinguishable for the first 45
seconds) is >80%. `DOSSIER.md`'s own choreography puts the cascade — the one un-fakeable moment —
at **2:10**. Move it to second 5. Zero code, biggest single gain on the board.

**`npm test` at the freeze is a green light over a file with zero assertions.** A check that
checks nothing is the same genus of defect as "halted & escalated," in front of the judge whose
whole profile is knowing the difference between a claim and a measurement.

**The winner-corpus statistics are unverifiable from this repo.** `EXECUTE.md` §1 cites
`/Users/aayu/yc-hackathon-analysis.md` — a file on one machine, not committed. "Winners median 29
commits, losers median 8" also has no causal story; commit count is a proxy for nothing a judge
scores. Ana is exactly the judge who asks where a number came from. Either commit the analysis or
stop citing the number.

**The field scan is weak evidence and `VERDICT.md` half-admits it, then banks the comfort
anyway.** Six repos in a ~35-team field, scanned at midday. The dangerous teams don't push before
16:45.

**A third patient age.** `DOSSIER.md` §2 says the demo patient is 78 and builds a thematic
argument on it ("78 → the CMS/Medicare mock is thematically perfect"). The seed says 1943 (age
83); the panel hardcodes 82. Emblematic of the whole diagnosis: the intel outran the repo.

---

## The single highest-value correction

**Delete Commit B and give its 75 minutes to the defect sweep.**

Both adjudicators reached this independently. The argument is one sentence: *every item on the
defect list is a way to lose points in front of a specific named judge, and nothing in Commit B is
a way to win any.*

With that one swap, the rest of `EXECUTE.md` is worth running approximately as written.

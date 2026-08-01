# 01 — The merged plan

This is the plan two frontier models converged on after independent analysis and a debate round.
It is not a replacement for `EXECUTE.md` — it is `EXECUTE.md` with **one block deleted and two
added**. The video/distribution/rehearsal/freeze spine of that document is correct and is kept.

---

## The verdict in one line

**Recostume: keep the engine, change the costume.** The deterministic cascade engine is the only
uncommon working clinical mechanism available. What's broken is the opening, the sponsor mix, and
the sentences the code can't back.

---

## What changes from EXECUTE.md

**DELETE — Commit B (Stedi), entirely.** Four reasons, in descending order of force:

1. **No Stedi employee is on the panel.** Diana Hu (YC), Cody Ebberson (Medplum), Ana Yoon Faria
   de Lima (Pavoot), Naomi Carrigan (Deepgram), Victor Wang (Deepgram), Sri Raghu Malireddi
   (moss). Every other sponsor has a judge who scores recognition. Stedi has none.
2. **The blessed path is behind a paywall.** DOSSIER Commit B routes through Medplum's
   `$stedi-check-eligibility`, which runs on the **Insurance Eligibility Bot** — and Bots are
   **not enabled on the free tier**; they require contacting Medplum **[researched]**. As
   scheduled, it burns the freshest 45 minutes of the day against a locked door.
3. **It fails the deletion test.** The demo beat is "coverage ✓ plus the annual cost of the
   deprescribed meds" — but a 271 does not return drug-level pricing. DOSSIER's own spec sources
   that dollar figure from *public generic prices, cited*. Delete Stedi and the number is
   unchanged. That is the definition of prize-farming, and a Stedi-aware judge sees it.
4. **The rubric says "and/or."** Three interdependent sponsors beat four chips with one false
   causal role.

**KEEP the dollar beat.** Price it from public generic prices and say so. It's the strongest
line in the pitch and it never needed Stedi.

**NARRATE the omission** — 30 seconds of Q&A ammunition, zero build time:

> "Stedi's one honest job in a deprescribing demo is a coverage checkmark. We chose depth on the
> three sponsors whose depth is load-bearing — and we can tell you exactly what a 270/271 can and
> cannot say about a drug someone is *stopping*."

Winners name the thing they refuse to do. This converts an absence into a scope decision.

**ADD — the 75-minute defect sweep** ([02-DEFECTS.md](02-DEFECTS.md)) in Commit B's old slot.

**ADD — real test assertions** (~30 min). `npm test` at the freeze is currently a green light
over a file with zero assertions.

---

## The clock

Two people. A = code, B = story/video. Adjust start time as needed; the shape is what matters.

| Time | A (code) | B (story) |
|---|---|---|
| **+0:00–1:15** | **Defect sweep.** Both false UI claims; `RiskAssessment` → `preliminary`; age from `birthDate`; real SNOMED/ICD codings on seeded Conditions; move `processedCalls.add` after success | Prose sweep — kill every "no incumbents" absolute, install the funded-category frame. Draft the video script. Dollar beat from public generic prices, cited |
| **+1:15–2:00** | **Un-hardcode the live path.** `DEMO_CONDITIONS`/`DEMO_DURATIONS` → Medplum reads. Idempotent seed | **Shoot the video, ≤60s. Public by 13:30.** Pill bag → the garbled-drug-name phone clip → panel repaint → drafts in Medplum |
| **+2:00–2:45** | Finish the read path. **Real assertions:** hero cascade, negative-control patient, red-flag path | **Distribution blitz**, ≥10 places. Then reorder the panel and script: cascade graph on screen by **second 5** |
| **+2:45–3:30** | **moss seam.** 45-minute hard timebox, synonym-table fallback so the demo cannot regress. Latency badge **only if measured** | Q&A cards: the six from EXECUTE §6, plus "what about Arine," plus the narrated Stedi omission |
| **+3:30–4:00** | **AuditEvent** per pipeline run + one panel line | Rehearsal prep. **Floor pass at 15:00** — Deepgram and moss tables. Plan one check-back before 17:00 |
| **+4:00–4:15** | Only if green: `nova-3-medical` + patient-specific keyterms via the existing Vapi config | — |
| **15:30** | **HARD FREEZE.** `npm test` (now actually asserting), typecheck, `panel:canned` verified offline | — |
| **15:30–16:15** | Re-record the backup capture — the panel changed, so this is mandatory | Rehearsal ×2, live path and canned path, both timed |
| **16:15–16:50** | **Submit.** Repo, video link, README first paragraph verbatim | Same |

**Drop order under slippage:** keyterms config → moss (ships as an honestly-labeled branch) →
AuditEvent. The sweep, the read path, the assertions, the video and the rehearsals are **never**
dropped.

**Not on this plan, deliberately:** Stedi, teach-back, the discharge pivot, any direct-Deepgram
infrastructure migration, new detection rules, the challenger persona, Medplum Bots, WebSocket
subscriptions, a React rewrite, general UI beautification.

---

## The three moves that actually change the score

### 1. Open on the cascade, at second 5

Zero code. The single cheapest fix available.

The field prediction says ~30–40% of teams build "voice agent interviews patient pre-visit →
FHIR," and P(≥5 projects look indistinguishable from ours for the first 45 seconds) is **>80%**
**[researched]**. Our thesis is genuinely uncommon — medication optimization was ~3% of ~95
surveyed hackathon projects, and *zero* implemented a real rule engine. But DOSSIER's own
choreography spends 0:40 on the pill-bag story and 1:30 on the live call before the cascade lands
at **2:10**. The one un-fakeable moment we own is buried behind the most generic 90 seconds in the
building.

Put "Three medications. One root cause." on screen at second five. The phone call becomes *how*,
not *what*.

### 2. Make Medplum causal, not a write sink

Reading the chart before the call — and using it to seed keyterms — turns the host's platform
from a place results get dumped into a **precondition** for the result existing. Same edit as
D4. Half of the second published criterion, one afternoon.

### 3. moss, scoped ruthlessly

One index over drug names — brand, generic, and lay variants. Query per utterance for candidate
retrieval; **RxNav stays the authoritative validator**; the deterministic table still makes every
clinical call. Show a *measured* latency number on screen — that is the co-founder judge's entire
career thesis.

Two demo queries: a jargon one ("amlodipine besylate") and a lay one ("my water pill").

⚠️ **[unverified]** — moss's `SessionIndex` and the `alpha` knob could not be independently
confirmed in research. Spend **20 minutes** proving the real SDK installs and queries repeatably
*before* committing the 45. If it fights you, ship the synonym fallback and spend the hour on the
evaluation table instead. Do not debug moss for three hours.

---

## Honest numbers

| Scenario | Best decision | P(1st) |
|---|---|---|
| 20 hours, standing start | Recostume | **~31%** |
| ~6 hours, current repo | This plan | **~21–24%** |
| Current repo, no changes | — | ~5–8% |
| Ceiling, everything lands clean | — | **~32–33%** |

Top-3 for the 6-hour plan: **~45–55%**. People's Choice with a 13:30 upload and a real blitz:
**~25–35%**, essentially independent of the judges.

Both adjudicators rejected anything above 35% as advocacy. The base rate in a ~35-team field is
~3%, so 31% is already a ~10× claim. See [05-ALTERNATIVES.md](05-ALTERNATIVES.md) for the
derivation and for what a higher number would require.

---

## The one thing

**Spend the first 75 minutes making the product unable to be caught lying — before adding
anything a judge might reward.**

The scoring is asymmetric. A missing feature costs you a fraction of one criterion. A caught
falsehood costs you the credibility of everything else you said. `VERDICT.md` already proved the
team knows this principle — it found a fatal overclaim in the pitch and replaced it with a
stronger true claim. It just stopped at the prose and never checked the UI or the code.

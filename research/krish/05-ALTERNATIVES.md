# 05 — The pivot question, answered

*"Are there other projects we could do? Maybe pivot slightly or entirely — is there anything that
gets us higher than 25%?"*

**Answer: no.** But the question was worth asking, and the process that answered it produced the
three changes that matter most in [01-PLAN.md](01-PLAN.md).

---

## How this was decided

Four Opus 5 agents generated candidates in parallel under **deliberately divergent framings** so
they couldn't converge:

1. **Clinician-burden lens** — ideas from "enhancing clinicians rather than adding to their workload"
2. **Sponsor-native** — working backward from the four sponsor APIs
3. **Cheap pivots** — reusing the existing ~2,600-line codebase
4. **White space** — anti-consensus; predict the field, then avoid it

Then **Fable 5 (high)** and **GPT-5.6-Sol (xhigh)** adjudicated the whole option set
**independently**, without seeing each other's work. Then each read the other's answer and
debated. Both verdicts and both debate rounds are preserved verbatim in the workspace research
directory.

---

## The ranking (post-debate)

Self-scores from the generating agents are shown to make the advocacy inflation visible.

| # | Candidate | Self-score | Adjudicated | Why |
|---|---|---|---|---|
| 1 | **Recostume Deprescribe** | 33% | **~31%** | Keeps the only uncommon working mechanism; deepens three sponsors without inventing a fourth |
| 2 | The 48-Hour Call | 38% | ~28–29% | Best impact evidence in the corpus; surrenders execution certainty |
| 3 | Incumbent + fixes, old costume | 25% | ~23–24% | Fine, but caps itself on the saturation problem |
| 4 | PREFLIGHT | 35% | ~23–25% | Great statistic; Diana has funded this category three times |
| 5 | ECHO (teach-back) | 28% | ~19–22% | Good closed-loop logic, lower technical ceiling. Better as a module |
| 6 | CONSULTA (live interpreter) | 32% | ~21% | Exceptional judge fit, high clinical + integration risk |
| 7 | Ask the Chart | 32% | ~20–24% | moss-maximal; one step from "chat with the chart," a crowded lane |
| 8 | SWITCHBOARD (stop → switch) | 33% | ~19–26% | Re-imports clinical judgement into a zero-LLM engine |
| 9 | Deprescribe & Cover | 30% | **~17–19%** | No START detector, no substitution engine. Not a 2-hour add |
| 10 | GROUNDWIRE | **40%** | **~15–20%** | Central proof is unsound — see below |
| — | Current repo, untouched | — | ~5–8% | Two false UI claims and a hardcoded live path |

---

## The three findings worth keeping

### GROUNDWIRE died on mechanism — and both models killed it the same way, independently

The highest-scoring generated idea was: *hear it (Deepgram Flux) → ground it to a real code
(moss) → prove the code is real by transacting with a payer (Stedi) → store with Provenance
(Medplum)*. Its one-liner was excellent: **"a hallucinated code is a rejected transaction."**

It does not survive contact with X12. **A 270/271 transacts member identity and service-type
codes — not RxNorm or ICD-10 clinical codes. A wrong RxCUI is invisible to a 271.** The
"REJECTED — not in RxNorm" verdict on its own wow screen is moss-side; the payer proves nothing
about the code. And since Stedi mock mode accepts only exact approved payloads, a *dynamic*
retrieved-code → transaction loop cannot be truthfully demoed in test mode at all.

Sol's phrasing: **"stagecraft, not technical truth."**

Two frontier models, opposite reasoning traditions, no contact, same fatal flaw. That is about as
strong as this kind of evidence gets — and 40% was advocacy.

### The white-space finding that redirected everything

> **The core is white space; the costume is the most saturated garment in the room.**

Medication optimization was ~3% of ~95 surveyed hackathon projects, and **zero** implemented
Beers/STOPP-START with cascade detection. P(five other teams build pre-visit voice *medication
review*) is <3%. **But P(≥5 teams look indistinguishable from us for the first 45 seconds) is
>80%** — and our one un-fakeable moment currently lands at 2:10.

That asymmetry is the entire argument for **recostuming rather than pivoting**: the moat is real,
the packaging is generic, and packaging is cheap to change.

### The signal hiding in the disagreement

Four generators with deliberately adversarial lenses **all put the incumbent's deterministic
engine inside their own winner.** When independent adversarial processes converge on one
component, that component is the signal and the 28–40% wrappers around it are marketing.

---

## What the debate actually changed

Three real concessions, each to an argument rather than to split a difference:

**Fable gave up its own #1.** Its 74%-reuse figure for the 48-Hour Call came from a ledger that
priced the *canned* pipeline as if it were the live one — but `explain`/`taper`/`challenger` run
only in `demo/run.ts`, and the live path is hardcoded (defect D6). Re-aiming a thinner-than-
advertised pipeline at a new frame costs more than budgeted, which erodes exactly the buildability
edge the ranking depended on.

**Both landed on omitting Stedi**, and Fable found the argument Sol hadn't: **there is no Stedi
employee on the judging panel.** Every other sponsor has a judge who scores recognition.

**The Scenario B gap closed from both ends.** Sol came down from 28% (its estimate assumed
best-case integration against a repo with zero test assertions). Fable came up from 15–18% after
Sol caught an internal contradiction — Fable had written that the cheap fixes "hold most of the
recoverable probability," then priced the 6-hour version 13 points below the 20-hour one. Both
can't be true.

**Source asymmetry, disclosed:** Sol read all 2,595 lines of `src/`. Fable was permission-blocked
from the source tree and worked from a reuse ledger. On code-level facts Fable explicitly
deferred, which is why Deprescribe & Cover fell from 28% to ~18%.

---

## The ceiling, and why it isn't 45%

**~32–33%** for a two-person team here, requiring **all** of: the cascade legible inside ten
seconds; zero false safety or FHIR-status claims; Deepgram visibly used for medical-term capture
rather than named through a non-sponsor wrapper; moss resolving a genuinely hard spoken drug
description with measured latency; Medplum supplying starting context *and* receiving reviewable
preliminary evidence; a multi-axis evaluation that includes failures; a live path that works
repeatedly with an honest fallback; and ideally one clinician validating the terminology.

Even then you lose roughly two times in three.

Be numerate about what these numbers mean. A ~35-team field puts the average at ~3%. So:

- **31%** ≈ 10× the field
- **35%** ≈ 12× the field, and favored roughly 1:2 against everyone else combined
- **45%** ≈ 14–15× the field, which is not a number this evidence base can support

The residual ~67% is irreducible: an unknown field that may contain a clinician-founded team or a
genuine technical first; live-demo variance, which is the largest single-event risk; judge
deliberation dynamics; and the fact that first prize is Diana Hu's interview — **she is scoring
founders, not products**, and twenty hours cannot manufacture founder-market fit.

**The honest posture:** maximize the executable ~31%, protect it with rehearsed fallbacks, and
treat People's Choice as a second, nearly uncorrelated ticket that a 13:30 upload very nearly
decides on its own.

---

## Ideas worth keeping for later

Not for today, but the research stands up and the reasoning is preserved in the workspace files:

- **The 48-Hour Call** — post-discharge reconciliation: call two days after discharge holding the
  hospital's `MedicationRequest` list and diff it against the actual bottles. Better impact
  evidence than the current framing (measured 2.13× 30-day ED hazard; a CMS deadline; a billing
  code), immune to the Beers "1.8% of ADE ED visits" counterpunch, and it makes reading Medplum
  intrinsic. **The single best post-hackathon product direction found.**
- **Teach-back verification** — everyone explains *to* the patient; nobody verifies receipt. Cheap
  as a closing beat.
- **STOPPFall** — falls-risk detector, ~88% reuse of the existing engine.
- **The 271's `authOrCertIndicator`** (`Y`/`N`/`U`) as a free, mock-testable prior-auth primitive.
  Almost nobody knows it exists. Useless here; genuinely valuable if the product ever needs PA.

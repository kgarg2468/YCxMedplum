# 02 — The defect list

Every item below was **[verified]** by reading the file in this repo. These are ordered by how
much they cost if a judge finds them, not by how hard they are to fix.

The governing principle, from the debate: **one caught falsehood reprices every true claim in
the demo to zero.** The panel contains the person who wrote Medplum's FHIR honesty guidance and
a judge whose entire profile is knowing the difference between a claim and a measurement. This
list is not polish. It is loss prevention.

---

## Tier 1 — the product currently says things that are not true

### D1. "Nothing is final" vs `status: 'final'`
- `src/ui/panel.ts:285` renders: *"preliminary / draft — nothing is final without a clinician."*
- `src/fhir/writers.ts:109` writes `RiskAssessment` with `status: 'final'`.
- Also `writers.ts:46` (Flag) and `writers.ts:83` (Goal) are `status: 'active'` — not drafts either.

**Why it's fatal:** the human-in-the-loop story is the project's entire safety posture and its
main lock on the Medplum judge. Three files away, the code contradicts it. A judge who opens the
repo — and at least one will — finds the product asserting a safety property it does not have.

**Fix (~20 min):** either change `RiskAssessment.status` to `preliminary` and Flag/Goal to a
non-active status, **or** change the UI to render each resource's actual status. Rendering the
real status is stronger: it turns an overclaim into a transparency feature.

### D2. "Review halted & escalated" is a `console.warn`
- `src/ui/panel.ts:340` renders: *"⚠ Red flags — review halted & escalated."*
- `src/server.ts:147` — the entire handling is `if (flags.length) console.warn('⚠ RED FLAG:', ...)`.
  The pipeline does not halt. Nothing is escalated.

**Why it's fatal:** this is a *safety* claim about a system that talks to elderly patients. It is
the single most dangerous sentence in the repo.

**Fix (~25 min):** implement the halt (return before writing findings) and create an urgent FHIR
`Task`, **or** change the copy to what actually happens ("red flags surfaced for clinician
review"). Implementing it is better and is nearly as cheap.

### D3. Three different ages for the same patient
- `src/fhir/seed.ts:92` — `birthDate: '1943-04-12'` with the comment `// 82 years old`.
  On 2026-08-01 she is **83**.
- `src/ui/panel.ts:292` — hardcoded `<span>Margaret Okonkwo, 82</span>`.
- `research/aayu/DOSSIER.md` §2 says the demo patient is **78**, and builds a thematic argument
  on it ("78 → the CMS/Medicare mock is thematically perfect").

**Fix (~15 min):** compute age from `birthDate` at render time; delete the hardcoded name/age
from `panel.ts`; correct the pitch doc. The comment in `seed.ts` is also wrong and should go.

---

## Tier 2 — the live system is not the demoed system

### D4. Every live caller gets Margaret's chart
- `src/server.ts:98` — `conditions: DEMO_CONDITIONS`
- `src/server.ts:101` — `durationsWeeks: DEMO_DURATIONS`

Both are imported from `src/fhir/seed.ts`. **Any** caller's review is computed against the demo
patient's conditions and durations.

**Why it matters:** the question this panel is most likely to ask is *"how do I know that isn't
hardcoded?"* Right now the honest answer is that it partly is. If a judge calls the number, a
second patient inherits Margaret's history.

**Fix (~1.5h):** read real history from Medplum (`Patient/$everything`) and pass it into
`runReview`. This is the same edit that converts Medplum from write-only to read+write, which is
half of the second published criterion. Highest value-per-hour item in the repo.

### D5. A failed call can never retry
- `src/server.ts:88` — `processedCalls.add(callId)` fires **before** the pipeline runs.

One transient failure (RxNav timeout, Anthropic 429, Medplum hiccup) permanently swallows that
call. On stage this looks like the demo silently doing nothing.

**Fix (~10 min):** move `processedCalls.add(callId)` to after the pipeline succeeds.

### D6. Half the pipeline only runs in the canned path
`explainFinding`, `buildTaper`, `challenge`, `writeTaperPlan`, `writePrescriberMessage` are all
called from `src/demo/run.ts` (lines 92, 98, 108, 145, 151). **`runPipeline` in `server.ts` calls
none of them.** The screen shown in the canned demo is not the screen a live call produces.

**Fix:** either wire them into the live path, or — cheaper and honest — cut them from what you
show. Do not demo a screen a live call cannot produce.

### D7. A new Margaret every server run
`seedDemoPatient` is not idempotent, so each run creates another Patient. Cody Ebberson's
published guidance is explicit about idempotent seeding.

**Fix (~20 min):** search by identifier before creating, or use a conditional create.

---

## Tier 3 — the checks that check nothing

### D8. `src/test/engine.test.ts` has zero assertions
It is a `console.log` script. `npm test` at the 15:30 freeze is a green light over a file that
cannot fail.

**Why it matters:** both adjudicators independently called this the same genus of defect as D1
and D2 — a claim with nothing behind it. And the negative-control test is the on-stage answer to
D4's question.

**Fix (~30 min), three assertions:**
1. The hero cascade (amlodipine → furosemide → allopurinol) is detected.
2. **Negative control:** a second patient without the symptom does *not* get the cascade.
   This is the proof artifact for "it isn't hardcoded."
3. A red flag triggers whatever D2 decides the behaviour is.

### D9. Seeded Conditions carry no codes
- `src/fhir/seed.ts:104` — `code: { text }`, with no `coding` array.

Medplum's CTO publishes a rubric for AI-generated FHIR whose most-repeated item is **hallucinated
or missing LOINC/SNOMED/ICD-10 codes** — he names it twice **[researched]**. Bare `text` on a
coded element is the adjacent failure, in the one repo he is most likely to open.

**Fix (~30 min):** add real SNOMED CT or ICD-10 codings for the handful of demo conditions.
Verify each code — inventing one is strictly worse than leaving `text`.

---

## The 75-minute sweep

If you do nothing else from this document, do this. Both adjudicators independently named it the
highest-value block on the clock, and it replaces Commit B (Stedi), which is aimed at a paid-tier
door — see [04-DIAGNOSIS-aayu-docs.md](04-DIAGNOSIS-aayu-docs.md).

| # | Item | Est. |
|---|---|---|
| D1 | Render real FHIR statuses / fix `RiskAssessment` | 20 min |
| D2 | Implement the halt + urgent `Task`, or fix the copy | 25 min |
| D3 | Age from `birthDate`; delete hardcoded name/age | 15 min |
| D5 | Move `processedCalls.add` after success | 10 min |
| D9 | Real codings on seeded Conditions | 30 min |

Then, in the next block: **D4** (Medplum read path, ~1.5h) and **D8** (assertions, ~30 min).

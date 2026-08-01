# research/krish — start here

Research and adjudication for the YC × Medplum Agentic Healthcare Hackathon, Aug 1 2026.

Produced by a multi-model process: four parallel idea-generation agents (Opus 5), then two
frontier models (Fable 5 at high, GPT-5.6-Sol at xhigh) adjudicating **independently**,
then a debate round where each read the other's answer. Where they disagreed, the
disagreement is recorded rather than averaged away.

## The files

| File | What's in it | Read if |
|---|---|---|
| [01-PLAN.md](01-PLAN.md) | The merged hour-by-hour plan. What to delete from EXECUTE.md and what to add. | You are about to write code |
| [02-DEFECTS.md](02-DEFECTS.md) | Every verified defect with `file:line` and the fix. The highest-value work in the repo. | You are about to write code |
| [03-RESEARCH.md](03-RESEARCH.md) | Rubric, six judge profiles, four sponsor APIs with their gotchas, field prediction, what wins hackathons. | You want the evidence base |
| [04-DIAGNOSIS-aayu-docs.md](04-DIAGNOSIS-aayu-docs.md) | Diagnosis of EXECUTE.md / DOSSIER.md / VERDICT.md — what's right, what's wrong, what will break. | You wrote those docs, or are following them |
| [05-ALTERNATIVES.md](05-ALTERNATIVES.md) | The pivot question: ten candidate projects scored, why every pivot lost. | You are wondering if we picked the wrong project |
| [06-PITCH.md](06-PITCH.md) | Corrected claims, the statistics that survive scrutiny, Q&A ammunition, the two claims to stop making. | You are writing the pitch or the video |

Aayusha's docs are in [`../aayu/`](../aayu/). For clinical numbers, `../aayu/RESEARCH.md` and
`docs/EVIDENCE.bib` are authoritative — they're PubMed primaries with a corrections log, and they
supersede any statistic in my files or hers that predates them.

## The one-page version

**Verdict: recostume. Do not pivot.** Keep the deterministic cascade engine — it's the only
uncommon working clinical mechanism in the building. Change the *costume*: the opening, the
sponsor mix, and every sentence the code cannot back.

**The single highest-value change to the current plan:** delete Commit B (Stedi) and give its
75 minutes to the defect sweep in [02-DEFECTS.md](02-DEFECTS.md). Every item on that list is a
way to *lose* points in front of a specific named judge. Nothing in Commit B is a way to win any.

**Three decisions that came out of the adjudication:**

1. **Omit Stedi.** There is no Stedi employee on the judging panel. The rubric says "and/or."
   The dollar figure comes from public generic prices, not from a 271. And the Medplum-blessed
   `$stedi-check-eligibility` path runs on a **paid-tier Bot**. Narrate the omission as a scope
   decision — don't stay silent about it.
2. **Open on the cascade, second 5.** ~30–40% of the field is predicted to build "voice agent
   interviews patient pre-visit → FHIR." Our thesis isn't in that lane; our *opening* is.
3. **Fix the lies before adding features.** Two claims currently rendered in the UI are
   contradicted by the code three files away, in front of the judge who led an FDA Class II
   clearance and the judge who publishes an honesty checklist.

**Honest probability.** Two models, independently: **~31%** P(1st) for the recostumed project
with a full day, **~21–24%** from where the repo stands now with ~6 hours. Ceiling ~32–33%.
Both explicitly rejected anything above 35% as advocacy rather than analysis. For scale: a
~35-team field puts the average team at ~3%, so 31% already claims ~10× the field.

People's Choice is a **separate, nearly uncorrelated ticket** worth ~25–35% and is decided
almost entirely by upload time. That is the cheapest prize in the building.

## Confidence markers used throughout

- **[verified]** — I read the file or fetched the page myself
- **[researched]** — from a research agent with a cited primary source
- **[unverified]** — plausible, load-bearing, and *not yet confirmed*. Check before betting hours on it.

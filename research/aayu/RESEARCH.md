# RESEARCH.md — Clinical Evidence Base (Primary Sources)

> Pulled directly from PubMed, 2026-08-01 11:20 PT. Machine-readable citations in
> [`EVIDENCE.bib`](../../docs/EVIDENCE.bib). This file is the human version: what each study
> found, what we're allowed to say on stage, and what we must never claim.

---

## 1. STOPPFrail deprescribing works — RCT

**Curtin et al., 2020, J Am Geriatr Soc (PMID 31868920, doi:10.1111/jgs.16278)**
RCT, n=130, age ≥75, frail, on 5+ drugs.

- Meds at 3 months: **−2.6** (intervention) vs −0.36 (control); diff 2.25,
  95% CI 1.18–3.32, **p<.001**
- Monthly drug cost: **−$74.97** vs −$13.22; diff $61.74/mo, p=.02
- Falls, hospitalizations, QoL, mortality: **no significant differences**
  (underpowered for those endpoints)

**Say:** "STOPPFrail-guided deprescribing removed 2+ medications per patient and
cut drug costs, with no detected harm, in a randomized trial."
**Never say:** "33:1 ROI" — that ratio does not exist in the primary literature.
We used to say it. It's dead. See §Corrections.

## 2. Our demo cascade is a published JAMA finding

**Savage et al., 2020, JAMA Internal Medicine (PMID 32091538,
doi:10.1001/jamainternmed.2019.7087)**
Population cohort, Ontario, age 66+: n=41,086 new CCB users vs 297,933 controls.

- New CCB (e.g., **amlodipine**) → **loop diuretic within 90 days**:
  **HR 2.51 (95% CI 2.13–2.96)** vs unrelated-drug controls; ~2.99 in days 31–60
- Cumulative 90-day incidence: 1.4% vs 0.5%

**Say:** "The cascade in our demo isn't hypothetical — JAMA Internal Medicine
measured it in 41,000 older adults. New amlodipine users are 2.5x more likely to
be put on a loop diuretic within 90 days. Our agent catches exactly this."
This is the strongest citation we own. It **is** the demo, quantified.

## 3. Deprescribing is safe — and the failures name our wedge

**Herrinton et al., 2023, JAMA Network Open (PMID 37428504)** — RCT, n=2,470,
age 76+: bundled deprescribing via mailers/EHR in an already-integrated system.
Result: no med reduction vs usual care, and **no adverse drug withdrawal effects**.

**Phelan et al., 2024, JAMA Network Open (PMID 39052289)** — cluster RCT, n=2,367:
CNS-active med deprescribing outreach. No falls reduction, but **1.79x TCA
discontinuation (95% CI 1.29–2.50, p=.001)** when patients engaged. No adverse
withdrawal effects.

**Say (defense):** "Across recent large RCTs, supervised deprescribing shows no
adverse withdrawal effects. Stopping correctly is safe."
**Say (offense — the wedge):** "The big trials that failed, failed at *getting
drugs stopped* — the interventions were letters and EHR flags. Engagement moved
discontinuation 1.8x. The bottleneck is the conversation. That's the part we
automated."

## 4. PIM prevalence — the market stat

Our headline stays: **18.8% PIM rate in a 2023 ambulatory cohort, n=81,295**
(already cited in README). Literature range across settings/criteria runs
~19–57% (Beers/STOPP, community vs inpatient). Always name the cohort; never
quote the top of the range as "seniors in general."

## 5. Anticholinergic burden → hard outcomes

**Graves-Morris et al., 2020, Front Pharmacol (PMID 32411001)** — systematic
review + meta-analysis, 18 cohorts, **n=498,056**: higher anticholinergic burden
associated with **increased mortality**; most evidence from the ACB scale — the
exact scale our panel computes.

**Uusvaara et al., 2011, Drugs & Aging (PMID 21275438)** — prospective: users of
anticholinergics had **~3x hospital days/person-year** (14.9 vs 5.2, p<.001).

**Say:** "An ACB of 8 is not a trivia number — higher burden is associated with
increased mortality in a meta-analysis of half a million patients, and triple
the hospital days in prospective cohorts."

---

## Corrections log (claims we killed today)

| Old claim | Why it died | Replacement |
|---|---|---|
| "Nobody is paid to deprescribe; zero incumbents" | Arine (40M recs/yr, 45+ plans), CMS-mandated MTM/CMRs | Funded-category-bad-execution frame (VERDICT.md §1) |
| "33:1 STOPPFrail return" | Not in the primary RCT; unsourceable | −2.6 meds/patient, −$62/mo, no harm (Curtin 2020, p<.001) |
| Deprescribing "prevents falls" (implied) | Phelan 2024 and Herrinton 2023 are null on falls | "Safe, fewer meds, lower cost; the bottleneck is the conversation" |

The pattern in all three: an absolute or a ratio nobody could source. The fix in
all three: the sourced number, which is *more* persuasive because it survives
the follow-up question.

---

*Method: PubMed E-utilities (esearch/efetch), abstracts read in full for every
effect size quoted. No secondary summaries trusted. LaTeX entries with the same
annotations: [`EVIDENCE.bib`](../../docs/EVIDENCE.bib).*

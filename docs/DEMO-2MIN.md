# DEMO-2MIN.md — "One call. Every clinician sees everything."

The 2-minute cut: problem → solution (plain language) → live-call clip + UI +
Medplum console → technical detail → close. No named patient persona — the demo
data is synthetic and we present it generically.

---

## Key UI features (redesign priorities — what must read instantly on stage)

1. **Above the fold carries the whole story.** In a 2-minute demo you may never
   scroll: stat tiles + chain diagram + the patient's stated preference must fit
   on one screen. Promote "what the patient would stop" from mid-page to the
   top, next to the tiles.
2. **A "prescribed by / practice" dimension on the med list.** The cross-practice
   angle needs visual evidence — add a source column (synthetic is fine:
   "Cardiology", "Primary care", "Urology") and tag the chain drugs by
   prescriber. *Single highest-impact change for this angle.*
3. **A standalone "Patient concerns" strip** — compact chips (dry mouth ·
   near-fall · foggy mornings) instead of symptoms living only inside findings.
4. **The chain diagram stays the hero** — with each node tagged by prescriber,
   so the wow moment and the fragmentation story land as one image.
5. **The patient's verbatim words stay prominent** — the quotes are the proof
   the story only had to be told once.
6. **Unresolved / needs-clarification flags must pop** — the "nothing gets lost
   or guessed" trust signal.
7. **Projector rules:** big type, high contrast, generous spacing; nothing under
   ~15px.
8. **Citations + draft-status footer stay visible** — the credibility layer for
   clinician judges; one glance, no reading required.

**Honesty guardrail:** the "what they'd stop" data is the patient's **stated**
preference, captured verbatim as a FHIR Goal (`expressedBy` = patient). Present
it as "the patient's own priorities" — never as a model prediction.

---

## The 2:00 outline

**0:00–0:20 — The problem.**
> Medication harm sends about one and a half million Americans to the emergency
> room every year — over six hundred thousand of them are adults sixty-five and
> older. Rarely because any single prescription was wrong: two in five older
> adults take five or more medications, usually from different prescribers, and
> no one sees the whole picture. The worst case is the prescribing cascade — a
> drug prescribed just to treat the side effect of another drug — and finding
> one takes a conversation nobody is paid to have.

*(Stat gate: **CLOSED**. Verified 2026-08-01 against the live CDC FastStats page
and pinned in `docs/EVIDENCE.bib` as `cdc_ade_faststats`. Both figures are exact:
>1.5M ED visits/yr, ~500k hospitalized, 65+ accounting for >600k, "more than
twice as often as younger people.")*

*(⚠️ Q&A landmine on this stat: in adults 65+, anticoagulants, diabetes agents and
opioid analgesics cause ~59.9% of those ED visits (Shehab, JAMA 2016) — and those
are **not** the drugs our engine targets. If asked "your tool doesn't touch the
drugs actually sending people to the ER": "Correct, and we don't claim that number
as our addressable market. It's the scale of medication harm, not our target. What
we address is the subset nobody is staffed to catch — drugs that are only there
because of another drug." Never imply we prevent the 1.5M.)*

**0:20–0:35 — The solution, in plain language.**
> Ours happens automatically. Before a visit, the patient gets a phone call — no
> app, no portal — and goes through their medications once. Every clinician who
> treats them then sees one shared review: everything they take across all their
> prescribers, the concerns they raised, what they'd most like to stop, and
> every risk we found — each one backed by a citation.

**0:35–1:15 — Show it.** *(clip first, then screens)*
- Play ~10–15s of a **recorded live call** — include the vague-name moment
  ("a water pill... furosemide, I think?")
- **UI walkthrough**: stat tiles → the cascade chain diagram (slow — this is the
  wow moment: three drugs, multiple prescribers, one root cause, visible only
  because the data is finally in one place) → patient concerns → what they'd stop
- **Medplum console flip**: the same review as draft FHIR resources awaiting
  clinician sign-off

**1:15–1:50 — How it works (now the technical beat).**
> Deepgram handles all speech, both directions — it survived garbled drug names
> over real telephony. Extraction is schema-constrained and allowed to say
> "I don't know" rather than guess. Names resolve through RxNorm, never through
> the model. And detection is fully deterministic — citation-backed lookup
> tables, zero LLM calls — so the system cannot hallucinate a drug interaction.
> Everything lands as standards-based FHIR in Medplum, which is why any
> practice's system can read it, and why every artifact is a draft until a
> clinician approves it.

**1:50–2:00 — Close.**
> The patient tells their story once, by phone. Every clinician treating them
> sees all of it — the medications, the concerns, the risks — with citations.
> That's enhancing clinicians without adding to their workload.

---

## Cut order if squeezed below 2:00

1. Shorten the call clip to one utterance (~7s)
2. The technical beat compresses to two sentences: deterministic detection
   (cannot hallucinate) + FHIR drafts (clinician approves)
3. Never cut: the chain diagram walkthrough or the close

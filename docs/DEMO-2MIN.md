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
> Forty-two percent of adults over sixty-five take five or more daily
> medications, usually from multiple prescribers across different practices —
> and nearly one in five is on a medication considered inappropriate for their
> age. The worst version of this is the prescribing cascade: a drug prescribed
> just to treat the side effect of another drug. Finding one takes a thirty-
> minute conversation about why each medication was started — a conversation
> nobody is paid to have, so it almost never happens.

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

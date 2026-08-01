# DEMO-2MIN.md — "One call. Every clinician sees everything."

The 2-minute cut, built on the cross-practice angle: one phone call for the
patient, one shared picture for every clinician who treats her.

---

## Key UI features (redesign priorities — what must read instantly on stage)

1. **Above the fold carries the whole story.** In a 2-minute demo you may never
   scroll: stat tiles + chain diagram + the patient's stated preference must fit
   on one screen. Promote "What she'd stop" from mid-page to the top, next to
   the tiles.
2. **A "prescribed by / practice" dimension on the med list.** The cross-practice
   angle needs visual evidence — add a source column (synthetic is fine:
   "Cardiology", "Primary care", "Urology") and tag the chain drugs by
   prescriber. *Single highest-impact change for this angle.*
3. **A standalone "Patient concerns" strip** — compact chips (dry mouth ·
   near-fall · foggy mornings) instead of symptoms living only inside findings.
4. **The chain diagram stays the hero** — with each node tagged by prescriber,
   so the wow moment and the fragmentation story land as one image.
5. **The patient's verbatim voice stays prominent** — the quotes are the proof
   she only had to say it once.
6. **Unresolved / needs-clarification flags must pop** — the "nothing gets lost
   or guessed" trust signal.
7. **Projector rules:** big type, high contrast, generous spacing; nothing under
   ~15px.
8. **Citations + draft-status footer stay visible** — the credibility layer for
   clinician judges; one glance, no reading required.

**Honesty guardrail:** the "what she doesn't like" data is her **stated**
preference, captured verbatim as a FHIR Goal (`expressedBy` = patient). Present
it as "the patient's own priorities" — never as a model prediction.

---

## The 2:00 outline

**0:00–0:15 — The problem is fragmentation.**
> Margaret, 82, sees four prescribers across three practices. Every visit she
> re-tells her medication story from memory — and each clinician sees only their
> own slice. Key detail dies in the retelling.

**0:15–0:35 — The tool: one phone call, one shared picture.**
> Before any visit she gets a phone call — no app, no portal, no login. A phone
> is the one piece of technology every 82-year-old already uses. She goes
> through her pill bag once. That's her entire burden.

*(Optional: play ~10 seconds of a recorded call — the "water pill... furosemide
I think?" moment.)*

**0:35–1:05 — Flip to the panel: what every clinician now sees.**
- Every medication she actually takes — across all prescribers, in her own
  words, resolved to real drug codes
- Her concerns — the symptoms she reported, unprompted and unfiltered
- What she'd stop if she could — her own words ("the sleeping pill... I just
  want to feel clear again"), captured as part of the record, so the clinician
  walks in already knowing what the patient wants to talk about

**1:05–1:35 — The chain: what fragmentation was hiding.** *(the wow moment — slow)*
> Amlodipine → furosemide → allopurinol. Three drugs, three prescribers, each
> acting reasonably on the slice they could see. Nobody saw the whole picture —
> that's how cascades happen, and this finding only exists because the data
> finally lives in one place.

**1:35–1:50 — Why any practice can use it.**
> It's all standards-based FHIR in Medplum — not a proprietary silo. Any
> practice's system can read these resources. And everything is a draft awaiting
> clinician sign-off: the system informs, the clinician decides.

**1:50–2:00 — Close.**
> The patient tells her story once, by phone. Every clinician treating her sees
> all of it — the drugs, the concerns, the things she'd stop — with citations.
> That's enhancing clinicians without adding to their workload.

---

## Cut order if squeezed below 2:00

1. The optional call clip (0:15 saved)
2. The FHIR beat compresses to one sentence inside the close
3. Never cut: the chain (1:05) or the close (1:50)

# Hey — read this first

This is **Deprescribe**: a voice agent that interviews an older adult about their
medications before a doctor visit, then a deterministic engine finds the drugs that
shouldn't be there — including **prescribing cascades** (drugs prescribed to treat
side effects of other drugs). Everything lands in Medplum as real FHIR resources
for a clinician to review. Built for the YC × Medplum Agentic Healthcare Hackathon
(Aug 1, 2026).

The pitch in one line: every AI health tool *adds* — more diagnosis, more docs.
The highest-return intervention in geriatric medicine is **subtraction**, and
nobody has built an agent for it.

## Status: it works, end to end, tested over a real phone call

- ☎️ Called **+1 (603) 457-8331** (live Vapi number), role-played the patient
- Deepgram heard "Jonipezil" and "Burosemide" through phone audio — pipeline still
  resolved donepezil and furosemide correctly
- Engine found the headline chain live: **amlodipine → furosemide → allopurinol**
  (her blood-pressure drug caused swelling → got a water pill → which caused gout →
  got a gout drug. 2 of those 3 drugs treat side effects of the first one.)
- FHIR resources written to Medplum automatically ~15s after hangup
- A review dashboard that repaints itself seconds after the call ends
  (`npm run server`, then open `localhost:3000/review` — it ships with a full
  demo dataset via `npm run panel:canned`, so you can see it without any keys)

## Try it in 2 minutes (no keys needed)

```bash
npm install
npm test          # offline engine test — 12 findings, ACB 8, the chain
```

With an Anthropic key in `.env` (`cp .env.example .env`):

```bash
npm run demo:fast # full pipeline vs canned transcript, no Medplum needed
```

## The one architectural rule

`src/engine/detect.ts` has **zero LLM calls**. The model turns speech into
structure and structure into prose — it never decides what's clinically wrong.
Every finding is a hand-curated table lookup with a real citation (Beers 2023,
STOPP/START v3, named trials). That's why it can't hallucinate an interaction,
which is the first thing a clinician judge will probe.

Full reasoning for every design decision: **[docs/DECISIONS.md](docs/DECISIONS.md)**
(it's written as judge-question prep — the war stories in there are good).

## Map

```
src/voice/     Vapi system prompt + red-flag patterns; createAssistant.ts configures Vapi from code
src/llm/       extraction (schema-constrained, allowed to say "I don't know") + explain/taper/challenger agents
src/rxnav.ts   spoken text → RxNorm ingredient (the join key for everything)
src/engine/    THE DIFFERENTIATOR — deterministic detection: PIMs, cascades, ACB, duplicates
src/data/      the curated clinical knowledge tables
src/fhir/      Medplum writers — DetectedIssue with implicated[] in causal order is the deep cut
src/ui/        the review panel (server-rendered, zero deps, works on dead wifi)
src/server.ts  webhook + a poller that makes the demo tunnel-free
docs/          SETUP (creds), DEMO (presentation scripts), DECISIONS (the why)
```

## Where you could plug in

Ideas > assignments — grab whatever pulls you:

- **Medplum Bot** — move the engine into a Bot triggered on MedicationStatement
  creation. Platform-native, strong pitch line, engine is already a pure function (~1–2h)
- **Cost/coverage surface** — Stedi (hackathon sponsor) has an eligibility API in
  test mode; "what does stopping 3 drugs save, and what does her plan cover" is the
  prompt's cost-transparency ask
- **Knowledge tables** — spot-check `src/data/knowledge.ts` against AGS Beers 2023
  / STOPP v3, add rules (pure data entry + citation, no code)
- **Panel polish / patient-facing view** — `src/ui/panel.ts` is one file of HTML
- **Extraction benchmark** — mumble drug names at the phone number, measure what
  survives; it's the path that breaks in the real world

Setup for Medplum/Vapi credentials when you need them: [docs/SETUP.md](docs/SETUP.md).
Everything here is synthetic data — Margaret Okonkwo is fictional.

# Graph Report - .  (2026-08-01)

## Corpus Check
- Corpus is ~21,247 words - fits in a single context window. You may not need a graph.

## Summary
- 197 nodes · 342 edges · 17 communities detected
- Extraction: 73% EXTRACTED · 27% INFERRED · 0% AMBIGUOUS · INFERRED: 91 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Server, Webhook and Demo Runtime|Server, Webhook and Demo Runtime]]
- [[_COMMUNITY_Cascade Confirmation and Demo Beats|Cascade Confirmation and Demo Beats]]
- [[_COMMUNITY_Deterministic Detection Engine|Deterministic Detection Engine]]
- [[_COMMUNITY_FHIR Writers and Resource Mapping|FHIR Writers and Resource Mapping]]
- [[_COMMUNITY_LLM Extraction and Prose Agents|LLM Extraction and Prose Agents]]
- [[_COMMUNITY_Review Panel and Presentation Scripts|Review Panel and Presentation Scripts]]
- [[_COMMUNITY_Infra, Credentials and Voice Config|Infra, Credentials and Voice Config]]
- [[_COMMUNITY_Market Thesis and Pitch Numbers|Market Thesis and Pitch Numbers]]
- [[_COMMUNITY_Regulatory Stance and Judge Q&A|Regulatory Stance and Judge Q&A]]
- [[_COMMUNITY_RxNorm Identity Resolution|RxNorm Identity Resolution]]
- [[_COMMUNITY_Knowledge Table Scale Limits|Knowledge Table Scale Limits]]
- [[_COMMUNITY_Extraction Benchmark Gap|Extraction Benchmark Gap]]
- [[_COMMUNITY_Medplum Bot Migration Path|Medplum Bot Migration Path]]
- [[_COMMUNITY_Donepezil-Oxybutynin Cascade|Donepezil-Oxybutynin Cascade]]
- [[_COMMUNITY_FHIR R4 Type Discipline|FHIR R4 Type Discipline]]
- [[_COMMUNITY_Vapi Assistant Re-sync|Vapi Assistant Re-sync]]
- [[_COMMUNITY_Patient Recall Prompts|Patient Recall Prompts]]

## God Nodes (most connected - your core abstractions)
1. `runReview()` - 16 edges
2. `main()` - 15 edges
3. `persistReview()` - 12 edges
4. `runPipeline()` - 10 edges
5. `Decision 7 — the FHIR mapping is the Medplum differentiator` - 10 edges
6. `resolveOne()` - 9 edges
7. `Decision 1 — the LLM never decides what is clinically wrong` - 9 edges
8. `resolveAll()` - 8 edges
9. `extractWithRetry()` - 8 edges
10. `End-to-end pipeline diagram (call → extract → rxnav → detect → FHIR)` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Repo map — what lives in each src/ directory` --references--> `resolveOne()`  [INFERRED]
  TEAM.md → src/rxnav.ts
- `End-to-end pipeline diagram (call → extract → rxnav → detect → FHIR)` --references--> `resolveAll()`  [INFERRED]
  README.md → src/rxnav.ts
- `NIH RxNorm canonical ingredient resolution (unresolved ≠ guessed)` --references--> `resolveAll()`  [INFERRED]
  README.md → src/rxnav.ts
- `Join key: lowercase RxNorm ingredient name` --references--> `resolveAll()`  [INFERRED]
  CLAUDE.md → src/rxnav.ts
- `Live review panel at /review` --references--> `renderReviewHtml()`  [INFERRED]
  README.md → src/ui/panel.ts

## Hyperedges (group relationships)
- **Transcript → extract → RxNorm → detect → FHIR pipeline** — readme_voice_interview, extract_extractwithretry, rxnav_resolveall, detect_runreview, writers_persistreview [EXTRACTED 1.00]
- **Three kinds of work, three owners (LLM / deterministic tables / LLM)** — decisions_1_llm_never_decides, readme_architectural_rule, extract_extract, detect_runreview, agents_explainfinding, knowledge_pim_rules [EXTRACTED 1.00]
- **The amlodipine→furosemide→allopurinol chain, end to end** — readme_margaret_cascade_chain, decisions_amlodipine_furosemide_mechanism, decisions_savage_jama_2020, knowledge_cascades, detect_detectcascadechains, writers_writecascades, demo_chain_beat [EXTRACTED 1.00]

## Communities

### Community 0 - "Server, Webhook and Demo Runtime"
Cohesion: 0.13
Nodes (21): main(), vapi(), Decision 8 — the webhook has a poller behind it, Retry-then-fallback plumbing so the pipeline never dies, Rationale: free tunnels die; the demo has no inbound network dependency, Failure-mode table and mitigations, extractWithRetry(), minimalFallback() (+13 more)

### Community 1 - "Cascade Confirmation and Demo Beats"
Cohesion: 0.09
Nodes (23): Verification gate: typecheck && test must print ACB 8 / 12 findings / the chain, Decision 4 — cascades are the product, and CONFIRMED is earned, Mechanism: amlodipine oedema is vasodilation, not volume overload, Structural cascade is suspicion; CONFIRMED needs the reported symptom, Live-testing bug: the treater's stated indication IS the linking symptom, Neutral symptom review — never lead the witness, Savage, JAMA Intern Med 2020 (citation), Rationale: the hard part is the conversation, not the lookup (+15 more)

### Community 2 - "Deterministic Detection Engine"
Cohesion: 0.21
Nodes (18): CLAUDE.md — rules for AI coding assistants, The one rule: detect.ts and knowledge.ts contain zero LLM calls, Decision 5 — PIMs, ACB, duplication, no-indication detectors, conditionMatches(), detectAnticholinergicBurden(), detectCascades(), detectDuplicates(), detectNoIndication() (+10 more)

### Community 3 - "FHIR Writers and Resource Mapping"
Cohesion: 0.23
Nodes (17): DetectedIssue.implicated must stay in causal order, Unresolved meds keep verbatim words — never guess a code, Decision 7 — the FHIR mapping is the Medplum differentiator, DetectedIssue is the deep cut — implicated[] + mitigation used per spec, Cut list — and the two things never to cut, Draft submission description, Deliberate statuses: preliminary / draft / preparation, Conversation output → FHIR resource mapping table (+9 more)

### Community 4 - "LLM Extraction and Prose Agents"
Cohesion: 0.2
Nodes (13): buildTaper(), challenge(), explainFinding(), Anthropic API notes (output_config.format, no prefill, no temperature), LLMs are used in exactly two places (extract, agents), callJson(), callText(), Decision 2 — extraction is allowed to say "I don't know" (+5 more)

### Community 5 - "Review Panel and Presentation Scripts"
Cohesion: 0.17
Nodes (12): Pre-flight checklist before being called up, SCRIPT A — 3-minute live presentation, SCRIPT B — backup video recorded the night before, cascadeFlow(), esc(), findingCard(), renderBody(), renderReviewHtml() (+4 more)

### Community 6 - "Infra, Credentials and Voice Config"
Cohesion: 0.12
Nodes (16): Every recommendation surface must show its citation, Model split: haiku-4-5 for voice loop, sonnet-5 for extraction/prose, Decision 9 — review panel is server-rendered HTML with zero deps, out/last-review.json snapshot + mtime repaint without scroll reset, Rationale: why not RAG — retrieval still ends with a model deciding, Clinician-in-the-loop: the agent proposes, never directs, FDA Non-Device CDS criteria (21st Century Cures §520(o)(1)(E)), Fresh-machine bootstrap (clone, install, copy .env) (+8 more)

### Community 7 - "Market Thesis and Pitch Numbers"
Cohesion: 0.13
Nodes (16): ACB is cumulative across the regimen; Margaret sits at 8, Rationale: say "curated subset" — honesty beats overclaiming, The system in one paragraph, Buyer and why-now: MA plans, CMS Star measures, 2026 pressure, Rationale: cite the cohort, not a generic prevalence number, Competitive read — MDI Health, FeelBetter, Arine are dashboards, Numbers for the pitch (42.0%, 18.8%, 33.2:1, ACB ≥ 3), PMC10491561 — 2023 ambulatory cohort, n=81,295 (citation) (+8 more)

### Community 8 - "Regulatory Stance and Judge Q&A"
Cohesion: 0.17
Nodes (15): Decision 10 — the regulatory answer (Non-Device CDS), Decision 1 — the LLM never decides what is clinically wrong, Asymmetric risk design — harmful hallucination impossible, harmless one allowed, Rationale: a null is a finding; a wrong guess is dangerous and invisible, Rationale: no hallucination, real citation, identical output every run, Judge Q&A — rehearsed answers to the predictable probes, Judging criteria mapping — say the rubric's words back, Judge Q&A: moss.dev fits below the deterministic layer (+7 more)

### Community 9 - "RxNorm Identity Resolution"
Cohesion: 0.25
Nodes (13): Join key: lowercase RxNorm ingredient name, Decision 3 — RxNorm resolves drug identity, not the LLM, Bigram Dice ≥ 0.5 guard on fuzzy matches → unresolved, not garbage, War story: raw Lucene scores, "a water pill" → water, "Ultra Mide", NIH RxNorm canonical ingredient resolution (unresolved ≠ guessed), approximateMatch(), exactMatch(), getJson() (+5 more)

### Community 10 - "Knowledge Table Scale Limits"
Cohesion: 0.5
Nodes (4): What breaks at scale — conversation quality and Rx-history integration, Roadmap: grow tables toward full STOPP/START with pharmacist review, Roadmap: prescription-history ingestion to pre-suspect cascades, Contribution area: spot-check and extend the knowledge tables

### Community 11 - "Extraction Benchmark Gap"
Cohesion: 0.67
Nodes (3): Extraction accuracy: 8/8 on one live call, no formal benchmark yet, Roadmap: formal extraction benchmark on real med-rec conversations, Contribution area: extraction benchmark against mumbled names

### Community 12 - "Medplum Bot Migration Path"
Cohesion: 0.67
Nodes (3): Why Medplum — headless FHIR-native platform, Bot as next step, Roadmap: rule engine as a Medplum Bot on MedicationStatement create, Contribution area: move the engine into a Medplum Bot

### Community 13 - "Donepezil-Oxybutynin Cascade"
Cohesion: 1.0
Nodes (2): Mechanism: donepezil → oxybutynin, the self-cancelling pair, Gill 2005 — archetypal prescribing cascade (citation)

### Community 14 - "FHIR R4 Type Discipline"
Cohesion: 1.0
Nodes (1): FHIR R4 only — types from @medplum/fhirtypes, writes via MedplumClient

### Community 15 - "Vapi Assistant Re-sync"
Cohesion: 1.0
Nodes (1): npm run vapi:setup after changing prompt.ts / createAssistant.ts

### Community 16 - "Patient Recall Prompts"
Cohesion: 1.0
Nodes (1): If the patient forgets: OTC/supplement prompts, read-back, patient-reported flag

## Knowledge Gaps
- **40 isolated node(s):** `Thesis: subtraction is the highest-return geriatric intervention`, `Pre-visit voice interview through the pill bag`, `Quickstart commands (npm test / panel:canned / server / demo)`, `Clinician-in-the-loop: the agent proposes, never directs`, `Red flags halt the review and escalate, checked every turn` (+35 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Donepezil-Oxybutynin Cascade`** (2 nodes): `Mechanism: donepezil → oxybutynin, the self-cancelling pair`, `Gill 2005 — archetypal prescribing cascade (citation)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `FHIR R4 Type Discipline`** (1 nodes): `FHIR R4 only — types from @medplum/fhirtypes, writes via MedplumClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vapi Assistant Re-sync`** (1 nodes): `npm run vapi:setup after changing prompt.ts / createAssistant.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Patient Recall Prompts`** (1 nodes): `If the patient forgets: OTC/supplement prompts, read-back, patient-reported flag`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `runReview()` connect `Deterministic Detection Engine` to `Server, Webhook and Demo Runtime`, `Cascade Confirmation and Demo Beats`, `LLM Extraction and Prose Agents`, `Regulatory Stance and Judge Q&A`?**
  _High betweenness centrality (0.258) - this node is a cross-community bridge._
- **Why does `main()` connect `Server, Webhook and Demo Runtime` to `Cascade Confirmation and Demo Beats`, `Deterministic Detection Engine`, `FHIR Writers and Resource Mapping`, `LLM Extraction and Prose Agents`, `RxNorm Identity Resolution`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **Why does `End-to-end pipeline diagram (call → extract → rxnav → detect → FHIR)` connect `LLM Extraction and Prose Agents` to `Deterministic Detection Engine`, `FHIR Writers and Resource Mapping`, `Review Panel and Presentation Scripts`, `Market Thesis and Pitch Numbers`, `RxNorm Identity Resolution`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `runReview()` (e.g. with `runPipeline()` and `main()`) actually correct?**
  _`runReview()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `main()` (e.g. with `extractWithRetry()` and `checkRedFlags()`) actually correct?**
  _`main()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `persistReview()` (e.g. with `runPipeline()` and `main()`) actually correct?**
  _`persistReview()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `runPipeline()` (e.g. with `extractWithRetry()` and `resolveAll()`) actually correct?**
  _`runPipeline()` has 6 INFERRED edges - model-reasoned connections that need verification._
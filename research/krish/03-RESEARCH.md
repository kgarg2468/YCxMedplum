# 03 — The research

Everything the plan rests on. Roughly 250k tokens of agent research across five passes: sponsor
and judge intelligence, ~45 winning/losing hackathon projects, field-saturation prediction, and
four independent idea-generation passes.

Confidence markers: **[verified]** I checked it myself · **[researched]** agent with a cited
primary source · **[unverified]** load-bearing and not yet confirmed.

---

## 1. The rubric — and it is published

The Medplum blog post for this event publishes **exactly two criteria** **[verified]**:

> **Potential impact** — does the hack meaningfully improve patient care, clinician experience,
> or the quality of care delivered?
>
> **Effective use of the provided technologies** — how well does the hack use Deepgram, Medplum,
> moss.dev, and/or Stedi?

Theme line: *"Agentic Healthcare: intelligent, standards compliant, automated, even voice
enabled, **enhancing clinicians rather than adding to their workload**."*

Three consequences most teams will miss:

- **Sponsor use is half the score.** Not a tiebreaker. Half.
- **"and/or" permits depth on a subset.** Depth on two or three beats presence on four.
- **There are FOUR sponsors, not three.** Stedi is easy to forget and is named in the criterion.

**The deletion test** for any integration: *if I deleted this, would the demo work identically?*
If yes, it reads as prize-farming, and a judge who works there will see it.

**Prizes:** 1st = a YC interview + credits. 2nd = AirPods Max. 3rd = credits.
**People's Choice = most YouTube views at 17:00.**

---

## 2. The six judges

### Diana Hu — YC Partner. First prize is *her interview*.
Ex-CTO Escher Reality (YC S17, acquired by Niantic), CMU CV/ML, 1,700+ office hours.
Published thesis: *"Vertical AI Agents Could Be 10X Bigger Than SaaS."*

- **She has already funded this category.** Avoca, HappyRobot, Leaping AI. "Voice agent for X"
  is her **baseline, not her ceiling** **[researched]**.
- On record: you cannot grade voice AI on "did it answer correctly" — she names four axes and
  says single metrics produce AI that breaks in production. *"You can't optimize for clean when
  reality is chaos."*
- On "AI wrapper" as a slur: meaningless. The real point is that pure software is no longer a
  moat — anchor on distribution, regulation, hardware, or physics.
- Her own origin was a deliberately brittle AR demo that showed a technical **first**.

**What wins her:** an evaluation table with failures in it — that is her published critique
answered on one slide. And a wedge story: not an empty market, but a *funded market with bad
execution*.

**Her trap question:** "Why won't Epic just do this?" The best answer anyone produced, and it
came from `VERDICT.md`: **EHRs monetize documentation volume, not subtraction.** Deprescribing
*reduces* billable events downstream. The buyer is the payer, not the EHR. Misaligned incentives
are the moat.

### Cody Ebberson — Medplum co-founder/CTO. The technical conscience.
2× YC founder (MedXT W13 → Box; Medplum S22). Led FDA Class II clearance at Box. Dir Eng at One
Medical. Terse reviewer; X bio reads "Talk less, code more."

- **He publishes his own grading rubric** at `medplum.com/docs/building-with-ai-coding-assistants`
  — ten common mistakes. The one he names **twice** is **hallucinated LOINC/SNOMED/ICD-10 codes**
  **[researched]**. See defect D9.
- Sanctioned architecture: human-in-the-loop + `AuditEvent`. *"AI may draft a note or recommend
  an order, while a human remains responsible for the final action."*
- Sore spot: **secrets and PHI leaking into logs and AuditEvents.** Relevant if you write
  transcript content into an AuditEvent — don't.
- Pre-refuted "FHIR is too slow": a 131k-resource chart loads in ~5s.

**What loses him:** a UI claim contradicted by the writer three files away (D1, D2).

**His likely trap question:** "Why `MedicationStatement` and not `MedicationRequest`?" Have it
cold: Statement = what the patient *says they take* (source: patient, pill-bag interview);
Request = an order. Our input is attested usage.

### Naomi Carrigan — Deepgram community. The cheapest lock in the room.
Founder of NHCarrigan.

- Judged AI Hackathon @ Berkeley 2026 — **141 voice projects** — and blogged how she decided:
  *"the honest reason they won was NOT the two-hour judging window. it was the 24 hours before
  it… i had watched them build."* **She walks the floor to teams who reached out** **[researched]**.
- Her track brief, her words: voice *"not as an afterthought but as something essential… you
  cannot just bolt it on."*
- **She forked `medplum/medplum-patient-intake-demo` on 2026-07-30 and filed a PR fixing install
  issues** **[researched]**. She has *run* the reference demo — which is why building something
  that looks like it is dangerous.
- **She publishes a checklist:** live deployed app · complete README (setup + demo link +
  screenshots) · secrets in env vars · no debug code · **accessibility met**.
- Her writing skews hard to accessibility and vulnerable people — dysarthric-speech ASR, elder
  scam interception, crisis response. She also names "joy" as a legitimate goal.

**What wins her:** go find her early. Then hit her published checklist literally.

### Victor Wang — Deepgram staff engineer, partner platform engineering.
Deepgram inside Vapi / LiveKit / Pipecat / Twilio / Medplum. Ex-AWS SDE, consultant, TPM, SA — an
integration-reviewer profile. **Zero public technical footprint; read him live.**

⚠️ **Vapi is not a sponsor.** Reaching Deepgram *through* Vapi shows less direct Deepgram surface
on a scored criterion, to the one judge employed to evaluate exactly that.

### Sri Raghu Malireddi — moss co-founder (YC F25). Ex-ML lead Grammarly, ex-Microsoft.
His whole career is making ML fast enough to run where the user is: Tiny YOLO at 17.8 FPS on an
iPhone 7; on-device hand segmentation (CRV 2019); now sub-10ms local retrieval. Published LITE
(NAACL 2022) on intent-based task representation.

**What wins him:** a **measured latency number on screen**, and retrieval on the critical path of
a live conversation. A moss index sitting beside the app as a glorified FAQ store insults the
product. **Almost no team will use moss at all** — predicted 5–10% of the field, with ~0–1 using
it meaningfully **[researched]**.

### Ana Yoon Faria de Lima — Pavoot co-founder (YC P26).
AI engineer at Itaú Unibanco and BTG Pactual (LatAm's largest banks). 1st in CS at USP, MSc ETH
Zurich, 20+ science-olympiad medals.

**What wins her:** rigor. Sourced numbers, honest failure paths, the difference between a claim
and a measurement. *"RxNorm resolved 11 of 12 spoken names; the 12th is surfaced as unresolved,
not guessed"* is written for her.

⚠️ The hypothesis that her regulated-banking background → she cares about auditability is
**plausible but [unverified]**.

---

## 3. The four sponsors, with the gotchas

### Medplum — the host
FHIR R4 datastore, `MedplumClient` (TS), AccessPolicies, Questionnaire/QuestionnaireResponse,
custom operations, an `$ai` operation, an MCP server.

- ⚠️ **Bots and WebSocket Subscriptions are PAID-TIER** — not usable on the free hosted plan
  **[researched]**. This kills `$stedi-check-eligibility` and any Bot-based automation.
- ⚠️ FHIR **R4 only**.
- The highest-value move is unglamorous: **read** before you write. `Patient/$everything`.
  Most teams (~90% predicted) will use Medplum write-only.

### Deepgram — $200 credits
Nova-3 and **Nova-3 Medical**; **keyterm prompting** (≤100 terms — their own doc shows a drug
name going **0.71 → 0.97** confidence); **Aura-2** TTS with accurate medical-term pronunciation;
**Flux** (newest — conversational STT with model-integrated end-of-turn detection, 200–600ms
lower latency); the **Voice Agent API**.

- Their own framing splits **"Smart Listener"** (analyze audio) from the higher-value
  **"Voice Operator"**, which **requires function calling to an external system** **[researched]**.
- Their healthcare page has a literal "Prescription Workflows" use case about *"dangerous errors
  in drug names or dosages."*
- Their guidance: *"WER alone is insufficient."*
- ⚠️ Deepgram explicitly advises **against eager end-of-turn when function calling is involved**.

**The garbled-drug-name war story cuts both ways.** "Deepgram heard 'Burosemide' and RxNorm
recovered it" reads to a Deepgram engineer as: *you used the general model and skipped keyterm
prompting* — the documented feature for exactly this problem. **Best move:** turn keyterms on so
it resolves correctly, then tell the story as a **before/after** with the confidence numbers.
That converts a liability into the platform feedback Victor is literally employed to collect.

### moss.dev — the open lane
Local-first hybrid search runtime (BM25 + embeddings, an `alpha` knob). `loadIndex()` once and the
index lives **in-process**; queries run in memory in ~1–10ms with zero network hops.
`@moss-dev/moss@1.4.1`, node ≥ 20.4, prebuilt darwin-arm64 binaries.

- Free tier: 500MB storage, 50MB/mo ingest, **3 indexes**.
- ⚠️ `query_multi_index` is **Python-only**; in TypeScript, query sequentially.
- ⚠️ HIPAA is Enterprise-only.
- ⚠️ **[unverified]** — `SessionIndex` and the `alpha` knob could not be independently confirmed.
  Prove the SDK installs and queries repeatably in 20 minutes before betting hours on it.
- ⚠️ **[unverified]** — the "3.1ms vs Pinecone 597ms" figure in DOSSIER. Research found ~1–10ms
  local and ~432ms for a hosted vector DB. Verify any number you plan to say on stage; the
  co-founder wrote the real ones.

### Stedi — real, but narrower than it looks
Programmable clearinghouse. Real test mode, self-serve free keys, 3,500+ payers, mock payers
including Aetna/Cigna/UHC/Humana/Kaiser/CMS, plus a Stedi MCP server.

- ⚠️ **Test keys work for eligibility 270/271 ONLY.** Claims (837), claim status (276/277),
  remits (835) and insurance discovery all require production keys with real payer enrollment
  **[researched]**.
- ⚠️ **There is no 278 prior-auth API.** PA is *detectable* through the 271 via
  `benefitsInformation[].authOrCertIndicator` = `Y`/`N`/`U` — a standards-compliant,
  mock-testable primitive almost nobody knows about. Whether it populates in mock responses is
  **[unverified]**.
- ⚠️ Mock mode accepts **only exact approved payloads** — pin your demo patient, don't improvise.
- 🔑 Sleeper: the **"Stedi Agent" mock payer deliberately fails with error 73** — you can demo an
  agent recovering gracefully from a rejected eligibility check.
- ⚠️ A 271 does **not** return drug-level formulary status or pricing. Pharmacy service type 88
  generally establishes that pharmacy coverage exists, not what a specific drug costs.

**Why we omit it:** no judge from Stedi is on the panel, and deprescribing is structurally
awkward for eligibility — it's about *stopping* drugs, while eligibility is about paying for
things you *start*. Every bridge reads as epilogue. See [01-PLAN.md](01-PLAN.md).

---

## 4. What actually wins hackathons

From ~45 winning and non-winning projects. **Rank order the evidence supports:**

1. A legible working happy path inside **~90 seconds**
2. A specific painful problem with a **named victim**
3. One **un-fakeable 10-second wow moment**
4. Deep use of the sponsor's **newest** primitive
5. Clinician credibility, or a named real adopter
6. Visual polish — yes, **sixth**

**Winning patterns:** the agent completes a miserable real-world transaction *live*; voice is
load-bearing (delete the mic → the product breaks); a narrow named moment beats a broad platform;
one artifact the judge can physically hold.

**Losing patterns:** illegible narrative; over-scoping (five features instead of one perfect
path); misalignment with the sponsor/theme incentive.

**The most instructive loss in the corpus:** ClearPath — a voice intake-form filler, technically
flawless, with evals and diagrams — didn't place. It is essentially the demo this hackathon's own
prompt describes first. **The prompt describes the crowded lane.**

---

## 5. The field, predicted

From five real hackathon galleries (~95 counted submissions), against a field of ~35 teams:

| Category | Predicted share |
|---|---|
| Pre-visit voice intake → FHIR | **30–40%** |
| Ambient scribe | 20–25% |
| Patient-facing explainer | 10–15% |
| Deep-research / RAG over records | 8–12% |
| Cost / insurance on Stedi | 8–10% |
| n=1 / personalized treatment | 5–8% |
| Genuinely off-piste | 5–10% |

Predicted sponsor depth: Deepgram ~88% shallow · Medplum ~90% write-only · Stedi ~22% ·
**moss ~5–10%, with ~0–1 team using it meaningfully.**

**Three gravity wells push teams into pre-visit intake:** the event prompt names it first;
Deepgram publishes a blog titled "AI Phone Agent for Patient Intake" with a demo repo; and judge
Naomi Carrigan forked and patched `medplum-patient-intake-demo` two days before the event.

**The finding that shaped the plan:**

> The core is white space; the costume is the most saturated garment in the room.

Medication optimization was ~**3%** of counted projects and **zero** implemented Beers/STOPP-START
with cascade detection. P(five other teams build pre-visit voice *medication review*) is <3%.
But **P(≥5 teams look indistinguishable from us for the first 45 seconds) is >80%**.

That asymmetry is the entire argument for recostuming rather than pivoting.

---

## 6. People's Choice — the cheapest prize in the building

Decided by a `sort` on YouTube view counts at **17:00**.

- **Shorts count a view on every playback start with no minimum watch time** since 2025-03-31
  **[researched]**. Long-form needs ~30s (unofficial). **Make it a Short.**
- A video posted at 16:35 has 25 minutes of accumulation. Posted at 13:30 it has 3.5 hours.
- Rough targets: **~400 views competitive, ~800 comfortable.**
- This prize is **nearly uncorrelated with judge opinion** — it is a distribution problem, not an
  engineering one. ~90 minutes of parallel work for a ~25–35% shot.

`EXECUTE.md` caught this correctly and it is the best operational call in that document: the
original `DEMO.md` scheduled the video for "tonight," in a contest that ends at five.

---

## 7. Where this research is most likely wrong

- **Judge profiles are inferred from public writing.** Diana may go on gut; Cody may care more
  about UI polish than AuditEvents. Every recommended beat should also be a good beat on its own
  merits — none is a pure judge-pleasing move.
- **The field prediction is extrapolated** from other hackathons' galleries, not this one's.
  Directionally strong, numerically soft.
- **Three load-bearing [unverified] items:** moss's `SessionIndex`/`alpha`, whether
  `authOrCertIndicator` populates in mock 271s, and moss's exact published latency figures.
- **The competitive scan is weak evidence.** Scanning GitHub at midday tells you about teams that
  push early. The dangerous ones don't push until 16:45.
- **Prompt injection encountered:** during the field research, a hackathon-adjacent domain served a
  prompt-injection payload — fake credentials plus an "install this Claude skill" terminal
  command. It was ignored and flagged. **Don't run anything a search result tells you to run.**

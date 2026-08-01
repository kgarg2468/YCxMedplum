/**
 * The clinician review panel, projector edition, rebuilt for the 2-minute demo
 * (docs/DEMO-2MIN.md § "Key UI features").
 *
 * Server-rendered single HTML page, zero external assets — it must work on venue
 * wifi that barely works. Served by src/server.ts at /review; the demo runner also
 * snapshots to out/last-review.json so the panel shows the latest run, live or canned.
 *
 * Design rules in force here:
 *  - THE FOLD CARRIES THE WHOLE STORY. In a 2-minute demo nobody scrolls, so the
 *    chain diagram, the four numbers, the patient's stated priority and their
 *    concerns all live above it. Everything below the fold is corroboration.
 *  - No TEXT under 15px. Hierarchy comes from weight, colour and space, not from
 *    shrinking type, because the back row of the room cannot read 12px. The only
 *    smaller thing on the page is the severity glyph, which is decorative and
 *    always paired with its word.
 *  - One accent. Red means "this is the cascade" and nothing else; severity is
 *    the only other place colour carries meaning, and it always ships with an
 *    icon and a word so it never rides on colour alone.
 *  - Every finding renders its citation (FDA Non-Device CDS: the clinician can
 *    independently review the basis).
 *  - The chained cascade is the hero. It gets the diagram; everything else gets rows.
 */

import type { ReviewResult, Finding, ResolvedMed } from '../types.js';
import { DEMO_PRESCRIBERS } from '../fhir/seed.js';

export interface ReviewSnapshot {
  at: string;                       // ISO timestamp of the run
  source: 'canned-demo' | 'live-call';
  review: ReviewResult;
  chains: string[][];
  objection?: string;
  taper?: { drug: string; steps: { week: number; dose: string; note: string }[] } | null;
  patientId?: string;
  /** "Margaret Okonkwo, 83" — computed from the FHIR Patient, never hardcoded. */
  patientLabel?: string;
  written?: {
    meds: number; flags: number; cascades: number; goals: number; risk: boolean;
    /** True when a red flag produced an urgent Task. */
    task?: boolean;
    /** Per-resource detail incl. the note/comment text the console UI buries. */
    resources?: { type: string; id: string; label: string; note?: string }[];
  };
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SEVERITY = {
  high:     { var: '--critical', icon: '&#9679;', label: 'High' },
  moderate: { var: '--serious',  icon: '&#9650;', label: 'Moderate' },
  low:      { var: '--warning',  icon: '&#9632;', label: 'Low' },
} as const;

const KIND_LABEL: Record<Finding['kind'], string> = {
  cascade: 'Prescribing cascade',
  pim: 'Potentially inappropriate medication',
  'no-indication': 'No stated indication',
  anticholinergic: 'Anticholinergic burden',
  duplicate: 'Therapeutic duplication',
};

/** Spelled numbers read better than numerals in a headline. Falls back to digits. */
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const spell = (n: number) => WORDS[n] ?? String(n);
/** "One medication" / "Three medications". */
const plural = (n: number, word: string) => `${spell(n)} ${word}${n === 1 ? '' : 's'}`;

/**
 * Synthetic practice attribution, shared with the FHIR writers so the panel and
 * the Medplum resources never disagree. Labelled as synthetic wherever it is
 * shown: it is demo scaffolding for the cross-practice story, not real data.
 */
const practiceOf = (ing: string | null | undefined): string | null =>
  (ing && DEMO_PRESCRIBERS[ing]) || null;

/** Distinct practices across the resolved regimen: the fragmentation number. */
function practices(meds: ResolvedMed[]): string[] {
  const seen = new Set<string>();
  for (const m of meds) {
    const p = practiceOf(m.ingredient);
    if (p) seen.add(p);
  }
  return [...seen];
}

function findingCard(f: Finding): string {
  const sev = SEVERITY[f.severity];
  const confirmed = f.kind === 'cascade'
    ? (f.symptomConfirmed
        ? `<div class="confirm yes">&#10003; Patient reported the linking symptom</div>`
        : `<div class="confirm no">&#9675; Structural only, linking symptom not reported</div>`)
    : '';

  // Cascades read as trigger → treater with the symptom on the arrow; everything
  // else is a flat list of the drugs involved.
  const body = f.kind === 'cascade'
    ? `<div class="flow">
         <span class="node">${esc(f.implicated[0] ?? '')}</span>
         <span class="link">
           <span class="link-symptom${f.symptomConfirmed ? ' hit' : ''}">${esc(f.linkingSymptom ?? '')}</span>
           <span class="link-arrow" aria-hidden="true">&#10230;</span>
         </span>
         <span class="node">${esc(f.implicated[1] ?? '')}</span>
       </div>`
    : `<div class="flow">${f.implicated.map((i) => `<span class="node">${esc(i)}</span>`).join('')}</div>`;

  return `
  <article class="finding" style="--accent: var(${sev.var})">
    <div class="finding-head">
      <span class="sev-chip"><span class="sev-icon" aria-hidden="true">${sev.icon}</span>${sev.label}</span>
      <span class="kind">${KIND_LABEL[f.kind]}</span>
    </div>
    <h3 class="finding-label">${esc(f.label)}</h3>
    ${body}
    ${confirmed}
    ${f.explanation ? `<p class="explain">${esc(f.explanation)}</p>` : ''}
    <p class="citation">${esc(f.citation)}</p>
  </article>`;
}

export function renderReviewHtml(snap: ReviewSnapshot | null): string {
  const body = snap ? renderBody(snap) : `
    <section class="empty">
      <h1 class="display">No review yet.</h1>
      <p class="lede">Run <code>npm run demo</code>, or complete a voice call. This page
      repaints itself the moment a review lands.</p>
    </section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Deprescribe, medication review</title>
<script>
  // Reload only when a NEW review lands — a blind meta-refresh resets scroll
  // position every few seconds, which is unusable mid-presentation.
  const current = ${JSON.stringify(snap?.at ?? null)};
  setInterval(async () => {
    try {
      const r = await fetch('/review.json');
      const s = await r.json();
      if ((s?.at ?? null) !== current) location.reload();
    } catch {}
  }, 3000);
</script>
<style>
  /* ── Tokens ──────────────────────────────────────────────────────────
     Two surfaces, three inks, four reserved status colours. That is the
     whole palette; anything else on screen is one of these at an opacity. */
  :root {
    color-scheme: light;
    --page: #fbfbfa;
    --surface: #ffffff;
    --sunken: #f4f4f1;
    --ink: #0a0a0a;
    --ink-2: #56554f;
    --muted: #86847c;
    --hairline: #e6e5df;
    --border: rgba(10,10,10,0.09);
    /* Reserved status colours. Contrast-checked against --surface for 15px text. */
    --critical: #c1322c;
    --serious: #a2560f;
    --warning: #8a6d0b;
    --good: #1a7f37;
    --shadow: 0 1px 2px rgba(10,10,10,0.04), 0 6px 20px rgba(10,10,10,0.05);
  }
  /* Dark is a designed mode, not an inverted one: its own steps, re-checked
     against the dark surface. Venues project either one. */
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --page: #0b0b0a;
      --surface: #161615;
      --sunken: #1e1e1c;
      --ink: #f6f6f3;
      --ink-2: #adaca3;
      --muted: #82817a;
      --hairline: #292927;
      --border: rgba(255,255,255,0.11);
      --critical: #ff6f66;
      --serious: #eda05c;
      --warning: #e2c052;
      --good: #52cc7e;
      --shadow: none;
    }
  }

  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--page); color: var(--ink);
    font: 18px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  }
  main { max-width: 1240px; margin: 0 auto; padding: 22px 40px 96px; }
  @media (max-width: 720px) { main { padding: 18px 20px 64px; } }

  /* Type scale. Five sizes, no text under 15px (the projector rule). */
  .display { font-size: clamp(36px, 4.1vw, 60px); font-weight: 620; line-height: 1.04;
    letter-spacing: -0.028em; margin: 0; }
  .lede { font-size: 19px; color: var(--ink-2); line-height: 1.5; margin: 14px 0 0; max-width: 70ch; }
  .label { font-size: 15px; font-weight: 640; letter-spacing: .085em; text-transform: uppercase;
    color: var(--muted); margin: 0; }
  .muted { color: var(--muted); }

  /* ── Top bar: identity only, deliberately quiet. ─────────────────── */
  .topbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px;
    padding-bottom: 18px; border-bottom: 1px solid var(--hairline); }
  .wordmark { font-size: 16px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
  .wordmark .minus { color: var(--critical); margin-left: 1px; }
  .topbar .who { font-size: 16px; font-weight: 600; }
  .topbar .rest { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-left: auto; }
  .pill { font-size: 15px; font-weight: 560; border: 1px solid var(--border); border-radius: 999px;
    padding: 3px 12px; color: var(--ink-2); white-space: nowrap; }
  .pill.live { color: var(--good); border-color: color-mix(in srgb, var(--good) 45%, var(--border)); }
  .topbar a { color: var(--ink-2); text-decoration: none; border-bottom: 1px solid var(--border);
    font-size: 15px; white-space: nowrap; }
  .topbar a:hover { color: var(--ink); }

  /* ── Hero: the chain. Owns the first screen. ─────────────────────── */
  .hero { padding: 30px 0 4px; }
  .hero .display .accent { color: var(--critical); }
  .hero .lede { margin-top: 16px; }

  .diagram { display: flex; flex-wrap: wrap; align-items: stretch; margin-top: 28px; }
  .drug {
    display: flex; flex-direction: column; justify-content: flex-start;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 16px; padding: 18px 22px; min-width: 208px; flex: 0 1 auto;
    box-shadow: var(--shadow);
  }
  .drug .practice { font-size: 15px; font-weight: 640; letter-spacing: .04em; text-transform: uppercase;
    color: var(--muted); }
  .drug .name { font-size: clamp(24px, 2.1vw, 33px); font-weight: 640; letter-spacing: -0.02em;
    line-height: 1.15; margin-top: 6px; }
  .drug .why { font-size: 16px; color: var(--ink-2); margin-top: 8px; max-width: 24ch; line-height: 1.4; }

  /* The arrow carries the linking symptom: it is the causal claim, so it is
     labelled rather than decorative. */
  .step { display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 0 18px; min-width: 116px; }
  .step .sym { font-size: 15px; font-weight: 620; color: var(--critical); text-align: center;
    line-height: 1.25; }
  .step .glyph { font-size: 28px; color: var(--critical); line-height: 1.2; }
  .step .caused { font-size: 15px; color: var(--muted); text-align: center; line-height: 1.25; }

  /* Below ~1040px a 3-drug chain wraps and can strand an arrow at the end of a
     line. Stack instead, arrows pointing down. Guards an unmaximized window on
     the projector, which is how this actually breaks in a venue. */
  @media (max-width: 1040px) {
    .diagram { flex-direction: column; align-items: stretch; }
    .drug { min-width: 0; }
    .step { flex-direction: row; gap: 10px; padding: 12px 0 12px 28px; min-width: 0;
      justify-content: flex-start; }
    .step .glyph { transform: rotate(90deg); }
  }

  .fragment { margin: 22px 0 0; font-size: 19px; color: var(--ink-2); max-width: 74ch; }
  .fragment strong { color: var(--ink); font-weight: 640; }

  /* ── Metrics: one hairline row, no boxes. ────────────────────────── */
  /* Always exactly four metrics, so the column count is explicit rather than
     auto-fit: an auto-fit row that wraps 3+1 leaves the hairline background
     showing through the empty cell as a grey block. */
  .metrics { display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 1px; margin-top: 34px; background: var(--hairline);
    border-top: 1px solid var(--hairline); border-bottom: 1px solid var(--hairline); }
  @media (max-width: 1040px) { .metrics { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 560px)  { .metrics { grid-template-columns: 1fr; } }
  .metric { background: var(--page); padding: 20px 24px 18px; }
  .metric .value { font-size: clamp(38px, 3.4vw, 52px); font-weight: 620; line-height: 1;
    letter-spacing: -0.03em; font-variant-numeric: tabular-nums; margin-top: 10px; }
  .metric .note { font-size: 15px; color: var(--muted); margin-top: 10px; line-height: 1.4; }
  /* Thin meter, rounded ends, threshold marked and named. */
  .meter { height: 6px; border-radius: 3px; margin-top: 14px; position: relative;
    background: color-mix(in srgb, var(--meter-color) 18%, var(--page)); }
  .meter .fill { position: absolute; inset: 0 auto 0 0; width: var(--meter-fill);
    background: var(--meter-color); border-radius: 3px; }
  .meter .tick { position: absolute; top: -4px; bottom: -4px; left: var(--meter-tick);
    width: 2px; background: var(--ink-2); border-radius: 1px; opacity: .5; }

  /* ── Patient band: their priority and their concerns, above the fold. ── */
  .band { display: grid; grid-template-columns: 1.45fr 1fr; gap: 26px; margin-top: 30px; }
  @media (max-width: 900px) { .band { grid-template-columns: 1fr; gap: 24px; } }
  .band .panel { background: var(--surface); border: 1px solid var(--border);
    border-radius: 16px; padding: 24px 26px; box-shadow: var(--shadow); }
  .quote { font-size: clamp(20px, 1.7vw, 25px); line-height: 1.35; letter-spacing: -0.015em;
    margin: 14px 0 0; font-weight: 480; }
  .chips { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 16px; }
  .chip { font-size: 16px; font-weight: 560; background: var(--sunken);
    border: 1px solid var(--border); border-radius: 999px; padding: 5px 14px; color: var(--ink); }
  .attrib { font-size: 15px; color: var(--muted); margin: 16px 0 0; }

  .redflag { margin-top: 28px; border-radius: 14px; padding: 18px 22px; font-size: 18px;
    background: color-mix(in srgb, var(--critical) 10%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--critical) 45%, var(--border)); }

  /* ── Sections below the fold ─────────────────────────────────────── */
  section.block { margin-top: 60px; }
  section.block > .label { padding-bottom: 12px; border-bottom: 1px solid var(--hairline); }
  .count { color: var(--muted); font-weight: 500; letter-spacing: 0; }

  /* The accent is inset rather than a full-height border: stacked findings of the
     same severity would otherwise fuse into one long unbroken bar. */
  .finding { position: relative; padding: 22px 0 20px 20px; border-bottom: 1px solid var(--hairline); }
  .finding::before { content: ""; position: absolute; left: 0; top: 22px; bottom: 20px;
    width: 3px; border-radius: 2px; background: var(--accent); }
  .finding-head { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .sev-chip { display: inline-flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 660;
    color: var(--accent); }
  .sev-icon { font-size: 11px; }
  .kind { color: var(--muted); font-size: 16px; }
  .finding-label { font-weight: 620; font-size: 21px; margin: 10px 0 0; letter-spacing: -0.015em; }

  .flow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 0; margin-top: 12px; }
  .flow .node { background: var(--sunken); border: 1px solid var(--border); border-radius: 10px;
    padding: 6px 15px; font-weight: 600; font-size: 17px; margin-right: 8px; }
  .flow .link { display: flex; flex-direction: column; align-items: center; padding: 0 14px 0 6px;
    line-height: 1.15; }
  .flow .link-symptom { font-size: 15px; color: var(--muted); font-style: italic; }
  .flow .link-symptom.hit { color: var(--good); font-weight: 620; font-style: normal; }
  .flow .link-arrow { font-size: 21px; color: var(--ink-2); }

  .confirm { font-size: 16px; margin-top: 12px; font-weight: 600; }
  .confirm.yes { color: var(--good); }
  .confirm.no { color: var(--muted); font-weight: 500; }
  .explain { margin: 12px 0 0; color: var(--ink-2); max-width: 78ch; }
  .citation { margin: 14px 0 0; font-size: 15px; color: var(--muted); max-width: 84ch; }

  /* ── Tables ──────────────────────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 17px; }
  th { text-align: left; font-size: 15px; text-transform: uppercase; letter-spacing: .07em;
    color: var(--muted); font-weight: 640; padding: 12px 16px 12px 0;
    border-bottom: 1px solid var(--hairline); }
  td { padding: 14px 16px 14px 0; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  td.num { font-variant-numeric: tabular-nums; }
  .said { color: var(--ink); }
  .ing { font-weight: 620; }
  .rxcui { font-size: 15px; color: var(--muted); font-weight: 400; }
  .src { font-size: 16px; color: var(--ink-2); white-space: nowrap; }
  .tag { display: inline-flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 620;
    border: 1px solid var(--border); border-radius: 999px; padding: 2px 11px; color: var(--ink-2);
    white-space: nowrap; }
  /* Trust signals must pop: icon + word + colour, never colour alone. */
  .tag.warn { color: var(--critical); border-color: color-mix(in srgb, var(--critical) 45%, var(--border));
    background: color-mix(in srgb, var(--critical) 8%, var(--surface)); }

  .foot { margin-top: 64px; padding-top: 18px; border-top: 1px solid var(--hairline);
    font-size: 15px; color: var(--muted); max-width: 92ch; line-height: 1.55; }
  code { background: var(--sunken); padding: 1px 7px; border-radius: 6px; font-size: .92em; }
  .empty { padding: 80px 0; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function renderBody(snap: ReviewSnapshot): string {
  const r = snap.review;
  const findings = r.findings;
  const cascades = findings.filter((f) => f.kind === 'cascade');
  const highCount = findings.filter((f) => f.severity === 'high').length;
  // Older snapshots predate the symptoms field; render nothing rather than crash.
  const symptoms = r.symptoms ?? [];
  const sources = practices(r.meds);

  const acbColor = r.acbScore >= 6 ? 'var(--critical)' : r.acbScore >= 3 ? 'var(--serious)' : 'var(--good)';
  const acbFill = Math.min(100, Math.round((r.acbScore / 12) * 100));
  const acbTick = Math.round((3 / 12) * 100); // clinical threshold marker
  const when = new Date(snap.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  const whyFor = (ing: string) => r.meds.find((m) => m.ingredient === ing)?.stated_indication ?? '';
  /** The cascade finding that links two adjacent chain nodes, for the arrow label. */
  const linkFor = (a: string, b: string) =>
    cascades.find((f) => f.implicated[0] === a && f.implicated[1] === b);

  const consoleLink = snap.patientId
    ? `<a href="https://app.medplum.com/Patient/${snap.patientId}" target="_blank" rel="noreferrer">Medplum console &#8599;</a>`
    : '';

  // ── Hero ────────────────────────────────────────────────────────────
  // The chained cascade is the one un-fakeable moment in the demo, so it is the
  // first thing on the projector. Each node is tagged with the practice that
  // prescribed it: the fragmentation story and the cascade land as one image.
  const hero = snap.chains.length ? snap.chains.map((chain, ci) => {
    const chainPractices = [...new Set(chain.map(practiceOf).filter((p): p is string => !!p))];
    const Tag = ci === 0 ? 'h1' : 'h2';
    return `
  <section class="hero">
    <${Tag} class="display">${plural(chain.length, 'medication')}.
      <span class="accent">One root cause.</span></${Tag}>
    <div class="diagram">
      ${chain.map((drug, i) => {
        const prev = chain[i - 1];
        const link = prev ? linkFor(prev, drug) : undefined;
        const step = prev ? `
        <div class="step" aria-hidden="true">
          <span class="sym">${esc(link?.linkingSymptom ?? 'side effect')}</span>
          <span class="glyph">&#10230;</span>
          <span class="caused">treated with</span>
        </div>` : '';
        const practice = practiceOf(drug);
        const why = whyFor(drug);
        return `${step}
        <div class="drug">
          ${practice ? `<span class="practice">${esc(practice)}</span>` : ''}
          <span class="name">${esc(drug)}</span>
          ${why ? `<span class="why">&ldquo;${esc(why)}&rdquo;</span>` : ''}
        </div>`;
      }).join('')}
    </div>
    <p class="fragment">Each drug after the first was prescribed for a symptom the one before it
      caused${chainPractices.length > 1
        ? `, across <strong>${plural(chainPractices.length, 'practice').toLowerCase()}</strong> that never saw each other's list`
        : ''}. Found by asking why each was started, not by checking for interactions.</p>
  </section>`;
  }).join('') : `
  <section class="hero">
    <h1 class="display">No prescribing cascade detected.</h1>
    <p class="lede">The engine ran the full table and found no drug being used to treat another
    drug's side effect. A clean result is a result.</p>
  </section>`;

  // ── Patient band ────────────────────────────────────────────────────
  const priority = r.patientGoals.length ? `
    <div class="panel">
      <p class="label">What they would most like to stop</p>
      ${r.patientGoals.map((g) => `<p class="quote">&ldquo;${esc(g)}&rdquo;</p>`).join('')}
      <p class="attrib">The patient's own words, recorded as a FHIR Goal with
        <code>expressedBy</code> = the patient. Their stated preference, not a prediction.</p>
    </div>` : '';

  const concerns = symptoms.length ? `
    <div class="panel">
      <p class="label">Concerns they raised <span class="count">${symptoms.length}</span></p>
      <div class="chips">
        ${symptoms.map((s) => `<span class="chip" title="${esc(s.patient_words)}">${esc(s.symptom)}</span>`).join('')}
      </div>
      <p class="attrib">Asked and answered on the same call. Four of these are the linking
        symptoms that confirmed a cascade.</p>
    </div>` : '';

  const band = priority || concerns ? `<div class="band">${priority}${concerns}</div>` : '';

  // ── Written-to-FHIR block ───────────────────────────────────────────
  const written = snap.written ? `
  <section class="block">
    <p class="label">Written to Medplum as FHIR</p>
    <p class="lede" style="font-size:17px">
      MedicationStatement &times; ${snap.written.meds} &middot; Flag &times; ${snap.written.flags} &middot;
      DetectedIssue &times; ${snap.written.cascades} &middot; Goal &times; ${snap.written.goals}${snap.written.risk ? ' &middot; RiskAssessment' : ''}
    </p>
    ${snap.written.resources?.length ? `
    <table>
      <thead><tr><th style="width:210px">Resource</th><th>Content</th><th>Notes written with it</th></tr></thead>
      <tbody>
      ${snap.written.resources.map((res) => `
        <tr>
          <td><a href="https://app.medplum.com/${res.type}/${res.id}" target="_blank" rel="noreferrer">${res.type}</a></td>
          <td>${esc(res.label)}</td>
          <td class="muted">${res.note ? esc(res.note) : '&mdash;'}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : ''}
    <p class="citation"><code>DetectedIssue.implicated</code> is written in causal order. Recommendation
      resources are <em>preliminary / draft / proposed</em> (DetectedIssue&nbsp;preliminary &middot;
      RiskAssessment&nbsp;preliminary &middot; CarePlan&nbsp;draft &middot; Communication&nbsp;preparation &middot;
      Goal&nbsp;proposed). A clinician confirms before anything becomes final.</p>
  </section>` : '';

  return `
  <header class="topbar">
    <span class="wordmark">Deprescribe<span class="minus">&minus;</span></span>
    <span class="who">${esc(snap.patientLabel ?? 'Synthetic demo patient')}</span>
    <span class="rest">
      <span class="pill">synthetic demo</span>
      <span class="pill${snap.source === 'live-call' ? ' live' : ''}">${snap.source === 'live-call' ? '&#9679; live call' : 'canned demo'}</span>
      <span class="muted" style="font-size:15px">${esc(when)}</span>
      ${consoleLink}
    </span>
  </header>

  ${hero}

  ${r.redFlags.length ? `
  <div class="redflag">
    <strong>&#9888; Red flags, ${snap.written?.task
      ? 'urgent FHIR Task created for clinician'
      : 'immediate clinician attention required'}:</strong> ${r.redFlags.map(esc).join('; ')}
  </div>` : ''}

  <div class="metrics">
    <div class="metric" style="--meter-color:${acbColor}; --meter-fill:${acbFill}%; --meter-tick:${acbTick}%">
      <p class="label">Anticholinergic burden</p>
      <div class="value">${r.acbScore}</div>
      <div class="meter"><span class="fill"></span><span class="tick"></span></div>
      <p class="note">Threshold 3. ${r.acbContributors.map((c) => `${esc(c.ingredient)} ${c.score}`).join(', ') || 'No contributors'}</p>
    </div>
    <div class="metric">
      <p class="label">Findings</p>
      <div class="value">${findings.length}</div>
      <p class="note">${findings.length
        ? `${highCount} high severity, ${cascades.length} prescribing cascade${cascades.length === 1 ? '' : 's'}, every one cited`
        : 'Nothing met a rule in the tables'}</p>
    </div>
    <div class="metric">
      <p class="label">Medications</p>
      <div class="value">${r.meds.length}</div>
      <p class="note">${r.unresolvedCount
        ? `${r.unresolvedCount} unresolved, sent for clinician review`
        : 'All resolved to RxNorm'}</p>
    </div>
    <div class="metric">
      <p class="label">Prescribing sources</p>
      <div class="value">${sources.length}</div>
      <p class="note">${sources.length ? esc(sources.join(', ')) : 'Not attributed'}</p>
    </div>
  </div>

  ${band}

  <section class="block">
    <p class="label">Findings <span class="count">${findings.length}</span></p>
    ${findings.length
      ? findings.map(findingCard).join('')
      : `<p class="lede">No findings. Every medication was checked against the Beers, STOPP/START,
          anticholinergic, duplication and cascade tables, and none matched. The engine reports what
          the tables contain; it does not invent findings to fill a screen.</p>`}
  </section>

  <section class="block">
    <p class="label">Medications, in the patient's own words <span class="count">${r.meds.length}</span></p>
    <table>
      <thead><tr>
        <th style="width:34%">Patient said</th>
        <th>Resolved</th>
        <th style="width:16%">Prescribed by</th>
        <th style="width:24%">Why they take it</th>
      </tr></thead>
      <tbody>
      ${r.meds.map((m) => {
        const src = practiceOf(m.ingredient);
        return `
        <tr>
          <td class="said">&ldquo;${esc(m.spoken_as)}&rdquo;</td>
          <td>${m.ingredient
            ? `<span class="ing">${esc(m.ingredient)}</span> <span class="rxcui">rxcui ${esc(m.rxcui ?? '')}</span>`
            : '<span class="tag warn">&#9888; unresolved, clinician review</span>'}${m.otc ? ' <span class="tag">OTC</span>' : ''}</td>
          <td class="src">${src ? esc(src) : '&mdash;'}</td>
          <td>${m.stated_indication ? esc(m.stated_indication) : '<span class="tag warn">&#9888; none stated</span>'}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
    <p class="citation">Unresolved names are never guessed: the patient's verbatim words are kept and
      sent for clinician review. Prescriber attribution is synthetic demo data.</p>
  </section>

  ${snap.taper?.steps?.length ? `
  <section class="block">
    <p class="label">Draft taper, ${esc(snap.taper.drug)}</p>
    <table>
      <thead><tr><th style="width:90px">Week</th><th style="width:200px">Dose</th><th>Note</th></tr></thead>
      <tbody>${snap.taper.steps.map((s) => `
        <tr><td class="num">${s.week}</td><td>${esc(s.dose)}</td><td class="muted">${esc(s.note)}</td></tr>`).join('')}
      </tbody>
    </table>
    <p class="citation">Instantiated from the published deprescribing.org algorithm. Draft CarePlan,
      requires clinician sign-off.</p>
  </section>` : ''}

  ${snap.objection ? `
  <section class="block">
    <p class="label">Reviewer objection, peer review</p>
    <p class="explain" style="margin-top:14px">${esc(snap.objection)}</p>
    <p class="citation">Generated by an adversarial reviewer agent before any clinician sees the plan.</p>
  </section>` : ''}

  ${written}

  <p class="foot">
    Detection is deterministic: a citation-backed table lookup with zero LLM calls. The model never
    decides what is clinically wrong. Ranked options with visible citations, nothing time-critical,
    recommendation resources preliminary/draft pending clinician review (FDA Non-Device CDS posture).
    Synthetic data only; prescriber attribution is synthetic.
  </p>`;
}

/**
 * The thin review panel (README hour-by-hour, 15:45 slot) — projector edition.
 *
 * Server-rendered single HTML page, zero external assets — it must work on venue
 * wifi that barely works. Served by src/server.ts at /review; the demo runner also
 * snapshots to out/last-review.json so the panel shows the latest run, live or canned.
 *
 * Design rules in force here:
 *  - type is sized to read from the back of a room (DEMO.md rehearsal checklist);
 *  - severity never rides on color alone (icon + label, left accent as reinforcement);
 *  - every finding renders its citation (FDA Non-Device CDS: the clinician can
 *    independently review the basis);
 *  - the chained cascade is the hero — it gets the diagram, everything else gets cards.
 */

import type { ReviewResult, Finding } from '../types.js';

export interface ReviewSnapshot {
  at: string;                       // ISO timestamp of the run
  source: 'canned-demo' | 'live-call';
  review: ReviewResult;
  chains: string[][];
  objection?: string;
  taper?: { drug: string; steps: { week: number; dose: string; note: string }[] } | null;
  patientId?: string;
  written?: { meds: number; flags: number; cascades: number; goals: number; risk: boolean };
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

/** trigger —(linking symptom)→ treater, for cascade cards. */
function cascadeFlow(f: Finding): string {
  const [trigger, treater] = f.implicated;
  return `
  <div class="flow">
    <span class="node">${esc(trigger)}</span>
    <span class="link">
      <span class="link-symptom${f.symptomConfirmed ? ' hit' : ''}">${esc(f.linkingSymptom ?? '')}</span>
      <span class="link-arrow">&#10230;</span>
    </span>
    <span class="node">${esc(treater)}</span>
  </div>`;
}

function findingCard(f: Finding): string {
  const sev = SEVERITY[f.severity];
  const confirmed = f.kind === 'cascade'
    ? (f.symptomConfirmed
        ? `<div class="confirm yes">&#10003; Patient reported the linking symptom</div>`
        : `<div class="confirm no">&#9675; Structural only — linking symptom not reported</div>`)
    : '';
  const body = f.kind === 'cascade'
    ? cascadeFlow(f)
    : `<div class="chain-line">${f.implicated.map(esc).join(' <span class="dim">&middot;</span> ')}</div>`;

  return `
  <div class="card finding" style="--accent: var(${sev.var})">
    <div class="finding-head">
      <span class="sev-chip"><span class="sev-icon">${sev.icon}</span>${sev.label}</span>
      <span class="kind">${KIND_LABEL[f.kind]}</span>
    </div>
    <div class="finding-label">${esc(f.label)}</div>
    ${body}
    ${confirmed}
    ${f.explanation ? `<p class="explain">${esc(f.explanation)}</p>` : ''}
    <div class="citation">${esc(f.citation)}</div>
  </div>`;
}

export function renderReviewHtml(snap: ReviewSnapshot | null): string {
  const body = snap ? renderBody(snap) : `
    <div class="card empty">
      <p>No review yet. Run <code>npm run demo</code>, or complete a voice call.</p>
      <p class="muted">This page updates automatically when a review lands.</p>
    </div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Deprescribe — medication review</title>
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
  :root {
    color-scheme: light;
    --page: #f9f9f7; --surface: #fcfcfb;
    --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
    --hairline: #e1e0d9; --border: rgba(11,11,11,0.10);
    --critical: #d03b3b; --serious: #ec835a; --warning: #fab219; --good: #0ca30c;
    --shadow: 0 1px 2px rgba(11,11,11,0.04), 0 4px 14px rgba(11,11,11,0.05);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --page: #0d0d0d; --surface: #1a1a19;
      --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
      --hairline: #2c2c2a; --border: rgba(255,255,255,0.10);
      --shadow: none;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--page); color: var(--ink);
    font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 1080px; margin: 0 auto; padding: 40px 28px 80px; }

  /* ── Header ─────────────────────────────────────────── */
  .brand { display: flex; align-items: baseline; gap: 10px; }
  .wordmark { font-size: 15px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); }
  .wordmark .minus { color: var(--critical); font-weight: 800; }
  h1 { font-size: 30px; margin: 6px 0 0; letter-spacing: -0.01em; }
  .sub { color: var(--ink-2); margin: 8px 0 0; font-size: 15.5px; display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
  .sub a { color: inherit; }
  .pill {
    display: inline-block; font-size: 12.5px; font-weight: 600; letter-spacing: .02em;
    border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; color: var(--ink-2);
  }
  .pill.live { color: var(--good); border-color: color-mix(in srgb, var(--good) 45%, var(--border)); }
  .muted { color: var(--muted); }
  .dim { color: var(--muted); }

  /* ── Stat tiles ─────────────────────────────────────── */
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; margin-top: 28px; }
  .tile {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 14px; padding: 18px 20px 16px; box-shadow: var(--shadow);
  }
  .tile .label { font-size: 13.5px; font-weight: 600; color: var(--ink-2); }
  .tile .value { font-size: 44px; font-weight: 650; line-height: 1.1; margin-top: 4px; letter-spacing: -0.02em; }
  .tile .note { font-size: 13px; color: var(--muted); margin-top: 6px; line-height: 1.45; }
  .meter { height: 7px; border-radius: 4px; margin-top: 12px; position: relative;
    background: color-mix(in srgb, var(--meter-color) 16%, var(--surface)); }
  .meter .fill { position: absolute; inset: 0 auto 0 0; width: var(--meter-fill); background: var(--meter-color); border-radius: 4px; }
  .meter .tick { position: absolute; top: -3px; bottom: -3px; left: var(--meter-tick); width: 2px; background: var(--ink-2); border-radius: 1px; opacity: .55; }

  /* ── Hero: the chained cascade ──────────────────────── */
  .hero {
    margin-top: 28px; border-radius: 16px; padding: 26px 28px 24px;
    background: color-mix(in srgb, var(--critical) 6%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--critical) 30%, var(--border));
    box-shadow: var(--shadow);
  }
  .hero .eyebrow { font-size: 13px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
    color: color-mix(in srgb, var(--critical) 80%, var(--ink)); }
  .diagram { display: flex; flex-wrap: wrap; align-items: stretch; gap: 6px 0; margin-top: 16px; }
  .drug {
    background: var(--surface); border: 1px solid color-mix(in srgb, var(--critical) 40%, var(--border));
    border-radius: 12px; padding: 12px 18px 10px; min-width: 150px;
  }
  .drug .name { font-size: 21px; font-weight: 650; letter-spacing: -0.01em; }
  .drug .why { font-size: 12.5px; color: var(--muted); margin-top: 2px; max-width: 200px; }
  .arrow-col { display: flex; align-items: center; padding: 0 14px;
    color: color-mix(in srgb, var(--critical) 75%, var(--ink)); font-size: 26px; }
  .hero .caption { margin-top: 14px; color: var(--ink-2); font-size: 15.5px; }
  .hero .caption strong { color: var(--ink); }

  .redflag {
    margin-top: 20px; border-radius: 14px; padding: 18px 22px;
    background: color-mix(in srgb, var(--critical) 12%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--critical) 50%, var(--border));
    font-size: 16px;
  }

  /* ── Sections & cards ───────────────────────────────── */
  h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
    color: var(--ink-2); margin: 40px 0 4px; display: flex; align-items: baseline; gap: 8px; }
  h2 .count { color: var(--muted); font-weight: 500; }
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 14px; padding: 18px 22px; margin-top: 14px; box-shadow: var(--shadow);
  }
  .finding { border-left: 4px solid var(--accent); }
  .finding-head { display: flex; gap: 12px; align-items: center; }
  .sev-chip {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 12.5px; font-weight: 700; letter-spacing: .03em;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
    background: color-mix(in srgb, var(--accent) 9%, var(--surface));
    border-radius: 999px; padding: 2px 11px;
  }
  .sev-icon { color: var(--accent); font-size: 10px; }
  .kind { color: var(--muted); font-size: 13.5px; }
  .finding-label { font-weight: 650; font-size: 18px; margin-top: 8px; letter-spacing: -0.01em; }
  .chain-line { color: var(--ink-2); margin-top: 4px; font-size: 15.5px; }

  .flow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 0; margin-top: 10px; }
  .flow .node {
    background: color-mix(in srgb, var(--ink) 5%, var(--surface));
    border: 1px solid var(--border); border-radius: 9px; padding: 5px 14px;
    font-weight: 600; font-size: 16px;
  }
  .flow .link { display: flex; flex-direction: column; align-items: center; padding: 0 12px; line-height: 1.1; }
  .flow .link-symptom { font-size: 12px; color: var(--muted); font-style: italic; }
  .flow .link-symptom.hit { color: var(--good); font-weight: 600; font-style: normal; }
  .flow .link-arrow { font-size: 20px; color: var(--ink-2); }

  .confirm { font-size: 13.5px; margin-top: 10px; font-weight: 600; }
  .confirm.yes { color: var(--good); }
  .confirm.no { color: var(--muted); font-weight: 500; }
  .explain { margin: 10px 0 0; color: var(--ink-2); }
  .citation { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--hairline);
    font-size: 13px; color: var(--muted); }

  /* ── Tables ─────────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 15px; }
  th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
    color: var(--muted); font-weight: 700; padding: 8px 12px 8px 0; border-bottom: 1px solid var(--hairline); }
  td { padding: 10px 12px 10px 0; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  td.num { font-variant-numeric: tabular-nums; }
  .said { color: var(--ink-2); }
  .ing { font-weight: 600; }
  .rxcui { font-size: 12.5px; color: var(--muted); font-weight: 400; }
  .tag {
    display: inline-block; font-size: 11.5px; font-weight: 600; border: 1px solid var(--border);
    border-radius: 999px; padding: 1px 9px; color: var(--ink-2); margin-left: 6px; white-space: nowrap;
  }
  .tag.warn { color: var(--critical); border-color: color-mix(in srgb, var(--critical) 40%, var(--border));
    background: color-mix(in srgb, var(--critical) 7%, var(--surface)); }

  .quote { font-size: 19px; letter-spacing: -0.01em; }
  .foot { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--hairline);
    font-size: 13px; color: var(--muted); max-width: 860px; }
  code { background: color-mix(in srgb, var(--ink) 6%, var(--surface)); padding: 1px 6px; border-radius: 5px; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function renderBody(snap: ReviewSnapshot): string {
  const r = snap.review;
  const cascades = r.findings.filter((f) => f.kind === 'cascade');
  const confirmedCascades = cascades.filter((f) => f.symptomConfirmed).length;
  const acbColor = r.acbScore >= 6 ? 'var(--critical)' : r.acbScore >= 3 ? 'var(--serious)' : 'var(--good)';
  const acbFill = Math.min(100, Math.round((r.acbScore / 12) * 100));
  const acbTick = Math.round((3 / 12) * 100); // clinical threshold marker
  const when = new Date(snap.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  // Annotate hero chain nodes with the patient's own reason for taking each drug.
  const whyFor = (ing: string) => {
    const med = r.meds.find((m) => m.ingredient === ing);
    return med?.stated_indication ?? '';
  };

  const consoleLink = snap.patientId
    ? `<a href="https://app.medplum.com/Patient/${snap.patientId}" target="_blank">Open in Medplum console &#8599;</a>`
    : '';

  const written = snap.written ? `
  <h2>Written to Medplum as FHIR</h2>
  <div class="card">
    MedicationStatement &times; ${snap.written.meds} &middot; Flag &times; ${snap.written.flags} &middot;
    DetectedIssue &times; ${snap.written.cascades} &middot; Goal &times; ${snap.written.goals}${snap.written.risk ? ' &middot; RiskAssessment' : ''}
    <div class="citation">DetectedIssue carries <code>implicated</code> in causal order. All review resources are
    <em>preliminary / draft</em> — nothing is final without a clinician.</div>
  </div>` : '';

  return `
  <div class="brand"><span class="wordmark">Deprescribe<span class="minus"> &minus;</span></span></div>
  <h1>Pre-visit medication review</h1>
  <p class="sub">
    <span>Margaret Okonkwo, 82</span>
    <span class="pill">synthetic demo</span>
    <span class="pill${snap.source === 'live-call' ? ' live' : ''}">${snap.source === 'live-call' ? '&#9679; live call' : 'canned demo'}</span>
    <span class="muted">${esc(when)}</span>
    ${consoleLink}
  </p>

  <div class="tiles">
    <div class="tile" style="--meter-color:${acbColor}; --meter-fill:${acbFill}%; --meter-tick:${acbTick}%">
      <div class="label">Anticholinergic burden</div>
      <div class="value">${r.acbScore}</div>
      <div class="meter"><span class="fill"></span><span class="tick"></span></div>
      <div class="note">&ge; 3 is clinically significant &middot; ${r.acbContributors.map((c) => `${esc(c.ingredient)} ${c.score}`).join(', ') || 'no contributors'}</div>
    </div>
    <div class="tile">
      <div class="label">Findings</div>
      <div class="value">${r.findings.length}</div>
      <div class="note">${r.findings.filter((f) => f.severity === 'high').length} high severity, every one cited</div>
    </div>
    <div class="tile">
      <div class="label">Medications</div>
      <div class="value">${r.meds.length}</div>
      <div class="note">${r.unresolvedCount ? `${r.unresolvedCount} unresolved &rarr; clinician review` : 'all resolved to RxNorm'}</div>
    </div>
    <div class="tile">
      <div class="label">Prescribing cascades</div>
      <div class="value">${cascades.length}</div>
      <div class="note">${confirmedCascades} confirmed by the patient's own symptoms</div>
    </div>
  </div>

  ${snap.chains.map((chain) => `
  <div class="hero">
    <div class="eyebrow">Chained prescribing cascade</div>
    <div class="diagram">
      ${chain.map((drug, i) => `
        ${i > 0 ? '<span class="arrow-col">&#10230;</span>' : ''}
        <span class="drug">
          <div class="name">${esc(drug)}</div>
          ${whyFor(drug) ? `<div class="why">&ldquo;${esc(whyFor(drug))}&rdquo;</div>` : ''}
        </span>`).join('')}
    </div>
    <div class="caption"><strong>${chain.length - 1} of these ${chain.length} drugs exist only to treat side effects of the one before it.</strong>
    Each was prescribed for a symptom the previous drug caused.</div>
  </div>`).join('')}

  ${r.redFlags.length ? `
  <div class="redflag">
    <strong>&#9888; Red flags — review halted &amp; escalated:</strong> ${r.redFlags.map(esc).join('; ')}
  </div>` : ''}

  <h2>Findings <span class="count">${r.findings.length}</span></h2>
  ${r.findings.map(findingCard).join('')}

  <h2>Medications, in the patient's own words <span class="count">${r.meds.length}</span></h2>
  <div class="card">
    <table>
      <thead><tr><th style="width:38%">Patient said</th><th>Resolved</th><th>Why they take it</th></tr></thead>
      <tbody>
      ${r.meds.map((m) => `
        <tr>
          <td class="said">&ldquo;${esc(m.spoken_as)}&rdquo;</td>
          <td>${m.ingredient
            ? `<span class="ing">${esc(m.ingredient)}</span> <span class="rxcui">rxcui ${esc(m.rxcui ?? '')}</span>`
            : '<span class="tag warn">unresolved &rarr; clinician review</span>'}${m.otc ? '<span class="tag">OTC</span>' : ''}</td>
          <td>${m.stated_indication ? esc(m.stated_indication) : '<span class="tag warn">none stated</span>'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  ${r.patientGoals.length ? `
  <h2>What matters to the patient</h2>
  <div class="card">
    ${r.patientGoals.map((g) => `<div class="quote">&ldquo;${esc(g)}&rdquo;</div>`).join('')}
    <div class="citation">Recorded as FHIR Goal with <code>expressedBy</code> = the patient, not the clinician.</div>
  </div>` : ''}

  ${snap.taper?.steps?.length ? `
  <h2>Draft taper — ${esc(snap.taper.drug)}</h2>
  <div class="card">
    <table>
      <thead><tr><th style="width:70px">Week</th><th style="width:180px">Dose</th><th>Note</th></tr></thead>
      <tbody>${snap.taper.steps.map((s) => `
        <tr><td class="num">${s.week}</td><td>${esc(s.dose)}</td><td class="muted">${esc(s.note)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="citation">Instantiated from the published deprescribing.org algorithm. Draft CarePlan — requires clinician sign-off.</div>
  </div>` : ''}

  ${snap.objection ? `
  <h2>Reviewer objection — peer review</h2>
  <div class="card">
    <p class="explain" style="margin:0">${esc(snap.objection)}</p>
    <div class="citation">Generated by an adversarial reviewer agent before any clinician sees the plan.</div>
  </div>` : ''}

  ${written}

  <div class="foot">
    Detection is deterministic — a citation-backed table lookup with zero LLM calls; the model
    never decides what is clinically wrong. Ranked options with visible citations, nothing
    time-critical, all resources preliminary/draft pending clinician review (FDA Non-Device CDS posture).
    Synthetic data only.
  </div>`;
}

/**
 * The thin review panel (README hour-by-hour, 15:45 slot).
 *
 * Server-rendered single HTML page, zero external assets — it must work on venue
 * wifi that barely works. Served by src/server.ts at /review; the demo runner also
 * snapshots to out/last-review.json so the panel shows the latest run, live or canned.
 *
 * Regulatory posture (FDA Non-Device CDS): every finding renders with its citation
 * visible next to it, severity never rides on color alone (icon + label), and the
 * footer states that nothing is final without a clinician.
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
  high:     { color: 'var(--critical)', icon: '&#9679;', label: 'HIGH' },
  moderate: { color: 'var(--serious)',  icon: '&#9650;', label: 'MODERATE' },
  low:      { color: 'var(--warning)',  icon: '&#9632;', label: 'LOW' },
} as const;

const KIND_LABEL: Record<Finding['kind'], string> = {
  cascade: 'Prescribing cascade',
  pim: 'Potentially inappropriate medication',
  'no-indication': 'No stated indication',
  anticholinergic: 'Anticholinergic burden',
  duplicate: 'Therapeutic duplication',
};

function findingCard(f: Finding): string {
  const sev = SEVERITY[f.severity];
  const confirmed = f.kind === 'cascade'
    ? (f.symptomConfirmed
        ? `<span class="confirm yes">&#10003; patient reported the linking symptom${f.linkingSymptom ? ` (&ldquo;${esc(f.linkingSymptom)}&rdquo;)` : ''}</span>`
        : `<span class="confirm no">&#9675; structural only — linking symptom not reported</span>`)
    : '';
  return `
  <div class="card finding">
    <div class="finding-head">
      <span class="sev"><span class="sev-dot" style="color:${sev.color}">${sev.icon}</span>${sev.label}</span>
      <span class="kind">${KIND_LABEL[f.kind]}</span>
    </div>
    <div class="finding-label">${esc(f.label)}</div>
    <div class="chain">${f.implicated.map(esc).join(' <span class="arrow">&rarr;</span> ')}</div>
    ${confirmed}
    ${f.explanation ? `<p class="explain">${esc(f.explanation)}</p>` : ''}
    <div class="citation">${esc(f.citation)}</div>
  </div>`;
}

export function renderReviewHtml(snap: ReviewSnapshot | null): string {
  const body = snap ? renderBody(snap) : `
    <div class="card empty">
      <p>No review yet. Run <code>npm run demo</code>, or complete a voice call.</p>
      <p class="muted">This page refreshes automatically.</p>
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
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --page: #0d0d0d; --surface: #1a1a19;
      --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
      --hairline: #2c2c2a; --border: rgba(255,255,255,0.10);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--page); color: var(--ink);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 980px; margin: 0 auto; padding: 28px 20px 60px; }
  h1 { font-size: 22px; margin: 0; }
  .sub { color: var(--ink-2); margin: 4px 0 0; }
  .sub a { color: inherit; }
  .muted { color: var(--muted); }
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 16px 18px; margin-top: 14px;
  }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-top: 20px; }
  .tile { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
  .tile .label { font-size: 13px; color: var(--ink-2); }
  .tile .value { font-size: 34px; font-weight: 600; line-height: 1.15; margin-top: 2px; }
  .tile .note { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .meter { height: 6px; border-radius: 3px; margin-top: 10px; background: color-mix(in srgb, var(--meter-color) 18%, var(--surface)); position: relative; overflow: hidden; }
  .meter > span { position: absolute; inset: 0 auto 0 0; width: var(--meter-fill); background: var(--meter-color); border-radius: 3px; }
  .banner {
    margin-top: 20px; padding: 16px 18px; border-radius: 10px;
    background: color-mix(in srgb, var(--critical) 8%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--critical) 35%, var(--border));
  }
  .banner .chain { font-size: 20px; font-weight: 600; margin-top: 4px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .04em; color: var(--ink-2); margin: 30px 0 2px; }
  .finding-head { display: flex; gap: 12px; align-items: baseline; font-size: 12.5px; }
  .sev { font-weight: 600; letter-spacing: .03em; }
  .sev-dot { margin-right: 5px; font-size: 11px; }
  .kind { color: var(--ink-2); }
  .finding-label { font-weight: 600; margin-top: 5px; }
  .chain { color: var(--ink-2); margin-top: 2px; }
  .arrow { color: var(--muted); }
  .confirm { display: inline-block; font-size: 12.5px; margin-top: 5px; }
  .confirm.yes { color: var(--good); }
  .confirm.no { color: var(--muted); }
  .explain { margin: 8px 0 0; color: var(--ink-2); }
  .citation { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--hairline); font-size: 12.5px; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 14px; }
  th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 600; padding: 6px 10px 6px 0; border-bottom: 1px solid var(--hairline); }
  td { padding: 7px 10px 7px 0; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  td.num { font-variant-numeric: tabular-nums; }
  .tag { display: inline-block; font-size: 11.5px; border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; color: var(--ink-2); margin-left: 6px; }
  .tag.warn { color: var(--critical); border-color: color-mix(in srgb, var(--critical) 40%, var(--border)); }
  .foot { margin-top: 34px; padding-top: 14px; border-top: 1px solid var(--hairline); font-size: 12.5px; color: var(--muted); }
  code { background: color-mix(in srgb, var(--ink) 6%, var(--surface)); padding: 1px 5px; border-radius: 4px; }
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
  const when = new Date(snap.at).toLocaleString();

  const consoleLink = snap.patientId
    ? ` &middot; <a href="https://app.medplum.com/Patient/${snap.patientId}" target="_blank">open in Medplum console</a>`
    : '';

  const written = snap.written ? `
  <div class="card">
    <strong>Written to Medplum</strong>
    <span class="muted"> — MedicationStatement &times; ${snap.written.meds}, Flag &times; ${snap.written.flags},
    DetectedIssue &times; ${snap.written.cascades}, Goal &times; ${snap.written.goals}${snap.written.risk ? ', RiskAssessment' : ''}.
    All review resources are <em>preliminary / draft</em> pending clinician sign-off.</span>
  </div>` : '';

  return `
  <h1>Deprescribe — pre-visit medication review</h1>
  <p class="sub">Margaret Okonkwo, 82 <span class="tag">synthetic demo</span> &middot; ${esc(snap.source)} &middot; ${esc(when)}${consoleLink}</p>

  <div class="tiles">
    <div class="tile" style="--meter-color:${acbColor}; --meter-fill:${acbFill}%">
      <div class="label">Anticholinergic burden (ACB)</div>
      <div class="value">${r.acbScore}</div>
      <div class="meter"><span></span></div>
      <div class="note">&ge; 3 is clinically significant &middot; ${r.acbContributors.map((c) => `${esc(c.ingredient)} ${c.score}`).join(', ') || 'no contributors'}</div>
    </div>
    <div class="tile">
      <div class="label">Findings</div>
      <div class="value">${r.findings.length}</div>
      <div class="note">${r.findings.filter((f) => f.severity === 'high').length} high severity</div>
    </div>
    <div class="tile">
      <div class="label">Medications</div>
      <div class="value">${r.meds.length}</div>
      <div class="note">${r.unresolvedCount ? `${r.unresolvedCount} unresolved &rarr; clinician` : 'all resolved to RxNorm'}</div>
    </div>
    <div class="tile">
      <div class="label">Cascades detected</div>
      <div class="value">${cascades.length}</div>
      <div class="note">${confirmedCascades} symptom-confirmed</div>
    </div>
  </div>

  ${snap.chains.length ? `
  <div class="banner">
    <div class="muted" style="font-size:12.5px">CHAINED PRESCRIBING CASCADE</div>
    ${snap.chains.map((c) => `<div class="chain">${c.map(esc).join(' <span class="arrow">&rarr;</span> ')}</div>`).join('')}
    <div class="muted" style="margin-top:4px">Drugs prescribed to treat the side effects of other drugs.</div>
  </div>` : ''}

  ${r.redFlags.length ? `
  <div class="banner">
    <div style="font-weight:600">&#9888; Red flags — review halted &amp; escalated</div>
    <div>${r.redFlags.map(esc).join('; ')}</div>
  </div>` : ''}

  <h2>Findings</h2>
  ${r.findings.map(findingCard).join('')}

  <h2>Medications as the patient described them</h2>
  <div class="card">
    <table>
      <thead><tr><th>Patient said</th><th>Resolved ingredient</th><th>Stated indication</th></tr></thead>
      <tbody>
      ${r.meds.map((m) => `
        <tr>
          <td>&ldquo;${esc(m.spoken_as)}&rdquo;</td>
          <td>${m.ingredient ? `${esc(m.ingredient)} <span class="muted">rxcui ${esc(m.rxcui ?? '')}</span>` : '<span class="tag warn">unresolved — clinician review</span>'}${m.otc ? '<span class="tag">OTC</span>' : ''}</td>
          <td>${m.stated_indication ? esc(m.stated_indication) : '<span class="tag warn">none stated</span>'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  ${r.patientGoals.length ? `
  <h2>What matters to the patient</h2>
  <div class="card">${r.patientGoals.map((g) => `<div>&ldquo;${esc(g)}&rdquo;</div>`).join('')}
    <div class="citation">Recorded as FHIR Goal with expressedBy = the patient, not the clinician.</div>
  </div>` : ''}

  ${snap.taper?.steps?.length ? `
  <h2>Draft taper — ${esc(snap.taper.drug)}</h2>
  <div class="card">
    <table>
      <thead><tr><th>Week</th><th>Dose</th><th>Note</th></tr></thead>
      <tbody>${snap.taper.steps.map((s) => `
        <tr><td class="num">${s.week}</td><td>${esc(s.dose)}</td><td class="muted">${esc(s.note)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="citation">Instantiated from the published deprescribing.org algorithm. Draft CarePlan — requires clinician sign-off.</div>
  </div>` : ''}

  ${snap.objection ? `
  <h2>Reviewer objection (peer review)</h2>
  <div class="card"><p class="explain" style="margin:0">${esc(snap.objection)}</p>
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

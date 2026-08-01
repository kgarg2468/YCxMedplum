/**
 * The clinician coordination panel — projector edition.
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
 *
 * WORDING IS A SAFETY CONTROL. The panel presents potential concerns for review:
 * it never states that a drug caused a symptom, never calls a cascade confirmed,
 * and never implies a prescriber erred. A reported symptom is shown as evidence
 * ("Patient reported the linking symptom"), not as proof.
 *
 * The snapshot is PRESENTATION-ONLY. No patient id, no chart resource id, no
 * generated output id, no deep link into a chart ever enters it — the panel is a
 * projector surface, and identifiers on a projector are a disclosure, not a feature.
 */

import type { ReviewResult, Finding } from '../types.js';
import type {
  ChartMedicationUseStatus, MedicationGapKind, PatientConcernIntent,
} from '../context/types.js';

/** A chart medication, stripped of every identifier before it reaches the page. */
export interface SnapshotChartMedication {
  display: string;
  ingredient: string | null;
  rxcui: string | null;
  strength: string | null;
  frequency: string | null;
  /** The recorded prescriber/source display. `null` means the chart records none. */
  sourceDisplay: string | null;
  /** `none` = the alias was never put to the patient on this call. */
  confirmation: ChartMedicationUseStatus | 'none';
}

export interface SnapshotGap {
  kind: MedicationGapKind;
  display: string;
  note?: string;
}

export interface SnapshotConcern {
  medicationName: string | null;
  patientWords: string;
  intent: PatientConcernIntent;
}

/** What was written, as prose. Deliberately no id and no link. */
export interface SnapshotWrittenResource {
  type: string;
  label: string;
  note?: string;
}

export interface ReviewSnapshot {
  at: string;                       // ISO timestamp of the run
  source: 'canned-demo' | 'live-call';
  review: ReviewResult;
  chains: string[][];
  objection?: string;
  taper?: { drug: string; steps: { week: number; dose: string; note: string }[] } | null;
  /** "Margaret Okonkwo, 83" — computed from the FHIR Patient, never hardcoded. */
  patientDisplay?: string;
  /** Pre-coordination snapshots used this name. Still rendered, never written. */
  patientLabel?: string;
  chart?: { medications: SnapshotChartMedication[]; conditions: string[] };
  gaps?: SnapshotGap[];
  concerns?: SnapshotConcern[];
  written?: {
    meds: number; flags: number; cascades: number; goals: number; risk: boolean;
    /** True when a red flag produced an urgent Task. */
    task?: boolean;
    /** Per-resource detail incl. the note/comment text the console UI buries. */
    resources?: SnapshotWrittenResource[];
  };
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const escOr = (s: string | null | undefined, fallback = '&mdash;') =>
  s && s.trim() ? esc(s) : fallback;

// ── Presentation vocabulary ─────────────────────────────────────────────────

const CONFIRMATION_LABEL: Record<SnapshotChartMedication['confirmation'], string> = {
  'taking-as-documented': 'Taking as documented',
  'taking-differently': 'Taking differently',
  'not-taking': 'Reports not taking it',
  unclear: 'Use not confirmed',
  none: 'Not raised on this call',
};

/** A confirmation is an explicit answer from the patient — silence is not one. */
const EXPLICIT: ReadonlySet<string> = new Set(['taking-as-documented', 'taking-differently', 'not-taking']);

const GAP_LABEL: Record<MedicationGapKind, string> = {
  'patient-only': 'Not in the chart — the patient reports taking it',
  'strength-mismatch': 'Strength differs from the chart',
  'frequency-mismatch': 'Frequency differs from the chart',
  'missing-indication': 'No indication recorded or stated',
  'not-taking': 'In the chart, but the patient reports not taking it',
  'use-unclear': 'In the chart; current use was not confirmed on this call',
};

const INTENT_LABEL: Record<PatientConcernIntent, string> = {
  'concern-only': 'wants it discussed',
  'discuss-changing': 'wants to discuss changing it',
  'discuss-stopping': 'wants to discuss stopping it',
};

type BasisKind = 'confirmed' | 'partial' | 'unconfirmed';

/**
 * How much of this review actually rests on the patient confirming the chart.
 * A review nobody confirmed must say so at the top: the worst failure mode of a
 * medication panel is looking complete when it is not.
 */
export function reviewBasis(snap: ReviewSnapshot): { kind: BasisKind; text: string; note: string } {
  const meds = snap.chart?.medications ?? [];
  const confirmed = meds.filter((m) => EXPLICIT.has(m.confirmation)).length;

  if (!meds.length || confirmed === 0) {
    return {
      kind: 'unconfirmed',
      text: 'Review based on an unconfirmed medication set',
      note: 'No charted medication was confirmed with the patient on this run. Treat this as a starting point for review, not a complete medication list.',
    };
  }
  if (confirmed < meds.length) {
    return {
      kind: 'partial',
      text: 'Review based on a partially confirmed medication set',
      note: `${confirmed} of ${meds.length} charted medications were confirmed with the patient; the rest remain unconfirmed.`,
    };
  }
  return {
    kind: 'confirmed',
    text: 'Review based on a confirmed medication set',
    note: `All ${meds.length} charted medications were put to the patient and answered.`,
  };
}

export type SourceRelationLabel = 'Cross-prescriber' | 'Same recorded source' | 'Source relationship unknown';

/**
 * Join implicated ingredients to their recorded sources — by EXACT ingredient
 * key only. Never by substring of the source display: two rows both mentioning
 * "Primary care" are not evidence of anything, and a display that happens to
 * contain another is not a match. Anything less than a unique, non-null join for
 * every implicated ingredient is `Source relationship unknown`.
 */
export function sourceRelation(
  implicated: string[],
  chart: SnapshotChartMedication[] | undefined,
): { label: SourceRelationLabel; sources: string[] } | null {
  if (!chart?.length || implicated.length < 2) return null;

  const sources: string[] = [];
  for (const ing of implicated) {
    const key = ing.trim().toLowerCase();
    const rows = chart.filter((m) => (m.ingredient ?? '').trim().toLowerCase() === key);
    if (rows.length !== 1 || !rows[0].sourceDisplay) {
      return { label: 'Source relationship unknown', sources: [] };
    }
    sources.push(rows[0].sourceDisplay);
  }
  const distinct = [...new Set(sources)];
  if (distinct.length === sources.length) return { label: 'Cross-prescriber', sources: distinct };
  if (distinct.length === 1) return { label: 'Same recorded source', sources: distinct };
  return { label: 'Source relationship unknown', sources: distinct };
}

/** The citation for every curated link in a chain — no finding goes uncited. */
function citationsFor(chain: string[], cascades: Finding[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const link = cascades.find((f) => f.implicated[0] === chain[i] && f.implicated[1] === chain[i + 1]);
    if (link && !out.includes(link.citation)) out.push(link.citation);
  }
  return out;
}

function sourceChip(relation: ReturnType<typeof sourceRelation>): string {
  if (!relation) return '';
  const cls = relation.label === 'Cross-prescriber' ? ' cross' : '';
  const detail = relation.sources.length ? ` &middot; ${relation.sources.map(esc).join(' &middot; ')}` : '';
  return `<div class="source-chip${cls}">${relation.label}${detail}</div>`;
}

const SEVERITY = {
  high:     { var: '--sev-high', icon: '&#9679;', label: 'High' },
  moderate: { var: '--sev-mod',  icon: '&#9650;', label: 'Moderate' },
  low:      { var: '--sev-low',  icon: '&#9632;', label: 'Low' },
} as const;

/**
 * Section heading. The bracketing and the caps are CSS, never text: the literal
 * heading strings are a tested contract, so they stay exactly as written here.
 */
function head(step: string | null, text: string, count?: string | number | null): string {
  return `<h2>${step ? `<span class="step">STEP ${step}</span>` : ''}<span class="lbl">${text}</span>${
    count !== null && count !== undefined ? `<span class="count">${count}</span>` : ''}</h2>`;
}

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

function findingCard(f: Finding, chart?: SnapshotChartMedication[]): string {
  const sev = SEVERITY[f.severity];
  // Evidence, stated as evidence. A reported symptom supports the finding; it
  // does not confirm causation, so the wording never claims a proven cascade.
  const evidence = f.kind === 'cascade'
    ? (f.symptomConfirmed
        ? `<div class="confirm yes">&#10003; Patient reported the linking symptom</div>`
        : `<div class="confirm no">&#9675; Present in the medication list; linking symptom not reported</div>`)
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
    ${evidence}
    ${sourceChip(sourceRelation(f.implicated, chart))}
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anybody:wght@400;600;800&family=Space+Mono:wght@400;700&display=swap">
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
  /* ── Design system ──────────────────────────────────────────────────────
     Sharp corners everywhere (zero border-radius), hairline rules, no drop
     shadows: depth comes from alternating light-canvas / dark-ink bands.
     Severity is never colour alone — every severity carries an icon + word. */
  :root {
    color-scheme: light;
    --canvas: #E9E9E9;
    --surface: #EEEEEE;
    --ink: #3D3B4F;
    --ink-50: rgba(61,59,79,0.5);
    --ink-70: rgba(61,59,79,0.7);
    --on-dark: #EEEEEE;
    --on-dark-60: rgba(238,238,238,0.62);
    --mint: #28E99F;
    --mint-pale: #C5FFD6;
    --pink: #FFCFFE;
    --pink-soft: rgba(255,172,254,0.1);
    --blue: rgba(88,130,255,0.5);
    --hairline: rgba(61,59,79,0.15);
    --hairline-strong: rgba(61,59,79,0.32);

    /* Severity — differentiated in hue AND always paired with icon + label. */
    --sev-high: #B4142E;
    --sev-mod:  #9A5308;
    --sev-low:  #3F4FA8;
    --good: #0B7A4B;

    --display: "Anybody", "Helvetica Neue", Arial, sans-serif;
    --mono: "Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  * { box-sizing: border-box; border-radius: 0 !important; }
  html { background: var(--canvas); }
  body {
    margin: 0; background: var(--canvas); color: var(--ink);
    font: 500 15px/1.62 var(--mono); letter-spacing: .35px;
    -webkit-font-smoothing: antialiased; overflow-x: hidden;
  }
  main { position: relative; z-index: 0; max-width: 1180px; margin: 0 auto; padding: 0 32px 0; }
  strong, b { font-weight: 700; }
  .muted, .dim { color: var(--ink-50); }

  /* Full-bleed dark band — the rhythm device. */
  .band { position: relative; margin: 72px 0 0; padding: 64px 0 68px; color: var(--on-dark); }
  .band::before {
    content: ""; position: absolute; z-index: -1; top: 0; bottom: 0;
    left: 50%; transform: translateX(-50%); width: 100vw; background: var(--ink);
  }
  .band {
    --surface: rgba(238,238,238,0.06);
    --hairline: rgba(238,238,238,0.22);
    --hairline-strong: rgba(238,238,238,0.4);
    --ink-50: var(--on-dark-60);
    --ink-70: rgba(238,238,238,0.8);
    --sev-high: #FF9BA8; --sev-mod: #FFCFFE; --sev-low: #9EB6FF; --good: var(--mint);
  }
  .band h2 { color: var(--mint-pale); }
  .band h2 .lbl { color: var(--on-dark); }

  /* ── Masthead ───────────────────────────────────────────────────────── */
  .masthead { padding: 44px 0 0; }
  .wordmark {
    font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: 1.2px;
    text-transform: uppercase; color: var(--ink-50);
  }
  .wordmark .minus { color: var(--ink); font-weight: 700; }
  h1 {
    font-family: var(--display); font-weight: 800;
    font-size: clamp(46px, 7.4vw, 96px); line-height: .94; letter-spacing: -2.4px;
    margin: 18px 0 0; text-transform: none;
  }
  .sub {
    margin: 22px 0 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: stretch;
    font-family: var(--mono); font-size: 12px; letter-spacing: 1.2px; text-transform: uppercase;
  }
  .pill {
    display: inline-flex; align-items: center; padding: 6px 12px; font-weight: 700;
    border: 1px solid var(--hairline-strong); color: var(--ink);
  }
  .pill.name { background: var(--ink); color: var(--on-dark); border-color: var(--ink); }
  .pill.live { background: var(--mint); border-color: var(--mint); color: var(--ink); }
  .pill.time { border-style: dashed; color: var(--ink-50); }

  /* ── Review basis — the completeness caveat, never quiet ─────────────── */
  .basis {
    margin-top: 26px; padding: 20px 24px 22px; background: var(--surface);
    border: 1px solid var(--hairline); border-left: 8px solid var(--good);
  }
  .basis .flag {
    font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: 1.8px;
    text-transform: uppercase; color: var(--ink-50);
  }
  .basis .flag::before { content: "[ "; } .basis .flag::after { content: " ]"; }
  .basis .headline {
    font-family: var(--display); font-weight: 600; font-size: clamp(20px, 2.3vw, 30px);
    letter-spacing: -1.1px; line-height: 1.12; margin-top: 8px;
  }
  .basis .note { color: var(--ink-70); font-size: 13.5px; margin-top: 8px; max-width: 74ch; }
  .basis.partial { border-left-color: var(--sev-mod); }
  .basis.unconfirmed { border-left-color: var(--sev-high); background: var(--pink-soft); }
  .basis.unconfirmed .flag { color: var(--sev-high); }

  /* ── Stat row — the signature giant numerals ─────────────────────────── */
  .tiles {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    margin-top: 44px; border-top: 1px solid var(--hairline-strong); border-left: 1px solid var(--hairline);
  }
  .tile {
    padding: 22px 24px 26px; border-right: 1px solid var(--hairline); border-bottom: 1px solid var(--hairline);
    display: flex; flex-direction: column;
  }
  .tile .label {
    font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: 1.8px;
    text-transform: uppercase; color: var(--ink-50);
  }
  .tile .value {
    font-family: var(--display); font-weight: 800; font-size: clamp(62px, 8vw, 104px);
    line-height: .9; letter-spacing: -3px; margin: 12px 0 auto; font-variant-numeric: tabular-nums;
  }
  .tile .note { font-size: 12px; color: var(--ink-50); margin-top: 14px; line-height: 1.5; letter-spacing: .3px; }
  .meter { height: 8px; margin-top: 20px; position: relative; background: rgba(61,59,79,0.12); }
  .meter .fill { position: absolute; inset: 0 auto 0 0; width: var(--meter-fill); background: var(--meter-color); }
  .meter .tick { position: absolute; top: -4px; bottom: -4px; left: var(--meter-tick); width: 2px; background: var(--ink); }

  /* ── Red flags ───────────────────────────────────────────────────────── */
  .redflag {
    margin-top: 36px; padding: 24px 26px; background: var(--ink); color: var(--on-dark);
    border-left: 10px solid var(--pink); font-size: 16px; letter-spacing: .3px;
  }
  .redflag strong { color: var(--pink); text-transform: uppercase; letter-spacing: 1.2px; font-size: 13px; display: block; margin-bottom: 8px; }

  /* ── Section heads: STEP 0n  +  [ BRACKETED LABEL ] ──────────────────── */
  h2 {
    margin: 64px 0 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 16px;
    font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: 1.8px;
    text-transform: uppercase; color: var(--ink-50);
  }
  h2 .step { color: var(--ink-50); }
  .band h2 .step { color: var(--mint-pale); }
  h2 .lbl { color: var(--ink); }
  h2 .lbl::before { content: "[ "; } h2 .lbl::after { content: " ]"; }
  h2 .count {
    font-family: var(--display); font-weight: 800; font-size: 22px; letter-spacing: -.8px;
    color: var(--ink-50); margin-left: auto;
  }
  .band h2 { margin-top: 0; }

  /* ── Cards ───────────────────────────────────────────────────────────── */
  .card {
    background: var(--surface); border: 1px solid var(--hairline);
    padding: 22px 24px; margin-top: 16px;
  }
  .finding { border-left: 6px solid var(--accent); }
  .finding-head { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; }
  .sev-chip {
    display: inline-flex; align-items: center; gap: 7px;
    font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
    border: 1px solid var(--accent); color: var(--accent); padding: 4px 10px;
  }
  .sev-icon { font-size: 10px; }
  .kind { color: var(--ink-50); font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; font-weight: 700; }
  .finding-label {
    font-family: var(--display); font-weight: 600; font-size: 24px; letter-spacing: -0.96px;
    line-height: 1.14; margin-top: 14px;
  }
  .chain-line { color: var(--ink-70); margin-top: 8px; font-size: 14px; }

  .flow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 0; margin-top: 16px; }
  .flow .node {
    background: transparent; border: 1px solid var(--hairline-strong); padding: 8px 16px;
    font-family: var(--display); font-weight: 600; font-size: 20px; letter-spacing: -.8px;
  }
  .flow .link { display: flex; flex-direction: column; align-items: center; padding: 0 14px; line-height: 1.2; }
  .flow .link-symptom { font-size: 10.5px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--ink-50); }
  .flow .link-symptom.hit { color: var(--good); font-weight: 700; }
  .flow .link-arrow { font-size: 20px; color: var(--ink-50); }

  .confirm { font-size: 12px; margin-top: 14px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; }
  .confirm.yes { color: var(--good); }
  .confirm.no { color: var(--ink-50); }
  .explain { margin: 14px 0 0; color: var(--ink-70); font-size: 14px; max-width: 78ch; }
  .citation {
    margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--hairline);
    font-size: 11.5px; letter-spacing: 1.1px; color: var(--ink-50); line-height: 1.6;
  }

  /* ── Hero: the chained cascade, on the dark band ─────────────────────── */
  .hero { margin-top: 16px; padding: 28px 30px 30px; background: var(--surface); border: 1px solid var(--hairline); }
  .hero .eyebrow {
    font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: 1.8px;
    text-transform: uppercase; color: var(--mint);
  }
  .hero-title {
    font-family: var(--display); font-weight: 600; font-size: clamp(26px, 3vw, 36px);
    letter-spacing: -1.44px; line-height: 1.08; margin-top: 16px; color: var(--ink);
  }
  .band .hero-title { color: var(--mint-pale); }
  .diagram { display: flex; flex-wrap: wrap; align-items: stretch; gap: 12px 0; margin-top: 22px; }
  .drug { border: 1px solid var(--hairline-strong); padding: 16px 20px 14px; min-width: 180px; }
  .drug .name { font-family: var(--display); font-weight: 800; font-size: 30px; letter-spacing: -1.4px; line-height: 1; }
  .drug .why { font-size: 12px; color: var(--ink-50); margin-top: 10px; max-width: 220px; line-height: 1.45; }
  .arrow-col { display: flex; align-items: center; padding: 0 16px; color: var(--mint); font-size: 30px; }
  .hero .caption { margin-top: 22px; color: var(--ink-70); font-size: 14px; max-width: 82ch; }
  .hero .caption strong { color: inherit; }
  .band .hero .caption strong { color: var(--mint-pale); }

  /* ── Tables ──────────────────────────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 13.5px; }
  th {
    text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1.4px;
    color: var(--ink-50); font-weight: 700; padding: 10px 16px 10px 0; border-bottom: 1px solid var(--hairline-strong);
  }
  td { padding: 13px 16px 13px 0; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  td.num { font-variant-numeric: tabular-nums; }
  .said { color: var(--ink-70); }
  .ing { font-family: var(--display); font-weight: 600; font-size: 17px; letter-spacing: -.5px; }
  .rxcui { font-size: 11px; color: var(--ink-50); letter-spacing: 1px; }
  .tag {
    display: inline-block; font-size: 10.5px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase;
    border: 1px solid var(--hairline-strong); padding: 2px 8px; color: var(--ink-50); margin-left: 6px; white-space: nowrap;
  }
  .tag.warn { color: var(--sev-high); border-color: var(--sev-high); background: var(--pink-soft); }

  /* ── Source relationship chip ────────────────────────────────────────── */
  .source-chip {
    margin-top: 16px; display: inline-block; font-size: 11px; font-weight: 700;
    letter-spacing: 1.4px; text-transform: uppercase;
    border: 1px solid var(--hairline-strong); padding: 5px 11px; color: var(--ink-70);
  }
  .source-chip.cross { color: var(--ink); background: var(--mint); border-color: var(--mint); }
  .band .source-chip.cross { color: var(--ink); }

  /* ── Patient's own ask ───────────────────────────────────────────────── */
  .ask { border-left: 6px solid var(--mint); }
  .ask .intent { color: var(--ink-50); font-size: 11.5px; letter-spacing: 1.4px; text-transform: uppercase; margin-top: 8px; }
  .quote {
    font-family: var(--display); font-weight: 600; font-size: clamp(22px, 2.6vw, 36px);
    letter-spacing: -1.44px; line-height: 1.1; margin-top: 6px;
  }
  .quote + .quote { margin-top: 18px; }
  .gap { display: flex; flex-wrap: wrap; gap: 6px 20px; align-items: baseline; padding: 14px 0; border-bottom: 1px solid var(--hairline); }
  .gap:first-child { padding-top: 0; }
  .gap:last-child { border-bottom: none; padding-bottom: 0; }
  .gap .what { font-family: var(--display); font-weight: 600; font-size: 20px; letter-spacing: -.8px; min-width: 220px; }
  .gap .why { color: var(--ink-70); font-size: 13.5px; }
  .empty-note { color: var(--ink-50); font-size: 14px; }

  .foot {
    padding: 0; font-size: 12px; letter-spacing: 1px; line-height: 1.75;
    color: var(--on-dark-60); max-width: 92ch;
  }
  .foot .foot-mark {
    font-family: var(--display); font-weight: 800; font-size: clamp(28px, 4vw, 52px);
    letter-spacing: -1.8px; color: var(--mint); display: block; margin-bottom: 18px; line-height: 1;
  }
  code { font-family: var(--mono); background: var(--pink-soft); padding: 1px 6px; }
  .band code { background: rgba(238,238,238,0.12); }

  .empty { margin-top: 80px; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function renderBody(snap: ReviewSnapshot): string {
  const r = snap.review;
  const cascades = r.findings.filter((f) => f.kind === 'cascade');
  const confirmedCascades = cascades.filter((f) => f.symptomConfirmed).length;
  const acbColor = r.acbScore >= 6 ? 'var(--sev-high)' : r.acbScore >= 3 ? 'var(--sev-mod)' : 'var(--good)';
  const acbFill = Math.min(100, Math.round((r.acbScore / 12) * 100));
  const acbTick = Math.round((3 / 12) * 100); // clinical threshold marker
  const when = new Date(snap.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  // Annotate hero chain nodes with the patient's own reason for taking each drug.
  const whyFor = (ing: string) => {
    const med = r.meds.find((m) => m.ingredient === ing);
    return med?.stated_indication ?? '';
  };

  const chartMeds = snap.chart?.medications;
  const basis = reviewBasis(snap);

  // The stated priority is usually the same sentence as the concern that was
  // logged from it. Say it once — a repeated quote on a projector reads as a bug.
  const spoken = new Set((snap.concerns ?? []).map((c) => c.patientWords.trim()));
  const extraGoals = r.patientGoals.filter((g) => !spoken.has(g.trim()));

  // ── 5. the hero: the strongest potential cascade, plus any chain ──────────
  const hero = cascades[0];
  const heroSection = (hero || snap.chains.length) ? `
  <section class="band">
  ${head('04', 'Potential prescribing cascade')}
  ${snap.chains.map((chain) => `
  <div class="hero">
    <div class="eyebrow">Chained pattern</div>
    <div class="diagram">
      ${chain.map((drug, i) => `
        ${i > 0 ? '<span class="arrow-col">&#10230;</span>' : ''}
        <span class="drug">
          <div class="name">${esc(drug)}</div>
          ${whyFor(drug) ? `<div class="why">&ldquo;${esc(whyFor(drug))}&rdquo;</div>` : ''}
        </span>`).join('')}
    </div>
    <div class="caption"><strong>${chain.length - 1} of these ${chain.length} medications may have been added in response to
    a side effect of the one before it.</strong> Shown as a potential cascade for clinician review &mdash; the pattern is a
    prompt to reconsider the earlier medication, not a statement about what happened.</div>
    ${sourceChip(sourceRelation(chain, chartMeds))}
    <div class="citation">${citationsFor(chain, cascades).map(esc).join(' &middot; ') || 'Curated cascade rules, cited per link below.'}</div>
  </div>`).join('')}
  ${hero ? `
  <div class="hero" style="--accent: var(${SEVERITY[hero.severity].var})">
    <div class="finding-head">
      <span class="sev-chip"><span class="sev-icon">${SEVERITY[hero.severity].icon}</span>${SEVERITY[hero.severity].label}</span>
      <span class="kind">${KIND_LABEL[hero.kind]}</span>
    </div>
    <div class="hero-title">${esc(hero.label)}</div>
    ${cascadeFlow(hero)}
    <div class="caption"><strong>${esc(hero.implicated[1] ?? '')} may have been added in response to a side effect of
    ${esc(hero.implicated[0] ?? '')}.</strong>${hero.linkingSymptom ? ` Linking symptom: ${esc(hero.linkingSymptom)}.` : ''}
    Shown as a potential cascade for clinician review.</div>
    ${hero.symptomConfirmed
      ? '<div class="confirm yes">&#10003; Patient reported the linking symptom</div>'
      : '<div class="confirm no">&#9675; Present in the medication list; linking symptom not reported</div>'}
    ${sourceChip(sourceRelation(hero.implicated, chartMeds))}
    <div class="citation">${esc(hero.citation)}</div>
  </div>` : ''}
  </section>` : '';

  // ── 8. what actually landed in the record — prose only, no ids, no links ──
  const w = snap.written;
  const written = `
  ${head('07', 'FHIR resources written')}
  <div class="card">
    ${w ? `MedicationStatement &times; ${w.meds} &middot; Flag &times; ${w.flags} &middot;
    DetectedIssue &times; ${w.cascades} &middot; Goal &times; ${w.goals}${w.risk ? ' &middot; RiskAssessment' : ''}${w.task ? ' &middot; Task (urgent)' : ''}
    ${w.resources?.length ? `
    <table style="margin-top:12px">
      <thead><tr><th style="width:190px">Resource</th><th>Content</th><th>Notes written with it</th></tr></thead>
      <tbody>
      ${w.resources.map((res) => `
        <tr>
          <td>${esc(res.type)}</td>
          <td>${esc(res.label)}</td>
          <td class="muted">${res.note ? esc(res.note) : '&mdash;'}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : ''}` : '<span class="empty-note">No FHIR resources were written for this run.</span>'}
    <div class="citation">DetectedIssue carries <code>implicated</code> in causal order. Recommendation resources are
    written as <em>preliminary / draft / proposed</em> (DetectedIssue&nbsp;preliminary &middot; RiskAssessment&nbsp;preliminary &middot;
    CarePlan&nbsp;draft &middot; Communication&nbsp;preparation &middot; Goal&nbsp;proposed) — a clinician confirms before anything becomes final.
    Resource identifiers stay in Medplum; this page is a projector surface and carries none.</div>
  </div>`;

  return `
  <div class="masthead">
  <div class="wordmark">Deprescribe<span class="minus"> &minus;</span></div>
  <h1>Pre-visit<br>medication review</h1>
  <p class="sub">
    <span class="pill name">${esc(snap.patientDisplay ?? snap.patientLabel ?? 'Synthetic demo patient')}</span>
    <span class="pill">synthetic demo</span>
    <span class="pill${snap.source === 'live-call' ? ' live' : ''}">${snap.source === 'live-call' ? '&#9679; live call' : 'canned demo'}</span>
    <span class="pill time">${esc(when)}</span>
  </p>
  </div>

  <div class="basis ${basis.kind}">
    <div class="flag">Review basis</div>
    <div class="headline">${basis.text}</div>
    <div class="note">${basis.note}</div>
  </div>

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
      <div class="label">Potential cascades</div>
      <div class="value">${cascades.length}</div>
      <div class="note">${confirmedCascades} with the linking symptom reported by the patient</div>
    </div>
  </div>

  ${r.redFlags.length ? `
  <div class="redflag">
    <strong>&#9888; Red flags &mdash; ${snap.written?.task
      ? 'urgent FHIR Task created for clinician'
      : 'immediate clinician attention required'}</strong>${r.redFlags.map(esc).join('; ')}
  </div>` : ''}

  ${head('01', 'What the patient wants addressed')}
  <div class="card ask">
    ${(snap.concerns ?? []).map((c) => `
      <div class="quote">&ldquo;${esc(c.patientWords)}&rdquo;</div>
      <div class="intent">${c.medicationName ? `${esc(c.medicationName)} &mdash; ` : ''}${INTENT_LABEL[c.intent]}</div>`).join('')}
    ${extraGoals.map((g) => `<div class="quote">&ldquo;${esc(g)}&rdquo;</div>`).join('')}
    ${!(snap.concerns ?? []).length && !r.patientGoals.length
      ? '<span class="empty-note">The patient did not raise a specific medication on this call.</span>' : ''}
    <div class="citation">Recorded verbatim as a FHIR Goal with <code>expressedBy</code> = the patient, not the clinician.
    Priorities the patient states are review prompts, never instructions to change a medication.</div>
  </div>

  ${head('02', 'Known before the call', chartMeds ? chartMeds.length : null)}
  <div class="card">
    ${chartMeds?.length ? `
    <table>
      <thead><tr><th style="width:32%">Charted medication</th><th style="width:28%">Recorded source</th><th>Dose &amp; frequency</th><th>Confirmed on the call</th></tr></thead>
      <tbody>
      ${chartMeds.map((m) => `
        <tr>
          <td><span class="ing">${escOr(m.display)}</span>${m.rxcui ? ` <span class="rxcui">rxcui ${esc(m.rxcui)}</span>` : ''}</td>
          <td>${m.sourceDisplay ? esc(m.sourceDisplay) : '<span class="tag warn">no source recorded</span>'}</td>
          <td class="muted">${[m.strength, m.frequency].filter(Boolean).map((x) => esc(x!)).join(' &middot; ') || '&mdash;'}</td>
          <td>${CONFIRMATION_LABEL[m.confirmation]}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<span class="empty-note">No chart context was loaded for this run — everything below comes from the interview alone.</span>'}
    ${snap.chart?.conditions?.length
      ? `<div class="citation">Charted conditions: ${snap.chart.conditions.map(esc).join(' &middot; ')}</div>` : ''}
  </div>

  ${head('03', 'Patient-reported changes or gaps', snap.gaps ? snap.gaps.length : null)}
  <div class="card">
    ${snap.gaps?.length ? snap.gaps.map((g) => `
      <div class="gap">
        <span class="what">${esc(g.display)}</span>
        <span class="why">${GAP_LABEL[g.kind]}${g.note ? ` &mdash; ${esc(g.note)}` : ''}</span>
      </div>`).join('')
      : `<span class="empty-note">${snap.gaps
          ? 'The chart and the interview agreed on every medication.'
          : 'No chart comparison was available for this run.'}</span>`}
  </div>

  ${heroSection}

  ${head('05', 'Other findings', Math.max(0, r.findings.length - (hero ? 1 : 0)))}
  ${r.findings.filter((f) => f !== hero).map((f) => findingCard(f, chartMeds)).join('')
    || '<div class="card"><span class="empty-note">No further findings.</span></div>'}

  ${snap.taper?.steps?.length ? `
  ${head(null, `Draft taper &mdash; ${esc(snap.taper.drug)}`)}
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
  ${head(null, 'Reviewer objection &mdash; peer review')}
  <div class="card">
    <p class="explain" style="margin:0">${esc(snap.objection)}</p>
    <div class="citation">Generated by an adversarial reviewer agent before any clinician sees the plan.</div>
  </div>` : ''}

  ${head('06', 'Medication reconciliation', r.meds.length)}
  <div class="card">
    <table>
      <thead><tr><th style="width:26%">Medication</th><th style="width:24%">Recorded source</th><th style="width:26%">Patient said</th><th>Why they take it</th></tr></thead>
      <tbody>
      ${r.meds.map((m) => {
        const key = (m.ingredient ?? '').trim().toLowerCase();
        const rows = key ? (chartMeds ?? []).filter((c) => (c.ingredient ?? '').trim().toLowerCase() === key) : [];
        const source = rows.length === 1 && rows[0].sourceDisplay
          ? esc(rows[0].sourceDisplay)
          : rows.length === 0
            ? '<span class="tag warn">not in the chart</span>'
            : '<span class="tag warn">no single recorded source</span>';
        return `
        <tr>
          <td>${m.ingredient
            ? `<span class="ing">${esc(m.ingredient)}</span> <span class="rxcui">rxcui ${esc(m.rxcui ?? '')}</span>`
            : '<span class="tag warn">unresolved &rarr; clinician review</span>'}${m.otc ? '<span class="tag">OTC</span>' : ''}</td>
          <td>${chartMeds ? source : '<span class="muted">&mdash;</span>'}</td>
          <td class="said">&ldquo;${esc(m.spoken_as)}&rdquo;</td>
          <td>${m.stated_indication ? esc(m.stated_indication) : '<span class="tag warn">none stated</span>'}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
    <div class="citation">Unresolved entries keep the patient's exact words and go to the clinician &mdash; the pipeline never guesses a code.</div>
  </div>

  ${written}

  <section class="band">
  <div class="foot">
    <span class="foot-mark">Deterministic detection.<br>Human sign-off.</span>
    Detection is deterministic — a citation-backed table lookup with zero LLM calls; the model
    never decides what is clinically wrong. Ranked options with visible citations, nothing
    time-critical, recommendation resources preliminary/draft pending clinician review (FDA Non-Device CDS posture).
    Synthetic data only.
  </div>
  </section>`;
}

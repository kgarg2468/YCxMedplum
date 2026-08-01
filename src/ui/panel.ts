/**
 * The clinician coordination panel — post-call dashboard edition.
 *
 * Server-rendered single HTML page, zero external assets — it must work on venue
 * wifi that barely works. Served by src/server.ts at /review; the demo runner also
 * snapshots to out/last-review.json so the panel shows the latest run, live or canned.
 *
 * This page is shown immediately AFTER a phone call, to break down what the call
 * produced. It is a DASHBOARD, not a deck: everything fits one laptop viewport,
 * ordered by what a clinician actually needs first —
 *   1. the medications the agent picked up,
 *   2. the findings (with the chained cascade called out),
 *   3. what was already known before the call.
 * Nothing scrolls at the page level; individual panels scroll internally.
 *
 * Design rules still in force:
 *  - severity never rides on color alone (icon + label, left accent as reinforcement);
 *  - every finding renders its citation, visible without interaction (FDA Non-Device
 *    CDS: the clinician can independently review the basis);
 *  - zero border-radius, hairline rules, no drop shadows.
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

import { FONT_FACE_CSS } from './fonts.js';
import type { ReviewResult, Finding, ResolvedMed } from '../types.js';
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

/** Full wording, used where there is room to read it (the chart panel). */
const CONFIRMATION_LABEL: Record<SnapshotChartMedication['confirmation'], string> = {
  'taking-as-documented': 'Taking as documented',
  'taking-differently': 'Taking differently',
  'not-taking': 'Reports not taking it',
  unclear: 'Use not confirmed',
  none: 'Not raised on this call',
};

/** Column-width wording for the dense medication table. Same meaning, fewer glyphs. */
const CONFIRMATION_SHORT: Record<SnapshotChartMedication['confirmation'], string> = {
  'taking-as-documented': 'As documented',
  'taking-differently': 'Taking differently',
  'not-taking': 'Reports not taking',
  unclear: 'Use not confirmed',
  none: 'Not raised',
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

/** Chip wording for the same gaps, sized for a table cell. Hover carries the full text. */
const GAP_CHIP: Record<MedicationGapKind, string> = {
  'patient-only': 'Not in chart',
  'strength-mismatch': 'Strength differs',
  'frequency-mismatch': 'Frequency differs',
  'missing-indication': 'No indication',
  'not-taking': 'Reports not taking',
  'use-unclear': 'Use not confirmed',
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

/** "Cardiology — Dr. Priya Shah" -> "Cardiology". Row-width shorthand only. */
const shortSource = (s: string) => s.split(/\s+[—–-]\s+/)[0].trim() || s;

/**
 * The source-relationship chip. The LABEL text is a tested safety contract and is
 * never abbreviated; only the accompanying source displays are shortened for
 * dense rows, with the full displays kept on the title attribute.
 */
function sourceChip(relation: ReturnType<typeof sourceRelation>, compact = false): string {
  if (!relation) return '';
  const cls = relation.label === 'Cross-prescriber' ? ' cross' : '';
  const shown = compact ? relation.sources.map(shortSource) : relation.sources;
  const detail = shown.length ? ` &middot; ${shown.map(esc).join(' &middot; ')}` : '';
  const title = relation.sources.length ? ` title="${esc(relation.sources.join(' · '))}"` : '';
  return `<span class="source-chip${cls}"${title}>${relation.label}${detail}</span>`;
}

const SEVERITY = {
  high:     { var: '--sev-high', icon: '&#9679;', label: 'High' },
  moderate: { var: '--sev-mod',  icon: '&#9650;', label: 'Moderate' },
  low:      { var: '--sev-low',  icon: '&#9632;', label: 'Low' },
} as const;

const KIND_LABEL: Record<Finding['kind'], string> = {
  cascade: 'Prescribing cascade',
  pim: 'Potentially inappropriate medication',
  'no-indication': 'No stated indication',
  anticholinergic: 'Anticholinergic burden',
  duplicate: 'Therapeutic duplication',
};

/**
 * Panel label. The bracketing and the caps are CSS, never text: the literal
 * label strings are a tested contract, so they stay exactly as written at the
 * call site.
 */
function panelTitle(text: string, count?: string | number | null): string {
  return `<div class="ptitle"><span class="lbl">${text}</span>${
    count !== null && count !== undefined ? `<span class="count">${count}</span>` : ''}</div>`;
}

// ── Gap ↔ medication join ───────────────────────────────────────────────────

/**
 * Gap displays are patient-facing strings ("senna", "omeprazole 20 mg once daily"),
 * so the join back to a resolved medication is best-effort and PRESENTATION ONLY —
 * a gap that finds no row is still rendered, never dropped.
 */
function gapMatches(gap: SnapshotGap, med: ResolvedMed): boolean {
  const key = (med.ingredient ?? '').trim().toLowerCase();
  if (!key) return false;
  const display = gap.display.trim().toLowerCase();
  if (!display) return false;
  if (display.includes(key)) return true;
  const first = display.split(/[^a-z0-9]+/).filter(Boolean)[0];
  return !!first && first.length >= 4 && key.includes(first);
}

function gapChip(g: SnapshotGap): string {
  const full = `${GAP_LABEL[g.kind]}${g.note ? ` — ${g.note}` : ''}`;
  return `<span class="chip gap-chip" title="${esc(full)}">${GAP_CHIP[g.kind]}</span>`;
}

// ── Panel 2: findings ───────────────────────────────────────────────────────

/** A single dense finding row: severity, label, implicated drugs, citation. */
function findingRow(f: Finding, chart?: SnapshotChartMedication[]): string {
  const sev = SEVERITY[f.severity];
  // Evidence, stated as evidence. A reported symptom supports the finding; it
  // does not confirm causation, so the wording never claims a proven cascade.
  const evidence = f.kind === 'cascade'
    ? (f.symptomConfirmed
        ? `<span class="confirm yes">&#10003; Patient reported the linking symptom</span>`
        : `<span class="confirm no">&#9675; Present in the medication list; linking symptom not reported</span>`)
    : '';
  const implicated = f.kind === 'cascade'
    ? f.implicated.map(esc).join(' <span class="arr">&#10230;</span> ')
    : f.implicated.map(esc).join(' <span class="dim">&middot;</span> ');

  return `
    <div class="f" style="--accent: var(${sev.var})">
      <span class="fsev"><span class="sev-icon">${sev.icon}</span>${sev.label}</span>
      <div class="fmain">
        <div class="fline"><span class="flabel">${esc(f.label)}</span><span class="fimp">${implicated}</span></div>
        <div class="fmeta"><span class="fkind">${KIND_LABEL[f.kind]}</span>${evidence}${
          sourceChip(sourceRelation(f.implicated, chart), true)}<span class="fcite">${esc(f.citation)}</span></div>
      </div>
    </div>`;
}

export function renderReviewHtml(snap: ReviewSnapshot | null): string {
  const body = snap ? renderBody(snap) : `
    <div class="empty">
      <p>No review yet. Run <code>npm run demo</code>, or complete a voice call.</p>
      <p class="muted">This page updates automatically when a review lands.</p>
    </div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Deprescribe — medication review</title>
<style>${FONT_FACE_CSS}</style>
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
     shadows. One viewport, three columns, no page scroll: panels that outrun
     their column scroll inside themselves.
     Severity is never colour alone — every severity carries an icon + word. */
  :root {
    color-scheme: light;
    --canvas: #E9E9E9;
    --surface: #EEEEEE;
    --ink: #3D3B4F;
    --ink-50: rgba(61,59,79,0.5);
    --ink-70: rgba(61,59,79,0.7);
    --mint: #28E99F;
    --mint-pale: #C5FFD6;
    --pink: #FFCFFE;
    --pink-soft: rgba(255,172,254,0.1);
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
  html, body { height: 100%; overflow: hidden; }
  body {
    margin: 0; background: var(--canvas); color: var(--ink);
    font: 500 12px/1.45 var(--mono); letter-spacing: .2px;
    -webkit-font-smoothing: antialiased;
  }
  strong, b { font-weight: 700; }
  .muted, .dim { color: var(--ink-50); }
  code { font-family: var(--mono); background: var(--pink-soft); padding: 0 4px; }

  .app {
    position: relative; height: 100vh; display: flex; flex-direction: column;
    gap: 14px; padding: 16px 20px 14px;
  }

  /* ── Header strip ────────────────────────────────────────────────────── */
  .hdr {
    flex: 0 0 auto; display: flex; align-items: stretch; gap: 0;
    border: 1px solid var(--hairline-strong); background: var(--surface);
  }
  .hdr > * { padding: 12px 18px; border-right: 1px solid var(--hairline); }
  .hdr > *:last-child { border-right: none; }
  .hdr-id { flex: 0 0 auto; display: flex; flex-direction: column; justify-content: center; gap: 3px; }
  .wordmark {
    font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: 1.1px;
    text-transform: uppercase; color: var(--ink-50);
  }
  .wordmark .minus { color: var(--ink); }
  .who { font-family: var(--display); font-weight: 700; font-size: 19px; letter-spacing: -.6px; line-height: 1.05; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip {
    display: inline-flex; align-items: center; padding: 1px 6px; font-size: 9.5px; font-weight: 700;
    letter-spacing: .9px; text-transform: uppercase; border: 1px solid var(--hairline-strong);
    color: var(--ink-70); white-space: nowrap;
  }
  .chip.live { background: var(--mint); border-color: var(--mint); color: var(--ink); }
  .chip.time { border-style: dashed; color: var(--ink-50); }

  /* Review basis — the completeness caveat, never quiet. */
  .basis {
    flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; justify-content: center;
    border-left: 6px solid var(--good) !important;
  }
  .basis .flag {
    font-size: 9.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--ink-50);
  }
  .basis .flag::before { content: "[ "; } .basis .flag::after { content: " ]"; }
  .basis .headline {
    font-family: var(--display); font-weight: 600; font-size: 17px; letter-spacing: -.6px; line-height: 1.14;
  }
  .basis .note { color: var(--ink-70); font-size: 10.5px; line-height: 1.35; margin-top: 1px; }
  .basis.partial { border-left-color: var(--sev-mod) !important; }
  .basis.unconfirmed { border-left-color: var(--sev-high) !important; background: var(--pink-soft); }
  .basis.unconfirmed .flag, .basis.unconfirmed .headline { color: var(--sev-high); }

  /* Stat numerals — medium, inline, never quarter-page tiles. */
  .stats { flex: 0 0 auto; display: flex; gap: 30px; align-items: center; }
  .stat { display: flex; flex-direction: column; align-items: flex-start; line-height: 1; }
  .stat .v {
    font-family: var(--display); font-weight: 800; font-size: 32px; letter-spacing: -1.6px;
    font-variant-numeric: tabular-nums; line-height: .92;
  }
  .stat .k {
    font-size: 9px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase;
    color: var(--ink-50); margin-top: 5px; white-space: nowrap;
  }
  .stat .sub { font-size: 9px; color: var(--ink-50); letter-spacing: .4px; margin-top: 2px; white-space: nowrap; }
  .stat.acb .v { color: var(--acb-color, var(--ink)); }

  /* Red flags — only when there are any. */
  .redflag {
    flex: 0 0 auto; padding: 6px 12px; background: var(--ink); color: #EEEEEE;
    border-left: 8px solid var(--pink); font-size: 11.5px;
  }
  .redflag strong { color: var(--pink); text-transform: uppercase; letter-spacing: 1.1px; font-size: 10px; margin-right: 8px; }

  /* ── Three-column grid ───────────────────────────────────────────────── */
  .grid {
    flex: 1 1 auto; min-height: 0;
    display: grid; grid-template-columns: 1.05fr 1.98fr .92fr; gap: 14px;
  }
  .panel {
    min-height: 0; min-width: 0; display: flex; flex-direction: column;
    background: var(--surface); border: 1px solid var(--hairline-strong);
  }
  .ptitle {
    flex: 0 0 auto; display: flex; align-items: baseline; gap: 8px;
    padding: 10px 14px; border-bottom: 1px solid var(--hairline-strong);
    font-size: 10.5px; font-weight: 700; letter-spacing: 1.3px; text-transform: uppercase; color: var(--ink-50);
  }
  .ptitle .lbl { color: var(--ink); }
  .ptitle .lbl::before { content: "[ "; } .ptitle .lbl::after { content: " ]"; }
  .ptitle .count {
    font-family: var(--display); font-weight: 800; font-size: 15px; letter-spacing: -.6px;
    color: var(--ink-50); margin-left: auto; line-height: 1;
  }
  .pbody { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0 14px 12px; }
  .pbody::-webkit-scrollbar { width: 7px; }
  .pbody::-webkit-scrollbar-thumb { background: var(--hairline-strong); }
  .pfoot {
    flex: 0 0 auto; padding: 8px 14px; border-top: 1px solid var(--hairline);
    font-size: 10px; letter-spacing: .5px; color: var(--ink-50); line-height: 1.5;
  }

  /* ── Tables ──────────────────────────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  thead th {
    position: sticky; top: 0; z-index: 1; background: var(--surface);
    text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 1px;
    color: var(--ink-50); font-weight: 700; padding: 9px 10px 7px 0;
    border-bottom: 1px solid var(--hairline-strong);
  }
  td { padding: 9px 10px 9px 0; border-bottom: 1px solid var(--hairline); vertical-align: top; line-height: 1.5; }
  tr:last-child td { border-bottom: none; }
  td.num { font-variant-numeric: tabular-nums; }
  .ing { font-family: var(--display); font-weight: 700; font-size: 12.5px; letter-spacing: -.3px; }
  .chip.otc { color: var(--ink-50); }
  .chip.warn { color: var(--sev-high); border-color: var(--sev-high); background: var(--pink-soft); }
  .gap-chip { color: var(--sev-mod); border-color: var(--sev-mod); cursor: help; }
  .said { color: var(--ink-50); font-size: 10px; font-style: italic; }
  .empty-note { color: var(--ink-50); font-size: 11px; display: block; padding: 8px 0; }

  /* ── Cascade strip — compact, mint accented, top of the findings panel ── */
  .cstrip {
    border: 1px solid var(--mint); border-left: 5px solid var(--mint); background: rgba(40,233,159,0.09);
    padding: 10px 12px 11px; margin: 12px 0 10px;
  }
  .cstrip + .cstrip { margin-top: 10px; }
  .cstrip .ceyebrow {
    font-size: 9px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; color: var(--ink-70);
  }
  .cflow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 0; margin: 7px 0 6px; }
  .cflow .node {
    border: 1px solid var(--hairline-strong); background: var(--surface); padding: 2px 7px;
    font-family: var(--display); font-weight: 700; font-size: 12.5px; letter-spacing: -.4px;
  }
  .cflow .arr-col { padding: 0 6px; color: var(--ink); font-size: 13px; line-height: 1; }
  .cstrip .cnote { font-size: 10.5px; color: var(--ink-70); line-height: 1.5; }
  .cstrip .cmeta { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; margin-top: 6px; }

  /* ── Finding rows ────────────────────────────────────────────────────── */
  .f {
    display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 0 10px; align-items: start;
    padding: 8px 0 8px 9px; border-bottom: 1px solid var(--hairline);
    border-left: 4px solid var(--accent);
  }
  .f:last-child { border-bottom: none; }
  .fsev {
    display: inline-flex; align-items: center; gap: 4px; justify-content: flex-start;
    font-size: 9px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase;
    border: 1px solid var(--accent); color: var(--accent); padding: 1px 5px; margin-top: 2px;
  }
  .sev-icon { font-size: 8px; }
  .fmain { min-width: 0; }
  .fline { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 8px; line-height: 1.4; }
  .flabel { font-family: var(--display); font-weight: 700; font-size: 12.5px; letter-spacing: -.3px; }
  .fkind { font-size: 9px; font-weight: 700; letter-spacing: .9px; text-transform: uppercase; color: var(--ink-50); }
  .fimp { font-size: 10.5px; color: var(--ink-70); letter-spacing: .2px; }
  .fimp .arr { color: var(--ink-50); }
  .fmeta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px 8px; line-height: 1.45; margin-top: 2px; }
  .fcite { font-size: 9.5px; letter-spacing: .2px; color: var(--ink-50); line-height: 1.45; }
  .confirm { font-size: 9px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
  .confirm.yes { color: var(--good); }
  .confirm.no { color: var(--ink-50); }

  /* ── Source relationship chip ────────────────────────────────────────── */
  .source-chip {
    display: inline-block; font-size: 9px; font-weight: 700; letter-spacing: .9px; text-transform: uppercase;
    border: 1px solid var(--hairline-strong); padding: 0 5px; color: var(--ink-70); white-space: nowrap;
  }
  .source-chip.cross { color: var(--ink); background: var(--mint); border-color: var(--mint); }

  /* ── Known-before-the-call rows + the patient's own ask ──────────────── */
  .ask {
    border: 1px solid var(--hairline-strong); border-left: 5px solid var(--mint);
    background: rgba(40,233,159,0.09); padding: 10px 12px 11px; margin: 12px 0 10px;
  }
  .ask .flag { font-size: 9px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; color: var(--ink-50); }
  .ask .quote { font-family: var(--display); font-weight: 600; font-size: 12.5px; letter-spacing: -.2px; line-height: 1.45; margin-top: 5px; }
  .ask .intent { font-size: 9px; letter-spacing: .9px; text-transform: uppercase; color: var(--ink-70); margin-top: 5px; }
  .crow { padding: 8px 0; border-bottom: 1px solid var(--hairline); }
  .crow:last-child { border-bottom: none; }
  .crow .cname { font-family: var(--display); font-weight: 700; font-size: 12px; letter-spacing: -.2px; line-height: 1.35; }
  .crow .cmeta2 { font-size: 10px; color: var(--ink-50); letter-spacing: .3px; line-height: 1.5; margin-top: 1px; }
  .crow .conf-yes { color: var(--good); }

  /* ── Bottom strip: what landed in the record, plus optional prose ────── */
  .strip {
    flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px;
    padding: 9px 14px; background: var(--surface); border: 1px solid var(--hairline-strong);
    font-size: 10.5px; letter-spacing: .4px; color: var(--ink-70);
  }
  .strip .slbl { font-size: 9px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--ink-50); }
  .strip .slbl::before { content: "[ "; } .strip .slbl::after { content: " ]"; }
  .strip details { position: static; }
  .strip summary {
    cursor: pointer; font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
    color: var(--ink); border: 1px solid var(--hairline-strong); padding: 1px 7px; list-style: none;
  }
  .strip summary::-webkit-details-marker { display: none; }
  .strip details[open] summary { background: var(--ink); color: #EEEEEE; border-color: var(--ink); }
  .dbody {
    position: absolute; left: 12px; right: 12px; bottom: 40px; z-index: 9;
    max-height: 56vh; overflow: auto; padding: 10px 12px;
    background: var(--surface); border: 1px solid var(--hairline-strong);
    font-size: 10.5px; line-height: 1.5;
  }
  .dbody table { font-size: 10px; }
  .cite-note { font-size: 9.5px; color: var(--ink-50); line-height: 1.5; margin-top: 8px; }

  .empty { padding: 60px; font-size: 15px; }
</style>
</head>
<body><div class="app">${body}</div></body>
</html>`;
}

function renderBody(snap: ReviewSnapshot): string {
  const r = snap.review;
  const cascades = r.findings.filter((f) => f.kind === 'cascade');
  const acbColor = r.acbScore >= 6 ? 'var(--sev-high)' : r.acbScore >= 3 ? 'var(--sev-mod)' : 'var(--good)';
  const when = new Date(snap.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  const chartMeds = snap.chart?.medications;
  const basis = reviewBasis(snap);
  const gaps = snap.gaps ?? [];
  const prescribers = new Set((chartMeds ?? []).map((m) => m.sourceDisplay).filter(Boolean)).size;

  // Findings first by severity, so the top of the panel is the top of the risk.
  const sevRank = { high: 0, moderate: 1, low: 2 } as const;
  const findings = [...r.findings].sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  // The stated priority is usually the same sentence as the concern that was
  // logged from it. Say it once — a repeated quote reads as a bug.
  const spoken = new Set((snap.concerns ?? []).map((c) => c.patientWords.trim()));
  const extraGoals = r.patientGoals.filter((g) => !spoken.has(g.trim()));

  // ── Panel 1: what the call actually produced ──────────────────────────────
  const usedGaps = new Set<SnapshotGap>();
  const medRows = r.meds.map((m) => {
    const key = (m.ingredient ?? '').trim().toLowerCase();
    const chartRows = key ? (chartMeds ?? []).filter((c) => (c.ingredient ?? '').trim().toLowerCase() === key) : [];
    const mine = gaps.filter((g) => gapMatches(g, m));
    mine.forEach((g) => usedGaps.add(g));

    const state = chartRows.length === 1
      ? CONFIRMATION_SHORT[chartRows[0].confirmation]
      : chartRows.length > 1
        ? 'Multiple chart rows'
        : '<span class="dim">Not in the chart</span>';

    return `
      <tr>
        <td>${m.ingredient
          ? `<span class="ing">${esc(m.ingredient)}</span>`
          : '<span class="chip warn">unresolved &rarr; clinician review</span>'}${
          m.otc ? ' <span class="chip otc">OTC</span>' : ''}${
          mine.map(gapChip).join('')}
          ${m.ingredient ? '' : `<div class="said">&ldquo;${esc(m.spoken_as)}&rdquo;</div>`}</td>
        <td class="muted">${[m.strength, m.frequency].filter(Boolean).map((x) => esc(x!)).join(' &middot; ') || '&mdash;'}</td>
        <td>${m.provenance === 'chart-confirmed' ? 'Chart' : 'Patient'} <span class="dim">&middot;</span> ${state}</td>
      </tr>`;
  }).join('');

  // A gap that matched no medication row is still shown — never silently dropped.
  const orphanGaps = gaps.filter((g) => !usedGaps.has(g));

  const medsPanel = `
    <section class="panel">
      ${panelTitle('Medications the agent picked up', r.meds.length)}
      <div class="pbody">
        <table>
          <thead><tr>
            <th style="width:38%">Medication</th><th style="width:28%">Dose &amp; frequency</th>
            <th style="width:34%">Source &amp; call status</th>
          </tr></thead>
          <tbody>${medRows || '<tr><td colspan="3"><span class="empty-note">No medications were captured on this call.</span></td></tr>'}</tbody>
        </table>
        ${orphanGaps.length ? `<div class="cite-note">Also reported: ${orphanGaps.map((g) =>
          `${esc(g.display)} &mdash; ${GAP_LABEL[g.kind]}${g.note ? ` (${esc(g.note)})` : ''}`).join(' &middot; ')}</div>` : ''}
      </div>
      <div class="pfoot">${r.unresolvedCount
        ? `${r.unresolvedCount} unresolved &rarr; clinician review.&nbsp;`
        : ''}Unresolved entries keep the patient's exact words &mdash; the pipeline never guesses a code.</div>
    </section>`;

  // ── Panel 2: findings, with the chained cascade as a compact strip ────────
  const chainStrips = snap.chains.map((chain) => `
      <div class="cstrip">
        <div class="ceyebrow">Chained pattern &mdash; potential cascade for clinician review</div>
        <div class="cflow">${chain.map((drug, i) => `${
          i > 0 ? '<span class="arr-col">&#10230;</span>' : ''}<span class="node">${esc(drug)}</span>`).join('')}</div>
        <div class="cnote"><strong>${chain.length - 1} of these ${chain.length} medications may have been added in response to
        a side effect of the one before it.</strong> A prompt to reconsider the earlier medication, not a statement about what happened.</div>
        <div class="cmeta">${sourceChip(sourceRelation(chain, chartMeds), true)}<span class="fcite">${
          citationsFor(chain, cascades).map(esc).join(' &middot; ') || 'Curated cascade rules, cited per finding below.'}</span></div>
      </div>`).join('');

  const findingsPanel = `
    <section class="panel">
      ${panelTitle('Findings', r.findings.length)}
      <div class="pbody">
        ${chainStrips}
        ${findings.map((f) => findingRow(f, chartMeds)).join('')
          || '<span class="empty-note">No findings for this run.</span>'}
      </div>
      <div class="pfoot">Detection is a citation-backed table lookup with zero LLM calls. Every finding shows its source.</div>
    </section>`;

  // ── Panel 3: what was already known ──────────────────────────────────────
  const concerns = snap.concerns ?? [];
  const askBlock = (concerns.length || extraGoals.length) ? `
      <div class="ask">
        <div class="flag">What the patient wants addressed</div>
        ${concerns.map((c) => `
          <div class="quote">&ldquo;${esc(c.patientWords)}&rdquo;</div>
          <div class="intent">${c.medicationName ? `${esc(c.medicationName)} &mdash; ` : ''}${INTENT_LABEL[c.intent]}</div>`).join('')}
        ${extraGoals.map((g) => `<div class="quote">&ldquo;${esc(g)}&rdquo;</div>`).join('')}
      </div>` : `
      <div class="ask">
        <div class="flag">What the patient wants addressed</div>
        <div class="intent">The patient did not raise a specific medication on this call.</div>
      </div>`;

  const knownPanel = `
    <section class="panel">
      ${panelTitle('Known before the call', chartMeds ? chartMeds.length : null)}
      <div class="pbody">
        ${askBlock}
        ${chartMeds?.length ? chartMeds.map((m) => `
          <div class="crow">
            <div class="cname">${escOr(m.display)}</div>
            <div class="cmeta2">${m.sourceDisplay ? esc(m.sourceDisplay) : '<span class="chip warn">no source recorded</span>'}
              &middot; <span class="${EXPLICIT.has(m.confirmation) ? 'conf-yes' : ''}">${CONFIRMATION_LABEL[m.confirmation]}</span></div>
          </div>`).join('')
          : '<span class="empty-note">No chart context was loaded for this run — everything here comes from the interview alone.</span>'}
      </div>
      <div class="pfoot">${snap.chart?.conditions?.length
        ? `Charted conditions: ${snap.chart.conditions.map(esc).join(' &middot; ')}`
        : 'No charted conditions recorded.'}</div>
    </section>`;

  // ── Bottom strip: what landed in the record, plus the de-prioritized prose ─
  const w = snap.written;
  const counts = w
    ? `${w.meds} MedicationStatement &middot; ${w.flags} Flag &middot; ${w.cascades} DetectedIssue &middot; ${w.goals} Goal${
        w.risk ? ' &middot; 1 RiskAssessment' : ''}${w.task ? ' &middot; 1 Task (urgent)' : ''}`
    : 'No FHIR resources were written for this run.';

  const strip = `
    <div class="strip">
      <span class="slbl">FHIR resources written</span>
      <span>${counts}</span>
      ${w?.resources?.length ? `
      <details>
        <summary>Detail</summary>
        <div class="dbody">
          <table>
            <thead><tr><th style="width:170px">Resource</th><th style="width:26%">Content</th><th>Notes written with it</th></tr></thead>
            <tbody>${w.resources.map((res) => `
              <tr><td>${esc(res.type)}</td><td>${esc(res.label)}</td><td class="muted">${res.note ? esc(res.note) : '&mdash;'}</td></tr>`).join('')}
            </tbody>
          </table>
          <div class="cite-note">DetectedIssue carries <code>implicated</code> in causal order. Recommendation resources are written as
          <em>preliminary / draft / proposed</em> (DetectedIssue&nbsp;preliminary &middot; RiskAssessment&nbsp;preliminary &middot;
          CarePlan&nbsp;draft &middot; Communication&nbsp;preparation &middot; Goal&nbsp;proposed) — a clinician confirms before anything
          becomes final. Resource identifiers stay in Medplum; this page carries none.</div>
        </div>
      </details>` : ''}
      ${snap.taper?.steps?.length ? `
      <details>
        <summary>Draft taper &mdash; ${esc(snap.taper.drug)}</summary>
        <div class="dbody">
          <table>
            <thead><tr><th style="width:60px">Week</th><th style="width:150px">Dose</th><th>Note</th></tr></thead>
            <tbody>${snap.taper.steps.map((s) => `
              <tr><td class="num">${s.week}</td><td>${esc(s.dose)}</td><td class="muted">${esc(s.note)}</td></tr>`).join('')}
            </tbody>
          </table>
          <div class="cite-note">Instantiated from the published deprescribing.org algorithm. Draft CarePlan — requires clinician sign-off.</div>
        </div>
      </details>` : ''}
      ${snap.objection ? `
      <details>
        <summary>Reviewer objection</summary>
        <div class="dbody">${esc(snap.objection)}
          <div class="cite-note">Generated by an adversarial reviewer agent before any clinician sees the plan.</div>
        </div>
      </details>` : ''}
      <span class="muted" style="margin-left:auto">Deterministic detection &middot; human sign-off &middot; synthetic data only</span>
    </div>`;

  return `
    <header class="hdr">
      <div class="hdr-id">
        <div class="wordmark">Deprescribe<span class="minus"> &minus;</span></div>
        <div class="who">${esc(snap.patientDisplay ?? snap.patientLabel ?? 'Synthetic demo patient')}</div>
        <div class="chips">
          <span class="chip${snap.source === 'live-call' ? ' live' : ''}">${
            snap.source === 'live-call' ? '&#9679; live call' : 'canned demo'}</span>
          <span class="chip">synthetic</span>
          <span class="chip time">${esc(when)}</span>
        </div>
      </div>
      <div class="basis ${basis.kind}">
        <div class="flag">Review basis</div>
        <div class="headline">${basis.text}</div>
        <div class="note">${basis.note}</div>
      </div>
      <div class="stats">
        <div class="stat acb" style="--acb-color:${acbColor}">
          <span class="v">${r.acbScore}</span><span class="k">ACB burden</span>
          <span class="sub">&ge; 3 significant</span>
        </div>
        <div class="stat">
          <span class="v">${r.findings.length}</span><span class="k">Findings</span>
          <span class="sub">${r.findings.filter((f) => f.severity === 'high').length} high &middot; all cited</span>
        </div>
        <div class="stat">
          <span class="v">${r.meds.length}</span><span class="k">Medications</span>
          <span class="sub">${r.unresolvedCount ? `${r.unresolvedCount} unresolved` : 'all resolved'}</span>
        </div>
        <div class="stat">
          <span class="v">${prescribers}</span><span class="k">Prescribers</span>
          <span class="sub">${cascades.length} potential cascade${cascades.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </header>

    ${r.redFlags.length ? `
    <div class="redflag">
      <strong>&#9888; Red flags &mdash; ${snap.written?.task
        ? 'urgent FHIR Task created for clinician'
        : 'immediate clinician attention required'}</strong>${r.redFlags.map(esc).join('; ')}
    </div>` : ''}

    <div class="grid">
      ${medsPanel}
      ${findingsPanel}
      ${knownPanel}
    </div>

    ${strip}`;
}

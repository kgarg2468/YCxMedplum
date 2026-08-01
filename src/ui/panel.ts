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

  /* ── Review basis (never quiet — this is the completeness caveat) ──── */
  .basis {
    margin-top: 18px; border-radius: 12px; padding: 14px 18px;
    border: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow);
    border-left: 5px solid var(--good);
  }
  .basis .headline { font-size: 17.5px; font-weight: 700; letter-spacing: -0.01em; }
  .basis .note { color: var(--ink-2); font-size: 14.5px; margin-top: 4px; }
  .basis.partial { border-left-color: var(--warning); }
  .basis.unconfirmed {
    border-left-color: var(--critical);
    background: color-mix(in srgb, var(--critical) 8%, var(--surface));
    border-color: color-mix(in srgb, var(--critical) 35%, var(--border));
  }
  .basis .flag { font-size: 12px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }
  .basis.unconfirmed .flag { color: color-mix(in srgb, var(--critical) 80%, var(--ink)); }

  /* ── Source relationship chip ───────────────────────────────────────── */
  .source-chip {
    margin-top: 10px; display: inline-block; font-size: 12.5px; font-weight: 600;
    border: 1px solid var(--border); border-radius: 999px; padding: 2px 11px; color: var(--ink-2);
  }
  .source-chip.cross {
    color: color-mix(in srgb, var(--critical) 80%, var(--ink));
    border-color: color-mix(in srgb, var(--critical) 40%, var(--border));
    background: color-mix(in srgb, var(--critical) 7%, var(--surface));
  }

  /* ── Patient's own ask ──────────────────────────────────────────────── */
  .ask { border-left: 5px solid var(--good); }
  .ask .intent { color: var(--ink-2); font-size: 14px; margin-top: 4px; }
  .gap { display: flex; gap: 12px; align-items: baseline; padding: 9px 0; border-bottom: 1px solid var(--hairline); }
  .gap:last-child { border-bottom: none; }
  .gap .what { font-weight: 650; min-width: 190px; }
  .gap .why { color: var(--ink-2); font-size: 14.5px; }
  .empty-note { color: var(--muted); }

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

  const chartMeds = snap.chart?.medications;
  const basis = reviewBasis(snap);

  // The stated priority is usually the same sentence as the concern that was
  // logged from it. Say it once — a repeated quote on a projector reads as a bug.
  const spoken = new Set((snap.concerns ?? []).map((c) => c.patientWords.trim()));
  const extraGoals = r.patientGoals.filter((g) => !spoken.has(g.trim()));

  // ── 5. the hero: the strongest potential cascade, plus any chain ──────────
  const hero = cascades[0];
  const heroSection = (hero || snap.chains.length) ? `
  <h2>Potential prescribing cascade</h2>
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
    <div class="eyebrow" style="margin-top:10px">${esc(hero.label)}</div>
    ${cascadeFlow(hero)}
    <div class="caption"><strong>${esc(hero.implicated[1] ?? '')} may have been added in response to a side effect of
    ${esc(hero.implicated[0] ?? '')}.</strong>${hero.linkingSymptom ? ` Linking symptom: ${esc(hero.linkingSymptom)}.` : ''}
    Shown as a potential cascade for clinician review.</div>
    ${hero.symptomConfirmed
      ? '<div class="confirm yes">&#10003; Patient reported the linking symptom</div>'
      : '<div class="confirm no">&#9675; Present in the medication list; linking symptom not reported</div>'}
    ${sourceChip(sourceRelation(hero.implicated, chartMeds))}
    <div class="citation">${esc(hero.citation)}</div>
  </div>` : ''}` : '';

  // ── 8. what actually landed in the record — prose only, no ids, no links ──
  const w = snap.written;
  const written = `
  <h2>FHIR resources written</h2>
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
  <div class="brand"><span class="wordmark">Deprescribe<span class="minus"> &minus;</span></span></div>
  <h1>Pre-visit medication review</h1>
  <p class="sub">
    <span>${esc(snap.patientDisplay ?? snap.patientLabel ?? 'Synthetic demo patient')}</span>
    <span class="pill">synthetic demo</span>
    <span class="pill${snap.source === 'live-call' ? ' live' : ''}">${snap.source === 'live-call' ? '&#9679; live call' : 'canned demo'}</span>
    <span class="muted">${esc(when)}</span>
  </p>

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
    <strong>&#9888; Red flags — ${snap.written?.task
      ? 'urgent FHIR Task created for clinician'
      : 'immediate clinician attention required'}:</strong> ${r.redFlags.map(esc).join('; ')}
  </div>` : ''}

  <h2>What the patient wants addressed</h2>
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

  <h2>Known before the call ${chartMeds ? `<span class="count">${chartMeds.length}</span>` : ''}</h2>
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

  <h2>Patient-reported changes or gaps ${snap.gaps ? `<span class="count">${snap.gaps.length}</span>` : ''}</h2>
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

  <h2>Other findings <span class="count">${Math.max(0, r.findings.length - (hero ? 1 : 0))}</span></h2>
  ${r.findings.filter((f) => f !== hero).map((f) => findingCard(f, chartMeds)).join('')
    || '<div class="card"><span class="empty-note">No further findings.</span></div>'}

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

  <h2>Medication reconciliation <span class="count">${r.meds.length}</span></h2>
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

  <div class="foot">
    Detection is deterministic — a citation-backed table lookup with zero LLM calls; the model
    never decides what is clinically wrong. Ranked options with visible citations, nothing
    time-critical, recommendation resources preliminary/draft pending clinician review (FDA Non-Device CDS posture).
    Synthetic data only.
  </div>`;
}

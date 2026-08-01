/**
 * STAGE 4/5 — structured findings back into human language.
 *
 * Each of these is deliberately narrow. The explain prompt is forbidden from
 * discovering new problems: given a wide brief the model volunteers a fourth
 * interaction it invented, and that is exactly the failure that gets caught by a
 * clinician judge.
 */

import { callJson, callText, REASONING_MODEL } from './client.js';
import { CASCADES, TAPERS, NEVER_ABRUPT } from '../data/knowledge.js';
import type { Finding, ReviewResult } from '../types.js';

// ─── Explain one finding ─────────────────────────────────────────────────────

const EXPLAIN_SYSTEM = `You explain ONE medication-review finding to a clinician.

RULES
- Discuss ONLY the finding given to you. Do not identify additional problems,
  cascades, interactions, or inappropriate medications, even if you notice them.
- If the patient did not report the linking symptom, say so explicitly.
- State the mechanism plainly, in the active voice. No hedging phrases like
  "may potentially possibly".
- Do NOT recommend a specific dose or dose change.
- 2 to 4 sentences. No preamble, no bullet points, no heading.`;

export async function explainFinding(
  finding: Finding,
  symptoms: string[],
): Promise<string> {
  const cascade = finding.kind === 'cascade'
    ? CASCADES.find((c) => c.label === finding.label)
    : undefined;

  const user = [
    `FINDING (the only thing you may discuss)`,
    `Type: ${finding.kind}`,
    `Label: ${finding.label}`,
    `Drugs implicated (causal order): ${finding.implicated.join(' \u2192 ')}`,
    `Severity: ${finding.severity}`,
    cascade ? `Known mechanism: ${cascade.mechanism}` : '',
    finding.kind === 'cascade'
      ? `Linking symptom reported by patient: ${finding.symptomConfirmed ? 'YES' : 'NO'}`
      : '',
    ``,
    `SYMPTOMS THE PATIENT REPORTED: ${symptoms.length ? symptoms.join('; ') : 'none recorded'}`,
    `GUIDELINE CITATION: ${finding.citation}`,
  ].filter(Boolean).join('\n');

  return callText({ system: EXPLAIN_SYSTEM, user, maxTokens: 400 });
}

export async function explainAll(
  review: ReviewResult,
  symptoms: string[],
): Promise<ReviewResult> {
  const findings = await Promise.all(
    review.findings.map(async (f) => ({
      ...f,
      explanation: await explainFinding(f, symptoms),
    })),
  );
  return { ...review, findings };
}

// ─── Instantiate a taper from the published algorithm ────────────────────────

interface TaperStep { week: number; dose: string; note: string }
interface TaperPlan {
  error?: string;
  drug?: string;
  steps?: TaperStep[];
  monitoring?: string[];
  citation?: string;
}

const TAPER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['error', 'drug', 'steps', 'monitoring', 'citation'],
  properties: {
    error: { type: ['string', 'null'], description: 'Set to "not covered by algorithm" if the algorithm does not apply. Otherwise null.' },
    drug: { type: ['string', 'null'] },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['week', 'dose', 'note'],
        properties: {
          week: { type: 'integer' },
          dose: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
    monitoring: { type: 'array', items: { type: 'string' } },
    citation: { type: ['string', 'null'] },
  },
} as const;

const TAPER_SYSTEM = `You instantiate a published tapering algorithm for one patient.
You do not design tapers. You apply the parameters you are given.

RULES
- Use ONLY the reduction percentage and interval specified. Do not interpolate
  your own schedule or invent intermediate doses beyond what the parameters imply.
- Round to doses that are achievable with real tablet strengths, and say so in the note.
- If the algorithm does not cover this drug, set error to "not covered by algorithm"
  and leave steps empty.
- Never schedule an abrupt stop for a drug flagged as never-abrupt.`;

export async function buildTaper(
  ingredient: string,
  currentDose: string,
  frequency: string | null,
  yearsOfUse: number | null,
): Promise<TaperPlan> {
  const algo = TAPERS.find((t) => t.ingredients.includes(ingredient));
  if (!algo) return { error: 'not covered by algorithm' };

  const user = [
    `ALGORITHM PARAMETERS`,
    `Class: ${algo.drugClass}`,
    `Reduce by ${algo.reductionPercent}% every ${algo.intervalWeeks} weeks.`,
    `Below ${algo.slowDownBelowFraction * 100}% of the starting dose, slow to ${algo.slowReductionPercent}% reductions.`,
    `Monitoring: ${algo.monitoring.join(' | ')}`,
    `Notes: ${algo.notes.join(' | ')}`,
    `Citation: ${algo.citation}`,
    `Never stop abruptly: ${NEVER_ABRUPT.has(ingredient) ? 'YES' : 'no'}`,
    ``,
    `PATIENT`,
    `Drug: ${ingredient}`,
    `Current dose: ${currentDose}`,
    `Frequency: ${frequency ?? 'unknown'}`,
    `Duration of use: ${yearsOfUse !== null ? `${yearsOfUse} years` : 'unknown'}`,
  ].join('\n');

  return callJson<TaperPlan>({
    model: REASONING_MODEL,
    system: TAPER_SYSTEM,
    user,
    schema: TAPER_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 2000,
  });
}

// ─── Challenger pass (the "peer review" the hackathon prompt asks for) ───────

export async function challenge(review: ReviewResult, planSummary: string): Promise<string> {
  const system = `You are a geriatrician reviewing a proposed deprescribing plan.
Name the single strongest clinical objection to it. Be specific and concrete.
If there is no substantive objection, say exactly: "No substantive objection."
Two sentences maximum. No preamble.`;

  const user = [
    `FINDINGS`,
    ...review.findings.map((f) => `- [${f.severity}] ${f.label}: ${f.implicated.join(' \u2192 ')}`),
    ``,
    `ANTICHOLINERGIC BURDEN: ${review.acbScore}`,
    `PATIENT GOALS: ${review.patientGoals.join('; ') || 'none recorded'}`,
    `UNRESOLVED MEDICATIONS: ${review.unresolvedCount}`,
    ``,
    `PROPOSED PLAN`,
    planSummary,
  ].join('\n');

  return callText({ system, user, maxTokens: 300 });
}

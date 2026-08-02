/**
 * SENTINEL STAGE 2, precision. Moss proposes, this disposes.
 *
 * Moss is deliberately biased to over-generate: its `score` carries no
 * information (reciprocal-rank fusion, identical tail for a real match and for
 * "banana telephone"), so the only signal upstream can take is which partition
 * the top hit landed in. That is a recall net, not a decision. Everything that
 * makes a candidate wrong rather than merely off-topic lives in the surrounding
 * conversation, not in the phrase:
 *
 *   "no swelling at all, and no falls either"   the patient DENIED it
 *   "my husband died of a heart attack"         it happened to SOMEONE ELSE
 *   "I fainted once back in the eighties"       remote, not current
 *   "I nearly died laughing"                    figure of speech
 *
 * So the verifier gets exactly one closed yes/no hypothesis plus the rolling
 * window, and is forbidden from doing anything else. A wide brief here is how
 * you get a model volunteering a seventh red flag it invented, which is the
 * failure a clinician judge catches instantly.
 *
 * Fast model (VOICE_MODEL) on purpose: this runs per turn, behind
 * res.sendStatus(200), and must never become the reason a call feels slow.
 *
 * FAIL CLOSED. Any throw, refusal, truncation, or malformed payload returns
 * `verifierRan: false`, and the caller must never escalate such a verdict.
 * Failing open would turn routine pill-bag chatter into alarms in exactly the
 * degraded state where nothing can check them.
 *
 * NO FREE TEXT LEAVES THIS FILE. `RedFlagVerdict.rationale` is written verbatim
 * into the FHIR Flag's audit extension, and it is the one string a clinician
 * reads to answer "why did a machine escalate this?". An earlier version asked
 * the model for a sentence of reasoning and it invented clinical detail: for the
 * turn "I went down in the bathroom on Sunday and caught the corner of the tub
 * with my temple", it wrote "with no memory of how they got there, indicating a
 * fall with loss of consciousness or awareness". The patient never said either
 * thing. A fabricated basis is worse than no basis, because CLAUDE.md's whole
 * regulatory argument is that a clinician can independently review the basis.
 *
 * So the model is asked for a QUOTE, not a reason, and the quote is checked
 * against the window before it is kept. Anything that is not a literal span of
 * what the patient said is discarded and replaced with a fixed string. The
 * boolean is the ruling; the quote is the evidence; there is no prose.
 */

import { callJson, VOICE_MODEL } from './client.js';
import type { RedFlagCandidate, RedFlagVerdict } from '../moss/types.js';

// ─── Schema ──────────────────────────────────────────────────────────────────

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['confirmed', 'quote'],
  properties: {
    confirmed: {
      type: 'boolean',
      description:
        'True only if the patient is describing this happening to them recently or now.',
    },
    quote: {
      type: 'string',
      description:
        'The exact span of the patient text that decided it, copied character for character. Not a summary, not a paraphrase, not an interpretation. Empty string if no single span decided it.',
    },
  },
} as const;

interface VerdictPayload {
  confirmed: boolean;
  quote: string;
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM = `You are answering ONE closed yes/no question about the patient in a
medication-review phone call. Nothing else.

Answer NO if:
- The patient DENIED it. "No swelling at all", "I haven't had any falls", "nothing
  like that" are all NO.
- It happened to SOMEONE ELSE. "My sister fell", "my husband died of a heart attack",
  "the lady next door passed out" are all NO. Only the patient counts.
- It is a remote past event with no current relevance. "I fainted once in my
  twenties" is NO.
- It is hypothetical, conditional, or a worry about the future. "I'd be scared if I
  fell" is NO.
- It is a figure of speech. "I nearly died laughing", "that was a headache",
  "my heart sank" are all NO.

Answer YES only if the patient is describing it as something that happened to them
recently or is happening now. Uncertainty about timing is not a YES on its own; the
patient has to be reporting it as their own recent or current experience.

You may NOT identify any other concern, even if you notice one. You are not
assessing severity, you are not naming a diagnosis, and you are not recommending
anything.

For the quote field, copy the exact words from the patient text that decided your answer,
character for character, as a contiguous span. Do NOT summarise them, do NOT
rephrase them, and do NOT add anything the patient did not say. If no single span
decided it, return an empty string. A quote that is not a literal copy is
discarded.`;

// ─── Verify one candidate ────────────────────────────────────────────────────

/**
 * Rules on one Moss candidate. Never throws.
 *
 * `windowText` is the conversational context to judge against (the rolling
 * window as the caller sees it now). `candidate.windowText` is preserved
 * separately as the audit record of what Moss actually matched.
 */
export async function verifyRedFlag(
  candidate: RedFlagCandidate,
  windowText: string,
): Promise<RedFlagVerdict> {
  const user = [
    `QUESTION (the only thing you may answer)`,
    candidate.question,
    ``,
    `WHAT THE PATIENT SAID (verbatim, most recent turns of the call)`,
    windowText.trim() || '(nothing recorded)',
  ].join('\n');

  try {
    const out = await callJson<VerdictPayload>({
      model: VOICE_MODEL,
      system: SYSTEM,
      user,
      schema: VERDICT_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 400,
    });

    // Structured outputs make this near-impossible, but a malformed payload must
    // fail closed rather than coerce into a truthy escalation.
    if (typeof out?.confirmed !== 'boolean') {
      return degraded(candidate, 'verifier returned a malformed verdict');
    }

    return {
      candidate,
      confirmed: out.confirmed,
      rationale: quotedEvidence(out.quote, windowText),
      verifierRan: true,
    };
  } catch (err) {
    return degraded(candidate, err instanceof Error ? err.message : String(err));
  }
}

/** Not confirmed, and flagged as not actually checked. Must never escalate. */
function degraded(candidate: RedFlagCandidate, reason: string): RedFlagVerdict {
  return { candidate, confirmed: false, rationale: reason, verifierRan: false };
}

// ─── Quote verification ──────────────────────────────────────────────────────

/**
 * Keep the model's quote only if it is genuinely a span of what the patient said.
 * Everything else is thrown away, so nothing that reaches a chart can be invented.
 *
 * The comparison is deliberately forgiving about the things an ASR transcript and a
 * model disagree on for reasons that carry no clinical meaning: case, curly versus
 * straight apostrophes, run of whitespace, and trailing punctuation. It is not
 * forgiving about anything else. A near-miss is treated as no quote at all rather
 * than repaired, because a repaired quote is exactly the fabrication being guarded
 * against.
 */
function quotedEvidence(quote: unknown, windowText: string): string {
  if (typeof quote !== 'string') return NO_QUOTE;
  // Unicode escapes rather than literal smart punctuation, so this file stays plain
  // ASCII and nobody's editor silently re-normalises the class members.
  const raw = quote.trim().replace(/^["'\u201C\u2018]+|["'\u201D\u2019.,;:!?]+$/g, '').trim();
  if (!raw) return NO_QUOTE;
  if (!normalise(windowText).includes(normalise(raw))) return NO_QUOTE;
  return `Patient's own words: "${raw}"`;
}

const NO_QUOTE = 'No verbatim quote from the window; the boolean ruling stands alone.';

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

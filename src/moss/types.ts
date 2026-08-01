/**
 * SENTINEL — shared contract for the semantic red-flag recall net.
 *
 * Why this layer exists, in one paragraph:
 *
 * `RED_FLAG_PATTERNS` in src/voice/prompt.ts is six regexes. Measured against eight
 * phrasings an older adult actually uses ("I went down in the bathroom and cracked my
 * head on the tub", "I would be better off not waking up") it caught ZERO, while
 * scoring 4/4 on the literal phrasings it was written for. That is the gap this fills.
 *
 * The design constraint that shapes everything here: Moss's `score` is NOT a similarity
 * score. It is reciprocal-rank fusion, `weight * 31/(30 + rank)`, exact to six decimals,
 * and the tail is byte-identical for a real match, for "banana telephone", and for the
 * empty string. Moss also always returns topK and never signals "no match". So:
 *
 *   NOTHING IN THIS MODULE MAY READ `score`.
 *
 * The only signal taken from Moss is WHICH PARTITION the top hit falls in: a red-flag
 * concept document, or a decoy document representing the benign traffic that fills a
 * medication-review call. That is a class read, not a threshold. Moss is deliberately
 * biased to over-generate; an LLM verifier with conversational context supplies the
 * precision, and a clinician supplies the decision.
 */

/** The six escalating conditions. Mirrors RED_FLAG_PATTERNS in src/voice/prompt.ts. */
export type RedFlagClass =
  | 'head-injury'
  | 'syncope'
  | 'chest-pain'
  | 'acute-confusion'
  | 'gi-bleed'
  | 'suicidality';

/**
 * Decoy classes. These are NOT red flags. They exist so that the top-1 class read has
 * somewhere benign to land: without them every utterance in the call ranks some red-flag
 * document first, because Moss always returns topK.
 */
export type DecoyClass = 'medication-admin' | 'small-talk' | 'benign-symptom';

export type ConceptClass = RedFlagClass | DecoyClass;

/** `off` = Moss never constructed. `shadow` = queried and logged, never escalates. `on` = live. */
export type MossMode = 'off' | 'shadow' | 'on';

/** A red-flag concept document. `text` is written in patient vernacular, never clinical prose. */
export interface ConceptDoc {
  id: ConceptClass;
  text: string;
  /** Moss metadata values must be strings; this is not a typo. */
  metadata: { kind: 'redflag' | 'decoy'; cls: ConceptClass };
}

/** Moss proposed this. Nothing has been confirmed yet. */
export interface RedFlagCandidate {
  cls: RedFlagClass;
  /** Escalation reason, phrased to match the existing RED_FLAG_PATTERNS reason strings. */
  reason: string;
  /** The single closed yes/no hypothesis handed to the verifier. Never open-ended. */
  question: string;
  /** The rolling-window text that triggered it, kept verbatim for the audit trail. */
  windowText: string;
  /**
   * True when an alpha=0.0 (pure BM25) query also returned this document, i.e. there was
   * literal lexical overlap. Recorded as a provenance boolean ONLY. It is never a
   * confidence magnitude and never gates anything: it is anti-correlated with the
   * paraphrase recall this module exists to add.
   */
  lexicalCorroboration: boolean;
}

/** The verifier's ruling on one candidate. */
export interface RedFlagVerdict {
  candidate: RedFlagCandidate;
  confirmed: boolean;
  rationale: string;
  /**
   * False when the LLM was unavailable. A candidate with `verifierRan: false` must NEVER
   * escalate. Failing open here would turn routine pill-bag chatter into alarms in exactly
   * the degraded state where nothing can check them.
   */
  verifierRan: boolean;
}

/** Everything one turn produced. Logged whole so the escalation decision is auditable. */
export interface SentinelResult {
  /** From the untouched `checkRedFlags`. Always computed, always escalates. */
  lexical: string[];
  /** Moss's proposals for this turn. Empty when top-1 landed on a decoy. */
  candidates: RedFlagCandidate[];
  /** One per candidate, in `on` mode. Empty in `shadow` mode. */
  verdicts: RedFlagVerdict[];
  /**
   * What actually escalates: `lexical` unioned with the reasons of confirmed verdicts.
   * INVARIANT, asserted by test: `lexical` is always a subset of `escalated`.
   */
  escalated: string[];
  mossMs: number | null;
  mode: MossMode;
}

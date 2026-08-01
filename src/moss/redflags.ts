/**
 * SENTINEL: the net itself. One turn in, one auditable SentinelResult out.
 *
 * Read src/moss/types.ts first; the constraint that shapes this file is stated there
 * and repeated here because it is the thing most likely to be "improved" by the next
 * person: MOSS RETURNS NO USABLE SCORE. It is reciprocal-rank fusion, weight *
 * 31/(30 + rank), and the tail is byte-identical for a genuine match, for "banana
 * telephone", and for the empty string. Moss also always returns topK and never says
 * "no match". So there is nothing to threshold and nothing to sort. The ONLY signal
 * taken here is which partition a returned document belongs to, read from
 * `metadata.kind`. Nothing in this file reads `.score`.
 *
 * The order of operations is the safety property:
 *
 *   1. `checkRedFlags(turnText)` runs FIRST and UNCONDITIONALLY, in every mode,
 *      before Moss is consulted at all. Its output seeds `escalated`.
 *   2. Moss can only ever ADD to that set. There is no code path in this module that
 *      removes a lexical hit, and no failure that can. Every early return and every
 *      catch returns a result whose `escalated` still contains all of `lexical`.
 *   3. A candidate only escalates if a verifier actually ran AND confirmed it.
 *      `verifierRan: false` never escalates: in the degraded state where nothing can
 *      check a proposal is exactly when failing open turns pill-bag chatter into
 *      alarms.
 *
 * THREE THINGS HERE WERE MEASURED WRONG ONCE AND ARE NOW MEASURED RIGHT. Do not undo
 * them without re-running src/test/redflags.live.ts:
 *
 *   A. MOSS IS QUERIED ON THE TURN, NOT ON THE WINDOW. Querying the joined 3-turn
 *      window sounds better and is catastrophic: two turns of ordinary pill chatter
 *      ("Yes, now is a good time." / "That is the water tablet, forty milligrams.")
 *      dominate the embedding, the medication-admin and small-talk decoys take every
 *      top slot, and measured escalation on held-out vernacular fell from 12/18 to
 *      0/18. The turn is the classification signal. The window is context for the
 *      VERIFIER, which is the stage that actually needs the neighbouring turns,
 *      because denials and third-party attributions live there.
 *
 *   B. EVERY RED-FLAG CLASS IN THE TOP-K IS VERIFIED, not only the top-1. Reading
 *      docs[0] alone lost real flags whose correct class sat at rank 2, most
 *      dangerously "I've been putting my pills to one side in the drawer, saving them
 *      up, just in case", which is a means-acquisition statement that ranks the
 *      medication-admin decoy first and suicidality second. The verifier, not the
 *      ranking, is the precision stage, so widening the net here is cheap and the
 *      false positives it lets through are answered one layer down.
 *
 *   C. LEXICAL HITS ARE VERIFIED TOO. The six regexes fire on flat denials ("No chest
 *      pain, never") and on third-party attribution ("My mother had black stools"),
 *      measured at 2/32 on the benign fixture set. Those hits still escalate, because
 *      `lexical` is a subset of `escalated` by contract and nothing here may weaken
 *      that. But building a candidate for them means the caller has a verifier ruling
 *      to consult before putting an alarm on a real chart. Recall is never reduced;
 *      only the evidence available to the caller is increased.
 *
 * Cost: one embed + two in-process queries, ~2ms each, against a nine-document index,
 * plus one verifier call per proposed class. The session is built once at boot (see
 * ./session.ts). Nothing here is on the voice reply path: the caller runs this after
 * `res.sendStatus(200)`.
 */

import type { SessionIndex } from '@moss-dev/moss';
import type { RedFlagCandidate, RedFlagClass, RedFlagVerdict, SentinelResult } from './types.js';
import { getSentinelSession, mossMode } from './session.js';
import { REDFLAG_REASONS, lexicalClasses, classOfLexicalReason } from './concepts.js';
import { checkRedFlags } from '../voice/prompt.js';
import { verifyRedFlag } from '../llm/verifyRedFlag.js';

/**
 * How many user turns the verifier's context window spans. Three is the span over
 * which an older adult actually finishes a thought on the phone; wider starts dragging
 * denials and topic changes from earlier in the interview into the verifier's context.
 * This window is NOT what Moss is queried on (see note A in the header).
 */
const WINDOW_TURNS = 3;

/**
 * topK 3 out of nine documents. Every red-flag document in this slice becomes a
 * candidate, so this is the width of the recall net: raising it trades verifier calls
 * for recall, lowering it loses the rank-2 classes that note B exists to recover.
 */
const TOP_K = 3;

// ─── Public entry point ────────────────────────────────────────────────────────

/**
 * Screen one user turn. NEVER throws, in any mode, for any input.
 *
 * `recentTurns` is the caller's ring buffer of user turns, oldest first. It may or may
 * not already contain `turnText`; `buildWindow` tolerates both so a caller that
 * buffers before screening and one that buffers after produce the same window.
 */
export async function runSentinel(
  turnText: string,
  recentTurns: string[],
): Promise<SentinelResult> {
  // Step 1, before anything else and regardless of mode. This is today's behaviour
  // and it is never conditional on Moss, on the network, or on a model.
  const lexical = checkRedFlags(turnText);
  const mode = mossMode();

  /** The floor. Every failure path below returns this, so `lexical ⊆ escalated` holds. */
  const base = (mossMs: number | null = null): SentinelResult => ({
    lexical,
    candidates: [],
    verdicts: [],
    escalated: unique(lexical),
    mossMs,
    mode,
  });

  if (mode === 'off') return base();

  let mossMs: number | null = null;
  try {
    const turn = (turnText ?? '').trim();
    const windowText = buildWindow(turnText, recentTurns);

    // The classes the untouched regex path already caught. These become candidates
    // whether or not Moss is reachable, so the caller always has a verifier ruling on
    // a regex hit even in a degraded state. They never gate escalation (note C).
    const fromLexical = lexicalClasses(lexical);

    let fromMoss: RedFlagClass[] = [];
    let corroborated = new Set<string>();

    // `off` is handled above, so this is the only construction trigger. It resolves to
    // null (never rejects) when Moss is unavailable, and stays null thereafter.
    const session = await getSentinelSession();
    if (session && turn) {
      const t0 = Date.now();
      // Note A: the TURN, never the window.
      const hybrid = await session.query(turn, { topK: TOP_K });
      mossMs = Date.now() - t0;

      // The class read. `kind` is the partition, `cls` names the flag. No score, no
      // ranking arithmetic, no threshold: just which documents came back.
      fromMoss = redFlagClassesOf(hybrid.docs);

      if (fromMoss.length) {
        const t1 = Date.now();
        corroborated = await corroborates(session, turn);
        mossMs += Date.now() - t1;
      }
    }

    const classes = unique([...fromLexical, ...fromMoss]) as RedFlagClass[];
    if (!classes.length) return base(mossMs);

    // Provenance only. An alpha=0.0 query is pure BM25, so this records whether there
    // was literal word overlap as well as semantic proximity. It is deliberately NOT
    // used as a gate or a confidence: it is anti-correlated with the paraphrase recall
    // this whole module exists to add, so gating on it would delete the feature.
    const candidates: RedFlagCandidate[] = classes.map((cls) => ({
      cls,
      reason: REDFLAG_REASONS[cls].reason,
      question: REDFLAG_REASONS[cls].question,
      windowText,
      lexicalCorroboration: corroborated.has(cls),
    }));

    // Shadow: propose and log, escalate nothing. `escalated` is byte-for-byte the
    // lexical set, so a shadow deployment is observationally identical downstream to
    // today while still producing the audit trail that says what it would have caught.
    if (mode === 'shadow') {
      return { lexical, candidates, verdicts: [], escalated: unique(lexical), mossMs, mode };
    }

    // On: precision stage. Concurrent by construction, so a multi-candidate turn costs
    // one round trip rather than N sequential ones. verifyRedFlag never throws.
    const verdicts: RedFlagVerdict[] = await Promise.all(
      candidates.map((c) => verifyRedFlag(c, windowText)),
    );

    // Class-keyed dedupe, not string-keyed. A class the regexes already caught is
    // ALREADY in `escalated` under the prompt.ts spelling of its reason; adding the
    // concepts.ts spelling of the same alarm would put two near-identical lines on one
    // clinician's screen and make the system read as broken.
    const confirmed = verdicts
      .filter((v) => v.verifierRan && v.confirmed && !fromLexical.includes(v.candidate.cls))
      .map((v) => v.candidate.reason);

    // Lexical first, so the union preserves today's ordering and the subset invariant
    // is visible in the literal shape of the array.
    return { lexical, candidates, verdicts, escalated: unique([...lexical, ...confirmed]), mossMs, mode };
  } catch (err) {
    // Invariant 4: nothing propagates. A broken Moss, a broken model, or a shape the
    // SDK changed under us all degrade to exactly the lexical behaviour of today.
    console.warn(`[sentinel] screening failed, lexical result stands: ${(err as Error).message}`);
    return base(mossMs);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * The last WINDOW_TURNS user turns, oldest first, joined into one blob. This is the
 * VERIFIER's context and the audit record of what was judged; it is not what Moss is
 * queried on. The current turn is appended unless the caller already pushed it.
 */
function buildWindow(turnText: string, recentTurns: string[]): string {
  const turns = [...recentTurns.map((t) => (t ?? '').trim()).filter(Boolean)];
  const current = (turnText ?? '').trim();
  if (current && turns[turns.length - 1] !== current) turns.push(current);
  return turns.slice(-WINDOW_TURNS).join(' ');
}

/**
 * Every red-flag class among the returned documents, in the order Moss returned them,
 * deduplicated. Documents in the decoy partition contribute nothing, which is what
 * makes a turn of ordinary pill chatter produce no candidates at all.
 *
 * Deliberately paranoid about the shape: metadata comes back from a native module as
 * `Record<string, string> | undefined`, and an unrecognised `cls` must mean no
 * candidate rather than an undefined lookup into REDFLAG_REASONS.
 */
function redFlagClassesOf(docs: { metadata?: Record<string, string> }[]): RedFlagClass[] {
  const out: RedFlagClass[] = [];
  for (const doc of docs ?? []) {
    const metadata = doc?.metadata;
    if (!metadata || metadata.kind !== 'redflag') continue;
    const cls = metadata.cls;
    if (cls && cls in REDFLAG_REASONS && !out.includes(cls as RedFlagClass)) {
      out.push(cls as RedFlagClass);
    }
  }
  return out;
}

/**
 * Which document ids a pure-BM25 (alpha 0.0) query also surfaced. Provenance only.
 * Its own failure is swallowed: a missing provenance field must never cost a candidate.
 */
async function corroborates(session: SessionIndex, queryText: string): Promise<Set<string>> {
  try {
    const lex = await session.query(queryText, { topK: TOP_K, alpha: 0.0 });
    return new Set(lex.docs.map((d) => d.id));
  } catch {
    return new Set();
  }
}

/** Order-preserving dedupe. Two spellings of the same alarm read as sloppy to a clinician. */
function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Collapse the three red-flag sources into one line per condition.
 *
 * `review.redFlags` unions the regexes, the LLM extractor's `red_flags`, and whatever
 * Sentinel escalated per turn. All three describe the same events in different words,
 * and unioning the raw strings put this on a real chart:
 *
 *   Fall with head injury; suicidal statement: "The wish I didn't wake up this
 *   morning."; fall with head injury: "On Sunday, I ... cracked my head on the
 *   bathtub."; Suicidal statement, escalate to a human immediately
 *
 * Two conditions, said three ways. A clinician reads that as a system that cannot
 * count.
 *
 * So resolve each string to a class and keep one per class. Class resolution tries the
 * canonical reason table first, then falls back to running the regexes over the string
 * itself, which is what catches the extractor's free text ("suicidal statement: ...").
 * Anything that resolves to no class is genuinely novel and is kept verbatim, because
 * dropping an unrecognised red flag to tidy a string is not a trade worth making.
 *
 * The extractor's quotes are not lost: they are the patient's own words, and they still
 * reach the chart through the Flag's audit extension.
 */
/**
 * Resolve a class from free text by its opening label.
 *
 * The extractor writes prose like `suicidal statement: "The wish I didn't wake up this
 * morning."`. The regexes do not fire on it, because "wish I didn't wake up" is exactly
 * the vernacular they miss, which is the whole reason Sentinel exists. But the
 * extractor names the condition in its own first words, and every canonical reason
 * starts with the same label ("Suicidal statement, escalate to..." / "Fall with head
 * injury"), so compare against the part before the first comma.
 *
 * A heuristic over model prose, so it is used LAST and only ever merges a duplicate.
 * Anything it fails to resolve is kept verbatim rather than dropped.
 */
function classOfLabel(text: string): RedFlagClass | null {
  const hay = text.toLowerCase();
  for (const [cls, { reason }] of Object.entries(REDFLAG_REASONS)) {
    const label = reason.split(',')[0].trim().toLowerCase();
    if (label.length >= 6 && hay.includes(label)) return cls as RedFlagClass;
  }
  return null;
}

export function normaliseRedFlags(reasons: string[]): string[] {
  const byClass = new Map<RedFlagClass, string>();
  const unclassified: string[] = [];

  for (const raw of reasons) {
    const reason = raw.trim();
    if (!reason) continue;

    const cls = classOfLexicalReason(reason)                   // exact canonical wording
      ?? lexicalClasses(checkRedFlags(reason))[0]              // the regexes, run on the text
      ?? classOfLabel(reason)                                  // the extractor's own prose
      ?? null;
    if (!cls) {
      if (!unclassified.includes(reason)) unclassified.push(reason);
      continue;
    }
    // First writer wins, and the sources are ordered regex, extractor, Sentinel, so the
    // canonical prompt.ts wording is preferred over the extractor's improvised prose.
    if (!byClass.has(cls)) byClass.set(cls, REDFLAG_REASONS[cls]?.reason ?? reason);
  }

  return [...byClass.values(), ...unclassified];
}

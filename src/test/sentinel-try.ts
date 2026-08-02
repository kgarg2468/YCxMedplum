/**
 * SENTINEL, ON ONE SENTENCE. The demo artifact.
 *
 *   npm run sentinel:try -- "I went down in the bathroom and cracked my head on the tub"
 *   npm run sentinel:try                # interactive: type sentences, one per line
 *
 * Runs the SAME sentence twice in one process, once with Moss off and once with it
 * on, and prints the two side by side. `mossMode()` re-reads the environment on every
 * call, so the flip is real rather than simulated: the off run never constructs a
 * Moss client at all.
 *
 * Why this exists rather than a slide: the honest question about any retrieval demo is
 * "is that hardcoded?", and the only answer that settles it is letting someone else
 * choose the sentence. Hand the keyboard over.
 *
 * What it does NOT show, deliberately: a Moss score. The score is
 * `weight * 31/(30 + rank)` and its tail is byte-identical for a real match, for
 * "banana telephone" and for the empty string. Printing it would imply a confidence
 * that does not exist. The class read is the whole signal.
 */

import { createInterface } from 'node:readline';
import { runSentinel } from '../moss/redflags.js';
import { checkRedFlags } from '../voice/prompt.js';
import type { SentinelResult } from '../moss/types.js';

const GREY = '\x1b[90m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const OFF = '\x1b[0m';

const row = (label: string, value: string) => `    ${label.padEnd(24)}${value}`;

/** The server's rule, reproduced: a Flag needs a class the verifier actually confirmed. */
function wouldWriteFlag(res: SentinelResult): string[] {
  return res.verdicts.filter((v) => v.verifierRan && v.confirmed).map((v) => v.candidate.cls);
}

async function inMode(mode: 'off' | 'on', text: string): Promise<SentinelResult> {
  process.env.MOSS_MODE = mode;
  return runSentinel(text, [text]);
}

function renderOff(res: SentinelResult) {
  console.log(`\n  ${BOLD}MOSS_MODE=off${OFF}  ${GREY}what the server does without Sentinel${OFF}`);
  console.log(row('regexes matched', res.lexical.length ? res.lexical.join('; ') : `${GREY}nothing${OFF}`));
  console.log(row('would escalate', res.escalated.length ? `${RED}${res.escalated.join('; ')}${OFF}` : `${GREY}no${OFF}`));
  console.log(row('written to the chart', `${GREY}nothing${OFF}`));
}

function renderOn(res: SentinelResult) {
  console.log(`\n  ${BOLD}MOSS_MODE=on${OFF}   ${GREY}Sentinel: Moss proposes, the verifier decides${OFF}`);
  console.log(row('regexes matched',
    res.lexical.length ? res.lexical.join('; ') : `${GREY}nothing  (unchanged, still runs first)${OFF}`));

  const proposed = res.candidates.map((c) => c.cls);
  console.log(row('Moss proposed',
    proposed.length
      ? `${proposed.join(', ')}   ${GREY}in ${res.mossMs ?? '?'}ms, in process, no network${OFF}`
      : `${GREY}nothing, top hit was a decoy${OFF}`));

  for (const v of res.verdicts) {
    // Just the hypothesis. Everything after the first question mark is the negation and
    // attribution guardrail ("answer no if they denied it, if it happened to someone
    // else..."), which is load-bearing in the prompt and pure noise on a projector.
    const asked = v.candidate.question.split('?')[0] + '?';
    console.log(row('verifier asked', `${GREY}"${asked}"${OFF}`));
    const ruling = !v.verifierRan
      ? `${GREY}unavailable, so it does NOT escalate${OFF}`
      : v.confirmed ? `${GREEN}YES${OFF}  ${GREY}${v.rationale}${OFF}` : `${GREY}no${OFF}`;
    console.log(row(`  -> ${v.candidate.cls}`, ruling));
  }

  console.log(row('would escalate', res.escalated.length ? `${RED}${res.escalated.join('; ')}${OFF}` : `${GREY}no${OFF}`));
  const flags = wouldWriteFlag(res);
  console.log(row('written to the chart',
    flags.length
      ? `${RED}Flag, urgent clinical review${OFF} ${GREY}(${flags.join(', ')}), plus an urgent Task${OFF}`
      : `${GREY}nothing${OFF}`));
}

async function screen(text: string) {
  console.log(`\n${'─'.repeat(78)}\n  ${BOLD}"${text}"${OFF}`);

  // Off first, on purpose: in `off` the session is never constructed, so this ordering
  // also demonstrates that the off path does no Moss work rather than just discarding it.
  renderOff(await inMode('off', text));
  const onResult = await inMode('on', text);
  renderOn(onResult);

  const lexicalMissed = checkRedFlags(text).length === 0;
  const sentinelCaught = wouldWriteFlag(onResult).length > 0;
  if (lexicalMissed && sentinelCaught) {
    console.log(`\n  ${GREEN}The regexes caught nothing here. Everything above came from Moss.${OFF}`);
  }
  console.log(`\n  ${GREY}No score was read. Moss returns 31/(30+rank), which is identical for`
    + ` "banana telephone".${OFF}`);
}

async function main() {
  const arg = process.argv.slice(2).join(' ').trim();
  if (arg) {
    await screen(arg);
    process.exit(0);
  }

  console.log(`\n${BOLD}Sentinel${OFF}  ${GREY}type a sentence the way an older adult would say it,`
    + ` then Enter. Ctrl-C to quit.${OFF}`);
  console.log(`${GREY}Try: "I went down in the bathroom and cracked my head on the tub."${OFF}`);
  console.log(`${GREY}Try: "There's not much point to any of it anymore."${OFF}`);
  console.log(`${GREY}Try: "No, I've not had any falls at all."   (a denial: it must stay silent)${OFF}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '\n> ' });
  rl.prompt();
  for await (const line of rl) {
    const text = line.trim();
    if (text) await screen(text);
    rl.prompt();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

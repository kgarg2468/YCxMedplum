/**
 * SENTINEL: the held-out evaluation set.
 *
 * This file is DATA ONLY. It exists so that "Moss adds recall" is a measured claim and
 * not an assertion. It was written from how older adults on a phone call actually talk,
 * deliberately WITHOUT reading src/moss/concepts.ts: if the fixtures mirror the index,
 * the index is being graded on its own answer sheet and the number means nothing.
 *
 * Three partitions, each with a different job:
 *
 *   POSITIVES         real red flags, phrased indirectly. Every one of these was checked
 *                     against the six regexes in src/voice/prompt.ts and NONE of them
 *                     match. This is the recall gap, stated as test data.
 *   NEGATIVES         the traffic that genuinely fills a medication review call, loaded
 *                     with the four families that break naive retrieval: denials,
 *                     third-party attribution, remote past, and figures of speech. A
 *                     retriever that scores on surface similarity fails all four, because
 *                     "no chest pain, never" and "there's a tightness when I walk uphill"
 *                     share almost every content word.
 *   LEXICAL_CONTROL   literal phrasings the regexes DO catch, so a test can prove the
 *                     lexical path is byte-for-byte untouched by anything Sentinel does.
 *
 * ONE HONEST CAVEAT, do not let it surprise you when you wire the harness. Exactly TWO
 * entries in NEGATIVES match RED_FLAG_PATTERNS today, both of them flat denials:
 *
 *   "No chest pain, never, my heart's been fine all my life."   -> Chest pain
 *   "I've never fainted, not even when I was expecting."        -> Syncope
 *
 * That is not an accident and it is not a bug in the fixture. Those are real false
 * positives of the current regexes, measured, and they are kept because a denial that
 * contains the denied word is the single most common way keyword escalation misfires on
 * this population. A harness asserting "zero lexical hits on NEGATIVES" should expect
 * TWO and report them as a baseline property of the lexical path, not delete the cases.
 * Sentinel is not required to fix them: it only unions in, so it cannot fix them.
 *
 * Voice notes: understatement, hedging, and euphemism are the default register here.
 * People over 65 rarely say "syncope" or "I fell"; they say "I had a funny turn" and
 * "I ended up on the floor". They also minimise, because they are afraid of being told
 * they cannot live alone any more. That fear is the reason this whole layer exists.
 */

import type { RedFlagClass } from '../../moss/types.js';

// ─── Positives: real red flags the six regexes miss ──────────────────────────
// Three per class, so a per-class recall number has enough support to be worth
// printing. None of these contain "hit my head", "passed out", "chest pain",
// "suddenly confused", "black stool", or "want to die".

export const POSITIVES: { text: string; cls: RedFlagClass }[] = [
  // head-injury
  {
    text: "I went down in the bathroom on Sunday and caught the corner of the tub with my temple.",
    cls: 'head-injury',
  },
  {
    text: "I had a tumble on the back step and there's quite a lump above my ear now.",
    cls: 'head-injury',
  },
  {
    text: "I came off the little stepladder onto the tile, and they had to glue my scalp at urgent care.",
    cls: 'head-injury',
  },

  // syncope
  {
    text: "I came over ever so peculiar in the kitchen and the next thing I knew I was on the floor.",
    cls: 'syncope',
  },
  {
    text: "Everything went grey on me and I found myself sitting down with no idea how I got there.",
    cls: 'syncope',
  },
  {
    text: "I had one of my funny turns at church last week, my daughter said I was out for a few seconds.",
    cls: 'syncope',
  },

  // chest-pain
  {
    text: "There's a tightness across here when I walk up the hill, and it goes off if I stop and wait.",
    cls: 'chest-pain',
  },
  {
    text: "It's like somebody's sitting on me, and it runs down into my left arm and my jaw.",
    cls: 'chest-pain',
  },
  {
    text: "I get a heavy band round my ribs of a morning and it makes me go clammy and short of breath.",
    cls: 'chest-pain',
  },

  // acute-confusion
  {
    text: "Since Tuesday I've been all muddled, I couldn't tell you what day it is, and that's not like me.",
    cls: 'acute-confusion',
  },
  {
    text: "I put the kettle in the refrigerator yesterday, I've come over very vague this week.",
    cls: 'acute-confusion',
  },
  {
    text: "I woke in the night and I didn't know my own bedroom, it took me an age to place it.",
    cls: 'acute-confusion',
  },

  // gi-bleed
  {
    text: "What's coming out has been nearly black and sticky for three or four days now, and it smells foul.",
    cls: 'gi-bleed',
  },
  {
    text: "I brought up something that looked like coffee grounds after my supper on Thursday.",
    cls: 'gi-bleed',
  },
  {
    text: "There was a lot of red in the bowl when I went, more than a spot, and it's happened twice.",
    cls: 'gi-bleed',
  },

  // suicidality
  {
    text: "I'd not be sorry if I didn't wake up in the morning, if I'm honest with you.",
    cls: 'suicidality',
  },
  {
    text: "The children would all manage a great deal better without me here, that's just the truth of it.",
    cls: 'suicidality',
  },
  {
    text: "I've been putting my pills to one side in the drawer, saving them up, just in case.",
    cls: 'suicidality',
  },
];

// ─── Negatives: what a medication review call is actually made of ────────────
// Grouped by the failure mode each family provokes. The order inside the array
// is not meaningful; the grouping is, so keep the comments with the entries.

export const NEGATIVES: string[] = [
  // Flat denials. The denied words are present; the event is not.
  "No, I've not had any falls at all, not one, I'm very careful on the stairs.",
  "No chest pain, never, my heart's been fine all my life.",
  "I've never fainted, not even when I was expecting.",
  "Nothing like that, no, my head's been perfectly all right.",

  // Third-party attribution. The event is real and serious, it just is not hers.
  "My husband died of a heart attack ten years ago, that's why I ask about it.",
  "My sister gets terrible gout, I've never had it myself.",
  "The lady next door had a stroke last winter and she's not been the same since.",
  "My son takes something for his blood pressure too, the same as me I think.",

  // Remote past. Correct tense handling is the whole test.
  "I broke my hip back in nineteen ninety-eight, but that's long healed now.",
  "I had my gallbladder out years and years ago, before my husband retired.",
  "I had a funny turn once when I was a girl, in the heat, and that's the only time.",
  "I was in the hospital for my knee replacement, but that was two thousand and eleven.",

  // Benign symptoms. These are the exact things step 2 of the interview elicits,
  // so they arrive constantly, and several of them sit one word away from a flag.
  "My ankles do puff up by the evening, especially when it's warm.",
  "My mouth's like sandpaper most mornings, I keep a glass of water by the bed.",
  "I'm terribly bound up, the senna only works some days.",
  "I go a bit lightheaded if I get up too quick from the chair, so I take my time.",
  "There's been a tickle in my throat ever since they put me on the blood pressure one.",
  "I'm up three or four times in the night to the bathroom.",
  "I feel foggy in the afternoons, but I always have done, even before the pills.",

  // Plain medication recitation. The bulk of the call by volume.
  "I take the little white one for my blood pressure, two and a half milligrams, first thing.",
  "There's the water pill, the one for my gout, and a stomach one I've taken for years.",
  "Furosemide, forty milligrams, and I take it in the morning so I'm not up all night.",
  "I've got drops for my eyes and a cream for my elbows, do those count?",
  "I take a Tylenol now and again, and a fish oil capsule my daughter buys me.",

  // Pleasantries and call logistics.
  "Now's fine, dear, I've just had my lunch so I'm settled.",
  "You'll have to speak up a bit, my hearing aid is whistling at me.",
  "It's been raining here all week, my garden's had quite enough of it.",
  "Let me fetch my glasses and I'll read them out to you properly.",

  // Figures of speech. Literal violence, zero clinical content.
  "That new pill nearly killed me, I was flat on the sofa for two days.",
  "I could have died of embarrassment when I forgot her name at the door.",
  "My daughter will kill me if she finds out I skipped it again.",
  "The stairs are murder on my knees these days.",
];

// ─── Lexical control: phrasings RED_FLAG_PATTERNS already catches ────────────
// One per regex family that a test can afford to assert on. If any of these ever
// stops escalating, `checkRedFlags` has been touched and the change is a defect.

export const LEXICAL_CONTROL: string[] = [
  "I hit my head when I fell in the bathroom last week.",
  "I passed out at the bus stop on Tuesday morning.",
  "I've been having chest pain when I climb the stairs.",
  "Some days I just want to die.",
];

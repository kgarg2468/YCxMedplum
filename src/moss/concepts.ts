/**
 * SENTINEL: the concept vocabulary. This file IS the detector.
 *
 * Nine documents go into the Moss index and the only thing read back out is which
 * partition the top-1 document belongs to (`metadata.kind`). No score is ever read,
 * because Moss's score is reciprocal-rank fusion (`weight * 31/(30 + rank)`) and is
 * byte-identical for a real match and for gibberish. So the entire discriminative
 * power of this layer lives in the wording below. Nothing downstream can rescue a
 * badly written document.
 *
 * Three consequences shape how these are written:
 *
 *  1. THE DECOYS ARE LOAD-BEARING, not padding. Moss always returns topK and never
 *     says "no match", so with six red-flag documents and nothing else, every single
 *     utterance in a forty-turn medication review ranks a red flag first. The three
 *     decoy documents are what the ordinary traffic of the call is supposed to land
 *     on: reciting doses and schedules, pleasantries, and the benign symptoms this
 *     interview is deliberately designed to elicit (see step 2 of VOICE_SYSTEM_PROMPT,
 *     which asks about dry mouth, constipation, swelling, urination, drowsiness,
 *     dizziness on standing, joint pain, and cough). Weakening a decoy does not make
 *     the net safer, it makes it fire on everything and get switched off.
 *
 *  2. VERNACULAR, NOT CLINICAL PROSE, INCLUDING CONTRACTIONS AS THE ASR EMITS THEM.
 *     The regexes in RED_FLAG_PATTERNS caught zero of eight real phrasings because
 *     "hit my head" is not how someone says it. An older adult understates ("a bit of
 *     a tumble"), goes indirect ("I came over funny"), and reaches for euphemism,
 *     hardest of all around suicidality, where the true presentation is passive ("I'd
 *     be better off not waking up") rather than the explicit wording a regex author
 *     imagines. Each document is packed with many comma-separated surface forms
 *     rather than one tidy definition, because the lexical half of the hybrid query
 *     can only match tokens that are actually present.
 *
 *  3. RECALL HERE, PRECISION LATER. These documents are deliberately over-inclusive.
 *     A hit is a CANDIDATE: an LLM verifier with conversational context rules on it
 *     against the closed question in REDFLAG_REASONS, and a clinician rules on that.
 *     Nothing here escalates anything by itself.
 *
 * Scientific integrity note: these documents were written from clinical and
 * linguistic knowledge only. The held-out phrasing fixtures this index is scored
 * against were not read while writing it. Fitting the index to the test set would
 * make the measured recall meaningless.
 */

import type { ConceptDoc, RedFlagClass } from './types.js';
import { RED_FLAG_PATTERNS } from '../voice/prompt.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. The nine documents
// ─────────────────────────────────────────────────────────────────────────────

export const CONCEPT_DOCS: ConceptDoc[] = [
  // ─── Red flags ─────────────────────────────────────────────────────────────
  {
    id: 'head-injury',
    text: [
      "I had a fall and I hit my head, I went down and banged my head, I took a tumble, I had a bit of a fall",
      "I came down hard, I went over, I slipped on the rug, I tripped on the step, I lost my footing, my legs gave way",
      "I went down in the bathroom and cracked my head on the tub, I caught my head on the corner of the nightstand",
      "I clipped my forehead on the cupboard door, I knocked my head on the door frame, I whacked the back of my head on the floor",
      "I landed on my face, I went down face first, I hit the concrete, I hit the tile, I caught the coffee table on the way down",
      "there's a lump on my head, a knot on my head, a goose egg, a bump on the back of my head, a big bruise on my temple",
      "I've got a black eye from it, I split it open, I needed a couple of stitches, it bled quite a bit",
      "I saw stars, it knocked me silly, it rang my bell, I was dazed for a minute, I felt woozy afterwards",
      "I was on the floor a while before I could get up, my daughter found me on the floor, I couldn't get myself up",
      "I've had a headache ever since I fell, my neck's been sore since I went down, I've been off since the fall",
      "I'm on a blood thinner and I hit my head, I take warfarin and I banged my head",
      "it happened yesterday, it was last night, it was a couple of days ago, it was this morning in the kitchen",
    ].join(', '),
    metadata: { kind: 'redflag', cls: 'head-injury' },
  },
  {
    id: 'syncope',
    text: [
      "I passed out, I blacked out, I fainted, I went out cold, I lost consciousness, I keeled over, I collapsed",
      "everything went black, everything went grey, the lights went out, my vision closed right in and then nothing",
      "the next thing I knew I was on the floor, I woke up on the kitchen floor, I came to on the bathroom floor",
      "I don't remember getting down there, I don't remember any of it, I lost a few minutes, I lost time",
      "my legs went out from under me and I was gone, I dropped like a stone, I went down and I was out",
      "I had a funny turn, I came over funny, I came over all faint, I went clammy and cold and then I was gone",
      "my wife was standing over me when I came round, they told me I was out for a minute, my son said he couldn't wake me",
      "I fainted dead away, I had a blackout, I had a spell and I've no idea what happened",
      "it happened at church, it happened standing at the sink, it happened getting out of bed, it happened on the bus",
      "I nearly went out and had to grab the counter, I very nearly passed out and had to sit down quick",
    ].join(', '),
    metadata: { kind: 'redflag', cls: 'syncope' },
  },
  {
    id: 'chest-pain',
    text: [
      "chest pain, a pain in my chest, a pain across my chest, pressure in my chest, tightness in my chest",
      "a heaviness in my chest, like a weight on my chest, like something sitting on my chest, like an elephant on my chest",
      "like a band tightening around me, a squeezing, a crushing feeling, a gripping right in the middle",
      "a burning behind my breastbone, an ache right here in the centre, a soreness under my ribs that won't shift",
      "it goes down my left arm, it runs into my shoulder, it goes up into my jaw, it goes into my teeth, it goes through to my back between my shoulder blades",
      "it comes on when I walk up the hill and it goes when I stop, I have to stop halfway up the stairs and wait for it to pass",
      "it came on carrying the shopping, it came on shovelling the drive, it woke me in the night",
      "I broke out in a cold sweat with it, I felt sick with it, I was short of breath with it, I couldn't get my breath",
      "I put it down to indigestion but it wasn't like my usual heartburn, the antacid didn't touch it, my spray isn't touching it any more",
      "it lasted twenty minutes, it keeps coming back, it's happened three times this week",
    ].join(', '),
    metadata: { kind: 'redflag', cls: 'chest-pain' },
  },
  {
    id: 'acute-confusion',
    text: [
      "I got suddenly confused, I got all muddled up, I wasn't making any sense, I was talking nonsense",
      "I haven't been myself since Tuesday, he's not been right for the last few days, she's gone downhill fast this week",
      "it came on all of a sudden, it came on overnight, she was fine last week and now she isn't",
      "I didn't know where I was for a bit, I woke up and couldn't work out which room I was in, I didn't know what day it was",
      "I got lost driving home from a shop I've been going to for thirty years, I set off for the post office and ended up somewhere else",
      "I couldn't find my words, I couldn't think of the word for it, I kept calling her by the wrong name",
      "my son says I didn't know him, my daughter says I was calling for my husband and he died years ago",
      "I was up at three in the morning packing a suitcase, he was trying to get out of the house in the night",
      "I've been seeing people in the room who aren't there, I thought there were children in the garden, I keep seeing things out of the corner of my eye",
      "I couldn't work out how to use the kettle, she can't manage the television remote any more",
      "he's drowsy and vague all day and then agitated by evening, she's much worse at night, she's been away with the fairies",
      "I've been in a complete fog since they started the new tablet, my thinking has gone very cloudy this week",
    ].join(', '),
    metadata: { kind: 'redflag', cls: 'acute-confusion' },
  },
  {
    id: 'gi-bleed',
    text: [
      "my stools have gone black, black tarry stools, my bowel movements are black and sticky, it looked like tar",
      "the toilet was full of blood, there was blood in the bowl, blood on the paper, I'm passing blood",
      "I brought up blood, I vomited blood, I was sick and there was blood in it, it looked like coffee grounds",
      "my motions are very dark, dark red, almost maroon, and they smell awful",
      "I've gone very pale and washed out and my stools are dark, I've no energy at all and my bowels are black",
      "I can't stop bleeding, the cut on my shin has been weeping for two days and won't stop",
      "I bled through the dressing, I nicked myself shaving and it went on for an hour, I had a nosebleed I couldn't stop",
      "my gums bleed when I brush, I'm bruising all over my arms, I've got bruises I can't account for",
      "I'm on the warfarin and I've been bleeding, I take an aspirin and a blood thinner and something's bleeding",
      "I've a burning pain in my stomach and my stools have changed colour",
    ].join(', '),
    metadata: { kind: 'redflag', cls: 'gi-bleed' },
  },
  {
    id: 'suicidality',
    text: [
      "there's not much point any more, I don't see the point in going on, what's the point of any of it",
      "I'd be better off not waking up, I hope I don't wake up in the morning, I go to bed hoping that's it",
      "I'd rather not be here, I don't want to be here any more, I've had enough of it all, I'm tired of living",
      "I'm just waiting for it to be over, I'm ready to go, I've made my peace, I'm only marking time now",
      "if the good Lord took me tonight I wouldn't complain, I wouldn't mind if I didn't wake up",
      "I'm a burden to my daughter, they'd all be better off without me, I'm no use to anybody, I'd be no loss",
      "nothing gives me any pleasure any more, there's nothing left for me since my wife died, I've nobody now",
      "I want to die, I want to end it all, I want it to stop, I could kill myself, I've thought about ending things",
      "I've been saving up my tablets, I keep the pills by the bed just in case, I've wondered if I took the lot of them whether that would do it",
      "what's the point of taking all these pills anyway, I've stopped bothering with them, I don't much care what happens to me now",
      "I feel very low, I've been crying every day, I can't see anything getting better",
    ].join(', '),
    metadata: { kind: 'redflag', cls: 'suicidality' },
  },

  // ─── Decoys: the ordinary traffic of a medication-review call ──────────────
  {
    id: 'medication-admin',
    text: [
      "I take two of the little white ones in the morning and one at night, one with my breakfast and one before bed",
      "twenty milligrams, forty milligrams once a day, a ten milligram tablet, half a tablet, one and a half at bedtime, five milligrams twice a day",
      "once a day, twice a day, three times a day, every other day, only when I need it, as needed, just now and then, only if it's bad",
      "I've been on that one for years, the doctor started it in the spring, they upped the dose in January, they halved it after my last blood test",
      "it says ten on the box, I'd have to go and look at the bottle, it's the little yellow one, it's the big oval one, it's the pink one",
      "it comes in a blister pack from the pharmacy, my daughter fills my pill box, the chemist does my dosette box, it's on the repeat prescription",
      "I take it on an empty stomach, I take it with food, I take it with my breakfast, I take it last thing at night",
      "I've got eye drops, one in each eye at bedtime, the blue inhaler twice a day, a patch I change every three days, a cream I rub on my knees",
      "I take a vitamin D, a fish oil, a multivitamin, a calcium tablet, a bit of turmeric, some ginger for my stomach",
      "I get the paracetamol from the supermarket, I buy the ibuprofen gel over the counter, I take a senna when I need it, I use an antihistamine for sleep",
      "that one's for my blood pressure, that one's for my cholesterol, it's for my thyroid, it's for my sugar, it's the water tablet, it's for my heart",
      "I honestly don't know what that one's for, nobody's ever told me, I think it's something for my bones",
      "amlodipine, furosemide, omeprazole, metformin, atorvastatin, levothyroxine, warfarin, gabapentin, oxybutynin, allopurinol, ramipril, sertraline",
      "I ran out last week and haven't picked it up, I forget it sometimes, I skipped it a few days, I stopped taking that one myself",
    ].join(', '),
    metadata: { kind: 'decoy', cls: 'medication-admin' },
  },
  {
    id: 'small-talk',
    text: [
      "hello, yes, no, right you are, that's right, mm hmm, go on then, of course, certainly, thank you dear, goodbye then",
      "yes now's a good time, this is fine, I've got a few minutes, how long is this going to take",
      "who did you say you were, are you a real person, are you from the surgery, my hearing aid is whistling, speak up love I'm a bit deaf, could you say that again",
      "it's been raining all week, lovely day out there, it's bitter this morning, the garden needs doing",
      "my grandson's coming at the weekend, my daughter does my shopping, my son lives up north, my late husband used to see to all this",
      "I'm ninety two next month, I've lived in this house forty years, I taught school for thirty years",
      "hold on, there's someone at the door, sorry, the dog's barking, let me turn the television down, I've got the kettle on",
      "my appointment's on Tuesday at half past nine, I'll have to ask my daughter, I don't drive any more",
      "what do you take that one for, is now a good time, do you have any eye drops or inhalers or creams or patches",
      "thank you, and what else do you take, what bothers you most day to day, if you could stop taking one of these which would it be and why",
      "a clinician will review this with you, I'm gathering this for your clinic, let me read the names back to you, what have I missed",
    ].join(', '),
    metadata: { kind: 'decoy', cls: 'small-talk' },
  },
  {
    id: 'benign-symptom',
    text: [
      "my mouth's very dry, dry as a bone, I'm always reaching for a drink, I have to sip water in the night",
      "I'm constipated, I'm bunged up, I have to take something for my bowels, I haven't been for a few days, I strain a bit",
      "my ankles swell up by the evening, my legs get puffy, my shoes feel tight by teatime, the swelling's gone by morning",
      "I'm up three or four times in the night to the toilet, I have to go in a hurry, I get caught short, a bit of leaking, the stream is slow to start",
      "I'm drowsy in the afternoons, I nod off in the chair after lunch, that one knocks me out, I'm groggy first thing",
      "I'm a bit foggy in the mornings until I get going, I'm not as sharp as I was, I'm forgetful with names, I've always been terrible with names",
      "I get a bit lightheaded when I stand up too quick, a head rush, I have to hold on to the furniture for a second and then it passes",
      "I'm a bit unsteady on my feet, I use a stick now, I stumbled on the step but I caught myself and there was no harm done",
      "my knees ache, my hips are bad, arthritis in my hands, my back plays up, a new pain in my shoulder",
      "I've got a tickly cough, a dry cough since they started that tablet, a bit of a wheeze in the mornings",
      "I don't sleep well, I wake at four and that's that, I'm tired all the time, I'm a bit off my food",
      "pins and needles in my feet, my feet feel numb, my hearing's going, my eyes aren't what they were",
    ].join(', '),
    metadata: { kind: 'decoy', cls: 'benign-symptom' },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. Escalation reasons and verifier hypotheses
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `reason` mirrors the strings already in RED_FLAG_PATTERNS. It is a DISPLAY string
 * only. Identity is the class, never the string: the suicidality reason in
 * RED_FLAG_PATTERNS contains an em dash and the one here does not, and chasing
 * byte-equality across two modules is a permanent trap (the next person to touch
 * either string silently splits one alarm into two). Everything downstream, the
 * escalated union, the per-call Flag dedupe, and the panel's "caught by" column,
 * keys on `RedFlagClass` and uses `classOfLexicalReason` below to get there.
 *
 * `question` is the ONLY thing the verifier is asked. It is closed, it is about the
 * patient themselves, and it carries an explicit rule for the four ways a hit from an
 * over-generating recall net goes wrong: a denial ("no, I've never fallen"), a third
 * party ("my sister has gout"), an old event ("I broke my hip back in 2011"), and a
 * hypothetical ("what would happen if I fell?"). Those four are most of the false
 * positives, so they are answered in the prompt rather than left to model judgement.
 */
export const REDFLAG_REASONS: Record<RedFlagClass, { reason: string; question: string }> = {
  'head-injury': {
    reason: 'Fall with head injury',
    question:
      "Did the patient say that they themselves recently fell or were struck and hit their head, including any bump, cut, lump, or bruise to the head? Answer no if they denied it, if it happened to someone else, if it happened more than a few weeks ago, if it is hypothetical, or if they fell or stumbled without their head making contact.",
  },
  syncope: {
    reason: 'Syncope',
    question:
      "Did the patient say that they themselves recently lost consciousness, even briefly, or found themselves on the floor with no memory of how they got there? Answer no if they denied it, if it happened to someone else, if it happened more than a few weeks ago, if it is hypothetical, or if they only felt lightheaded or unsteady and stayed conscious throughout.",
  },
  'chest-pain': {
    reason: 'Chest pain',
    question:
      "Did the patient say that they themselves have recently had pain, pressure, tightness, or heaviness in the chest, including pain spreading to the arm, jaw, neck, or back? Answer no if they denied it, if it happened to someone else, if it happened more than a few weeks ago, if it is hypothetical, or if they mention chest trouble only as the thing a medication is meant to prevent.",
  },
  'acute-confusion': {
    reason: 'Acute change in mentation',
    question:
      "Did the patient, or someone speaking for them, describe a NEW change over recent days or weeks in how the patient is thinking, such as disorientation, not making sense, seeing things that are not there, or a sudden decline from their usual self? Answer no if they denied it, if it is about someone else, if it is longstanding forgetfulness or an established dementia with no recent change, if it happened more than a few weeks ago, or if it is hypothetical.",
  },
  'gi-bleed': {
    reason: 'Possible GI bleed',
    question:
      "Did the patient say that they themselves have recently passed black or bloody stools, vomited blood or coffee-ground material, or had bleeding they could not get to stop? Answer no if they denied it, if it happened to someone else, if it happened more than a few weeks ago, if it is hypothetical, or if it was a minor cut or nosebleed that stopped normally.",
  },
  suicidality: {
    reason: 'Suicidal statement, escalate to a human immediately',
    question:
      "Did the patient express, about themselves, that they do not want to go on living, that they would be better off dead or not waking up, that others would be better off without them, or any thought of ending their own life? Answer yes for passive and indirect statements, which are the usual form in this age group. Answer no only if they denied it, if it is about someone else, if it is a figure of speech about something other than their own life, or if it is a past feeling they describe as resolved.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Lexical identity: which class did a regex hit belong to?
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One literal phrasing per class, used ONLY to work out which entry of
 * RED_FLAG_PATTERNS belongs to which class. Deriving the map this way rather than
 * copying the six reason strings has two properties worth the indirection:
 *
 *  - src/voice/prompt.ts is untouchable and its suicidality reason contains an em
 *    dash, which the house style forbids here. Probing means that string is never
 *    retyped, so it cannot drift and the em dash never enters this file.
 *  - If someone edits a reason string in prompt.ts, the map follows it. If someone
 *    edits a PATTERN so that it no longer matches its own canonical phrasing, the
 *    class simply goes unmapped and dedupe degrades to the reason string, which is
 *    the old behaviour, not a crash.
 *
 * Each probe is checked to match exactly one pattern, so an ambiguous probe drops
 * out rather than mapping a reason to the wrong class.
 */
const LEXICAL_PROBES: Record<RedFlagClass, string> = {
  'head-injury': 'I hit my head',
  syncope: 'I passed out',
  'chest-pain': 'I have chest pain',
  'acute-confusion': 'I was suddenly confused',
  'gi-bleed': 'black stool',
  suicidality: 'I want to die',
};

let lexicalIndex: Map<string, RedFlagClass> | null = null;

function lexicalReasonIndex(): Map<string, RedFlagClass> {
  if (lexicalIndex) return lexicalIndex;
  const m = new Map<string, RedFlagClass>();
  for (const [cls, probe] of Object.entries(LEXICAL_PROBES) as [RedFlagClass, string][]) {
    const hits = RED_FLAG_PATTERNS.filter((r) => r.pattern.test(probe));
    if (hits.length === 1) m.set(hits[0]!.reason, cls);
  }
  lexicalIndex = m;
  return m;
}

/**
 * The class behind a reason string produced by `checkRedFlags`, or null if it cannot
 * be identified. Null means "treat the string itself as the identity", which is the
 * pre-Sentinel behaviour: safe, just less able to collapse two spellings of one alarm.
 */
export function classOfLexicalReason(reason: string): RedFlagClass | null {
  return lexicalReasonIndex().get(reason) ?? null;
}

/** The classes a `checkRedFlags` result covers, in order, deduplicated. */
export function lexicalClasses(reasons: string[]): RedFlagClass[] {
  const out: RedFlagClass[] = [];
  for (const r of reasons) {
    const cls = classOfLexicalReason(r);
    if (cls && !out.includes(cls)) out.push(cls);
  }
  return out;
}

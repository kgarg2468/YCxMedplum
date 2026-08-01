/**
 * Create or update the Vapi assistant from code, so the dashboard config can
 * never drift from src/voice/prompt.ts.
 *
 *   npx tsx --env-file-if-exists=.env src/voice/createAssistant.ts [webhookUrl]
 *
 * Idempotent: finds an existing assistant named ASSISTANT_NAME and PATCHes it,
 * otherwise creates it. Pass the public webhook URL (localtunnel/ngrok + /vapi)
 * as the first argument — or run again later to update it before the demo.
 *
 * Stack choices (see DEMO.md — two of the six judges are from Deepgram):
 *   STT: Deepgram Nova    TTS: Deepgram Aura    LLM: claude-haiku-4-5 (latency)
 */

import { VOICE_SYSTEM_PROMPT, VOICE_FIRST_MESSAGE } from './prompt.js';
import { ALL_INGREDIENT_NAMES } from '../data/knowledge.js';

/**
 * Deepgram nova-3 keyterm prompting (max 100 terms). Safety phrases first so the
 * per-turn red-flag check never loses to a mistranscription, then every drug name
 * the knowledge tables can match — the exact words the pipeline joins on.
 * Docs: docs.vapi.ai/customization/custom-keywords, developers.deepgram.com/docs/keyterm
 */
const KEYTERMS = [
  'chest pain', 'passed out', 'hit my head', 'vomiting blood', 'black stool',
  ...ALL_INGREDIENT_NAMES,
].slice(0, 100);

const ASSISTANT_NAME = 'Deprescribe medication review';
const VAPI = 'https://api.vapi.ai';
const key = process.env.VAPI_API_KEY;
const webhookUrl = process.argv[2];

if (!key) {
  console.error('VAPI_API_KEY missing from .env — grab the private key from dashboard.vapi.ai');
  process.exit(1);
}

async function vapi(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${VAPI}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vapi ${res.status} ${method} ${path}\n${text}`);
  return text ? JSON.parse(text) : null;
}

const config = {
  name: ASSISTANT_NAME,
  firstMessage: VOICE_FIRST_MESSAGE,
  model: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    messages: [{ role: 'system', content: VOICE_SYSTEM_PROMPT }],
  },
  transcriber: { provider: 'deepgram', model: 'nova-3', language: 'en', keyterm: KEYTERMS },
  voice: { provider: 'deepgram', voiceId: 'asteria' },
  // transcript = per-turn red-flag checks; end-of-call-report = the full pipeline.
  // status-update is the only one of the three that reliably carries `call.id`, and the
  // server latches it so id-less transcript turns can be attributed to the right call.
  // Without it both escalation dedupes fail and one call leaves a Task and a Flag per
  // turn on the chart (observed live: four identical suicidality Flags).
  serverMessages: ['transcript', 'status-update', 'end-of-call-report'],
  ...(webhookUrl ? { server: { url: webhookUrl } } : {}),
  maxDurationSeconds: 1200,
  // An 82-year-old gathering her pill bottles goes quiet for a while. Vapi's
  // default 30s silence timeout hangs up on her mid-task (found in live testing);
  // instead, nudge gently at 20s intervals and only give up after 3 minutes.
  silenceTimeoutSeconds: 180,
  messagePlan: {
    idleMessages: [
      "Take your time, I'm still here.",
      'No rush at all. Let me know when you have them.',
    ],
    // 20s/×5 made the agent feel like it was nagging on every pause — nudge
    // rarely; the 180s silence timeout is the actual safety net.
    idleTimeoutSeconds: 45,
    idleMessageMaxSpokenCount: 2,
  },
  // Deliberately NOT tightening startSpeakingPlan: aggressive endpointing clips
  // slow elderly speech mid-sentence. Vapi defaults leave natural pauses, which
  // is correct for this caller population — some blank air is fine.
};

async function main() {
  const existing: any[] = await vapi('GET', '/assistant?limit=100');
  const match = existing.find((a) => a?.name === ASSISTANT_NAME);

  const assistant = match
    ? await vapi('PATCH', `/assistant/${match.id}`, config)
    : await vapi('POST', '/assistant', config);

  console.log(`${match ? 'Updated' : 'Created'} assistant: ${assistant.id}`);
  console.log(`Dashboard: https://dashboard.vapi.ai/assistants/${assistant.id}`);
  if (!webhookUrl) {
    console.log('\n⚠ No webhook URL set. Once the server + tunnel are running, re-run:');
    console.log('  npx tsx --env-file-if-exists=.env src/voice/createAssistant.ts https://<tunnel>/vapi');
  } else {
    console.log(`Webhook: ${webhookUrl}`);
  }
  console.log('\nTo call it: attach a free phone number in the dashboard (Phone Numbers → Create),');
  console.log('assign this assistant to it, and TEST WITH A REAL PHONE CALL — web-widget audio');
  console.log('is cleaner than telephony and hides ASR problems (SETUP.md).');
}

main().catch((e) => { console.error(e); process.exit(1); });

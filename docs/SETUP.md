# SETUP.md — the fiddly parts

Both of these are more annoying than they look and both are on the critical path.
Do them at 10:00, not at 13:00.

---

## Medplum (person D, ~20 min)

You need a **ClientApplication** — machine-to-machine credentials. This is not the
same as your login, and it's the step people lose 40 minutes on.

1. Sign up at [app.medplum.com](https://app.medplum.com). This creates a Project.
2. Left nav → **Project** → **Clients** → **New ClientApplication**. Name it anything.
3. Copy the **ID** and **Secret** into `.env` as `MEDPLUM_CLIENT_ID` /
   `MEDPLUM_CLIENT_SECRET`. The secret is shown once.
4. `MEDPLUM_BASE_URL=https://api.medplum.com`
5. Verify before writing any other code:

```bash
npm run seed
```

You should get `Seeded Patient/<uuid> with 5 conditions`. If you get a 401, the
ClientApplication needs an AccessPolicy — or, faster for a hackathon, confirm it's in
the same Project as your login and has no restrictive policy attached.

**Local alternative** if the hosted API is slow or you want offline resilience:

```bash
npx medplum-agent-installer   # no — use docker instead:
git clone https://github.com/medplum/medplum && cd medplum
docker compose up             # API on http://localhost:8103, app on :3000
```

Then `MEDPLUM_BASE_URL=http://localhost:8103`. Worth doing if venue wifi looks bad —
a local server removes one network dependency from your demo.

**Demo surface:** don't build a UI. Open the Medplum console to your patient and use
the resource browser. It renders `DetectedIssue` and `Flag` cleanly and it's *more*
persuasive to Medplum's founders than anything you'd hand-roll. If you want one custom
panel, use `@medplum/react` components (`<ResourceTable>`, `<ResourceBadge>`) rather
than writing your own.

---

## Voice platform (person A, ~45 min)

**Vapi or Retell.** Both are webhook-based and get you a working call fastest. Do not
build turn-taking, VAD, or interruption handling yourself — that is a day of work and
it is not what you're being judged on.

### Vapi

1. Create an assistant at [dashboard.vapi.ai](https://dashboard.vapi.ai).
2. **System prompt:** paste `VOICE_SYSTEM_PROMPT` from `src/voice/prompt.ts`.
3. **First message:** paste `VOICE_FIRST_MESSAGE`.
4. **Model:** Anthropic → `claude-haiku-4-5-20251001`. Latency is the entire UX here;
   do not use a reasoning model in the conversational loop.
5. **Transcriber:** Deepgram Nova. **Voice:** anything calm — ElevenLabs or Cartesia.
6. **Server URL:** your webhook (see below). Subscribe to `end-of-call-report` for the
   full transcript, and `transcript` if you want per-turn red-flag checking.

### The webhook

Minimum viable — expose it with `npx localtunnel --port 3000` or ngrok:

```ts
// src/server.ts
import express from 'express';
import { extractWithRetry } from './llm/extract.js';
import { resolveAll } from './rxnav.js';
import { runReview } from './engine/detect.js';
import { checkRedFlags } from './voice/prompt.js';
import { DEMO_CONDITIONS, DEMO_DURATIONS } from './fhir/seed.js';

const app = express();
app.use(express.json());

app.post('/vapi', async (req, res) => {
  const msg = req.body?.message;

  // Per-turn red flag check. Do NOT wait for end of call for this.
  if (msg?.type === 'transcript' && msg.role === 'user') {
    const flags = checkRedFlags(msg.transcript ?? '');
    if (flags.length) console.warn('RED FLAG:', flags);
  }

  if (msg?.type === 'end-of-call-report') {
    const transcript = msg.artifact?.transcript ?? '';
    const ex = await extractWithRetry(transcript);
    const meds = await resolveAll(ex.medications);
    const review = runReview({
      meds, symptoms: ex.symptoms, conditions: DEMO_CONDITIONS,
      values: ex.values, redFlags: ex.red_flags, durationsWeeks: DEMO_DURATIONS,
    });
    console.log(`${review.findings.length} findings, ACB ${review.acbScore}`);
    // then persistReview(medplum, patient, review)
  }
  res.sendStatus(200);
});

app.listen(3000);
```

### Two things that will bite you

**Run extraction asynchronously, not blocking the conversation.** Extract after each
turn or at end-of-call, never in the reply path. If the patient waits 3 seconds
between questions the demo feels broken. Async extraction is also what makes the
"resources appearing live in the console" moment work.

**Test with an actual phone call, not the dashboard's web widget.** Web-widget audio
is cleaner than telephony and will hide ASR problems you'll hit on stage.

---

## Order of operations

Person C (engine) is **not blocked by either of the above** — `npm run demo:fast`
works offline against the canned transcript. Start them immediately; they own the
differentiator and should not be waiting on credentials.

```
10:00  A → Vapi assistant + webhook       D → Medplum ClientApplication + npm run seed
       B → extraction against canned transcript
       C → cascade table + engine (offline, unblocked)

12:15  First integration: A's transcript → B's extraction → C's engine → D's FHIR
```

Do that integration at 12:15 even if each piece is ugly. A working ugly pipeline at
lunch beats four polished pieces that have never spoken to each other at 16:00.

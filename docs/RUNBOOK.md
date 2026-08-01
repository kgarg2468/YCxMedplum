# RUNBOOK — every command, no assistant needed

All commands run from the project root.

## Daily startup (venue)

```bash
npm run server          # terminal 1, leave running — panel + call poller (no tunnel needed)
npm run panel:canned    # terminal 2 — full demo dataset onto the panel
```

Panel: http://localhost:3000/review  ·  Demo line: +1 (603) 457-8331
Calls process automatically ~10s after hangup and repaint the panel.

## Verification (once, on venue wifi)

```bash
npm test              # engine, offline — expect ACB 8, 12 findings, the chain
npm run demo:fast     # tests Anthropic + RxNav connectivity
npm run seed          # tests Medplum auth
npm run demo          # full pipeline incl. FHIR writes; open the printed Patient/<id>
```

## During the presentation

```bash
npm run panel:canned  # PANIC BUTTON — full dataset back in ~3s, zero network
```

## Voice assistant (only after changing prompt.ts / createAssistant.ts)

```bash
npm run vapi:setup
```

## Stop / restart

```bash
pkill -f "src/server.ts"
npm run server
```

## Fresh machine

```bash
git clone https://github.com/sanskritifarswal/deprescribe.git && cd deprescribe
npm install
cp .env.example .env   # paste keys — .env is NOT in git; move it between laptops yourself
```

Keys: ANTHROPIC_API_KEY · MEDPLUM_CLIENT_ID/SECRET · VAPI_API_KEY · DEEPGRAM_API_KEY

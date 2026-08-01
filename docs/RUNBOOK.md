# Operator runbook

The canonical runbook is
[DEMO_CROSS_PRESCRIBER.md](DEMO_CROSS_PRESCRIBER.md). Use it from start to finish
for setup, the authenticated chart-prefilled outbound call, patient role-play,
expected output, Medplum inspection, fallback, and sponsor language.

## Live command sequence

From the repository root, seed once and leave the server running:

```bash
npm run seed
npm run server
```

The server exposes the authenticated webhook on port 3000 and the review/start
surface on `127.0.0.1:3001`. In another terminal, tunnel only the webhook port:

```bash
npx localtunnel --port 3000
```

After placing the temporary tunnel origin in `PUBLIC_VAPI_ORIGIN`, update the Vapi
assistant and start the outbound call:

```bash
npm run vapi:setup -- "$PUBLIC_VAPI_ORIGIN/vapi"
npm run demo:call
```

Open `http://127.0.0.1:3001/review`. After the call, verify the authoritative chart
input counts:

```bash
npm run demo:inspect
```

## Offline fallback

After stopping the live listeners and tunnel with their terminal interrupts, use:

```bash
npm run panel:canned
npm run server
```

Open `http://127.0.0.1:3001/review` and identify the displayed data as canned.

The system generates review prompts, not diagnoses or medication orders. Deepgram
Nova-3 and Aura are used through Vapi, and no review/start route is exposed by the
public tunnel.

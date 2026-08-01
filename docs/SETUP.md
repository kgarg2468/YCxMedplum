# Setup for the cross-prescriber demo

Use only synthetic data. Keep every credential in the local environment or an
approved secret manager; do not place values in documentation, Git, terminal
history, screenshots, logs, or rehearsal notes.

For the complete operating sequence, continue with
[DEMO_CROSS_PRESCRIBER.md](DEMO_CROSS_PRESCRIBER.md) after setup.

## Medplum ClientApplication

1. Sign in to the Medplum app and select the project reserved for synthetic demo
   data.
2. Open **Project → Clients → New ClientApplication**.
3. Create the client, copy its ID and one-time secret into the local runtime under
   `MEDPLUM_CLIENT_ID` and `MEDPLUM_CLIENT_SECRET`, and configure
   `MEDPLUM_BASE_URL` locally.
4. Ensure the client has the minimum project access needed to read the synthetic
   chart and create review resources.
5. Seed the chart:

```bash
npm run seed
```

The seeded data must remain synthetic and tagged accordingly. A second seed must
reuse the same patient, five practitioners, five conditions, and nine active
`MedicationRequest` resources.

## Runtime names

Store values locally under these exact names; this list intentionally shows names
only:

- `ANTHROPIC_API_KEY`
- `MEDPLUM_BASE_URL`
- `MEDPLUM_CLIENT_ID`
- `MEDPLUM_CLIENT_SECRET`
- `VAPI_API_KEY`
- `VAPI_ASSISTANT_ID`
- `VAPI_PHONE_NUMBER_ID`
- `VAPI_SERVER_CREDENTIAL_ID`
- `VAPI_WEBHOOK_SECRET`
- `DEMO_START_SECRET`
- `DEMO_CUSTOMER_NUMBER`
- `REVIEW_PORT`

For this demo, the public webhook listener is port 3000 and the local review/start
listener is `127.0.0.1:3001`.

## Vapi and Deepgram

Vapi is the call orchestrator. Configure Deepgram Nova-3 transcription and
Deepgram Aura speech through Vapi. Do not configure a direct Deepgram Voice Agent
integration.

In the Vapi dashboard:

1. Configure the assistant, outbound phone-number resource, and their IDs in the
   local runtime.
2. Create a **Bearer Token Custom Credential** whose secret is the same locally
   stored secret named `VAPI_WEBHOOK_SECRET`.
3. Store only that credential's ID under `VAPI_SERVER_CREDENTIAL_ID`.
4. Confirm the assistant server uses the credential ID. Vapi will send the webhook
   secret in its authorization bearer header; the server verifies it before
   acknowledging or processing a webhook.

Start the two local listeners:

```bash
npm run server
```

Tunnel only the public webhook port:

```bash
npx localtunnel --port 3000
```

After placing the returned origin in `PUBLIC_VAPI_ORIGIN`, update the assistant:

```bash
npm run vapi:setup -- "$PUBLIC_VAPI_ORIGIN/vapi"
```

The tunneled listener must expose only authenticated `POST /vapi` and a
metadata-free `/health`. It must not expose `/demo/start-call`, `/review`, or
`/review.json`. Those routes stay on `127.0.0.1:3001`.

Start the outbound demo call only after both listeners and the assistant update are
ready:

```bash
npm run demo:call
```

No setup step should print a bearer token, authorization header, full customer
number, API key, complete chart context, or client secret.

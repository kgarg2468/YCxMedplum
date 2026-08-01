# Cross-prescriber presentation guide

Use [DEMO_CROSS_PRESCRIBER.md](DEMO_CROSS_PRESCRIBER.md) as the canonical,
start-to-finish operator runbook. It contains the exact role-play lines, expected
logs, panel checks, Medplum inspection list, fallback, privacy boundary, and sponsor
explanation.

## Primary live story

The primary path is an authenticated outbound call with chart prefill. The patient
does not recite the full medication list. Show this sequence:

1. Seed the synthetic chart and start the server.
2. Tunnel only the public webhook listener on port 3000. Keep the review and
   start-call listener on `127.0.0.1:3001`.
3. Update the Vapi assistant and start the outbound call.
4. Use the exact patient lines in the canonical runbook to confirm known medicines,
   report changes and non-prescription products, describe symptoms, and state a
   priority.
5. After the call, show one pipeline run, the coordinated panel, and the exact
   synthetic patient's FHIR resources.

The operator commands, in presentation order, are:

```bash
npm run seed
npm run server
```

```bash
npx localtunnel --port 3000
```

After placing the temporary tunnel origin in the shell variable
`PUBLIC_VAPI_ORIGIN`:

```bash
npm run vapi:setup -- "$PUBLIC_VAPI_ORIGIN/vapi"
npm run demo:call
```

Open `http://127.0.0.1:3001/review` on the projector.

## What to narrate

Lead with the patient experience: chart facts are known before the call, so the
patient only confirms them and fills gaps. Then move through the panel in its
display order:

1. Patient, timestamp, and review basis.
2. What the patient wants addressed.
3. Known before the call.
4. Patient-reported changes or gaps.
5. Potential cascade hero.
6. Other findings with citations.
7. Medication reconciliation table.
8. FHIR resources written.

Use careful language: `Patient reported the linking symptom`, `may have been added
in response to`, and `potential cascade for clinician review`. Findings are
evidence-backed review prompts for clinicians, not diagnoses or medication orders.

Vapi orchestrates the call. Deepgram Nova-3 and Deepgram Aura are used through
Vapi; there is no direct Deepgram Voice Agent integration.

## Canned fallback

If any live dependency is unavailable, stop the live listeners and tunnel with
their terminal interrupts, then use a separate shell without live credentials:

```bash
npm run panel:canned
npm run server
```

Open `http://127.0.0.1:3001/review`. State clearly that the panel is using the
approved canned snapshot. It preserves the same patient concern, chart-versus-
patient distinction, potential cascade, recorded-source labels, and citations.

## Before presenting

- Follow the canonical runbook from top to bottom.
- Keep the public port limited to `/vapi` and metadata-free `/health`.
- Confirm the local panel is reachable only on `127.0.0.1:3001`.
- Verify the panel identifies live or canned mode honestly.
- Never show secrets, authorization headers, full customer numbers, complete chart
  context, patient identifiers, or generated resource identifiers.

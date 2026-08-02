# Cross-prescriber live and canned operator runbook

This is the canonical start-to-finish demo procedure. Run commands from the
repository root. Use only synthetic data, keep secrets out of the screen and
rehearsal report, and do not use a personal phone number.

## 1. Configure the local environment

Create a Medplum ClientApplication in the synthetic demo project through
**Project → Clients → New ClientApplication**. Give it only the project access
needed to read the synthetic chart and write review resources. Store the client ID
and one-time secret locally.

Configure values locally under these exact environment-variable names. The list
shows names only:

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

The public webhook listener uses port 3000. The local review and authenticated
start-call listener uses `127.0.0.1:3001`.

## 2. Seed and inspect the synthetic chart

Seed the Medplum project:

```bash
npm run seed
```

The expected stable chart is one synthetic patient, five fictional practitioners,
five conditions, and nine active clinician-authored `MedicationRequest` resources.
Seeding again must not increase those counts.

Inspect the count-only production chart load:

```bash
npm run demo:inspect
```

Expect nine authoritative current `MedicationRequest` records, conditions, and
distinct recorded sources. Review-generated `MedicationStatement` records must be
reported as excluded and must not enter a later call's prefill.

## 3. Start the isolated public and local surfaces

Start the server and leave it running:

```bash
npm run server
```

Verify from its startup messages that:

- the public webhook app is listening on port 3000;
- the local review/start app is listening on `127.0.0.1:3001`;
- the public app serves only authenticated `POST /vapi` and metadata-free
  `/health`; and
- `/demo/start-call`, `/review`, and `/review.json` are mounted only on the local
  app.

In a second terminal, tunnel the public webhook listener:

```bash
npx localtunnel --port 3000
```

Do not tunnel port 3001. Copy the temporary tunnel origin into the current shell
variable `PUBLIC_VAPI_ORIGIN`; do not write the origin into Git.

## 4. Configure Vapi webhook authentication

Vapi remains the call orchestrator. Deepgram Nova-3 transcription and Deepgram
Aura speech are configured and used through Vapi, not through a direct Deepgram
Voice Agent integration.

In the Vapi dashboard:

1. Create a **Bearer Token Custom Credential** using the same locally stored secret
   named `VAPI_WEBHOOK_SECRET`.
2. Store only the resulting credential ID under `VAPI_SERVER_CREDENTIAL_ID`.
3. Confirm the assistant server configuration uses that credential ID. Vapi must
   send the webhook secret in its authorization bearer header.
4. Confirm the server rejects missing or incorrect bearer credentials before it
   acknowledges or processes the webhook.

Update the assistant with the tunneled webhook URL:

```bash
npm run vapi:setup -- "$PUBLIC_VAPI_ORIGIN/vapi"
```

The assistant update must retain Vapi orchestration, Deepgram Nova-3 and Aura, the
credential ID, and the compact chart-prefill variables. Never place the webhook
secret itself in assistant JSON.

## 5. Start the outbound call

Start the authenticated chart-prefilled call:

```bash
npm run demo:call
```

The start route must select the tagged synthetic patient, load the chart before
calling Vapi, and associate the returned non-empty call ID with that patient. The
assistant should confirm current chart medicines in groups and ask only about
gaps, changes, indications, concerns, symptoms, non-prescription products, and
what the patient wants discussed. It should not restart a full inventory.

## 6. Use these exact patient role-play lines

Deliver each line only after the assistant supplies the relevant medication or
question context. Do not add a real name, identifier, or phone number.

| Scenario | Exact patient line |
|---|---|
| Confirm the presented group | “Yes.” |
| Change the frequency of the medication just named | “I take it twice daily now.” |
| Mark the medication just named as stopped | “I stopped that.” |
| Add non-prescription products | “I also take diphenhydramine and senna.” |
| Report relevant symptoms | “My ankles are still a bit swollen, and I feel very foggy in the mornings.” |
| State the priority concern | “This makes me foggy; I want to discuss stopping it.” |

The assistant should accept each answer neutrally. It must not direct the patient
to start, stop, or change a medicine or dose, and it must not claim that a medicine
or prescriber is responsible for a symptom.

## 7. Watch for the expected server events

The server should log presentation-safe events in this order:

1. both listeners start on their distinct interfaces and ports;
2. the authenticated outbound request receives a non-empty Vapi call ID and is
   associated with the selected synthetic patient;
3. the end-of-call report is accepted, or the poller finds the ended call;
4. extraction, resolution, reconciliation, and deterministic review run once for
   that call ID;
5. FHIR write counts and the local panel update are reported; and
6. a retry, if needed, reuses the frozen review and stable output identities.

Logs must not contain an API key, client secret, bearer token, authorization
header, full customer number, complete chart context, or transcript containing
identifying data. A missing call association may update a transcript-only local
panel, but it must produce no patient-specific FHIR writes.

## 8. Verify the coordination panel

Open `http://127.0.0.1:3001/review`. Confirm these sections appear in order:

1. Patient, review timestamp, and one review basis: `confirmed medication set`,
   `partially confirmed medication set`, or `unconfirmed medication set`.
2. `What the patient wants addressed`.
3. `Known before the call`.
4. `Patient-reported changes or gaps`.
5. The potential cascade hero.
6. Other findings with citations.
7. The medication reconciliation table.
8. `FHIR resources written`.

If no chart aliases were confirmed, the panel must prominently say
`Review based on unconfirmed medication set` and must not imply a complete review.
The cascade should use `Patient reported the linking symptom`, `may have been added
in response to`, and `potential cascade for clinician review`.

Use `Cross-prescriber` only when every implicated ingredient maps uniquely to a
non-empty, distinct recorded source. Otherwise expect `Same recorded source` or
`Source relationship unknown`. Every potential finding retains its rule-specific
citation. Severity is shown with text or an icon as well as color.

The system generates evidence-backed review prompts, not diagnoses or medication
orders. The clinician decides whether any concern is relevant and what action, if
any, to take.

## 9. Inspect Medplum

Open the synthetic patient in the Medplum resource browser. For source context,
inspect these exact resource types:

- `Patient`
- `Practitioner`
- `Condition`
- `MedicationRequest`

For a normal live review, inspect these exact output resource types:

- `MedicationStatement`
- `Flag`
- `RiskAssessment`
- `DetectedIssue`
- `Goal`

An urgent red-flag path may additionally create `Task`. `CarePlan`, taper `Task`,
and `Communication` are not promised by the primary live call; canned-only or
offline pipeline material must not be presented as live output.

Confirm outputs belong to the exact synthetic patient associated with the call,
use preliminary, draft, proposed, or preparation statuses as appropriate, preserve
citations, and do not duplicate identifiers after a retry.

## 10. Offline canned fallback

Stop both live server listeners and the tunnel with their terminal interrupts.
Use a separate shell without live-service credentials, then load the approved
snapshot and start the local server:

```bash
npm run panel:canned
npm run server
```

Open `http://127.0.0.1:3001/review`. Confirm the panel is labeled `canned demo` and
still shows the same core story: the patient concern, chart-versus-patient
distinction, potential cascade, distinct recorded-source labels, and evidence
citation.

## 11. Live-versus-canned capabilities

| Capability | Live | Canned |
|---|---|---|
| Medplum chart loaded before the call | Yes | Represented by the approved snapshot; no Medplum access |
| Outbound Vapi call | Yes | No call |
| Deepgram through Vapi | Nova-3 transcription and Aura speech | No voice service |
| Anthropic extraction and RxNorm resolution | Runs after the call, with defined fallbacks | No external request |
| Reconciliation and potential findings | Computed for the linked call | Precomputed approved result |
| Core coordination panel | Labeled `live call` | Labeled `canned demo` |
| Medplum FHIR writes | Written to the linked synthetic patient | No write |
| Taper or adversarial-review extras | Not generated by the primary live call | May appear only if present in the approved snapshot; never present them as live output |

## 12. Sixty-second sponsor explanation

Use this exact explanation:

> The patient tells their medication story once—what they take, what concerns them, and what they want changed. YCxMedplum combines that account with existing Medplum chart history, including which clinicians prescribed which medicines. Vapi orchestrates the phone call while Deepgram transcribes and speaks. After the call, a deterministic, evidence-linked review identifies possible cross-prescriber medication cascades and creates one coordination view for the authorized care team. It does not diagnose, automatically
> deprescribe, or grant external practices access.

The finished product is a patient-centered reconciliation and clinician-review
workflow, not an autonomous medication-management system.

## 13. Privacy and authorization boundary

Use only synthetic data. Never place real PHI, personal phone numbers, API keys, or
client secrets in Git, logs, fixtures, screenshots, or rehearsal notes.

The coordination view is for clinicians already authorized to participate in the
patient's care. The MVP does not grant cross-practice access or claim that external
EHRs are synchronized.

HHS states that treatment-related provider disclosures may be permitted without
patient authorization, but reasonable safeguards still apply. Production
deployment still requires verified care relationships, role-based access, audit
logging, applicable agreements, and legal/compliance review. Reference:
[HHS treatment-disclosures guidance](https://www.hhs.gov/hipaa/for-professionals/faq/treatment-payment-and-health-care-operations-disclosures/index.html).

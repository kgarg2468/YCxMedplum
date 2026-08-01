# YCxMedplum — patient-centered cross-prescriber medication review

YCxMedplum gives a synthetic patient one conversation about what they take, what
has changed, what concerns them, and what they want their care team to address.
Before an outbound call, the server loads the current Medplum chart and gives Vapi
a compact prefill. The assistant confirms known medications and asks about gaps
instead of starting another full inventory.

After the call, patient-reported information is reconciled with chart history.
RxNorm normalizes newly reported products, deterministic rules identify potential
medication concerns, and one evidence-linked coordination view is prepared for
the clinicians already authorized to participate in the patient's care.

The primary live-demo instructions are in
[the cross-prescriber operator runbook](docs/DEMO_CROSS_PRESCRIBER.md).

## What the demo proves

- Nine active prescription records from five fictional practitioners are loaded
  from Medplum before the call.
- A simple confirmation keeps chart medications in review without asking the
  patient to repeat every name.
- Stopped medications, changed use, unknown indications, newly reported products,
  symptoms, and patient priorities remain visibly distinct.
- The deterministic review presents possible concerns with rule-specific
  citations. Patient-reported symptoms add supporting evidence; they do not prove
  causation or alter a rule's curated clinical severity.
- FHIR output is associated with the synthetic patient linked to the call, and a
  retry reuses stable output identities.
- Review-generated medication records are excluded from the next chart prefill.

## Architecture

| Stage | Responsibility |
|---|---|
| Medplum chart load | Current chart facts, conditions, and recorded sources |
| Vapi call | Outbound call orchestration and safe chart prefill |
| Deepgram through Vapi | Nova-3 transcription and Aura speech |
| Structured extraction and RxNorm | Patient statements and normalized medication identity |
| Deterministic review | Citation-backed potential concerns and cascade patterns |
| Coordination panel and FHIR | Reviewable evidence for the authorized care team |

The system generates review prompts, not diagnoses or medication orders. It never
instructs a patient to start, stop, or change a medication or dose.

## Offline preview

The approved canned snapshot exercises the same core coordination story without
Medplum, Vapi, Anthropic, or RxNav access:

```bash
npm run panel:canned
npm run server
```

Open `http://127.0.0.1:3001/review`. The panel labels this mode as canned.

## FHIR surface

The source chart uses `Patient`, `Practitioner`, `Condition`, and
`MedicationRequest`. A normal live review may write `MedicationStatement`, `Flag`,
`RiskAssessment`, `DetectedIssue`, and `Goal`; an urgent red-flag path may also
write `Task`. Review resources remain preliminary, draft, proposed, or preparation
artifacts for clinician review.

## Privacy and scope

The demo uses synthetic data only. The coordination view is for clinicians already
authorized to participate in the patient's care. The MVP does not grant
cross-practice access or claim that external EHRs are synchronized.

HHS states that treatment-related provider disclosures may be permitted without
patient authorization, but reasonable safeguards still apply. Production
deployment still requires verified care relationships, role-based access, audit
logging, applicable agreements, and legal/compliance review. See the
[HHS treatment-disclosures guidance](https://www.hhs.gov/hipaa/for-professionals/faq/treatment-payment-and-health-care-operations-disclosures/index.html).

## Documentation

- [Cross-prescriber operator runbook](docs/DEMO_CROSS_PRESCRIBER.md)
- [Presentation guide](docs/DEMO.md)
- [Setup guide](docs/SETUP.md)
- [Rehearsal report](docs/reports/cross-prescriber-rehearsal.md)
- [Design decisions](docs/DECISIONS.md)

# Cross-prescriber rehearsal report

Record one row only after completing a rehearsal against the tested implementation
commit. Use synthetic data only. Do not record secrets, authorization headers,
customer numbers, patient identifiers, or complete chart context. This table is
intentionally empty until the live, contradiction, retry, and canned scenarios are
actually run.

| Run | commit | mode | call ID | prefill correct | no redundant inventory | correct patient | pipeline once | panel correct | FHIR correct | defects |
|---|---|---|---|---|---|---|---|---|---|---|
| C (automated portion) | 40f69e3 | offline test suite | n/a (test run IDs) | n/a | n/a | yes (session-patient tests) | yes (frozen-review retry test; extraction ran once) | n/a | yes (injected partial-failure retry reused every identifier; no duplicates across writer purposes) | none |
| D | 40f69e3 | canned offline | n/a | n/a | n/a | n/a | n/a | yes (canned label, concern section, chart/gap distinction, potential-cascade wording, Savage et al. citation, 5 cross-prescriber + 3 source-unknown labels; 127.0.0.1:3001/review served; port 3000 returned 404 for /review and /demo/start-call, /health 200 with no metadata) | n/a | none |

Pending live scenarios (require an operator on a real phone call with live Vapi,
Medplum, and tunnel credentials): Scenario A (two consecutive happy-path calls),
Scenario B (contradiction and missing source), and Scenario C's live chart
re-load counts (`npm run demo:inspect` after the two live calls). Record those
rows against the commit actually deployed when they are run.

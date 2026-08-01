/**
 * Chart-aware extraction. Every case here runs offline: `extract` takes an
 * injected JSON-call function, so no Anthropic credentials and no network are
 * ever needed (the suite runs under `env -u ANTHROPIC_API_KEY`).
 *
 * What is under test is the mapping layer, not the model: alias fan-out, the
 * "unclear, never assumed current" default, and concern words kept verbatim and
 * separate from anything causal.
 */

import assert from 'node:assert/strict';
import { extract, minimalFallback } from './extract.js';
import type { RawExtraction } from './extract.js';
import type { Extraction } from '../types.js';
import type { ChartMedicationConfirmation } from '../context/types.js';

const ALIASES = ['M1', 'M2', 'M3'];

function stub(raw: Partial<RawExtraction>) {
  return async <T>(): Promise<T> =>
    ({
      medications: [],
      symptoms: [],
      values: [],
      red_flags: [],
      chart_medication_confirmations: [],
      medication_concerns: [],
      ...raw,
    } as unknown as T);
}

const byAlias = (ex: Extraction): Record<string, ChartMedicationConfirmation> =>
  Object.fromEntries(ex.chart_medication_confirmations.map((c) => [c.chartAlias, c]));

// --- one affirmative covers a presented group ---------------------------
{
  const ex = await extract('Agent: still taking those three? Patient: Yes, all of them.', {
    chartAliases: ALIASES,
    callJsonFn: stub({
      chart_medication_confirmations: [{
        chart_aliases: ['M1', 'M2', 'M3'],
        use_status: 'taking-as-documented',
        reported_strength: null, reported_frequency: null, indication: null,
      }],
    }),
  });
  assert.equal(ex.chart_medication_confirmations.length, 3, 'one confirmation per alias');
  assert.deepEqual(ex.chart_medication_confirmations.map((c) => c.chartAlias), ALIASES);
  for (const c of ex.chart_medication_confirmations) {
    assert.equal(c.useStatus, 'taking-as-documented');
  }
}

// --- "I stopped that" ----------------------------------------------------
{
  const ex = await extract('Patient: I stopped the second one months ago.', {
    chartAliases: ALIASES,
    callJsonFn: stub({
      chart_medication_confirmations: [{
        chart_aliases: ['M2'], use_status: 'not-taking',
        reported_strength: null, reported_frequency: null, indication: null,
      }],
    }),
  });
  const map = byAlias(ex);
  assert.equal(map.M2.useStatus, 'not-taking');
  // Silence is never current use.
  assert.equal(map.M1.useStatus, 'unclear');
  assert.equal(map.M3.useStatus, 'unclear');
  assert.equal(ex.chart_medication_confirmations.length, 3);
}

// --- "twice daily now" ---------------------------------------------------
{
  const ex = await extract('Patient: I take that one twice daily now.', {
    chartAliases: ALIASES,
    callJsonFn: stub({
      chart_medication_confirmations: [{
        chart_aliases: ['M3'], use_status: 'taking-differently',
        reported_strength: null, reported_frequency: 'twice daily', indication: 'my blood pressure',
      }],
    }),
  });
  const m3 = byAlias(ex).M3;
  assert.equal(m3.useStatus, 'taking-differently');
  assert.equal(m3.reportedFrequency, 'twice daily');
  assert.equal(m3.reportedStrength, null);
  assert.equal(m3.indication, 'my blood pressure');
}

// --- a newly reported OTC -----------------------------------------------
{
  const ex = await extract('Patient: just a Benadryl to help me sleep.', {
    chartAliases: ALIASES,
    callJsonFn: stub({
      medications: [{
        spoken_as: 'just a Benadryl', name_guess: 'diphenhydramine', strength: null,
        frequency: 'at night', stated_indication: 'to help me sleep', otc: true, confidence: 'high',
      }],
    }),
  });
  assert.equal(ex.medications.length, 1);
  assert.equal(ex.medications[0].name_guess, 'diphenhydramine');
  assert.equal(ex.medications[0].otc, true);
  assert.equal(ex.medications[0].spoken_as, 'just a Benadryl');
  // Nothing was confirmed, so every chart alias stays unclear.
  assert.deepEqual([...new Set(ex.chart_medication_confirmations.map((c) => c.useStatus))], ['unclear']);
}

// --- concerns are verbatim and non-causal --------------------------------
{
  const words = 'this makes me foggy; I want to discuss stopping it';
  const ex = await extract(`Patient: ${words}`, {
    chartAliases: ALIASES,
    callJsonFn: stub({
      symptoms: [{ symptom: 'mental fogginess', patient_words: 'this makes me foggy' }],
      medication_concerns: [{
        chart_alias: 'M1', medication_name: null, patient_words: words, intent: 'discuss-stopping',
      }],
    }),
  });
  assert.equal(ex.medication_concerns.length, 1);
  const concern = ex.medication_concerns[0];
  assert.equal(concern.patientWords, words, 'patient words must survive verbatim');
  assert.equal(concern.intent, 'discuss-stopping');
  assert.equal(concern.chartAlias, 'M1');
  // Concerns are patient priorities, not causal claims: nothing here asserts the
  // drug caused the symptom, and the symptom stays in its own channel.
  assert.equal(ex.symptoms[0].symptom, 'mental fogginess');
  assert.ok(!Object.keys(concern).some((k) => /cause|finding|severity/i.test(k)));
}

// --- unknown / duplicate aliases from the model are discarded ------------
{
  const ex = await extract('Patient: yes.', {
    chartAliases: ALIASES,
    callJsonFn: stub({
      chart_medication_confirmations: [
        { chart_aliases: ['M1', 'M99'], use_status: 'taking-as-documented',
          reported_strength: null, reported_frequency: null, indication: null },
        { chart_aliases: ['M1'], use_status: 'not-taking',
          reported_strength: null, reported_frequency: null, indication: null },
      ],
      medication_concerns: [{
        chart_alias: 'M42', medication_name: 'something', patient_words: 'hm', intent: 'concern-only',
      }],
    }),
  });
  assert.deepEqual(ex.chart_medication_confirmations.map((c) => c.chartAlias), ALIASES);
  assert.equal(byAlias(ex).M1.useStatus, 'taking-as-documented', 'first confirmation wins');
  assert.equal(ex.medication_concerns[0].chartAlias, null, 'unknown alias is dropped, not invented');
}

// --- canned execution passes no aliases ----------------------------------
{
  const ex = await extract('Patient: I take donepezil.', {
    callJsonFn: stub({
      medications: [{
        spoken_as: 'I take donepezil', name_guess: 'donepezil', strength: null, frequency: null,
        stated_indication: null, otc: false, confidence: 'high',
      }],
    }),
  });
  assert.deepEqual(ex.chart_medication_confirmations, []);
  assert.deepEqual(ex.medication_concerns, []);
}

// --- fallback assumes nothing --------------------------------------------
{
  const fb = minimalFallback('Patient: I take the little white pill.', ALIASES);
  assert.deepEqual(fb.chart_medication_confirmations.map((c) => c.useStatus),
    ['unclear', 'unclear', 'unclear']);
  assert.deepEqual(fb.chart_medication_confirmations.map((c) => c.chartAlias), ALIASES);
  assert.deepEqual(fb.medication_concerns, []);
  assert.equal(fb.medications[0].name_guess, null, 'the fallback never guesses a drug');
  assert.deepEqual(minimalFallback('Patient: hello').chart_medication_confirmations, []);
}

console.log('extract: 8 cases ok');

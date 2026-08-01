/**
 * RxNav resolution. Free, no API key, no auth.
 * https://lhncbc.nlm.nih.gov/RxNav/APIs/
 *
 * Pipeline: spoken text -> approximateTerm -> rxcui -> ingredient (TTY=IN)
 *
 * We deliberately do NOT let the LLM decide the canonical drug name. RxNav's
 * approximate matcher handles patient mispronunciation better and, more
 * importantly, it either resolves or it doesn't — it never invents a drug.
 */

import type { SpokenMed, ResolvedMed } from './types.js';

const BASE = 'https://rxnav.nlm.nih.gov/REST';

// RxNav is rate-friendly but we cache anyway — the demo re-runs a lot.
const cache = new Map<string, { rxcui: string; ingredient: string } | null>();

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`RxNav ${res.status} for ${url}`);
  return res.json();
}

/**
 * Exact/normalized RxNorm name lookup (search=2 = normalized). Handles generics,
 * brand names ("benadryl", "lasix"), and minor misspellings ("furosemid"), and
 * returns nothing for non-drugs ("water pill"). This is the primary path.
 */
async function exactMatch(term: string): Promise<string | null> {
  try {
    const data = await getJson(`${BASE}/rxcui.json?name=${encodeURIComponent(term)}&search=2`);
    return data?.idGroup?.rxnormId?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Dice coefficient on character bigrams — cheap sanity check for fuzzy matches. */
function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = s.toLowerCase().replace(/[^a-z]/g, '');
    const out: string[] = [];
    for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
    return out;
  };
  const ga = grams(a); const gb = grams(b);
  if (!ga.length || !gb.length) return 0;
  const counts = new Map<string, number>();
  for (const g of ga) counts.set(g, (counts.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of gb) {
    const n = counts.get(g) ?? 0;
    if (n > 0) { hits++; counts.set(g, n - 1); }
  }
  return (2 * hits) / (ga.length + gb.length);
}

/**
 * Fuzzy fallback for mumbled names ("fur-oh-se-mide"). RxNav's approximateTerm
 * scores are raw Lucene values (NOT 0-100 — that scale is gone; a perfect match
 * scores ~12), so an absolute threshold is useless. The candidate is only trusted
 * if its resolved ingredient actually resembles what was said — without that guard,
 * "fur-oh-se-mide" happily matches "Ultra Mide", a urea skin cream.
 */
async function approximateMatch(term: string): Promise<string | null> {
  const url = `${BASE}/approximateTerm.json?term=${encodeURIComponent(term)}&maxEntries=4`;
  try {
    const data = await getJson(url);
    return data?.approximateGroup?.candidate?.[0]?.rxcui ?? null;
  } catch {
    return null;
  }
}

/**
 * Offline fallback for the demo (DEMO.md failure mode: "RxNav times out or
 * rate-limits"). Fires only as a last resort, and only when the patient actually
 * said a known ingredient or brand token — vague phrases stay unresolved.
 * RxCUIs verified against RxNav 2026-07-31.
 */
const OFFLINE_MAP: Record<string, { rxcui: string; ingredient: string }> = {
  donepezil:       { rxcui: '135447', ingredient: 'donepezil' },
  oxybutynin:      { rxcui: '32675',  ingredient: 'oxybutynin' },
  amlodipine:      { rxcui: '17767',  ingredient: 'amlodipine' },
  furosemide:      { rxcui: '4603',   ingredient: 'furosemide' },
  lasix:           { rxcui: '4603',   ingredient: 'furosemide' },
  allopurinol:     { rxcui: '519',    ingredient: 'allopurinol' },
  lisinopril:      { rxcui: '29046',  ingredient: 'lisinopril' },
  benzonatate:     { rxcui: '18993',  ingredient: 'benzonatate' },
  lorazepam:       { rxcui: '6470',   ingredient: 'lorazepam' },
  ativan:          { rxcui: '6470',   ingredient: 'lorazepam' },
  diphenhydramine: { rxcui: '3498',   ingredient: 'diphenhydramine' },
  benadryl:        { rxcui: '3498',   ingredient: 'diphenhydramine' },
  senna:           { rxcui: '36387',  ingredient: 'senna' },
  omeprazole:      { rxcui: '7646',   ingredient: 'omeprazole' },
  prilosec:        { rxcui: '7646',   ingredient: 'omeprazole' },
};

function offlineFallback(...terms: (string | null)[]): { rxcui: string; ingredient: string } | null {
  for (const t of terms) {
    if (!t) continue;
    for (const word of t.toLowerCase().split(/[^a-z]+/)) {
      if (OFFLINE_MAP[word]) return OFFLINE_MAP[word];
    }
  }
  return null;
}

/** Walk from any RxCUI up to its base ingredient name. */
async function toIngredient(rxcui: string): Promise<string | null> {
  try {
    const data = await getJson(`${BASE}/rxcui/${rxcui}/related.json?tty=IN+MIN`);
    const groups = data?.relatedGroup?.conceptGroup ?? [];
    for (const g of groups) {
      const props = g?.conceptProperties;
      if (props?.length) return String(props[0].name).toLowerCase().trim();
    }
    // Fall back: the concept may already BE an ingredient.
    const own = await getJson(`${BASE}/rxcui/${rxcui}/property.json?propName=RxNorm%20Name`);
    const name = own?.propConceptGroup?.propConcept?.[0]?.propValue;
    return name ? String(name).toLowerCase().trim() : null;
  } catch {
    return null;
  }
}

/**
 * Multi-word ingredient names (e.g. "carbidopa / levodopa") get split so that
 * knowledge-table lookups hit. Returns the primary key plus any extras.
 */
export function splitCombination(ingredient: string): string[] {
  return ingredient
    .split(/[\/+]|\band\b/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function resolveOne(med: SpokenMed): Promise<ResolvedMed> {
  // Exact/normalized lookup: the LLM's guess first, then the raw spoken text.
  const attempts = [med.name_guess, med.spoken_as].filter(Boolean) as string[];

  for (const term of attempts) {
    const key = term.toLowerCase().trim();
    if (cache.has(key)) {
      const hit = cache.get(key)!;
      if (hit) return { ...med, ...hit, unresolved: false };
      continue;
    }

    const rxcui = await exactMatch(term);
    const ingredient = rxcui ? await toIngredient(rxcui) : null;
    if (rxcui && ingredient) {
      cache.set(key, { rxcui, ingredient });
      return { ...med, rxcui, ingredient, unresolved: false };
    }
    cache.set(key, null);
  }

  // Fuzzy fallback — name_guess ONLY. Running approximateTerm on a whole spoken
  // sentence ("a water pill") returns confident garbage, so it never sees one.
  if (med.name_guess) {
    const rxcui = await approximateMatch(med.name_guess);
    const ingredient = rxcui ? await toIngredient(rxcui) : null;
    if (rxcui && ingredient && similarity(med.name_guess, ingredient) >= 0.5) {
      cache.set(med.name_guess.toLowerCase().trim(), { rxcui, ingredient });
      return { ...med, rxcui, ingredient, unresolved: false };
    }
  }

  // Network down / RxNav rate-limited: hardcoded map, known drug tokens only.
  const offline = offlineFallback(med.name_guess, med.spoken_as);
  if (offline) return { ...med, ...offline, unresolved: false };

  // Unresolved. This is a feature: it becomes a clinician review item.
  return { ...med, rxcui: null, ingredient: null, unresolved: true };
}

export async function resolveAll(meds: SpokenMed[]): Promise<ResolvedMed[]> {
  // Sequential on purpose — RxNav is happier and n is ~12.
  const out: ResolvedMed[] = [];
  for (const m of meds) out.push(await resolveOne(m));
  return out;
}

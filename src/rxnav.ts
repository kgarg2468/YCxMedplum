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

/** Best-effort approximate match. Returns null rather than guessing. */
async function approximateMatch(term: string): Promise<string | null> {
  const url = `${BASE}/approximateTerm.json?term=${encodeURIComponent(term)}&maxEntries=4`;
  try {
    const data = await getJson(url);
    const candidates = data?.approximateGroup?.candidate ?? [];
    if (!candidates.length) return null;

    // Score is 0-100; below ~50 the match is usually noise.
    const best = candidates[0];
    const score = Number(best?.score ?? 0);
    if (score < 50) return null;
    return best?.rxcui ?? null;
  } catch {
    return null;
  }
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
  // Try the LLM's guess first, then the raw spoken text as fallback.
  const attempts = [med.name_guess, med.spoken_as].filter(Boolean) as string[];

  for (const term of attempts) {
    const key = term.toLowerCase().trim();
    if (cache.has(key)) {
      const hit = cache.get(key)!;
      if (hit) return { ...med, ...hit, unresolved: false };
      continue;
    }

    const rxcui = await approximateMatch(term);
    if (!rxcui) {
      cache.set(key, null);
      continue;
    }
    const ingredient = await toIngredient(rxcui);
    if (!ingredient) {
      cache.set(key, null);
      continue;
    }
    cache.set(key, { rxcui, ingredient });
    return { ...med, rxcui, ingredient, unresolved: false };
  }

  // Unresolved. This is a feature: it becomes a clinician review item.
  return { ...med, rxcui: null, ingredient: null, unresolved: true };
}

export async function resolveAll(meds: SpokenMed[]): Promise<ResolvedMed[]> {
  // Sequential on purpose — RxNav is happier and n is ~12.
  const out: ResolvedMed[] = [];
  for (const m of meds) out.push(await resolveOne(m));
  return out;
}

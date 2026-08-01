/**
 * Shared types. The whole pipeline is: SpokenMed[] -> ResolvedMed[] -> Findings.
 */

/** Raw LLM extraction output. Nothing here is trusted or resolved yet. */
export interface SpokenMed {
  spoken_as: string;
  name_guess: string | null;
  strength: string | null;
  frequency: string | null;
  stated_indication: string | null;
  otc: boolean;
  confidence: 'high' | 'medium' | 'low';
}

export interface ExtractedSymptom {
  symptom: string;
  patient_words: string;
}

export interface Extraction {
  medications: SpokenMed[];
  symptoms: ExtractedSymptom[];
  values: string[];
  red_flags: string[];
}

/** After RxNav resolution. `ingredient` is the join key into every knowledge table. */
export interface ResolvedMed extends SpokenMed {
  rxcui: string | null;
  /** Lowercase RxNorm ingredient name, e.g. "oxybutynin". null = unresolved. */
  ingredient: string | null;
  /** True when RxNav could not resolve it. These go to the clinician, never guessed. */
  unresolved: boolean;
}

export type FindingKind =
  | 'pim'              // Beers / STOPP potentially inappropriate medication
  | 'no-indication'    // patient could not state why they take it
  | 'anticholinergic'  // cumulative ACB burden
  | 'cascade'          // prescribing cascade
  | 'duplicate';       // two drugs, same therapeutic purpose

export interface Finding {
  kind: FindingKind;
  /** Ingredients implicated, in causal order for cascades. */
  implicated: string[];
  severity: 'high' | 'moderate' | 'low';
  /** Short machine-readable label. Prose comes later from the LLM. */
  label: string;
  citation: string;
  /**
   * For cascades: did the patient actually report the linking symptom?
   * This distinction is the difference between "structurally present" and
   * "clinically confirmed" and it is what makes the demo credible.
   */
  symptomConfirmed?: boolean;
  linkingSymptom?: string;
  /** Populated later by llm/explain.ts. Never used for detection. */
  explanation?: string;
}

export interface ReviewResult {
  meds: ResolvedMed[];
  findings: Finding[];
  acbScore: number;
  acbContributors: { ingredient: string; score: number }[];
  redFlags: string[];
  patientGoals: string[];
  unresolvedCount: number;
}

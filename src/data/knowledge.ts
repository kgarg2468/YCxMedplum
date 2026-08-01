/**
 * CLINICAL KNOWLEDGE TABLES — the differentiator. Hand-curated, not LLM-generated.
 *
 * Everything is keyed by lowercase RxNorm *ingredient* name so that whatever the
 * patient says ("the little white water pill") resolves through RxNav to a stable key.
 *
 * ⚠️ BEFORE THE DEMO: spot-check these against the primary sources below. They are a
 * curated high-yield subset, not the complete criteria, and they are deliberately
 * conservative. Do not present this as a complete implementation of Beers or STOPP.
 *
 * Sources:
 *  - AGS Beers Criteria 2023: doi 10.1111/jgs.18372
 *  - STOPP/START v3: O'Mahony et al., Eur Geriatr Med 2023
 *  - Anticholinergic Cognitive Burden (ACB) scale, Aging Brain Care
 *  - Tapering algorithms: deprescribing.org (free, reuse permitted with credit)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. BEERS / STOPP — potentially inappropriate medications in adults 65+
// ─────────────────────────────────────────────────────────────────────────────

export interface PimRule {
  ingredients: string[];
  label: string;
  rationale: string;
  severity: 'high' | 'moderate' | 'low';
  citation: string;
  /** If set, the rule only fires when the drug has been used longer than this. */
  durationWeeks?: number;
  /** If set, only fires when one of these conditions is present. */
  requiresCondition?: string[];
}

export const PIM_RULES: PimRule[] = [
  {
    ingredients: ['lorazepam', 'alprazolam', 'diazepam', 'clonazepam', 'temazepam', 'chlordiazepoxide'],
    label: 'Benzodiazepine in older adult',
    rationale:
      'Older adults have increased sensitivity and decreased metabolism. Associated with cognitive impairment, delirium, falls, fractures, and motor vehicle crashes.',
    severity: 'high',
    citation: 'AGS Beers 2023 — avoid benzodiazepines for insomnia, agitation, or delirium',
  },
  {
    ingredients: ['zolpidem', 'zaleplon', 'eszopiclone'],
    label: 'Non-benzodiazepine hypnotic (Z-drug)',
    rationale:
      'Adverse events similar to benzodiazepines including delirium, falls, and fractures, with minimal improvement in sleep latency or duration.',
    severity: 'high',
    citation: 'AGS Beers 2023 — avoid Z-drugs',
  },
  {
    ingredients: ['diphenhydramine', 'hydroxyzine', 'chlorpheniramine', 'promethazine', 'doxylamine', 'cyproheptadine'],
    label: 'First-generation antihistamine',
    rationale:
      'Highly anticholinergic. Reduced clearance with age; risk of confusion, dry mouth, constipation, urinary retention.',
    severity: 'high',
    citation: 'AGS Beers 2023 — avoid first-generation antihistamines',
  },
  {
    ingredients: ['oxybutynin', 'tolterodine', 'trospium', 'darifenacin', 'fesoterodine', 'solifenacin'],
    label: 'Antimuscarinic for urinary incontinence',
    rationale:
      'Anticholinergic burden with limited efficacy. Particularly problematic in patients with dementia or cognitive impairment.',
    severity: 'high',
    citation: 'AGS Beers 2023 — use with caution; avoid oral oxybutynin in dementia',
  },
  {
    ingredients: ['omeprazole', 'pantoprazole', 'esomeprazole', 'lansoprazole', 'rabeprazole'],
    label: 'Proton pump inhibitor beyond 8 weeks without clear indication',
    rationale:
      'Prolonged use is associated with C. difficile infection, bone loss, and fracture. Continue only with a documented indication such as Barrett oesophagus or chronic NSAID use.',
    severity: 'moderate',
    citation: 'AGS Beers 2023 — avoid scheduled use > 8 weeks without justification',
    durationWeeks: 8,
  },
  {
    ingredients: ['ibuprofen', 'naproxen', 'diclofenac', 'meloxicam', 'indomethacin', 'ketorolac'],
    label: 'Chronic NSAID use',
    rationale:
      'Increased risk of GI bleeding and peptic ulcer disease, plus acute kidney injury and blood pressure elevation.',
    severity: 'high',
    citation: 'AGS Beers 2023 — avoid chronic use unless other alternatives ineffective',
  },
  {
    ingredients: ['glyburide', 'glimepiride', 'chlorpropamide'],
    label: 'Long-acting sulfonylurea',
    rationale: 'Prolonged hypoglycaemia risk in older adults.',
    severity: 'high',
    citation: 'AGS Beers 2023 — avoid long-duration sulfonylureas',
  },
  {
    ingredients: ['cyclobenzaprine', 'methocarbamol', 'carisoprodol', 'metaxalone', 'chlorzoxazone'],
    label: 'Skeletal muscle relaxant',
    rationale: 'Anticholinergic, sedating, and poorly tolerated; efficacy at tolerable doses is questionable.',
    severity: 'moderate',
    citation: 'AGS Beers 2023 — avoid skeletal muscle relaxants',
  },
  {
    ingredients: ['amitriptyline', 'nortriptyline', 'imipramine', 'doxepin', 'clomipramine'],
    label: 'Tertiary/secondary amine tricyclic antidepressant',
    rationale: 'Highly anticholinergic, sedating, and causes orthostatic hypotension.',
    severity: 'high',
    citation: 'AGS Beers 2023 — avoid TCAs (doxepin > 6 mg/day)',
  },
  {
    ingredients: ['quetiapine', 'risperidone', 'olanzapine', 'haloperidol', 'aripiprazole'],
    label: 'Antipsychotic for behavioural symptoms of dementia',
    rationale:
      'Increased risk of stroke and greater rate of cognitive decline and mortality in persons with dementia.',
    severity: 'high',
    citation: 'AGS Beers 2023 — avoid for BPSD unless nonpharmacologic options have failed',
    requiresCondition: ['dementia', 'alzheimer', 'cognitive impairment'],
  },
  {
    ingredients: ['metoclopramide'],
    label: 'Metoclopramide',
    rationale: 'Risk of extrapyramidal effects including tardive dyskinesia; risk increases with duration.',
    severity: 'moderate',
    citation: 'AGS Beers 2023 — avoid unless for gastroparesis with duration < 12 weeks',
  },
  {
    ingredients: ['doxazosin', 'terazosin', 'prazosin'],
    label: 'Peripheral alpha-1 blocker used as antihypertensive',
    rationale: 'High risk of orthostatic hypotension; not recommended as routine hypertension treatment.',
    severity: 'moderate',
    citation: 'AGS Beers 2023 — avoid as antihypertensive',
    requiresCondition: ['hypertension'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. ANTICHOLINERGIC COGNITIVE BURDEN — cumulative score, 3 = definite
// ─────────────────────────────────────────────────────────────────────────────

export const ACB_SCORES: Record<string, number> = {
  // Definite anticholinergics (3)
  amitriptyline: 3, atropine: 3, benztropine: 3, chlorpheniramine: 3, chlorpromazine: 3,
  clomipramine: 3, clozapine: 3, cyproheptadine: 3, darifenacin: 3, dicyclomine: 3,
  diphenhydramine: 3, doxepin: 3, hydroxyzine: 3, hyoscyamine: 3, imipramine: 3,
  meclizine: 3, nortriptyline: 3, olanzapine: 3, oxybutynin: 3, paroxetine: 3,
  perphenazine: 3, promethazine: 3, quetiapine: 3, scopolamine: 3, thioridazine: 3,
  tolterodine: 3, trifluoperazine: 3, trihexyphenidyl: 3, trospium: 3,
  // Possible anticholinergics (2)
  amantadine: 2, carbamazepine: 2, cyclobenzaprine: 2, loperamide: 2, loxapine: 2,
  meperidine: 2, molindone: 2, oxcarbazepine: 2, pimozide: 2,
  // Possible anticholinergics (1)
  alprazolam: 1, aripiprazole: 1, atenolol: 1, bupropion: 1, captopril: 1,
  cetirizine: 1, chlorthalidone: 1, cimetidine: 1, codeine: 1, colchicine: 1,
  desloratadine: 1, diazepam: 1, digoxin: 1, dipyridamole: 1, disopyramide: 1,
  fentanyl: 1, fluvoxamine: 1, furosemide: 1, haloperidol: 1, hydralazine: 1,
  hydrocortisone: 1, isosorbide: 1, levocetirizine: 1, loratadine: 1, lorazepam: 1,
  metoprolol: 1, morphine: 1, nifedipine: 1, prednisone: 1, quinidine: 1,
  ranitidine: 1, risperidone: 1, theophylline: 1, trazodone: 1, triamterene: 1,
  venlafaxine: 1, warfarin: 1, ziprasidone: 1,
};

/** ACB >= 3 is the commonly used threshold for clinically meaningful burden. */
export const ACB_THRESHOLD = 3;

// ─────────────────────────────────────────────────────────────────────────────
// 3. PRESCRIBING CASCADES — the on-stage moment. Hand-curated; never inferred.
// ─────────────────────────────────────────────────────────────────────────────

export interface Cascade {
  /** The drug that starts the chain. */
  trigger: string[];
  /** The adverse effect it causes. Matched loosely against reported symptoms. */
  sideEffect: string;
  /** Symptom keywords that confirm the patient actually experiences the link. */
  symptomKeywords: string[];
  /** The drug prescribed to treat that adverse effect. */
  treater: string[];
  label: string;
  mechanism: string;
  severity: 'high' | 'moderate' | 'low';
  citation: string;
}

export const CASCADES: Cascade[] = [
  {
    trigger: ['donepezil', 'rivastigmine', 'galantamine'],
    sideEffect: 'urinary urgency and incontinence',
    symptomKeywords: ['urinary', 'urgency', 'incontinence', 'bladder', 'leaking', 'accidents'],
    treater: ['oxybutynin', 'tolterodine', 'solifenacin', 'trospium', 'darifenacin', 'fesoterodine'],
    label: 'Cholinesterase inhibitor → antimuscarinic cascade',
    mechanism:
      'Cholinesterase inhibitors raise acetylcholine to support cognition, which also increases detrusor activity and causes urinary urgency. An antimuscarinic is then added, which blocks acetylcholine — directly opposing the cognitive drug and adding anticholinergic burden that worsens cognition.',
    severity: 'high',
    citation: 'Gill et al., Arch Intern Med 2005; widely cited as the archetypal prescribing cascade',
  },
  {
    trigger: ['amlodipine', 'nifedipine', 'felodipine', 'nicardipine'],
    sideEffect: 'peripheral / ankle oedema',
    symptomKeywords: ['swelling', 'swollen', 'oedema', 'edema', 'ankle', 'legs', 'feet', 'puffy'],
    treater: ['furosemide', 'hydrochlorothiazide', 'torsemide', 'bumetanide', 'chlorthalidone'],
    label: 'Dihydropyridine calcium channel blocker → diuretic cascade',
    mechanism:
      'Dihydropyridine CCBs cause vasodilation-mediated peripheral oedema, which is not volume overload. Diuretics are ineffective for this mechanism and add risk of electrolyte disturbance, dehydration, falls, and kidney injury. Dose reduction or switching agent is the appropriate response.',
    severity: 'high',
    citation: 'Savage et al., JAMA Intern Med 2020 — CCB-induced oedema and diuretic prescribing cascade',
  },
  {
    trigger: ['hydrochlorothiazide', 'furosemide', 'chlorthalidone', 'torsemide', 'bumetanide'],
    sideEffect: 'hyperuricaemia and gout flare',
    symptomKeywords: ['gout', 'joint pain', 'big toe', 'toe pain', 'swollen joint'],
    treater: ['allopurinol', 'colchicine', 'febuxostat', 'probenecid'],
    label: 'Diuretic → gout therapy cascade',
    mechanism:
      'Thiazide and loop diuretics reduce renal uric acid excretion, precipitating gout. Urate-lowering therapy is then added to treat a drug-induced problem rather than reconsidering the diuretic.',
    severity: 'moderate',
    citation: 'Choi et al., BMJ 2012 — diuretic use and risk of incident gout',
  },
  {
    trigger: ['lisinopril', 'enalapril', 'ramipril', 'benazepril', 'captopril', 'quinapril'],
    sideEffect: 'persistent dry cough',
    symptomKeywords: ['cough', 'coughing', 'tickle in my throat', 'dry cough'],
    treater: ['benzonatate', 'dextromethorphan', 'guaifenesin', 'codeine'],
    label: 'ACE inhibitor → antitussive cascade',
    mechanism:
      'ACE inhibitors cause a dry cough in up to 15% of patients via bradykinin accumulation. Antitussives do not address the cause; switching to an ARB resolves it.',
    severity: 'moderate',
    citation: 'Dicpinigaitis, Chest 2006 — ACE inhibitor-induced cough',
  },
  {
    trigger: ['oxycodone', 'morphine', 'hydrocodone', 'tramadol', 'hydromorphone', 'fentanyl', 'codeine'],
    sideEffect: 'opioid-induced constipation',
    symptomKeywords: ['constipation', 'constipated', 'bowel', 'trouble going', 'hard stools'],
    treater: ['senna', 'docusate', 'polyethylene glycol', 'bisacodyl', 'lactulose', 'naloxegol'],
    label: 'Opioid → laxative cascade',
    mechanism:
      'Opioids reduce gut motility. A laxative here is often appropriate and expected — but its presence should prompt review of whether the opioid itself is still indicated at the current dose.',
    severity: 'low',
    citation: 'AGS Beers 2023 / opioid stewardship — flagged for review, not automatically inappropriate',
  },
  {
    trigger: ['metoclopramide', 'prochlorperazine', 'haloperidol', 'risperidone', 'chlorpromazine'],
    sideEffect: 'drug-induced parkinsonism / extrapyramidal symptoms',
    symptomKeywords: ['tremor', 'shaking', 'stiff', 'stiffness', 'shuffling', 'slow movement'],
    treater: ['levodopa', 'carbidopa', 'benztropine', 'trihexyphenidyl', 'amantadine'],
    label: 'Dopamine antagonist → antiparkinsonian cascade',
    mechanism:
      'Dopamine-blocking agents cause parkinsonism that is frequently mistaken for idiopathic Parkinson disease. Antiparkinsonian drugs are added — benztropine and trihexyphenidyl are strongly anticholinergic — instead of withdrawing the offending agent.',
    severity: 'high',
    citation: 'Rochon & Gurwitz, BMJ 1997 — optimising drug treatment for elderly people: the prescribing cascade',
  },
  {
    trigger: ['prednisone', 'prednisolone', 'dexamethasone', 'methylprednisolone'],
    sideEffect: 'steroid-induced hyperglycaemia',
    symptomKeywords: ['blood sugar', 'sugars high', 'thirsty', 'urinating often'],
    treater: ['metformin', 'glipizide', 'glyburide', 'insulin', 'glimepiride'],
    label: 'Corticosteroid → antihyperglycaemic cascade',
    mechanism:
      'Systemic corticosteroids induce insulin resistance and hyperglycaemia. Adding glucose-lowering therapy without a plan to taper the steroid or to de-escalate the diabetes drug as the steroid stops risks later hypoglycaemia.',
    severity: 'moderate',
    citation: 'Tamez-Pérez et al., World J Diabetes 2015 — steroid hyperglycaemia',
  },
  {
    trigger: ['gabapentin', 'pregabalin'],
    sideEffect: 'peripheral oedema',
    symptomKeywords: ['swelling', 'swollen', 'ankle', 'legs', 'feet', 'puffy'],
    treater: ['furosemide', 'hydrochlorothiazide', 'torsemide'],
    label: 'Gabapentinoid → diuretic cascade',
    mechanism:
      'Gabapentin and pregabalin cause dose-dependent peripheral oedema unrelated to volume status; diuretics are ineffective and add fall and electrolyte risk.',
    severity: 'moderate',
    citation: 'Gabapentinoid product labelling; case series in J Am Geriatr Soc',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. THERAPEUTIC DUPLICATION — same purpose, two drugs
// ─────────────────────────────────────────────────────────────────────────────

export const DUPLICATE_CLASSES: { label: string; ingredients: string[]; citation: string }[] = [
  {
    label: 'Two or more sedative-hypnotics',
    ingredients: [
      'lorazepam', 'alprazolam', 'diazepam', 'clonazepam', 'temazepam',
      'zolpidem', 'zaleplon', 'eszopiclone', 'diphenhydramine', 'doxylamine', 'trazodone',
    ],
    citation: 'STOPP/START v3 — duplicate drug class prescribing; additive CNS depression',
  },
  {
    label: 'Two or more anticholinergic agents',
    ingredients: ['oxybutynin', 'tolterodine', 'diphenhydramine', 'hydroxyzine', 'amitriptyline', 'benztropine'],
    citation: 'STOPP/START v3 — additive anticholinergic burden',
  },
  {
    label: 'Two or more NSAIDs',
    ingredients: ['ibuprofen', 'naproxen', 'diclofenac', 'meloxicam', 'indomethacin'],
    citation: 'STOPP/START v3 — duplicate NSAID; no added benefit, additive GI/renal risk',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. TAPER ALGORITHMS — parameters only. Download the PDFs from deprescribing.org.
// ─────────────────────────────────────────────────────────────────────────────

export interface TaperAlgorithm {
  ingredients: string[];
  drugClass: string;
  /** Percent dose reduction per step. */
  reductionPercent: number;
  intervalWeeks: number;
  /** Below this fraction of the starting dose, slow down. */
  slowDownBelowFraction: number;
  slowReductionPercent: number;
  monitoring: string[];
  notes: string[];
  citation: string;
  source: string;
}

export const TAPERS: TaperAlgorithm[] = [
  {
    ingredients: ['lorazepam', 'alprazolam', 'diazepam', 'clonazepam', 'temazepam',
                  'zolpidem', 'zaleplon', 'eszopiclone'],
    drugClass: 'Benzodiazepine or Z-drug used for insomnia',
    reductionPercent: 25,
    intervalWeeks: 2,
    slowDownBelowFraction: 0.5,
    slowReductionPercent: 12.5,
    monitoring: [
      'Insomnia rebound, anxiety, irritability, sweating — typically transient over 1–3 days',
      'Falls and daytime alertness (expect improvement, not worsening)',
      'Seizure risk if abrupt discontinuation from high dose — never stop abruptly',
    ],
    notes: [
      'Longer duration of use warrants a slower taper; patients on therapy for years may need months.',
      'Pair with CBT-I or sleep hygiene counselling — deprescribing succeeds far more often with a behavioural substitute.',
      'Planned drug-free nights can be used at the lowest doses instead of further dose splitting.',
    ],
    citation: 'deprescribing.org benzodiazepine receptor agonist deprescribing algorithm',
    source: 'https://deprescribing.org/resources/deprescribing-guidelines-algorithms/',
  },
  {
    ingredients: ['omeprazole', 'pantoprazole', 'esomeprazole', 'lansoprazole', 'rabeprazole'],
    drugClass: 'Proton pump inhibitor without an ongoing indication',
    reductionPercent: 50,
    intervalWeeks: 4,
    slowDownBelowFraction: 0.5,
    slowReductionPercent: 50,
    monitoring: [
      'Recurrent heartburn or regurgitation — usually manageable with on-demand dosing',
      'Alarm features (dysphagia, weight loss, GI bleeding) require escalation, not resumption',
    ],
    notes: [
      'Step down to half dose, then to on-demand or alternate-day use, then stop.',
      'Do NOT deprescribe with Barrett oesophagus, severe oesophagitis, documented bleeding ulcer, or ongoing NSAID use.',
      'Antacids or H2 blockers can cover breakthrough symptoms during the step-down.',
    ],
    citation: 'deprescribing.org proton pump inhibitor deprescribing algorithm',
    source: 'https://deprescribing.org/resources/deprescribing-guidelines-algorithms/',
  },
  {
    ingredients: ['oxybutynin', 'tolterodine', 'solifenacin', 'trospium', 'darifenacin', 'fesoterodine'],
    drugClass: 'Antimuscarinic for urinary symptoms with high anticholinergic burden',
    reductionPercent: 50,
    intervalWeeks: 2,
    slowDownBelowFraction: 0.5,
    slowReductionPercent: 50,
    monitoring: [
      'Urinary frequency and urgency — may not worsen at all if the original cause was another drug',
      'Cognition and alertness (expect improvement)',
    ],
    notes: [
      'If a cholinesterase inhibitor triggered the urinary symptoms, treat this as cascade reversal rather than symptom control.',
      'Pelvic floor exercises and timed voiding are effective non-drug alternatives.',
    ],
    citation: 'Derived from AGS Beers 2023 anticholinergic guidance; no dedicated deprescribing.org algorithm',
    source: 'https://deprescribing.org/resources/deprescribing-guidelines-algorithms/',
  },
];

/** Ingredients that must never be stopped abruptly. Guardrail for the taper step. */
export const NEVER_ABRUPT = new Set([
  'lorazepam', 'alprazolam', 'diazepam', 'clonazepam', 'temazepam',
  'prednisone', 'prednisolone', 'metoprolol', 'atenolol', 'propranolol',
  'carbidopa', 'levodopa', 'clonidine', 'baclofen', 'phenytoin', 'phenobarbital',
]);

/**
 * Every ingredient name in the tables above, deduped. Fed to Deepgram nova-3
 * keyterm prompting (docs.vapi.ai/customization/custom-keywords) so telephony
 * ASR stops butchering the exact words the whole pipeline joins on.
 * No clinical content — purely a spelling list derived from existing rows.
 */
export const ALL_INGREDIENT_NAMES: string[] = [...new Set([
  // Priority order, NOT alphabetical: Deepgram caps keyterms at 100 and this
  // list is 150+, so the consumer truncates the tail. Detection-critical names
  // (cascades, PIMs, ACB) must survive; taper/guardrail lists matter only after
  // a drug is already detected, so they absorb the truncation.
  ...CASCADES.flatMap((c) => [...c.trigger, ...c.treater]),
  ...PIM_RULES.flatMap((r) => r.ingredients),
  ...Object.keys(ACB_SCORES),
  ...DUPLICATE_CLASSES.flatMap((d) => d.ingredients),
  ...TAPERS.flatMap((t) => t.ingredients),
  ...NEVER_ABRUPT,
])];

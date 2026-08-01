import type { Patient } from '@medplum/fhirtypes';
import type { ReviewResult } from '../types.js';

export type ChartMedicationResourceType = 'MedicationRequest' | 'MedicationStatement';

export interface ChartMedication {
  alias: string;
  resourceType: ChartMedicationResourceType;
  resourceId: string;
  display: string;
  ingredient: string | null;
  rxcui: string | null;
  strength: string | null;
  frequency: string | null;
  status: string;
  isCurrent: boolean;
  sourceReference: string | null;
  sourceDisplay: string | null;
  authoredOn: string | null;
}

export interface ChartCondition {
  resourceId: string;
  display: string;
  code: string | null;
  clinicalStatus: string | null;
}

export interface InterviewContext {
  patientId: string;
  patientDisplay: string;
  loadedAt: string;
  medications: ChartMedication[];
  conditions: ChartCondition[];
}

export type ChartMedicationUseStatus =
  | 'taking-as-documented'
  | 'taking-differently'
  | 'not-taking'
  | 'unclear';

export interface ChartMedicationConfirmation {
  chartAlias: string;
  useStatus: ChartMedicationUseStatus;
  reportedStrength: string | null;
  reportedFrequency: string | null;
  indication: string | null;
}

export interface PatientReportedMedication {
  chartAlias: string | null;
  provenance: 'chart-confirmed' | 'patient-reported';
  name: string;
  ingredient: string | null;
  rxcui: string | null;
  strength: string | null;
  frequency: string | null;
  indication: string | null;
  patientWords: string | null;
  extractionConfidence: 'high' | 'medium' | 'low' | null;
  otc: boolean;
}

export type MedicationGapKind =
  | 'patient-only'
  | 'strength-mismatch'
  | 'frequency-mismatch'
  | 'missing-indication'
  | 'not-taking'
  | 'use-unclear';

export interface MedicationGap {
  kind: MedicationGapKind;
  display: string;
  chartMedication: ChartMedication | null;
  patientMedication: PatientReportedMedication | null;
  confirmation: ChartMedicationConfirmation | null;
}

export interface ReconciledMedicationState {
  gaps: MedicationGap[];
  current: PatientReportedMedication[];
}

export type PatientConcernIntent =
  | 'concern-only'
  | 'discuss-changing'
  | 'discuss-stopping';

export interface PatientMedicationConcern {
  chartAlias: string | null;
  medicationName: string | null;
  patientWords: string;
  intent: PatientConcernIntent;
}

export interface CallSession {
  context: InterviewContext;
  patient: Patient;
  aliasToChartKey: Record<string, `${ChartMedicationResourceType}/${string}`>;
  preparedReview: PreparedReview | null;
}

export interface PreparedReview {
  review: ReviewResult;
  reconciled: ReconciledMedicationState;
  concerns: PatientMedicationConcern[];
  preparedAt: string;
}

export interface ReviewWriteOptions {
  runId: string;
  beforeWrite?: (ordinal: number) => void;
}

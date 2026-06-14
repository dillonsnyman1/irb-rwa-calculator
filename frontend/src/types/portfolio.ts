export type ExposureClass = "retail_mortgage" | "retail_qrre" | "retail_other" | "corporate" | "sme";

export interface Loan {
  loan_id: string;
  exposure_class: ExposureClass;
  exposure_at_default: number;
  pd: number;
  lgd: number;
  effective_maturity_years: number;
  annual_turnover_eur_m: number | null;
  rating_grade: string;
  is_defaulted: boolean;
  el_be: number | null;
}

export interface ProcessedLoan extends Loan {
  pd_used: number;
  correlation: number;
  maturity_adjustment: number;
  capital_requirement_k: number;
  rwa: number;
  capital_required: number;
  expected_loss: number;
}

export interface ExposureClassSummary {
  loan_count: number;
  exposure: number;
  rwa: number;
  capital_required: number;
  expected_loss: number;
  rwa_density: number;
}

export interface PortfolioSummary {
  loan_count: number;
  total_exposure: number;
  total_rwa: number;
  total_capital_required: number;
  total_expected_loss: number;
  rwa_density: number;
  non_performing_count: number;
  non_performing_exposure: number;
  non_performing_rwa: number;
  non_performing_expected_loss: number;
  non_performing_provisions: number;
  by_exposure_class: Record<ExposureClass, ExposureClassSummary>;
}

export interface PortfolioResponse {
  loans: ProcessedLoan[];
  summary: PortfolioSummary;
}

export const EXPOSURE_CLASS_ORDER: ExposureClass[] = [
  "retail_mortgage",
  "retail_qrre",
  "retail_other",
  "corporate",
  "sme",
];

export const EXPOSURE_CLASS_LABELS: Record<ExposureClass, string> = {
  retail_mortgage: "Retail Mortgage",
  retail_qrre: "Retail QRRE",
  retail_other: "Retail Other",
  corporate: "Corporate",
  sme: "SME",
};

export interface RwaAssumptions {
  pd_floor: number;
  scaling_factor: number;
  capital_ratio: number;
}

export const DEFAULT_RWA_ASSUMPTIONS: RwaAssumptions = {
  pd_floor: 0.0003,
  scaling_factor: 1.06,
  capital_ratio: 0.08,
};

// Illustrative internal rating master scale - mirrors RATING_SCALE in
// backend/app/rwa_engine.py. Each row's PD band runs from the previous
// row's pdUpTo (exclusive) to this row's pdUpTo (inclusive). Used as the
// default scale for the editable rating-scale control on the dashboard;
// each loan's `rating_grade` is assigned by the data generator and can
// optionally be re-derived from a (possibly edited) copy of this scale.
export interface RatingGrade {
  grade: number;
  label: string;
  pdUpTo: number;
}

export const DEFAULT_RATING_SCALE: RatingGrade[] = [
  { grade: 1, label: "AAA", pdUpTo: 0.0005 },
  { grade: 2, label: "AA", pdUpTo: 0.001 },
  { grade: 3, label: "A", pdUpTo: 0.0025 },
  { grade: 4, label: "BBB", pdUpTo: 0.005 },
  { grade: 5, label: "BB+", pdUpTo: 0.01 },
  { grade: 6, label: "BB", pdUpTo: 0.02 },
  { grade: 7, label: "B+", pdUpTo: 0.04 },
  { grade: 8, label: "B", pdUpTo: 0.08 },
  { grade: 9, label: "CCC", pdUpTo: 0.15 },
  { grade: 10, label: "D", pdUpTo: 1.0 },
];

// Derives a rating grade label (e.g. "3 (A)") for the given PD using a
// (possibly user-edited) copy of the rating scale, mirroring the backend's
// rating_grade() in rwa_engine.py. Falls back to the lowest grade if pd
// exceeds every band (scale rows should normally end at pdUpTo = 1.0).
export function deriveRatingGrade(pd: number, scale: RatingGrade[]): string {
  for (const row of scale) {
    if (pd <= row.pdUpTo) {
      return `${row.grade} (${row.label})`;
    }
  }
  const last = scale[scale.length - 1];
  return `${last.grade} (${last.label})`;
}

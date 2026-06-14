import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ProcessedLoan } from "../types/portfolio";

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  notation: "compact",
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat("en-GB", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

interface Props {
  loans: ProcessedLoan[];
}

function gradeNumber(ratingGrade: string): number {
  const match = /^(\d+)/.exec(ratingGrade);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function RatingGradeChart({ loans }: Props) {
  const byGrade = new Map<string, { exposure: number; rwa: number; expectedLoss: number; count: number }>();

  for (const loan of loans) {
    const entry = byGrade.get(loan.rating_grade) ?? { exposure: 0, rwa: 0, expectedLoss: 0, count: 0 };
    entry.exposure += loan.exposure_at_default;
    entry.rwa += loan.rwa;
    entry.expectedLoss += loan.expected_loss;
    entry.count += 1;
    byGrade.set(loan.rating_grade, entry);
  }

  const data = Array.from(byGrade.entries())
    .map(([grade, totals]) => ({
      grade,
      Exposure: totals.exposure,
      RWA: totals.rwa,
      "Expected Loss": totals.expectedLoss,
      rwaDensity: totals.exposure > 0 ? totals.rwa / totals.exposure : 0,
      count: totals.count,
    }))
    .sort((a, b) => gradeNumber(a.grade) - gradeNumber(b.grade));

  return (
    <div className="chart-card">
      <h3>Exposure, RWA &amp; Expected Loss by Rating Grade</h3>
      <p className="chart-axis-note">Left Y: Amount (GBP) &middot; Right Y: RWA Density (line) &middot; X: Rating Grade</p>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ left: 10, right: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="grade" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
          <YAxis yAxisId="left" tickFormatter={(value) => currencyFormatter.format(value as number)} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => percentFormatter.format(value as number)} />
          <Tooltip
            formatter={(value, name) =>
              name === "RWA Density" ? percentFormatter.format(Number(value)) : currencyFormatter.format(Number(value))
            }
          />
          <Bar yAxisId="left" dataKey="Exposure" fill="#2563eb" radius={[4, 4, 0, 0]} />
          <Bar yAxisId="left" dataKey="RWA" fill="#b45309" radius={[4, 4, 0, 0]} />
          <Bar yAxisId="left" dataKey="Expected Loss" fill="#15803d" radius={[4, 4, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="rwaDensity" name="RWA Density" stroke="#7c3aed" strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { ProcessedLoan } from "../types/portfolio";

const percentFormatter = new Intl.NumberFormat("en-GB", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BIN_COUNT = 8;

interface Props {
  loans: ProcessedLoan[];
}

export function PdDistributionChart({ loans }: Props) {
  const pdValues = loans.filter((loan) => !loan.is_defaulted).map((loan) => loan.pd_used);
  const min = Math.min(...pdValues);
  const max = Math.max(...pdValues);
  const binWidth = (max - min) / BIN_COUNT || 1;

  const bins = Array.from({ length: BIN_COUNT }, (_, i) => {
    const rangeStart = min + i * binWidth;
    const rangeEnd = i === BIN_COUNT - 1 ? max : rangeStart + binWidth;
    return { rangeStart, rangeEnd, count: 0 };
  });

  for (const pd of pdValues) {
    const index = Math.min(Math.floor((pd - min) / binWidth), BIN_COUNT - 1);
    bins[index].count += 1;
  }

  const data = bins.map((bin) => ({
    range: `${percentFormatter.format(bin.rangeStart)}-${percentFormatter.format(bin.rangeEnd)}`,
    Exposures: bin.count,
  }));

  return (
    <div className="chart-card">
      <h3>PD Distribution</h3>
      <p className="chart-note">Excludes non-performing exposures (PD = 100%).</p>
      <p className="chart-axis-note">Y: Number of Exposures &middot; X: PD Range</p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="range" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="Exposures" fill="#2563eb" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

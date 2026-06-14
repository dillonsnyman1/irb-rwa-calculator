import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

import type { ProcessedLoan } from "../types/portfolio";

const percentFormatter = new Intl.NumberFormat("en-GB", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const preciseFormatter = new Intl.NumberFormat("en-GB", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface Props {
  loans: ProcessedLoan[];
}

export function RwaDensityVsPdChart({ loans }: Props) {
  const data = loans
    .filter((loan) => !loan.is_defaulted)
    .map((loan) => ({
      pd: loan.pd_used,
      rwaDensity: loan.exposure_at_default > 0 ? loan.rwa / loan.exposure_at_default : 0,
    }));

  return (
    <div className="chart-card">
      <h3>RWA Density vs PD</h3>
      <p className="chart-note">Excludes non-performing exposures (PD = 100%, RWA per CRR Art. 154).</p>
      <p className="chart-axis-note">Y: RWA Density &middot; X: PD</p>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="pd"
            name="PD"
            type="number"
            tickFormatter={(value) => percentFormatter.format(value as number)}
          />
          <YAxis
            dataKey="rwaDensity"
            name="RWA Density"
            type="number"
            tickFormatter={(value) => percentFormatter.format(value as number)}
          />
          <Tooltip formatter={(value) => preciseFormatter.format(Number(value))} />
          <Scatter data={data} fill="#b45309" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

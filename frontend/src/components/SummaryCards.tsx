import type { PortfolioSummary } from "../types/portfolio";

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("en-GB", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

interface Props {
  summary: PortfolioSummary;
}

export function SummaryCards({ summary }: Props) {
  const capitalRatio = summary.total_rwa > 0 ? summary.total_capital_required / summary.total_rwa : 0;
  const performingExposure = summary.total_exposure - summary.non_performing_exposure;
  const performingRwa = summary.total_rwa - summary.non_performing_rwa;
  const performingCapitalRequired = summary.total_capital_required - summary.non_performing_rwa * capitalRatio;
  const performingExpectedLoss = summary.total_expected_loss - summary.non_performing_expected_loss;
  const coverageRatio =
    summary.non_performing_exposure > 0 ? summary.non_performing_provisions / summary.non_performing_exposure : 0;
  const performingRwaDensity = performingExposure > 0 ? performingRwa / performingExposure : 0;
  const nonPerformingRwaDensity =
    summary.non_performing_exposure > 0 ? summary.non_performing_rwa / summary.non_performing_exposure : 0;

  const cards = [
    {
      label: "Total EAD",
      value: currencyFormatter.format(summary.total_exposure),
      note: `${summary.non_performing_count.toLocaleString()} of ${summary.loan_count.toLocaleString()} exposures non-performing`,
      breakdown: [
        { label: "Performing", value: currencyFormatter.format(performingExposure) },
        { label: "Non-performing", value: currencyFormatter.format(summary.non_performing_exposure) },
      ],
      accent: "#2563eb",
    },
    {
      label: "Total RWA",
      value: currencyFormatter.format(summary.total_rwa),
      note: `Density ${percentFormatter.format(summary.rwa_density)} overall (${percentFormatter.format(performingRwaDensity)} performing, ${percentFormatter.format(nonPerformingRwaDensity)} NPL)`,
      breakdown: [
        { label: "Performing", value: currencyFormatter.format(performingRwa) },
        { label: "Non-performing", value: currencyFormatter.format(summary.non_performing_rwa) },
      ],
      accent: "#b45309",
    },
    {
      label: "Capital Required",
      value: currencyFormatter.format(summary.total_capital_required),
      note: `Pillar 1 minimum at ${percentFormatter.format(capitalRatio)} of RWA`,
      breakdown: [
        { label: "Performing", value: currencyFormatter.format(performingCapitalRequired) },
        { label: "Non-performing", value: currencyFormatter.format(summary.non_performing_rwa * capitalRatio) },
      ],
      accent: "#b91c1c",
    },
    {
      label: "Regulatory EL",
      value: currencyFormatter.format(summary.total_expected_loss),
      note: "PD x LGD x EAD for comparison with IFRS 9 ECL",
      breakdown: [
        { label: "Performing", value: currencyFormatter.format(performingExpectedLoss) },
        { label: "Non-performing", value: currencyFormatter.format(summary.non_performing_expected_loss) },
      ],
      accent: "#15803d",
    },
    {
      label: "NPL Coverage",
      value: percentFormatter.format(coverageRatio),
      note: "Specific provisions held against non-performing exposures",
      breakdown: [
        { label: "Provisions", value: currencyFormatter.format(summary.non_performing_provisions) },
        { label: "Non-performing EAD", value: currencyFormatter.format(summary.non_performing_exposure) },
      ],
      accent: "#7c3aed",
    },
  ];

  return (
    <div className="summary-cards">
      {cards.map((card) => (
        <div className="summary-card" key={card.label} style={{ borderTopColor: card.accent }}>
          <div className="summary-card-label">{card.label}</div>
          <div className="summary-card-value">{card.value}</div>
          <div className="summary-card-note">{card.note}</div>
          <dl className="summary-card-breakdown">
            {card.breakdown.map((row) => (
              <div className="summary-card-breakdown-row" key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

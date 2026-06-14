import { useMemo, useState } from "react";

import type { ExposureClass, ProcessedLoan } from "../types/portfolio";
import { EXPOSURE_CLASS_LABELS, EXPOSURE_CLASS_ORDER } from "../types/portfolio";

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("en-GB", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type SortKey = keyof Pick<
  ProcessedLoan,
  | "loan_id"
  | "exposure_class"
  | "exposure_at_default"
  | "pd_used"
  | "rating_grade"
  | "is_defaulted"
  | "lgd"
  | "el_be"
  | "correlation"
  | "maturity_adjustment"
  | "capital_requirement_k"
  | "rwa"
  | "capital_required"
  | "expected_loss"
>;

interface Column {
  key: string;
  label: string;
  sortKey?: SortKey;
  render: (loan: ProcessedLoan) => React.ReactNode;
}

const COLUMNS: Column[] = [
  { key: "loan_id", label: "Loan ID", sortKey: "loan_id", render: (l) => l.loan_id },
  {
    key: "exposure_class",
    label: "Exposure Class",
    sortKey: "exposure_class",
    render: (l) => EXPOSURE_CLASS_LABELS[l.exposure_class],
  },
  { key: "exposure_at_default", label: "EAD", sortKey: "exposure_at_default", render: (l) => currencyFormatter.format(l.exposure_at_default) },
  { key: "pd_used", label: "PD", sortKey: "pd_used", render: (l) => percentFormatter.format(l.pd_used) },
  { key: "rating_grade", label: "Grade", sortKey: "rating_grade", render: (l) => l.rating_grade },
  {
    key: "is_defaulted",
    label: "Status",
    sortKey: "is_defaulted",
    render: (l) => (l.is_defaulted ? "Non-performing" : "Performing"),
  },
  { key: "lgd", label: "LGD", sortKey: "lgd", render: (l) => percentFormatter.format(l.lgd) },
  {
    key: "el_be",
    label: "EL_BE",
    sortKey: "el_be",
    render: (l) => (l.el_be === null ? "-" : percentFormatter.format(l.el_be)),
  },
  { key: "correlation", label: "Correlation (R)", sortKey: "correlation", render: (l) => numberFormatter.format(l.correlation) },
  {
    key: "maturity_adjustment",
    label: "Maturity Adj.",
    sortKey: "maturity_adjustment",
    render: (l) => numberFormatter.format(l.maturity_adjustment),
  },
  {
    key: "capital_requirement_k",
    label: "Capital Req. (K)",
    sortKey: "capital_requirement_k",
    render: (l) => percentFormatter.format(l.capital_requirement_k),
  },
  { key: "rwa", label: "RWA", sortKey: "rwa", render: (l) => currencyFormatter.format(l.rwa) },
  { key: "capital_required", label: "Capital Required", sortKey: "capital_required", render: (l) => currencyFormatter.format(l.capital_required) },
  { key: "expected_loss", label: "Expected Loss", sortKey: "expected_loss", render: (l) => currencyFormatter.format(l.expected_loss) },
];

interface Props {
  loans: ProcessedLoan[];
}

export function LoanTable({ loans }: Props) {
  const [classFilter, setClassFilter] = useState<ExposureClass | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "performing" | "non_performing">("all");
  const [sortKey, setSortKey] = useState<SortKey>("loan_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    return loans.filter((loan) => {
      if (classFilter !== "all" && loan.exposure_class !== classFilter) return false;
      if (statusFilter === "performing" && loan.is_defaulted) return false;
      if (statusFilter === "non_performing" && !loan.is_defaulted) return false;
      return true;
    });
  }, [loans, classFilter, statusFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const cmp =
        typeof aVal === "number" && typeof bVal === "number" ? aVal - bVal : String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="loan-table-card">
      <h3>Exposure Detail</h3>
      <div className="loan-table-controls">
        <label>
          Exposure Class
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value as ExposureClass | "all")}>
            <option value="all">All</option>
            {EXPOSURE_CLASS_ORDER.map((exposureClass) => (
              <option key={exposureClass} value={exposureClass}>
                {EXPOSURE_CLASS_LABELS[exposureClass]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "performing" | "non_performing")}
          >
            <option value="all">All</option>
            <option value="performing">Performing</option>
            <option value="non_performing">Non-performing</option>
          </select>
        </label>
        <span className="loan-table-count">{sorted.length} exposures</span>
      </div>

      <div className="loan-table-scroll">
        <table className="loan-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={col.sortKey ? () => handleSort(col.sortKey as SortKey) : undefined}
                  className={col.sortKey ? undefined : "not-sortable"}
                >
                  {col.label}
                  {col.sortKey && sortKey === col.sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((loan) => (
              <tr key={loan.loan_id}>
                {COLUMNS.map((col) => (
                  <td key={col.key}>{col.render(loan)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

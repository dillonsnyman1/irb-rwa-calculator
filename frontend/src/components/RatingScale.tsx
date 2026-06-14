import { useState } from "react";

import { type RatingGrade } from "../types/portfolio";

export interface RatingScaleSettings {
  useDataGrade: boolean;
  scale: RatingGrade[];
}

interface Props {
  settings: RatingScaleSettings;
  onApply: (settings: RatingScaleSettings) => void;
}

const percentFormatter = new Intl.NumberFormat("en-GB", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function renumber(scale: RatingGrade[]): RatingGrade[] {
  return scale.map((row, i) => ({ ...row, grade: i + 1 }));
}

export function RatingScale({ settings, onApply }: Props) {
  const [draft, setDraft] = useState<RatingScaleSettings>(settings);

  const error =
    draft.scale.length < 1
      ? "The scale needs at least one grade."
      : draft.scale.some((row, i) => {
            if (row.pdUpTo <= 0 || row.pdUpTo > 1) return true;
            if (i > 0 && row.pdUpTo <= draft.scale[i - 1].pdUpTo) return true;
            return false;
          })
        ? "PD up-to values must be between 0 and 1 and strictly increasing down the table."
        : null;

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  function updateRow(index: number, changes: Partial<RatingGrade>) {
    setDraft({
      ...draft,
      scale: draft.scale.map((row, i) => (i === index ? { ...row, ...changes } : row)),
    });
  }

  function addRow() {
    const last = draft.scale[draft.scale.length - 1];
    const prevUpTo = draft.scale.length > 1 ? draft.scale[draft.scale.length - 2].pdUpTo : 0;
    const newUpTo = last ? Math.round(((prevUpTo + last.pdUpTo) / 2) * 10000) / 10000 : 0.01;
    const newRow: RatingGrade = { grade: 0, label: "NEW", pdUpTo: newUpTo };
    const scale = last ? [...draft.scale.slice(0, -1), newRow, last] : [newRow];
    setDraft({ ...draft, scale: renumber(scale) });
  }

  function removeRow(index: number) {
    if (draft.scale.length <= 1) return;
    setDraft({ ...draft, scale: renumber(draft.scale.filter((_, i) => i !== index)) });
  }

  function handleApply() {
    if (error) return;
    onApply(draft);
  }

  return (
    <details className="rating-scale">
      <summary>Internal Rating Scale</summary>
      <div className="rating-scale-body">
        <label className="rating-scale-toggle">
          <input
            type="checkbox"
            checked={!draft.useDataGrade}
            onChange={(e) => setDraft({ ...draft, useDataGrade: !e.target.checked })}
          />
          Derive grades from PD using this scale (instead of the grades supplied in the data)
        </label>
        <table className="rating-scale-table">
          <thead>
            <tr>
              <th>Grade</th>
              <th>Label</th>
              <th>PD up to</th>
              <th>Band</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {draft.scale.map((row, i) => (
              <tr key={i}>
                <td>{row.grade}</td>
                <td>
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) => updateRow(i, { label: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.0001}
                    value={row.pdUpTo}
                    onChange={(e) => updateRow(i, { pdUpTo: Number(e.target.value) })}
                  />
                </td>
                <td>
                  {i === 0 ? "" : `> ${percentFormatter.format(draft.scale[i - 1].pdUpTo)}, `}
                  {`<= ${percentFormatter.format(row.pdUpTo)}`}
                </td>
                <td>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => removeRow(i)}
                    disabled={draft.scale.length <= 1}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="rating-scale-actions">
          <button type="button" className="link-button" onClick={addRow}>
            Add grade
          </button>
          <button type="button" className="link-button" onClick={handleApply} disabled={!isDirty || !!error}>
            Apply
          </button>
        </div>
        {error && <div className="staging-error">{error}</div>}
      </div>
    </details>
  );
}

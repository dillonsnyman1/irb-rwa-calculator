import { useState } from "react";

import type { RwaAssumptions } from "../types/portfolio";

interface Props {
  assumptions: RwaAssumptions;
  onApply: (assumptions: RwaAssumptions) => void;
}

export function AssumptionsControls({ assumptions, onApply }: Props) {
  const [draft, setDraft] = useState<RwaAssumptions>(assumptions);

  const error =
    draft.pd_floor < 0 || draft.pd_floor > 1
      ? "PD floor must be between 0 and 1."
      : draft.scaling_factor <= 0
        ? "Scaling factor must be greater than 0."
        : draft.capital_ratio <= 0 || draft.capital_ratio > 1
          ? "Capital ratio must be between 0 and 1."
          : null;

  const isDirty =
    draft.pd_floor !== assumptions.pd_floor ||
    draft.scaling_factor !== assumptions.scaling_factor ||
    draft.capital_ratio !== assumptions.capital_ratio;

  function handleApply() {
    if (error) return;
    onApply(draft);
  }

  return (
    <div className="staging-controls">
      <div className="staging-field">
        <label htmlFor="pd-floor">PD floor</label>
        <input
          id="pd-floor"
          type="number"
          min={0}
          max={1}
          step={0.0001}
          value={draft.pd_floor}
          onChange={(e) => setDraft({ ...draft, pd_floor: Number(e.target.value) })}
        />
      </div>
      <div className="staging-field">
        <label htmlFor="scaling-factor">Scaling factor</label>
        <input
          id="scaling-factor"
          type="number"
          min={0}
          step={0.01}
          value={draft.scaling_factor}
          onChange={(e) => setDraft({ ...draft, scaling_factor: Number(e.target.value) })}
        />
      </div>
      <div className="staging-field">
        <label htmlFor="capital-ratio">Capital ratio</label>
        <input
          id="capital-ratio"
          type="number"
          min={0}
          max={1}
          step={0.005}
          value={draft.capital_ratio}
          onChange={(e) => setDraft({ ...draft, capital_ratio: Number(e.target.value) })}
        />
      </div>
      <button type="button" className="link-button" onClick={handleApply} disabled={!isDirty || !!error}>
        Apply
      </button>
      {error && <div className="staging-error">{error}</div>}
    </div>
  );
}

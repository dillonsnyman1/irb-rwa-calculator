import type { ExposureClass, PortfolioResponse, RwaAssumptions } from "../types/portfolio";

// In production this is set at build time to the deployed API Gateway URL
// (see .github/workflows/deploy.yml); locally it falls back to the FastAPI
// dev server.
const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

function assumptionsParams(assumptions: RwaAssumptions): URLSearchParams {
  return new URLSearchParams({
    pd_floor: String(assumptions.pd_floor),
    scaling_factor: String(assumptions.scaling_factor),
    capital_ratio: String(assumptions.capital_ratio),
  });
}

export async function fetchSamplePortfolio(
  assumptions: RwaAssumptions,
  exposureClass: ExposureClass,
): Promise<PortfolioResponse> {
  const params = assumptionsParams(assumptions);
  params.set("exposure_class", exposureClass);
  const res = await fetch(`${API_BASE}/api/portfolio?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to load portfolio (${res.status})`);
  }
  return res.json();
}

export async function uploadPortfolio(file: File, assumptions: RwaAssumptions): Promise<PortfolioResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/portfolio/upload?${assumptionsParams(assumptions)}`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Failed to upload portfolio (${res.status})`);
  }

  return res.json();
}

export function sampleCsvUrl(): string {
  return `${API_BASE}/api/portfolio/sample-csv`;
}

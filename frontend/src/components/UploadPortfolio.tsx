import { useRef, useState } from "react";

import { sampleCsvUrl, uploadPortfolio } from "../api/client";
import type { ExposureClass, PortfolioResponse, RwaAssumptions } from "../types/portfolio";
import { EXPOSURE_CLASS_LABELS, EXPOSURE_CLASS_ORDER } from "../types/portfolio";

interface Props {
  assumptions: RwaAssumptions;
  exposureClass: ExposureClass;
  onExposureClassChange: (exposureClass: ExposureClass) => void;
  onUploaded: (data: PortfolioResponse, file: File) => void;
  onGenerateSample: () => void;
}

export function UploadPortfolio({
  assumptions,
  exposureClass,
  onExposureClassChange,
  onUploaded,
  onGenerateSample,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      const data = await uploadPortfolio(file, assumptions);
      onUploaded(data, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload portfolio.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="upload-portfolio">
      <label className="upload-button">
        {loading ? "Uploading..." : "Upload custom portfolio (CSV)"}
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} disabled={loading} hidden />
      </label>
      <select
        value={exposureClass}
        onChange={(e) => onExposureClassChange(e.target.value as ExposureClass)}
        aria-label="Exposure class to generate"
      >
        {EXPOSURE_CLASS_ORDER.map((ec) => (
          <option key={ec} value={ec}>
            {EXPOSURE_CLASS_LABELS[ec]}
          </option>
        ))}
      </select>
      <button type="button" className="link-button" onClick={onGenerateSample}>
        Generate sample data
      </button>
      <a className="link-button" href={sampleCsvUrl()} download>
        Download CSV template
      </a>
      {error && <div className="upload-error">{error}</div>}
    </div>
  );
}

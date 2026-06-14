import { useEffect, useMemo, useState } from "react";

import "./App.css";
import { fetchSamplePortfolio, uploadPortfolio } from "./api/client";
import { AssumptionsControls } from "./components/AssumptionsControls";
import { LoanTable } from "./components/LoanTable";
import { PdDistributionChart } from "./components/PdDistributionChart";
import { RatingGradeChart } from "./components/RatingGradeChart";
import { RatingScale, type RatingScaleSettings } from "./components/RatingScale";
import { RwaDensityVsPdChart } from "./components/RwaDensityVsPdChart";
import { SummaryCards } from "./components/SummaryCards";
import { UploadPortfolio } from "./components/UploadPortfolio";
import {
  DEFAULT_RATING_SCALE,
  DEFAULT_RWA_ASSUMPTIONS,
  EXPOSURE_CLASS_ORDER,
  deriveRatingGrade,
  type ExposureClass,
  type PortfolioResponse,
  type RwaAssumptions,
} from "./types/portfolio";

const DEFAULT_RATING_SCALE_SETTINGS: RatingScaleSettings = {
  useDataGrade: true,
  scale: DEFAULT_RATING_SCALE,
};

function App() {
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assumptions, setAssumptions] = useState<RwaAssumptions>(DEFAULT_RWA_ASSUMPTIONS);
  const [exposureClass, setExposureClass] = useState<ExposureClass>(EXPOSURE_CLASS_ORDER[0]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [ratingScaleSettings, setRatingScaleSettings] = useState<RatingScaleSettings>(
    DEFAULT_RATING_SCALE_SETTINGS,
  );

  const displayLoans = useMemo(() => {
    if (!portfolio) return [];
    if (ratingScaleSettings.useDataGrade) return portfolio.loans;
    return portfolio.loans.map((loan) => ({
      ...loan,
      rating_grade: deriveRatingGrade(loan.pd_used, ratingScaleSettings.scale),
    }));
  }, [portfolio, ratingScaleSettings]);

  function loadSample(nextAssumptions: RwaAssumptions, nextExposureClass: ExposureClass) {
    setLoading(true);
    setError(null);
    fetchSamplePortfolio(nextAssumptions, nextExposureClass)
      .then(setPortfolio)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load portfolio."))
      .finally(() => setLoading(false));
  }

  function reloadUploadedFile(file: File, nextAssumptions: RwaAssumptions) {
    setLoading(true);
    setError(null);
    uploadPortfolio(file, nextAssumptions)
      .then(setPortfolio)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load portfolio."))
      .finally(() => setLoading(false));
  }

  function handleGenerateSample() {
    setUploadedFile(null);
    loadSample(assumptions, exposureClass);
  }

  function handleExposureClassChange(nextExposureClass: ExposureClass) {
    setExposureClass(nextExposureClass);
    if (!uploadedFile) {
      loadSample(assumptions, nextExposureClass);
    }
  }

  function handleUploaded(data: PortfolioResponse, file: File) {
    setUploadedFile(file);
    setPortfolio(data);
  }

  function handleAssumptionsChange(nextAssumptions: RwaAssumptions) {
    setAssumptions(nextAssumptions);
    if (uploadedFile) {
      reloadUploadedFile(uploadedFile, nextAssumptions);
    } else {
      loadSample(nextAssumptions, exposureClass);
    }
  }

  useEffect(() => {
    // loading and error are already at their initial values on mount, so just
    // kick off the fetch directly rather than going through loadSample
    fetchSamplePortfolio(assumptions, exposureClass)
      .then(setPortfolio)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load portfolio."))
      .finally(() => setLoading(false));
    // only run once on mount, assumption/exposure class changes are handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <header className="app-header">
        <h1>IRB RWA Calculator</h1>
        <p>
          A simplified, illustrative Basel IRB risk-weighted asset (RWA) and capital requirement engine.
          Each exposure is assigned an asset correlation based on its exposure class (retail mortgage,
          QRRE, other retail, corporate or SME), with a maturity adjustment and SME firm-size adjustment
          applied where relevant, to derive the capital requirement K, RWA and Pillar 1 capital required.
        </p>
      </header>

      <div className="toolbar">
        <UploadPortfolio
          assumptions={assumptions}
          exposureClass={exposureClass}
          onExposureClassChange={handleExposureClassChange}
          onUploaded={handleUploaded}
          onGenerateSample={handleGenerateSample}
        />
      </div>

      <div className="toolbar">
        <AssumptionsControls assumptions={assumptions} onApply={handleAssumptionsChange} />
      </div>

      <div className="toolbar">
        <RatingScale settings={ratingScaleSettings} onApply={setRatingScaleSettings} />
      </div>

      {loading && <div className="status-message">Loading portfolio...</div>}
      {error && <div className="status-message error">{error}</div>}

      {portfolio && !loading && (
        <>
          <SummaryCards summary={portfolio.summary} />
          <div className="charts-row">
            <PdDistributionChart loans={portfolio.loans} />
            <RwaDensityVsPdChart loans={portfolio.loans} />
          </div>
          <div className="charts-row">
            <RatingGradeChart loans={displayLoans} />
          </div>
          <LoanTable loans={displayLoans} />
        </>
      )}
    </>
  );
}

export default App;

import os
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import ValidationError

from app.data_generator import LOANS_PER_CLASS, generate_portfolio
from app.models import ExposureClass, Loan, PortfolioResponse, RwaAssumptions
from app.rwa_engine import process_portfolio

SAMPLE_DATA_PATH = Path(__file__).parent / "sample_data" / "sample_portfolio.csv"

app = FastAPI(title="IRB RWA Calculator")

# CORS_ORIGINS is a comma-separated list of allowed origins, e.g. the
# CloudFront domain in production. Defaults to the local Vite dev server.
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _loans_from_dataframe(df: pd.DataFrame) -> list[Loan]:
    # annual_turnover_eur_m is optional (only meaningful for SME exposures),
    # so blank/missing cells should become None rather than NaN.
    df = df.astype(object).where(pd.notna(df), None)
    try:
        return [Loan(**row) for row in df.to_dict(orient="records")]
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid loan data: {exc}") from exc


def _build_assumptions(pd_floor: float, scaling_factor: float, capital_ratio: float) -> RwaAssumptions:
    try:
        return RwaAssumptions(pd_floor=pd_floor, scaling_factor=scaling_factor, capital_ratio=capital_ratio)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid assumptions: {exc}") from exc


@app.get("/api/portfolio", response_model=PortfolioResponse)
def get_portfolio(
    exposure_class: ExposureClass = Query(default=ExposureClass.retail_mortgage),
    pd_floor: float = Query(default=0.0003, ge=0, le=1),
    scaling_factor: float = Query(default=1.06, gt=0),
    capital_ratio: float = Query(default=0.08, gt=0, le=1),
) -> PortfolioResponse:
    assumptions = _build_assumptions(pd_floor, scaling_factor, capital_ratio)
    loans = generate_portfolio(loans_per_class=LOANS_PER_CLASS, exposure_classes=[exposure_class])
    return process_portfolio(loans, assumptions)


@app.post("/api/portfolio/upload", response_model=PortfolioResponse)
async def upload_portfolio(
    file: UploadFile,
    pd_floor: float = Query(default=0.0003, ge=0, le=1),
    scaling_factor: float = Query(default=1.06, gt=0),
    capital_ratio: float = Query(default=0.08, gt=0, le=1),
) -> PortfolioResponse:
    assumptions = _build_assumptions(pd_floor, scaling_factor, capital_ratio)

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="Please upload a CSV file.")

    try:
        df = pd.read_csv(file.file)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read CSV file: {exc}") from exc

    required_columns = set(Loan.model_fields) - {"annual_turnover_eur_m", "is_defaulted", "el_be"}
    missing = required_columns - set(df.columns)
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"CSV is missing required columns: {', '.join(sorted(missing))}",
        )

    loans = _loans_from_dataframe(df)
    return process_portfolio(loans, assumptions)


@app.get("/api/portfolio/sample-csv")
def download_sample_csv() -> FileResponse:
    return FileResponse(
        SAMPLE_DATA_PATH,
        media_type="text/csv",
        filename="sample_portfolio.csv",
    )


# AWS Lambda entrypoint (via API Gateway HTTP API proxy integration). Unused
# when running locally with uvicorn.
from mangum import Mangum  # noqa: E402

handler = Mangum(app)

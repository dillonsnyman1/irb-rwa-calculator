# IRB RWA / Capital Calculator

[![CI/CD](https://github.com/dillonsnyman1/irb-rwa-calculator/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/dillonsnyman1/irb-rwa-calculator/actions/workflows/ci-cd.yml)

A full-stack demo that calculates Basel Internal Ratings-Based (IRB)
risk-weighted assets (RWA), Pillar 1 capital requirements and regulatory
expected loss for a loan portfolio across retail and corporate/SME exposure
classes.

- **Backend**: Python + FastAPI for the asset correlation, maturity
  adjustment and capital requirement formulas
- **Frontend**: React + Vite + TypeScript dashboard (summary metrics,
  exposure/RWA charts, filterable exposure table, CSV upload)

> **Disclaimer**: This is a simplified, illustrative implementation built for
> portfolio purposes. It is **not** a production-grade IRB model and should
> not be used for regulatory reporting. All data is synthetic.

---

## Methodology

Each exposure has the following inputs: `exposure_class`,
`exposure_at_default` (EAD), `pd` (12-month probability of default), `lgd`,
`effective_maturity_years` (corporate/SME only) and, for SME exposures,
`annual_turnover_eur_m`.

### 1. PD floor

A configurable floor (default 0.03%) is applied to `pd` before any other
calculation - `pd_used = max(pd, pd_floor)`.

### 2. Asset correlation (R)

| Exposure class | Asset correlation |
|---|---|
| Retail mortgage | Fixed at `0.15` |
| Retail QRRE (revolving) | Fixed at `0.04` |
| Retail other | `R = 0.03*K + 0.16*(1-K)`, where `K = (1 - e^(-35*PD)) / (1 - e^(-35))` |
| Corporate | `R = 0.12*K + 0.24*(1-K)`, where `K = (1 - e^(-50*PD)) / (1 - e^(-50))` |
| SME | Corporate `R` minus a firm-size adjustment |

**SME firm-size adjustment**: `0.04 * (1 - (S - 5) / 45)`, where `S` is the
obligor's annual turnover in EUR millions, clamped to `[5, 50]`. Smaller
obligors (turnover near EUR 5m) get the full `0.04` reduction in
correlation; obligors at or above EUR 50m get none. This EUR 5m-50m band is
the fixed threshold from the Basel/CRR SME supporting factor, independent of
the portfolio's reporting currency.

### 3. Maturity adjustment (corporate/SME only)

Retail exposures use a maturity adjustment of `1.0`. For corporate and SME
exposures:

```
b      = (0.11852 - 0.05478 * ln(PD))^2
b_adj  = (1 + (M - 2.5) * b) / (1 - 1.5 * b)
```

where `M` is `effective_maturity_years`, clamped to `[1, 5]`.

### 4. Capital requirement (K)

```
K = max(0, [LGD * N(sqrt(1/(1-R)) * G(PD) + sqrt(R/(1-R)) * G(0.999)) - PD * LGD] * b_adj)
```

where `N` is the standard normal CDF and `G` is its inverse (computed with
Python's stdlib `statistics.NormalDist`, avoiding a scipy/numpy dependency).

### 5. RWA and capital required

```
RWA              = K * 12.5 * EAD * scaling_factor
capital_required = RWA * capital_ratio
```

`scaling_factor` is the Basel II IRB scaling factor (default `1.06`).
`capital_ratio` converts RWA into a capital amount (default `8%`, the
Pillar 1 minimum).

### 6. Regulatory expected loss

```
expected_loss = pd_used * LGD * EAD
```

Shown alongside RWA/capital for comparison against an IFRS 9 ECL figure for
the same exposure (see `ifrs9-ecl-calculator`).

### Portfolio summary

The portfolio-level summary aggregates total exposure, total RWA, total
capital required, total expected loss, overall RWA density
(`total_rwa / total_exposure`), and the same breakdown per exposure class.

### Assumptions controls

The dashboard exposes `pd_floor`, `scaling_factor` and `capital_ratio` as
adjustable assumptions, so you can see how sensitive RWA and capital are to
each of them.

---

## Project Structure

```
irb-rwa-calculator/
├── backend/        # FastAPI app, RWA engine, synthetic data generator, tests
└── frontend/       # React + Vite + TypeScript dashboard
```

---

## Running Locally

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000`.

Run the test suite:

```bash
pytest
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The dashboard runs at `http://localhost:5173` and expects the backend API at
`http://localhost:8000`.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/portfolio` | Returns the bundled synthetic sample portfolio, processed (RWA/capital) |
| `POST` | `/api/portfolio/upload` | Accepts a CSV upload of a custom portfolio, returns processed results |
| `GET` | `/api/portfolio/sample-csv` | Downloads the sample portfolio CSV as a template for custom uploads |

Both `/api/portfolio` and `/api/portfolio/upload` accept optional query
parameters to override the RWA assumptions:

| Parameter | Default | Description |
|---|---|---|
| `pd_floor` | `0.0003` | Minimum PD applied to every exposure before the RWA formula |
| `scaling_factor` | `1.06` | Basel II IRB scaling factor applied to RWA (`1.0` to disable) |
| `capital_ratio` | `0.08` | Capital ratio used to convert RWA into a capital requirement |

### CSV Format

Custom portfolio CSVs must include the following columns:

```
loan_id, exposure_class, exposure_at_default, pd, lgd, effective_maturity_years, annual_turnover_eur_m
```

`exposure_class` must be one of `retail_mortgage`, `retail_qrre`,
`retail_other`, `corporate` or `sme`. `effective_maturity_years` defaults to
`2.5` if omitted (ignored for retail exposures). `annual_turnover_eur_m` is
only used for `sme` exposures and can be left blank for other classes.

---

## Deployment

The app deploys to AWS with no custom domain - CloudFront serves the
frontend, and the FastAPI backend runs on Lambda (as a container image, for
pandas compatibility) behind an API Gateway HTTP API. Everything is defined
in Terraform under [`infra/`](infra/), and a GitHub Actions workflow
([`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml)) runs the
backend tests and frontend build on every push/PR, then - if those pass -
builds the backend image, applies the Terraform config, and publishes the
frontend to S3/CloudFront. The deploy job runs automatically on every push to
`main`, or on demand via the Actions tab.

> **Live demo**: not yet deployed.
>
> The backend is fully stateless - there's no database or session storage of
> any kind. Each request (including CSV uploads) is read, processed and
> returned in one go; your data is never written to disk or stored anywhere,
> so it's safe for multiple people to use the demo at the same time without
> their data overlapping.

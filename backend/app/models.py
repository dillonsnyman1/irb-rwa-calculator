from enum import Enum

from pydantic import BaseModel, Field


class ExposureClass(str, Enum):
    """Basel IRB exposure classes covered by this calculator.

    Each class uses a different asset correlation formula (and, for
    corporate/SME, a maturity adjustment) - see rwa_engine.py.
    """

    retail_mortgage = "retail_mortgage"
    retail_qrre = "retail_qrre"
    retail_other = "retail_other"
    corporate = "corporate"
    sme = "sme"


class RwaAssumptions(BaseModel):
    """Assumptions applied across the portfolio when calculating RWA.

    These are configurable so users can see how sensitive RWA and capital
    requirements are to the choices a bank makes within the IRB framework.
    """

    pd_floor: float = Field(
        default=0.0003,
        ge=0,
        le=1,
        description="minimum PD applied to every exposure before the RWA formula",
    )
    scaling_factor: float = Field(
        default=1.06,
        gt=0,
        description="Basel II IRB scaling factor applied to RWA (1.0 to disable)",
    )
    capital_ratio: float = Field(
        default=0.08,
        gt=0,
        le=1,
        description="capital ratio used to convert RWA into a capital requirement (Pillar 1 minimum is 8%)",
    )


class Loan(BaseModel):
    """Loan-level inputs that go into the IRB RWA formula."""

    loan_id: str
    exposure_class: ExposureClass
    exposure_at_default: float = Field(gt=0)
    pd: float = Field(gt=0, le=1, description="12-month probability of default, before any floor is applied")
    lgd: float = Field(ge=0, le=1)
    effective_maturity_years: float = Field(
        default=2.5,
        ge=1,
        le=5,
        description="effective maturity M, used by the corporate/SME maturity adjustment (ignored for retail)",
    )
    annual_turnover_eur_m: float | None = Field(
        default=None,
        gt=0,
        description="obligor's annual turnover in EUR millions, used by the SME firm-size adjustment",
    )
    rating_grade: str = Field(
        description="internal rating grade assigned to the obligor (e.g. '3 (A)'), per the bank's master scale",
    )
    is_defaulted: bool = Field(
        default=False,
        description=(
            "whether the obligor is currently in default (non-performing, PD=100%). "
            "Defaulted exposures are not run through the IRB risk-weight curve - "
            "per CRR Art. 181, K = max(0, LGD - EL_BE) and the expected loss is LGD x EAD."
        ),
    )
    el_be: float | None = Field(
        default=None,
        ge=0,
        le=1,
        description=(
            "for defaulted exposures, the bank's best estimate of expected loss (EL_BE) - "
            "the portion of LGD already covered by specific provisions, expressed as a "
            "fraction of EAD comparable to LGD. Used as K = max(0, LGD - EL_BE); null/ignored "
            "for performing exposures."
        ),
    )


class ProcessedLoan(Loan):
    """Loan with the IRB RWA calculation already worked out."""

    pd_used: float
    correlation: float
    maturity_adjustment: float
    capital_requirement_k: float
    rwa: float
    capital_required: float
    expected_loss: float


class ExposureClassSummary(BaseModel):
    loan_count: int
    exposure: float
    rwa: float
    capital_required: float
    expected_loss: float
    rwa_density: float


class PortfolioSummary(BaseModel):
    loan_count: int
    total_exposure: float
    total_rwa: float
    total_capital_required: float
    total_expected_loss: float
    rwa_density: float
    non_performing_count: int
    non_performing_exposure: float
    non_performing_rwa: float
    non_performing_expected_loss: float
    non_performing_provisions: float
    by_exposure_class: dict[ExposureClass, ExposureClassSummary]


class PortfolioResponse(BaseModel):
    loans: list[ProcessedLoan]
    summary: PortfolioSummary

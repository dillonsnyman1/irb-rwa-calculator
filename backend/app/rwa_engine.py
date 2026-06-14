# Basel IRB risk-weighted asset (RWA) and capital requirement calculation.
#
# Simplified version of the IRB formulas for demo purposes, not a
# production model. See the README for the methodology behind the
# correlation, maturity adjustment and capital requirement formulas below.

import math
from statistics import NormalDist

from app.models import (
    ExposureClass,
    ExposureClassSummary,
    Loan,
    PortfolioResponse,
    PortfolioSummary,
    ProcessedLoan,
    RwaAssumptions,
)

_NORMAL = NormalDist()

RETAIL_CLASSES = {ExposureClass.retail_mortgage, ExposureClass.retail_qrre, ExposureClass.retail_other}

# Fixed asset correlations for retail exposure classes that don't depend on PD.
_FIXED_RETAIL_CORRELATION = {
    ExposureClass.retail_mortgage: 0.15,
    ExposureClass.retail_qrre: 0.04,
}


def _retail_other_correlation(pd: float) -> float:
    k = (1 - math.exp(-35 * pd)) / (1 - math.exp(-35))
    return 0.03 * k + 0.16 * (1 - k)


def _corporate_correlation(pd: float) -> float:
    k = (1 - math.exp(-50 * pd)) / (1 - math.exp(-50))
    return 0.12 * k + 0.24 * (1 - k)


def sme_size_adjustment(annual_turnover_eur_m: float | None) -> float:
    """Firm-size adjustment subtracted from the corporate correlation for SMEs.

    Turnover is clamped to the EUR 5m-50m range the adjustment applies
    over; turnover below EUR 5m (or not provided) is treated as EUR 5m,
    giving the maximum adjustment.
    """
    turnover = 5.0 if annual_turnover_eur_m is None else annual_turnover_eur_m
    s = max(5.0, min(turnover, 50.0))
    return 0.04 * (1 - (s - 5) / 45)


def correlation(exposure_class: ExposureClass, pd: float, annual_turnover_eur_m: float | None = None) -> float:
    """Asset value correlation R for the given exposure class and PD."""
    if exposure_class in _FIXED_RETAIL_CORRELATION:
        return _FIXED_RETAIL_CORRELATION[exposure_class]
    if exposure_class == ExposureClass.retail_other:
        return _retail_other_correlation(pd)

    r = _corporate_correlation(pd)
    if exposure_class == ExposureClass.sme:
        r -= sme_size_adjustment(annual_turnover_eur_m)
    return r


def maturity_adjustment_factor(exposure_class: ExposureClass, pd: float, effective_maturity_years: float) -> float:
    """Maturity adjustment b_adj. Always 1.0 for retail exposures."""
    if exposure_class in RETAIL_CLASSES:
        return 1.0

    m = max(1.0, min(effective_maturity_years, 5.0))
    b = (0.11852 - 0.05478 * math.log(pd)) ** 2
    return (1 + (m - 2.5) * b) / (1 - 1.5 * b)


# Illustrative internal rating master scale, mapping a 1-10 grade and an
# S&P-style label to the PD band it covers (upper bound, exclusive of the
# previous grade's upper bound). Real banks calibrate their own master scale
# and assign a grade to each obligor based on it - used here by the data
# generator to assign each loan's rating_grade from its raw PD. The dashboard
# lets the user re-derive grades from a (possibly edited) copy of this scale
# instead of using the grade carried in the data.
RATING_SCALE: list[tuple[int, str, float]] = [
    (1, "AAA", 0.0005),
    (2, "AA", 0.0010),
    (3, "A", 0.0025),
    (4, "BBB", 0.0050),
    (5, "BB+", 0.0100),
    (6, "BB", 0.0200),
    (7, "B+", 0.0400),
    (8, "B", 0.0800),
    (9, "CCC", 0.1500),
    (10, "D", 1.0),
]


def rating_grade(pd: float) -> str:
    """Internal rating grade (e.g. "3 (A)") for the given PD, per RATING_SCALE."""
    for grade, label, upper_bound in RATING_SCALE:
        if pd <= upper_bound:
            return f"{grade} ({label})"
    return f"{RATING_SCALE[-1][0]} ({RATING_SCALE[-1][1]})"


def capital_requirement_k(pd: float, lgd: float, r: float, maturity_adjustment: float) -> float:
    """Capital requirement K, as a proportion of EAD."""
    conditional_pd = _NORMAL.cdf(
        math.sqrt(1 / (1 - r)) * _NORMAL.inv_cdf(pd) + math.sqrt(r / (1 - r)) * _NORMAL.inv_cdf(0.999)
    )
    k = (lgd * conditional_pd - pd * lgd) * maturity_adjustment
    return max(k, 0.0)


def process_loan(loan: Loan, assumptions: RwaAssumptions) -> ProcessedLoan:
    if loan.is_defaulted:
        # Defaulted (non-performing) exposures don't use the IRB
        # risk-weight curve. Per CRR Art. 181, K = max(0, LGD - EL_BE),
        # where EL_BE is the bank's best estimate of expected loss - the
        # portion of LGD already covered by specific provisions. An
        # exposure without a provided EL_BE is treated as unprovisioned
        # (EL_BE = 0), so the full LGD attracts capital.
        el_be = loan.el_be if loan.el_be is not None else 0.0
        k = max(0.0, loan.lgd - el_be)
        rwa = k * 12.5 * loan.exposure_at_default * assumptions.scaling_factor
        capital_required = rwa * assumptions.capital_ratio

        return ProcessedLoan(
            **loan.model_dump(),
            pd_used=1.0,
            correlation=0.0,
            maturity_adjustment=1.0,
            capital_requirement_k=k,
            rwa=rwa,
            capital_required=capital_required,
            expected_loss=loan.lgd * loan.exposure_at_default,
        )

    pd_used = max(loan.pd, assumptions.pd_floor)

    r = correlation(loan.exposure_class, pd_used, loan.annual_turnover_eur_m)
    m_adj = maturity_adjustment_factor(loan.exposure_class, pd_used, loan.effective_maturity_years)
    k = capital_requirement_k(pd_used, loan.lgd, r, m_adj)

    rwa = k * 12.5 * loan.exposure_at_default * assumptions.scaling_factor
    capital_required = rwa * assumptions.capital_ratio
    expected_loss = pd_used * loan.lgd * loan.exposure_at_default

    return ProcessedLoan(
        **loan.model_dump(),
        pd_used=pd_used,
        correlation=r,
        maturity_adjustment=m_adj,
        capital_requirement_k=k,
        rwa=rwa,
        capital_required=capital_required,
        expected_loss=expected_loss,
    )


def summarize_portfolio(loans: list[ProcessedLoan]) -> PortfolioSummary:
    total_exposure = sum(loan.exposure_at_default for loan in loans)
    total_rwa = sum(loan.rwa for loan in loans)
    total_capital_required = sum(loan.capital_required for loan in loans)
    total_expected_loss = sum(loan.expected_loss for loan in loans)

    by_exposure_class: dict[ExposureClass, ExposureClassSummary] = {}
    for exposure_class in ExposureClass:
        class_loans = [loan for loan in loans if loan.exposure_class == exposure_class]
        class_exposure = sum(loan.exposure_at_default for loan in class_loans)
        class_rwa = sum(loan.rwa for loan in class_loans)
        by_exposure_class[exposure_class] = ExposureClassSummary(
            loan_count=len(class_loans),
            exposure=class_exposure,
            rwa=class_rwa,
            capital_required=sum(loan.capital_required for loan in class_loans),
            expected_loss=sum(loan.expected_loss for loan in class_loans),
            rwa_density=class_rwa / class_exposure if class_exposure > 0 else 0.0,
        )

    non_performing_loans = [loan for loan in loans if loan.is_defaulted]

    return PortfolioSummary(
        loan_count=len(loans),
        total_exposure=total_exposure,
        total_rwa=total_rwa,
        total_capital_required=total_capital_required,
        total_expected_loss=total_expected_loss,
        rwa_density=total_rwa / total_exposure if total_exposure > 0 else 0.0,
        non_performing_count=len(non_performing_loans),
        non_performing_exposure=sum(loan.exposure_at_default for loan in non_performing_loans),
        non_performing_rwa=sum(loan.rwa for loan in non_performing_loans),
        non_performing_expected_loss=sum(loan.expected_loss for loan in non_performing_loans),
        non_performing_provisions=sum(
            (loan.el_be or 0.0) * loan.exposure_at_default for loan in non_performing_loans
        ),
        by_exposure_class=by_exposure_class,
    )


def process_portfolio(loans: list[Loan], assumptions: RwaAssumptions | None = None) -> PortfolioResponse:
    assumptions = assumptions or RwaAssumptions()
    processed = [process_loan(loan, assumptions) for loan in loans]
    summary = summarize_portfolio(processed)
    return PortfolioResponse(loans=processed, summary=summary)

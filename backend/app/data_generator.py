# Generates fake portfolio data for the demo dataset.
#
# A real bank would run the IRB formula separately for each exposure class,
# each with its own PD/LGD models, so this generator produces a portfolio for
# a single exposure class at a time, with parameter ranges roughly typical of
# that class.

import random
from collections.abc import Iterable

from app.models import ExposureClass, Loan
from app.rwa_engine import rating_grade

LOANS_PER_CLASS = 40

# (EAD range, PD range, LGD range)
_RANGES: dict[ExposureClass, tuple[tuple[float, float], tuple[float, float], tuple[float, float]]] = {
    ExposureClass.retail_mortgage: ((50_000, 400_000), (0.003, 0.03), (0.10, 0.25)),
    ExposureClass.retail_qrre: ((500, 15_000), (0.01, 0.08), (0.50, 0.75)),
    ExposureClass.retail_other: ((1_000, 30_000), (0.01, 0.10), (0.30, 0.55)),
    ExposureClass.corporate: ((100_000, 5_000_000), (0.003, 0.08), (0.35, 0.45)),
    ExposureClass.sme: ((50_000, 2_000_000), (0.005, 0.10), (0.35, 0.50)),
}

MATURITY_RANGE = (1.0, 5.0)
SME_TURNOVER_RANGE = (5.0, 50.0)

# Share of loans per class that are generated as defaulted (non-performing,
# PD=100%), so each portfolio includes a mix of performing and
# non-performing exposures.
DEFAULT_RATE = 0.05

# For defaulted loans, EL_BE (the bank's best-estimate provisions) is
# generated as this fraction of the loan's LGD, varying per loan so
# provisioning coverage differs across defaulted exposures.
EL_BE_COVERAGE_RANGE = (0.3, 0.9)


def _generate_loan(index: int, exposure_class: ExposureClass, rng: random.Random) -> Loan:
    ead_range, pd_range, lgd_range = _RANGES[exposure_class]

    effective_maturity_years = 2.5
    annual_turnover_eur_m = None
    if exposure_class in (ExposureClass.corporate, ExposureClass.sme):
        effective_maturity_years = round(rng.uniform(*MATURITY_RANGE), 1)
    if exposure_class == ExposureClass.sme:
        annual_turnover_eur_m = round(rng.uniform(*SME_TURNOVER_RANGE), 1)

    is_defaulted = rng.random() < DEFAULT_RATE
    pd = 1.0 if is_defaulted else round(rng.uniform(*pd_range), 4)
    lgd = round(rng.uniform(*lgd_range), 4)
    el_be = round(lgd * rng.uniform(*EL_BE_COVERAGE_RANGE), 4) if is_defaulted else None

    return Loan(
        loan_id=f"L{index:05d}",
        exposure_class=exposure_class,
        exposure_at_default=round(rng.uniform(*ead_range), 2),
        pd=pd,
        lgd=lgd,
        effective_maturity_years=effective_maturity_years,
        annual_turnover_eur_m=annual_turnover_eur_m,
        rating_grade=rating_grade(pd),
        is_defaulted=is_defaulted,
        el_be=el_be,
    )


def generate_portfolio(
    loans_per_class: int = LOANS_PER_CLASS,
    seed: int | None = 42,
    exposure_classes: Iterable[ExposureClass] | None = None,
) -> list[Loan]:
    rng = random.Random(seed)
    loans = []
    index = 1
    for exposure_class in exposure_classes if exposure_classes is not None else list(ExposureClass):
        for _ in range(loans_per_class):
            loans.append(_generate_loan(index, exposure_class, rng))
            index += 1
    return loans

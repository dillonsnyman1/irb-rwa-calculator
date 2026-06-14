import math
from statistics import NormalDist

import pytest

from app.models import ExposureClass, Loan, RwaAssumptions
from app.rwa_engine import (
    RATING_SCALE,
    capital_requirement_k,
    correlation,
    maturity_adjustment_factor,
    process_portfolio,
    rating_grade,
    sme_size_adjustment,
)

_NORMAL = NormalDist()
DEFAULT_ASSUMPTIONS = RwaAssumptions()


def make_loan(**overrides) -> Loan:
    defaults = dict(
        loan_id="L00001",
        exposure_class=ExposureClass.corporate,
        exposure_at_default=1_000_000.0,
        pd=0.02,
        lgd=0.45,
        effective_maturity_years=2.5,
        annual_turnover_eur_m=None,
        rating_grade="6 (BB)",
    )
    defaults.update(overrides)
    return Loan(**defaults)


def test_retail_mortgage_correlation_is_fixed():
    assert correlation(ExposureClass.retail_mortgage, 0.01) == pytest.approx(0.15)
    assert correlation(ExposureClass.retail_mortgage, 0.10) == pytest.approx(0.15)


def test_retail_qrre_correlation_is_fixed():
    assert correlation(ExposureClass.retail_qrre, 0.01) == pytest.approx(0.04)
    assert correlation(ExposureClass.retail_qrre, 0.10) == pytest.approx(0.04)


def test_retail_other_correlation_matches_formula():
    pd = 0.02
    k = (1 - math.exp(-35 * pd)) / (1 - math.exp(-35))
    expected = 0.03 * k + 0.16 * (1 - k)
    assert correlation(ExposureClass.retail_other, pd) == pytest.approx(expected)


def test_corporate_correlation_matches_formula():
    pd = 0.02
    k = (1 - math.exp(-50 * pd)) / (1 - math.exp(-50))
    expected = 0.12 * k + 0.24 * (1 - k)
    assert correlation(ExposureClass.corporate, pd) == pytest.approx(expected)


def test_corporate_correlation_approaches_bounds_at_extreme_pd():
    # very low PD -> correlation close to 0.24, very high PD -> close to 0.12
    assert correlation(ExposureClass.corporate, 0.0001) == pytest.approx(0.24, abs=1e-3)
    assert correlation(ExposureClass.corporate, 0.9999) == pytest.approx(0.12, abs=1e-3)


def test_sme_size_adjustment_at_turnover_bounds():
    # turnover at or below EUR 5m gets the maximum adjustment
    assert sme_size_adjustment(5.0) == pytest.approx(0.04)
    assert sme_size_adjustment(2.0) == pytest.approx(0.04)
    assert sme_size_adjustment(None) == pytest.approx(0.04)
    # turnover at or above EUR 50m gets no adjustment
    assert sme_size_adjustment(50.0) == pytest.approx(0.0)
    assert sme_size_adjustment(100.0) == pytest.approx(0.0)
    # midpoint
    assert sme_size_adjustment(27.5) == pytest.approx(0.02)


def test_sme_correlation_is_lower_than_corporate_for_same_pd():
    pd = 0.02
    corporate_r = correlation(ExposureClass.corporate, pd)
    sme_r = correlation(ExposureClass.sme, pd, annual_turnover_eur_m=20.0)
    assert sme_r == pytest.approx(corporate_r - sme_size_adjustment(20.0))
    assert sme_r < corporate_r


def test_maturity_adjustment_is_one_for_retail():
    for exposure_class in (ExposureClass.retail_mortgage, ExposureClass.retail_qrre, ExposureClass.retail_other):
        assert maturity_adjustment_factor(exposure_class, 0.02, 5.0) == pytest.approx(1.0)


def test_maturity_adjustment_matches_formula_for_corporate():
    pd = 0.02
    m = 4.0
    b = (0.11852 - 0.05478 * math.log(pd)) ** 2
    expected = (1 + (m - 2.5) * b) / (1 - 1.5 * b)
    assert maturity_adjustment_factor(ExposureClass.corporate, pd, m) == pytest.approx(expected)


def test_maturity_adjustment_is_one_at_one_year():
    # at M=1, (1+(M-2.5)*b) == (1-1.5*b), so the factor is always 1.0
    pd = 0.02
    assert maturity_adjustment_factor(ExposureClass.corporate, pd, 1.0) == pytest.approx(1.0)


def test_maturity_adjustment_increases_with_maturity():
    pd = 0.02
    short = maturity_adjustment_factor(ExposureClass.corporate, pd, 1.0)
    long = maturity_adjustment_factor(ExposureClass.corporate, pd, 5.0)
    assert long > short


def test_maturity_adjustment_clamped_to_one_to_five_years():
    pd = 0.02
    assert maturity_adjustment_factor(ExposureClass.corporate, pd, 0.5) == pytest.approx(
        maturity_adjustment_factor(ExposureClass.corporate, pd, 1.0)
    )
    assert maturity_adjustment_factor(ExposureClass.corporate, pd, 10.0) == pytest.approx(
        maturity_adjustment_factor(ExposureClass.corporate, pd, 5.0)
    )


def test_capital_requirement_k_matches_formula():
    pd, lgd, r, m_adj = 0.02, 0.45, 0.18, 1.2
    conditional_pd = _NORMAL.cdf(
        math.sqrt(1 / (1 - r)) * _NORMAL.inv_cdf(pd) + math.sqrt(r / (1 - r)) * _NORMAL.inv_cdf(0.999)
    )
    expected = (lgd * conditional_pd - pd * lgd) * m_adj
    assert capital_requirement_k(pd, lgd, r, m_adj) == pytest.approx(expected)


def test_capital_requirement_k_is_non_negative():
    # a very high PD pushes the unconditional EL term above the conditional
    # term; K should be floored at zero rather than going negative.
    assert capital_requirement_k(pd=0.5, lgd=0.45, r=0.12, maturity_adjustment=1.0) >= 0.0


def test_pd_floor_is_applied():
    loan = make_loan(pd=0.0001)
    assumptions = RwaAssumptions(pd_floor=0.0003)
    response = process_portfolio([loan], assumptions)
    assert response.loans[0].pd_used == pytest.approx(0.0003)


def test_pd_floor_does_not_reduce_higher_pd():
    loan = make_loan(pd=0.02)
    assumptions = RwaAssumptions(pd_floor=0.0003)
    response = process_portfolio([loan], assumptions)
    assert response.loans[0].pd_used == pytest.approx(0.02)


def test_rwa_and_capital_required_formulas():
    loan = make_loan(pd=0.02, lgd=0.45, exposure_at_default=1_000_000.0, effective_maturity_years=2.5)
    assumptions = RwaAssumptions(pd_floor=0.0003, scaling_factor=1.06, capital_ratio=0.08)
    response = process_portfolio([loan], assumptions)
    processed = response.loans[0]

    expected_rwa = processed.capital_requirement_k * 12.5 * loan.exposure_at_default * assumptions.scaling_factor
    assert processed.rwa == pytest.approx(expected_rwa)
    assert processed.capital_required == pytest.approx(processed.rwa * assumptions.capital_ratio)


def test_expected_loss_uses_floored_pd():
    loan = make_loan(pd=0.0001, lgd=0.45, exposure_at_default=1_000_000.0)
    assumptions = RwaAssumptions(pd_floor=0.0003)
    response = process_portfolio([loan], assumptions)
    processed = response.loans[0]
    assert processed.expected_loss == pytest.approx(0.0003 * 0.45 * 1_000_000.0)


def test_scaling_factor_scales_rwa_linearly():
    loan = make_loan()
    base = process_portfolio([loan], RwaAssumptions(scaling_factor=1.0)).loans[0]
    scaled = process_portfolio([loan], RwaAssumptions(scaling_factor=1.06)).loans[0]
    assert scaled.rwa == pytest.approx(base.rwa * 1.06)


def test_process_portfolio_summary_aggregates_correctly():
    loans = [
        make_loan(loan_id="L1", exposure_class=ExposureClass.retail_mortgage, exposure_at_default=200_000.0, pd=0.01, lgd=0.15),
        make_loan(loan_id="L2", exposure_class=ExposureClass.corporate, exposure_at_default=1_000_000.0, pd=0.02, lgd=0.45),
        make_loan(loan_id="L3", exposure_class=ExposureClass.sme, exposure_at_default=500_000.0, pd=0.03, lgd=0.40, annual_turnover_eur_m=10.0),
    ]

    response = process_portfolio(loans, DEFAULT_ASSUMPTIONS)
    summary = response.summary

    assert summary.loan_count == 3
    assert summary.total_exposure == pytest.approx(1_700_000.0)
    assert summary.total_rwa == pytest.approx(sum(loan.rwa for loan in response.loans))
    assert summary.total_capital_required == pytest.approx(sum(loan.capital_required for loan in response.loans))
    assert summary.total_expected_loss == pytest.approx(sum(loan.expected_loss for loan in response.loans))
    assert summary.rwa_density == pytest.approx(summary.total_rwa / summary.total_exposure)

    mortgage_summary = summary.by_exposure_class[ExposureClass.retail_mortgage]
    assert mortgage_summary.loan_count == 1
    assert mortgage_summary.exposure == pytest.approx(200_000.0)
    assert mortgage_summary.rwa_density == pytest.approx(mortgage_summary.rwa / mortgage_summary.exposure)

    qrre_summary = summary.by_exposure_class[ExposureClass.retail_qrre]
    assert qrre_summary.loan_count == 0
    assert qrre_summary.exposure == 0.0
    assert qrre_summary.rwa_density == 0.0


def test_higher_pd_corporate_gives_higher_rwa_density_than_lower_pd():
    low_pd_loan = make_loan(loan_id="L1", pd=0.003, lgd=0.45, exposure_at_default=1_000_000.0)
    high_pd_loan = make_loan(loan_id="L2", pd=0.05, lgd=0.45, exposure_at_default=1_000_000.0)

    low = process_portfolio([low_pd_loan], DEFAULT_ASSUMPTIONS).loans[0]
    high = process_portfolio([high_pd_loan], DEFAULT_ASSUMPTIONS).loans[0]

    assert high.rwa > low.rwa


def test_rating_grade_matches_scale_boundaries():
    # exactly on an upper bound falls into that grade, not the next one
    assert rating_grade(0.0005) == "1 (AAA)"
    assert rating_grade(0.0010) == "2 (AA)"
    assert rating_grade(1.0) == "10 (D)"


def test_rating_grade_just_above_boundary_moves_to_next_grade():
    assert rating_grade(0.00051) == "2 (AA)"
    assert rating_grade(0.0011) == "3 (A)"


def test_rating_grade_is_monotonic_with_pd():
    pds = [bound for _, _, bound in RATING_SCALE]
    grades = [rating_grade(pd) for pd in pds]
    grade_numbers = [int(label.split(" ")[0]) for label in grades]
    assert grade_numbers == sorted(grade_numbers)


def test_process_loan_passes_through_rating_grade():
    loan = make_loan(pd=0.02, rating_grade="6 (BB)")
    processed = process_portfolio([loan], DEFAULT_ASSUMPTIONS).loans[0]
    assert processed.rating_grade == loan.rating_grade


def test_defaulted_loan_uses_lgd_minus_el_be_for_capital():
    loan = make_loan(pd=0.02, lgd=0.45, exposure_at_default=1_000_000.0, is_defaulted=True, el_be=0.18)
    assumptions = RwaAssumptions(scaling_factor=1.0, capital_ratio=0.08)
    processed = process_portfolio([loan], assumptions).loans[0]

    assert processed.pd_used == pytest.approx(1.0)
    assert processed.capital_requirement_k == pytest.approx(0.45 - 0.18)
    assert processed.rwa == pytest.approx(processed.capital_requirement_k * 12.5 * 1_000_000.0)
    assert processed.capital_required == pytest.approx(processed.rwa * 0.08)
    assert processed.expected_loss == pytest.approx(0.45 * 1_000_000.0)


def test_defaulted_loan_has_zero_capital_when_provisions_fully_cover_lgd():
    loan = make_loan(pd=0.02, lgd=0.45, exposure_at_default=1_000_000.0, is_defaulted=True, el_be=0.45)
    processed = process_portfolio([loan], DEFAULT_ASSUMPTIONS).loans[0]

    assert processed.capital_requirement_k == pytest.approx(0.0)
    assert processed.rwa == pytest.approx(0.0)
    assert processed.capital_required == pytest.approx(0.0)


def test_defaulted_loan_without_el_be_attracts_full_lgd_capital():
    loan = make_loan(pd=0.02, lgd=0.45, exposure_at_default=1_000_000.0, is_defaulted=True)
    assumptions = RwaAssumptions(scaling_factor=1.0, capital_ratio=0.08)
    processed = process_portfolio([loan], assumptions).loans[0]

    assert processed.capital_requirement_k == pytest.approx(0.45)
    assert processed.rwa == pytest.approx(0.45 * 12.5 * 1_000_000.0)


def test_summary_counts_non_performing_exposures():
    loans = [
        make_loan(loan_id="L1", exposure_at_default=100_000.0, is_defaulted=False),
        make_loan(loan_id="L2", exposure_at_default=50_000.0, lgd=0.45, el_be=0.18, is_defaulted=True),
    ]
    summary = process_portfolio(loans, DEFAULT_ASSUMPTIONS).summary
    non_performing_loan = process_portfolio(loans, DEFAULT_ASSUMPTIONS).loans[1]

    assert summary.non_performing_count == 1
    assert summary.non_performing_exposure == pytest.approx(50_000.0)
    assert summary.non_performing_rwa == pytest.approx(non_performing_loan.rwa)
    assert summary.non_performing_expected_loss == pytest.approx(non_performing_loan.expected_loss)
    assert summary.non_performing_provisions == pytest.approx(0.18 * 50_000.0)

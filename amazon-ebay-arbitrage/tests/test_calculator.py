"""Kiểm thử calculator.py — chạy:  python -m pytest -q"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from calculator import (  # noqa: E402
    FeeSettings,
    ProductCost,
    analyze_profit,
    charm_price,
    min_price_for_margin,
    recommend_price,
)


@pytest.mark.parametrize("raw,expected", [(23.10, 23.99), (23.99, 23.99), (24.00, 24.99), (0.5, 0.99), (9.995, 10.99)])
def test_charm_price(raw, expected):
    assert charm_price(raw) == pytest.approx(expected)


def test_analyze_profit_hand_calculated():
    fees = FeeSettings(
        ebay_fvf_rate=0.13, buyer_sales_tax_rate=0.0, promoted_ad_rate=0.0,
        return_reserve_rate=0.0, income_tax_rate=0.0,
    )
    b = analyze_profit(50.0, ProductCost(amazon_price=30.0), fees)
    # 50 - 30 - 6.50 (FVF) - 0.40 (phí cố định) = 13.10
    assert b.ebay_fvf == 6.50
    assert b.ebay_fixed_fee == 0.40
    assert b.net_profit == pytest.approx(13.10)
    assert b.net_margin == pytest.approx(13.10 / 50)
    assert b.roi == pytest.approx(13.10 / 30)


def test_fvf_charged_on_buyer_sales_tax():
    fees = FeeSettings(ebay_fvf_rate=0.10, buyer_sales_tax_rate=0.10)
    b = analyze_profit(100.0, ProductCost(amazon_price=10.0), fees)
    assert b.ebay_fvf == pytest.approx(11.0)  # 10% × 110$


def test_no_income_tax_on_loss():
    b = analyze_profit(10.0, ProductCost(amazon_price=50.0), FeeSettings())
    assert b.income_tax == 0
    assert b.net_profit < 0


@pytest.mark.parametrize("amazon_price", [1.0, 4.0, 5.5, 19.99, 120.0, 900.0])
@pytest.mark.parametrize("margin", [0.0, 0.15, 0.25, 0.35])
def test_min_price_hits_target_exactly(amazon_price, margin):
    cost = ProductCost(amazon_price=amazon_price, amazon_sales_tax_rate=0.08, shipping_cost=2.0)
    fees = FeeSettings()
    p = min_price_for_margin(cost, fees, margin)
    assert p is not None
    # Tại đúng giá tối thiểu, biên = mục tiêu; giảm 1 cent thì phải thấp hơn mục tiêu.
    assert analyze_profit(p, cost, fees).net_margin == pytest.approx(margin, abs=1e-3)
    assert analyze_profit(p - 0.01, cost, fees).net_margin < margin + 1e-9


def test_impossible_margin_returns_none():
    fees = FeeSettings(promoted_ad_rate=0.20, income_tax_rate=0.40)
    assert min_price_for_margin(ProductCost(10.0), fees, 0.40) is None
    assert recommend_price(ProductCost(10.0), fees, 0.40).status == "KHÔNG_KHẢ_THI"


def test_recommend_undercuts_competitor_when_room():
    rec = recommend_price(ProductCost(10.0), FeeSettings(), 0.25, competitor_lowest_price=40.0)
    assert rec.status == "CẠNH_TRANH"
    assert rec.recommended_price == 39.99
    assert rec.breakdown.net_margin >= 0.25


def test_recommend_keeps_margin_when_competitor_too_cheap():
    rec = recommend_price(ProductCost(30.0), FeeSettings(), 0.25, competitor_lowest_price=35.0)
    assert rec.status == "ĐẮT_HƠN_ĐỐI_THỦ"
    assert rec.recommended_price > 35.0
    assert rec.breakdown.net_margin >= 0.25


def test_recommend_without_competitor_is_charm_price_above_min():
    rec = recommend_price(ProductCost(19.99, 0.0825), FeeSettings(), 0.25)
    assert rec.status == "OK"
    assert f"{rec.recommended_price:.2f}".endswith(".99")
    assert rec.recommended_price >= rec.min_price
    assert rec.breakdown.net_margin >= 0.25


@pytest.mark.parametrize("amazon_price", [x / 4 for x in range(4, 800)])
def test_recommended_price_never_below_target(amazon_price):
    """Quét dày giá Amazon: giá đề xuất (sau làm tròn) không bao giờ dưới biên mục tiêu."""
    for competitor in (None, amazon_price * 1.2, amazon_price * 3):
        rec = recommend_price(ProductCost(amazon_price, 0.0825), FeeSettings(), 0.25, competitor)
        assert rec.breakdown.net_margin >= 0.25 - 1e-12

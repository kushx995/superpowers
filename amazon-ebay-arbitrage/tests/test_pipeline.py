"""Kiểm thử pipeline end-to-end trên dữ liệu giả lập + các nâng cấp calculator."""

import pytest

from calculator import FeeSettings, ProductCost, analyze_profit, min_price_for_margin, suggest_buffer_rate
from pipeline import ScanConfig, scan
from sources import AmazonProduct, EbayMarketData, MarketSource, MockMarketSource, MockProductSource, ProductSource
from vero_checker import VeroChecker


@pytest.fixture(scope="module")
def vero():
    return VeroChecker.from_csv()


def _run(vero, **kw):
    cfg = ScanConfig(keyword="silicone baking mat", limit=40, amazon_tax_rate=0.0625, **kw)
    return scan(MockProductSource(), MockMarketSource(), FeeSettings(), cfg, vero)


def test_winners_meet_target_margin(vero):
    results = _run(vero)
    winners = [r for r in results if r.is_winner]
    assert winners, "dữ liệu giả lập phải có ít nhất 1 sản phẩm thắng"
    for r in winners:
        assert r.recommendation.breakdown.net_margin >= 0.25
        assert r.product.in_stock and r.vero.level != "block"
    # sản phẩm thắng được xếp lên đầu
    assert all(r.is_winner for r in results[: len(winners)])


def test_vero_remove_vs_flag(vero):
    removed = [r for r in _run(vero, vero_mode="remove") if r.vero.level == "block"]
    flagged = [r for r in _run(vero, vero_mode="flag") if r.vero.level == "block"]
    assert removed and all(r.skipped_reason == "VERO" for r in removed)
    assert flagged and all(r.recommendation is not None and not r.is_winner for r in flagged)


def test_out_of_stock_skipped(vero):
    assert any(r.skipped_reason == "HẾT_HÀNG" for r in _run(vero))


class _OneProduct(ProductSource):
    def __init__(self, product):
        self.product = product

    def search(self, keyword, category="All", limit=20):
        return [self.product]


class _FixedMarket(MarketSource):
    def lookup(self, product):
        return EbayMarketData(query="q", active_lowest=40, active_p25=35, sold_median_30d=60, sold_30d=20, active_count=10)


def test_price_strategy_and_non_prime_shipping(vero):
    p = AmazonProduct(asin="B1", title="Plain Mug", amazon_price=10.0, is_prime=False)
    fees = FeeSettings()
    common = dict(keyword="mug", fixed_buffer_rate=0.0, buffer_mode="fixed", non_prime_shipping=6.0)
    sold = scan(_OneProduct(p), _FixedMarket(), fees, ScanConfig(price_strategy="sold_median", **common), vero)[0]
    low = scan(_OneProduct(p), _FixedMarket(), fees, ScanConfig(price_strategy="active_lowest", **common), vero)[0]
    assert sold.recommendation.recommended_price == 59.99   # rẻ hơn trung vị đã bán 1 cent
    assert low.recommendation.status == "CẠNH_TRANH" and low.recommendation.recommended_price == 39.99
    assert sold.recommendation.breakdown.shipping_cost == 6.0  # không Prime → cộng phí ship


# --- Calculator: thuế bang, buffer ------------------------------------------------------
def test_buffer_is_a_cost_line_and_raises_min_price():
    fees = FeeSettings()
    plain = ProductCost(20.0, 0.0625)
    buffered = ProductCost(20.0, 0.0625, price_buffer_rate=0.05)
    assert buffered.price_buffer == pytest.approx(20 * 1.0625 * 0.05)
    assert min_price_for_margin(buffered, fees, 0.25) > min_price_for_margin(plain, fees, 0.25)
    b = analyze_profit(50, buffered, fees)
    assert ("Buffer biến động giá Amazon", -b.price_buffer) in b.to_rows()
    assert sum(v for _, v in b.cost_shares()) == pytest.approx(1 - b.net_profit / 50, abs=1e-3)


def test_invalid_cost_inputs():
    with pytest.raises(ValueError):
        ProductCost(0)
    with pytest.raises(ValueError):
        ProductCost(10, amazon_sales_tax_rate=0.5)


@pytest.mark.parametrize("vol,expected", [(None, 0.02), (0.01, 0.02), (0.10, 0.05), (0.8, 0.15)])
def test_suggest_buffer_rate(vol, expected):
    assert suggest_buffer_rate(vol) == expected

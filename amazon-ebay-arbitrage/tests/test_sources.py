"""Kiểm thử các adapter API bằng session HTTP giả (không cần mạng/API key)."""

import datetime as dt
import time

import pytest
from conftest import FakeSession

from sources import (
    AmazonPAAPISource, AmazonProduct, EbayMarketData, EbayMarketSource, HttpClient,
    KeepaSource, RainforestSource, SourceError,
)
from sources.ebay import build_query
from sources.keepa import keepa_minutes_to_unix
from sources.paapi import sign_v4


# --- HttpClient ---------------------------------------------------------------
def test_http_retries_then_succeeds(no_sleep):
    s = FakeSession({"x.com": [(429, {}), (503, {}), (200, {"ok": 1})]})
    assert HttpClient(s, retries=3).get("https://x.com/a") == {"ok": 1}
    assert len(s.calls) == 3


def test_http_raises_on_client_error(no_sleep):
    s = FakeSession({"x.com": [(401, {"error": "bad key"})]})
    with pytest.raises(SourceError, match="401"):
        HttpClient(s).get("https://x.com/a")


# --- Keepa ----------------------------------------------------------------------
def test_keepa_time_conversion():
    assert keepa_minutes_to_unix(0) == int(dt.datetime(2011, 1, 1, tzinfo=dt.timezone.utc).timestamp())


def test_keepa_parse_product():
    now_km = int(time.time() / 60) - 21_564_000
    raw = {
        "asin": "B000TEST01", "title": "Silicone Mat", "brand": "Kitchy",
        "availabilityAmazon": 0, "imagesCSV": "a.jpg,b.jpg", "upcList": [123456789012],
        "features": ["Food safe"], "categoryTree": [{"catId": 1, "name": "Home"}, {"catId": 2, "name": "Baking Mats"}],
        "csv": [[now_km - 100, 1999, now_km, 2199], None, None, [now_km - 100, 5000, now_km - 50, -1, now_km, 4000]],
        "stats": {"current": [2199, 2099, -1, 4000] + [-1] * 12 + [46, 1234]},
    }
    p = KeepaSource("k", http=HttpClient(FakeSession({}))).parse_product(raw)
    assert p.amazon_price == 21.99
    assert p.bsr == 4000 and [r for _, r in p.bsr_history] == [5000, 4000]  # bỏ giá trị -1
    assert p.price_history[-1][1] == 21.99
    assert p.amazon_rating == 4.6 and p.review_count == 1234
    assert p.is_prime and p.in_stock and p.gtin == "123456789012"
    assert p.category == "Baking Mats"
    assert p.image_urls[0] == "https://m.media-amazon.com/images/I/a.jpg"
    assert p.bsr_avg_90d == pytest.approx(4500)


def test_keepa_search_calls_api():
    s = FakeSession({"api.keepa.com/search": [(200, {"products": [{"asin": "B1", "title": "t", "stats": {"current": [500]}}]})]})
    out = KeepaSource("KEY", http=HttpClient(s)).search("mat", limit=5)
    assert out[0].amazon_price == 5.0
    assert s.calls[0][2]["params"]["key"] == "KEY"


def test_missing_key_raises():
    with pytest.raises(SourceError):
        KeepaSource("")


# --- Rainforest -------------------------------------------------------------------
def test_rainforest_search_enriches_top_n():
    s = FakeSession({"rainforestapi.com": [
        (200, {"search_results": [
            {"asin": "B1", "title": "A", "price": {"value": 10.5}, "is_prime": True},
            {"asin": "B2", "title": "Ad", "sponsored": True},
            {"asin": "B3", "title": "C", "price": {"value": 7}},
        ]}),
        (200, {"product": {
            "asin": "B1", "title": "A full", "brand": "Kitchy",
            "buybox_winner": {"price": {"value": 11.0}, "is_prime": True, "availability": {"type": "in_stock"}},
            "bestsellers_rank": [{"rank": 321, "category": "Kitchen"}],
            "feature_bullets": ["b1"], "specifications": [{"name": "UPC", "value": "012345678905"}],
        }}),
    ]})
    out = RainforestSource("k", http=HttpClient(s), enrich_top=1).search("mat")
    assert [p.asin for p in out] == ["B1", "B3"]  # bỏ sponsored
    assert out[0].amazon_price == 11.0 and out[0].bsr == 321 and out[0].gtin == "012345678905"
    assert out[1].amazon_price == 7.0  # không làm giàu → giữ bản tóm tắt


# --- PA-API -----------------------------------------------------------------------
def test_sigv4_is_deterministic_and_well_formed():
    kw = dict(access_key="AKID", secret_key="SECRET", region="us-east-1", service="ProductAdvertisingAPI",
              host="webservices.amazon.com", path="/paapi5/searchitems", target="T", body="{}",
              now=dt.datetime(2026, 1, 2, 3, 4, 5, tzinfo=dt.timezone.utc))
    h1, h2 = sign_v4(**kw), sign_v4(**kw)
    assert h1 == h2
    assert h1["x-amz-date"] == "20260102T030405Z"
    assert h1["Authorization"].startswith(
        "AWS4-HMAC-SHA256 Credential=AKID/20260102/us-east-1/ProductAdvertisingAPI/aws4_request, "
        "SignedHeaders=content-encoding;content-type;host;x-amz-date;x-amz-target, Signature=")
    assert sign_v4(**{**kw, "body": '{"a":1}'})["Authorization"] != h1["Authorization"]


@pytest.mark.parametrize("offers", [
    {"OffersV2": {"Listings": [{"Price": {"Money": {"Amount": 12.34}}, "Availability": {"Type": "IN_STOCK"}}]}},
    {"Offers": {"Listings": [{"Price": {"Amount": 12.34}, "Availability": {"Type": "Now"},
                              "DeliveryInfo": {"IsPrimeEligible": True}}]}},
])
def test_paapi_parse_both_offer_formats(offers):
    item = {"ASIN": "B9", "ItemInfo": {"Title": {"DisplayValue": "Mat"},
                                       "ByLineInfo": {"Brand": {"DisplayValue": "Kitchy"}}},
            "BrowseNodeInfo": {"WebsiteSalesRank": {"SalesRank": 77}}, **offers}
    p = AmazonPAAPISource("a", "b", "tag-20", http=HttpClient(FakeSession({}))).parse_item(item)
    assert (p.amazon_price, p.brand, p.bsr, p.in_stock) == (12.34, "Kitchy", 77, True)


# --- eBay -------------------------------------------------------------------------
def _ebay_session(insights_status=200):
    recent = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=3)).isoformat().replace("+00:00", "Z")
    old = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=60)).isoformat().replace("+00:00", "Z")
    return FakeSession({
        "oauth2/token": [(200, {"access_token": "TOKEN", "expires_in": 7200})],
        "browse/v1/item_summary/search": [(200, {"total": 57, "itemSummaries": [
            {"price": {"value": "20.00"}, "shippingOptions": [{"shippingCost": {"value": "5.00"}}]},
            {"price": {"value": "30.00"}},
            {"price": {"value": "40.00"}},
        ]})],
        "marketplace_insights": [(insights_status, {"itemSales": [
            {"lastSoldPrice": {"value": "31"}, "totalSoldQuantity": 4, "lastSoldDate": recent},
            {"lastSoldPrice": {"value": "35"}, "totalSoldQuantity": 2, "lastSoldDate": recent},
            {"lastSoldPrice": {"value": "99"}, "totalSoldQuantity": 9, "lastSoldDate": old},
        ]})],
    })


def test_ebay_lookup_active_and_sold(no_sleep):
    s = _ebay_session()
    src = EbayMarketSource("id", "secret", use_insights=True, http=HttpClient(s))
    m = src.lookup(AmazonProduct(asin="B1", title="Silicone Baking Mat for Oven", amazon_price=10, gtin="012345678905"))
    assert m.active_count == 57 and m.active_lowest == 25.0  # 20 + 5 ship
    assert m.sold_30d == 6 and m.sold_median_30d == 33.0       # bỏ giao dịch > 30 ngày
    assert any(c[2]["params"].get("gtin") == "012345678905" for c in s.calls if "browse" in c[1])
    src.lookup(AmazonProduct(asin="B2", title="x", amazon_price=10))
    assert sum("oauth2" in c[1] for c in s.calls) == 2  # token cache theo scope (browse + insights)


def test_ebay_insights_forbidden_falls_back(no_sleep):
    src = EbayMarketSource("id", "secret", use_insights=True, http=HttpClient(_ebay_session(403)))
    m = src.lookup(AmazonProduct(asin="B1", title="Mat", amazon_price=10))
    assert m.sold_30d is None and "Marketplace Insights" in m.note
    assert m.reference_price("sold_median") == m.active_p25  # tự lùi về giá active


def test_build_query_drops_stopwords():
    assert build_query("Silicone Baking Mat for the Oven, 2 Pack Set") == "Silicone Baking Mat Oven"


def test_reference_price_fallback_order():
    m = EbayMarketData(query="q", active_lowest=10, active_p25=12, sold_median_30d=15)
    assert [m.reference_price(s) for s in ("sold_median", "active_p25", "active_lowest")] == [15, 12, 10]

"""
scraper.py — "Cổng vào" lớp dữ liệu: chọn nguồn Amazon & nguồn eBay theo tên
=============================================================================

Các adapter cụ thể nằm trong gói `sources/`:

    sources/mock.py        Dữ liệu giả lập (mặc định, không cần key)
    sources/keepa.py       Keepa API      — giá, LỊCH SỬ BSR/giá, tồn kho Amazon
    sources/rainforest.py  Rainforest API — dữ liệu trang Amazon real-time
    sources/paapi.py       Amazon PA-API 5 (chính thức, tự ký AWS SigV4)
    sources/ebay.py        eBay Browse API (+ Marketplace Insights cho Sold Listings)

Ví dụ dùng:
    from scraper import get_product_source, get_market_source
    amazon = get_product_source("keepa")
    ebay = get_market_source("ebay")
    for p in amazon.search("silicone baking mat", limit=10):
        print(p.title, p.amazon_price, ebay.lookup(p).reference_price("sold_median"))

⚠️ Không scrape HTML trực tiếp từ Amazon: vi phạm điều khoản sử dụng và bị chặn
   rất nhanh. Các nguồn trên đều là API có giấy phép.
"""

from __future__ import annotations

from config import Settings, settings as default_settings
from sources import (
    AmazonPAAPISource,
    AmazonProduct,
    EbayMarketData,
    EbayMarketSource,
    KeepaSource,
    MarketSource,
    MockMarketSource,
    MockProductSource,
    ProductSource,
    RainforestSource,
    SourceError,
)

PRODUCT_SOURCE_LABELS = {
    "mock": "🧪 Dữ liệu giả lập",
    "keepa": "📈 Keepa API",
    "rainforest": "🌳 Rainforest API",
    "paapi": "🅰️ Amazon PA-API 5",
}
MARKET_SOURCE_LABELS = {
    "mock": "🧪 Dữ liệu giả lập",
    "ebay": "🛒 eBay Browse/Insights API",
}


def get_product_source(name: str, cfg: Settings = default_settings) -> ProductSource:
    """Tạo nguồn dữ liệu Amazon theo tên; báo lỗi rõ ràng nếu thiếu key."""
    if name == "mock":
        return MockProductSource()
    if name == "keepa":
        return KeepaSource(cfg.keepa_api_key)
    if name == "rainforest":
        return RainforestSource(cfg.rainforest_api_key)
    if name == "paapi":
        return AmazonPAAPISource(cfg.paapi_access_key, cfg.paapi_secret_key, cfg.paapi_partner_tag)
    raise SourceError(f"Không biết nguồn Amazon '{name}'")


def get_market_source(name: str, cfg: Settings = default_settings) -> MarketSource:
    """Tạo nguồn dữ liệu eBay theo tên."""
    if name == "mock":
        return MockMarketSource()
    if name == "ebay":
        return EbayMarketSource(cfg.ebay_client_id, cfg.ebay_client_secret, use_insights=cfg.ebay_enable_insights)
    raise SourceError(f"Không biết nguồn eBay '{name}'")


__all__ = [
    "AmazonProduct", "EbayMarketData", "ProductSource", "MarketSource", "SourceError",
    "MockProductSource", "MockMarketSource", "get_product_source", "get_market_source",
    "PRODUCT_SOURCE_LABELS", "MARKET_SOURCE_LABELS",
]

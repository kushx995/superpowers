"""
sources/ebay.py — eBay Buy APIs: giá đối thủ (Browse) + Sold Listings (Marketplace Insights)
==========================================================================================

⚠️ SỰ THẬT QUAN TRỌNG VỀ DỮ LIỆU "SOLD":
   • Browse API (ai đăng ký eBay Developer cũng dùng được) CHỈ trả về listing ĐANG BÁN —
     KHÔNG có dữ liệu đã bán.
   • Dữ liệu Sold Listings qua API chỉ có ở Marketplace Insights API — đây là API
     "Limited Release", phải xin eBay duyệt riêng. Chưa được duyệt sẽ nhận HTTP 403.
   • Module này dùng Insights nếu bạn bật EBAY_ENABLE_INSIGHTS=1 và đã được duyệt;
     nếu không, tự lùi về dữ liệu active và ghi chú rõ trong kết quả.

Xác thực: OAuth "client credentials" (Application token) từ App ID + Cert ID.
Tài liệu: https://developer.ebay.com/api-docs/buy/browse/overview.html
"""

from __future__ import annotations

import base64
import datetime as dt
import re
import statistics
import time
from typing import Optional

from .base import AmazonProduct, EbayMarketData, HttpClient, MarketSource, SourceError, percentile

SCOPE_BASE = "https://api.ebay.com/oauth/api_scope"
SCOPE_INSIGHTS = "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights"

# Từ "rác" bỏ khỏi query khi phải tìm theo tiêu đề (không có GTIN).
_STOPWORDS = {"for", "with", "and", "the", "of", "to", "in", "a", "an", "pack", "set", "pcs", "piece", "new"}


def build_query(title: str, max_words: int = 7) -> str:
    """Rút gọn tiêu đề Amazon thành truy vấn eBay: giữ các từ quan trọng đầu tiên."""
    words = re.findall(r"[A-Za-z0-9]+", title)
    keep = [w for w in words if w.lower() not in _STOPWORDS and len(w) > 1]
    return " ".join(keep[:max_words])


class EbayMarketSource(MarketSource):
    name = "ebay"
    API = "https://api.ebay.com"

    def __init__(self, client_id: str, client_secret: str, marketplace: str = "EBAY_US",
                 use_insights: bool = False, http: Optional[HttpClient] = None):
        if not (client_id and client_secret):
            raise SourceError("Thiếu EBAY_CLIENT_ID / EBAY_CLIENT_SECRET")
        self.client_id, self.client_secret = client_id, client_secret
        self.marketplace = marketplace
        self.use_insights = use_insights
        self.http = http or HttpClient()
        self._tokens: dict[str, tuple[str, float]] = {}  # scope → (token, hết hạn lúc)

    # -- OAuth --------------------------------------------------------------
    def _token(self, scope: str) -> str:
        cached = self._tokens.get(scope)
        if cached and cached[1] > time.time() + 60:
            return cached[0]
        basic = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        data = self.http.post(
            f"{self.API}/identity/v1/oauth2/token",
            headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded"},
            data={"grant_type": "client_credentials", "scope": scope},
        )
        self._tokens[scope] = (data["access_token"], time.time() + int(data.get("expires_in", 7200)))
        return data["access_token"]

    def _headers(self, scope: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token(scope)}", "X-EBAY-C-MARKETPLACE-ID": self.marketplace}

    # -- Tra cứu --------------------------------------------------------------
    def lookup(self, product: AmazonProduct) -> EbayMarketData:
        query = build_query(product.title)
        result = EbayMarketData(query=product.gtin or query, source=self.name)
        self._fill_active(result, product.gtin, query)
        if self.use_insights:
            try:
                self._fill_sold(result, product.gtin, query)
            except SourceError as exc:
                result.note = f"Không lấy được Sold Listings (Marketplace Insights): {exc}"[:200]
        else:
            result.note = "Chưa bật Marketplace Insights — chỉ có dữ liệu listing đang bán."
        return result

    def _fill_active(self, out: EbayMarketData, gtin: str, query: str) -> None:
        """Browse API: listing Fixed Price, hàng NEW, sắp xếp theo giá tăng dần."""
        params = {"filter": "buyingOptions:{FIXED_PRICE},conditionIds:{1000}", "sort": "price", "limit": 50}
        params.update({"gtin": gtin} if gtin else {"q": query})
        data = self.http.get(f"{self.API}/buy/browse/v1/item_summary/search",
                             params=params, headers=self._headers(SCOPE_BASE))
        prices = []
        for item in data.get("itemSummaries") or []:
            price = float((item.get("price") or {}).get("value") or 0)
            ship_opts = item.get("shippingOptions") or [{}]
            ship = float(((ship_opts[0] or {}).get("shippingCost") or {}).get("value") or 0)
            if price > 0:
                prices.append(round(price + ship, 2))  # khách so sánh tổng giá gồm ship
        out.active_count = data.get("total", len(prices))
        out.active_lowest = min(prices) if prices else None
        out.active_p25 = percentile(prices, 0.25)

    def _fill_sold(self, out: EbayMarketData, gtin: str, query: str) -> None:
        """Marketplace Insights API: giao dịch đã bán (90 ngày gần nhất), lọc lại 30 ngày."""
        params = {"filter": "buyingOptions:{FIXED_PRICE},conditionIds:{1000}", "limit": 200}
        params.update({"gtin": gtin} if gtin else {"q": query})
        data = self.http.get(f"{self.API}/buy/marketplace_insights/v1_beta/item_sales/search",
                             params=params, headers=self._headers(SCOPE_INSIGHTS))
        cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)
        prices, qty = [], 0
        for sale in data.get("itemSales") or []:
            sold_at = sale.get("lastSoldDate")
            if sold_at and dt.datetime.fromisoformat(sold_at.replace("Z", "+00:00")) < cutoff:
                continue
            price = float((sale.get("lastSoldPrice") or {}).get("value") or 0)
            if price > 0:
                prices.append(price)
                qty += int(sale.get("totalSoldQuantity") or 1)
        out.sold_30d = qty
        out.sold_median_30d = round(statistics.median(prices), 2) if prices else None
        out.sold_lowest_30d = min(prices) if prices else None

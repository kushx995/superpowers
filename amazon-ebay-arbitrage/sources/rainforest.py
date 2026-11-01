"""
sources/rainforest.py — Rainforest API: dữ liệu Amazon real-time
=================================================================

Rainforest trả về dữ liệu trang Amazon dưới dạng JSON (giá buybox, tồn kho,
BSR hiện tại, bullet points...). KHÔNG có lịch sử BSR — dùng Keepa nếu cần.
Mỗi request tốn 1 credit, nên mặc định chỉ "làm giàu" chi tiết cho top N kết quả.

Tài liệu: https://docs.trajectdata.com/rainforestapi
"""

from __future__ import annotations

from typing import Optional

from .base import AmazonProduct, HttpClient, ProductSource, SourceError


def _price(obj: Optional[dict]) -> Optional[float]:
    if not obj:
        return None
    value = obj.get("value")
    return float(value) if value not in (None, "") else None


class RainforestSource(ProductSource):
    name = "rainforest"
    BASE = "https://api.rainforestapi.com/request"

    def __init__(self, api_key: str, http: Optional[HttpClient] = None,
                 amazon_domain: str = "amazon.com", enrich_top: int = 10):
        if not api_key:
            raise SourceError("Thiếu RAINFOREST_API_KEY")
        self.api_key = api_key
        self.http = http or HttpClient()
        self.amazon_domain = amazon_domain
        self.enrich_top = enrich_top  # số sản phẩm gọi thêm type=product để lấy tồn kho/BSR/bullet

    def search(self, keyword: str, category: str = "All", limit: int = 20) -> list[AmazonProduct]:
        data = self.http.get(self.BASE, params={
            "api_key": self.api_key, "type": "search",
            "amazon_domain": self.amazon_domain, "search_term": keyword,
        })
        results = [r for r in data.get("search_results") or [] if not r.get("sponsored")][:limit]
        products = [self.parse_search_result(r) for r in results]
        # Làm giàu chi tiết cho top N (tốn thêm credit).
        for i, p in enumerate(products[: self.enrich_top]):
            try:
                products[i] = self.get_product(p.asin)
            except SourceError:
                pass  # giữ bản tóm tắt nếu lỗi chi tiết
        return products

    def get_product(self, asin: str) -> AmazonProduct:
        data = self.http.get(self.BASE, params={
            "api_key": self.api_key, "type": "product",
            "amazon_domain": self.amazon_domain, "asin": asin,
        })
        return self.parse_product(data.get("product") or {})

    # -- Parse ------------------------------------------------------------
    def parse_search_result(self, r: dict) -> AmazonProduct:
        price = _price(r.get("price")) or _price((r.get("prices") or [{}])[0])
        return AmazonProduct(
            asin=r.get("asin", ""),
            title=r.get("title", ""),
            amazon_price=price,
            amazon_rating=r.get("rating"),
            review_count=r.get("ratings_total"),
            is_prime=bool(r.get("is_prime")),
            in_stock=price is not None,
            image_urls=[r["image"]] if r.get("image") else [],
            source=self.name,
        )

    def parse_product(self, p: dict) -> AmazonProduct:
        buybox = p.get("buybox_winner") or {}
        availability = buybox.get("availability") or {}
        ranks = p.get("bestsellers_rank") or []
        images = [img.get("link") for img in p.get("images") or [] if img.get("link")]
        if not images and (p.get("main_image") or {}).get("link"):
            images = [p["main_image"]["link"]]
        return AmazonProduct(
            asin=p.get("asin", ""),
            title=p.get("title", ""),
            amazon_price=_price(buybox.get("price")),
            brand=p.get("brand") or "",
            category=(p.get("categories") or [{}])[-1].get("name", ""),
            # UPC/EAN nằm trong bảng thông số (nếu nhà bán có khai báo).
            gtin=next((str(s.get("value", "")).strip() for s in p.get("specifications") or []
                       if str(s.get("name", "")).strip().upper() in ("UPC", "EAN", "GTIN")), ""),
            amazon_rating=p.get("rating"),
            review_count=p.get("ratings_total"),
            is_prime=bool(buybox.get("is_prime")),
            in_stock=availability.get("type") == "in_stock",
            stock_qty=availability.get("stock_level"),
            bsr=ranks[0].get("rank") if ranks else None,
            bullet_points=p.get("feature_bullets") or [],
            description=p.get("description") or "",
            image_urls=images,
            source=self.name,
        )

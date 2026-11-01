"""
sources/keepa.py — Keepa API: giá Amazon, LỊCH SỬ BSR & giá, tình trạng tồn kho
================================================================================

Keepa là nguồn tốt nhất cho dữ liệu LỊCH SỬ (BSR, giá 90 ngày) — thứ mà PA-API
và Rainforest không có. Tính phí theo "token" (xem bảng giá trên keepa.com).

Định dạng dữ liệu Keepa cần biết:
  • Giá tính bằng CENT (1999 = 19.99$); -1 = không có dữ liệu.
  • Thời gian là "Keepa minutes" = số phút kể từ 2011-01-01 UTC.
  • product["csv"] là mảng các chuỗi lịch sử [t1, v1, t2, v2, ...] theo chỉ số:
        0 = giá AMAZON, 1 = giá NEW (bên thứ 3), 3 = SALES RANK (BSR)
  • stats.current[i] = giá trị hiện tại của chuỗi i (cần gọi kèm tham số stats).
  • availabilityAmazon: -1 không có offer Amazon, 0 còn hàng, 1 pre-order,
                        2 không rõ, 3 back-order, 4 giao chậm.

Tài liệu: https://keepa.com/#!discuss/t/product-object/116
"""

from __future__ import annotations

from typing import Optional

from .base import AmazonProduct, HttpClient, ProductSource, SourceError

KEEPA_EPOCH_OFFSET_MIN = 21_564_000  # phút từ 1970-01-01 tới 2011-01-01
IDX_AMAZON, IDX_NEW, IDX_SALES_RANK, IDX_RATING, IDX_REVIEWS = 0, 1, 3, 16, 17
DOMAIN_US = 1


def keepa_minutes_to_unix(minutes: int) -> int:
    return (minutes + KEEPA_EPOCH_OFFSET_MIN) * 60


def _series(csv: list, idx: int) -> list[tuple[int, int]]:
    """Chuyển mảng phẳng [t, v, t, v...] thành [(unix_ts, v), ...], bỏ giá trị -1."""
    if not csv or idx >= len(csv) or not csv[idx]:
        return []
    flat = csv[idx]
    return [(keepa_minutes_to_unix(flat[i]), flat[i + 1]) for i in range(0, len(flat) - 1, 2) if flat[i + 1] >= 0]


def _cents(v: Optional[int]) -> Optional[float]:
    return round(v / 100, 2) if v is not None and v > 0 else None


class KeepaSource(ProductSource):
    name = "keepa"
    BASE = "https://api.keepa.com"

    def __init__(self, api_key: str, http: Optional[HttpClient] = None, domain: int = DOMAIN_US):
        if not api_key:
            raise SourceError("Thiếu KEEPA_API_KEY")
        self.api_key = api_key
        self.http = http or HttpClient()
        self.domain = domain

    # -- API --------------------------------------------------------------
    def search(self, keyword: str, category: str = "All", limit: int = 20) -> list[AmazonProduct]:
        """Tìm theo từ khóa (endpoint /search, trả về đủ product object kèm stats)."""
        data = self.http.get(
            f"{self.BASE}/search",
            params={"key": self.api_key, "domain": self.domain, "type": "product",
                    "term": keyword, "stats": 90, "page": 0},
        )
        products = [self.parse_product(p) for p in data.get("products") or []]
        return products[:limit]

    def get_products(self, asins: list[str]) -> list[AmazonProduct]:
        """Tra cứu chi tiết theo danh sách ASIN (tối đa 100 ASIN/lần)."""
        data = self.http.get(
            f"{self.BASE}/product",
            params={"key": self.api_key, "domain": self.domain, "asin": ",".join(asins[:100]), "stats": 90},
        )
        return [self.parse_product(p) for p in data.get("products") or []]

    # -- Parse ------------------------------------------------------------
    def parse_product(self, p: dict) -> AmazonProduct:
        csv = p.get("csv") or []
        current = (p.get("stats") or {}).get("current") or []

        def cur(i: int) -> Optional[int]:
            return current[i] if i < len(current) and current[i] is not None and current[i] >= 0 else None

        # Ưu tiên giá do chính Amazon bán; nếu không có, lấy giá NEW thấp nhất.
        price = _cents(cur(IDX_AMAZON)) or _cents(cur(IDX_NEW))
        availability = p.get("availabilityAmazon", -1)
        rating = cur(IDX_RATING)
        images = [f"https://m.media-amazon.com/images/I/{name}" for name in (p.get("imagesCSV") or "").split(",") if name]
        tree = p.get("categoryTree") or []
        upcs = p.get("upcList") or p.get("eanList") or []

        return AmazonProduct(
            asin=p.get("asin", ""),
            title=p.get("title") or "",
            amazon_price=price,
            brand=p.get("brand") or "",
            category=tree[-1]["name"] if tree else "",
            gtin=str(upcs[0]) if upcs else "",
            amazon_rating=rating / 10 if rating else None,  # Keepa lưu 45 = 4.5 sao
            review_count=cur(IDX_REVIEWS),
            is_prime=availability == 0,  # Amazon tự bán & còn hàng ≈ Prime
            in_stock=price is not None and availability in (-1, 0, 4),
            bsr=cur(IDX_SALES_RANK),
            bsr_history=_series(csv, IDX_SALES_RANK),
            price_history=[(ts, v / 100) for ts, v in _series(csv, IDX_AMAZON)],
            bullet_points=p.get("features") or [],
            description=p.get("description") or "",
            image_urls=images,
            source=self.name,
        )

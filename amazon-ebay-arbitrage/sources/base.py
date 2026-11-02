"""
sources/base.py — Mô hình dữ liệu chung + giao diện nguồn dữ liệu + HTTP helper
================================================================================

Mọi nguồn dữ liệu (Mock, Keepa, Rainforest, PA-API, eBay) đều trả về CÙNG một
kiểu dữ liệu, nên phần còn lại của tool (calculator, pipeline, UI) không cần
biết dữ liệu đến từ đâu:

    ProductSource.search()  ──► list[AmazonProduct]     (phía Amazon: giá gốc, BSR, tồn kho)
    MarketSource.lookup()   ──► EbayMarketData          (phía eBay: giá đối thủ, đã bán)
"""

from __future__ import annotations

import statistics
import time
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

import requests


class SourceError(RuntimeError):
    """Lỗi khi gọi API nguồn dữ liệu (sai key, hết quota, mạng...)."""


# ---------------------------------------------------------------------------
# MÔ HÌNH DỮ LIỆU
# ---------------------------------------------------------------------------
@dataclass
class AmazonProduct:
    """Một sản phẩm phía Amazon (nguồn hàng)."""

    asin: str
    title: str
    amazon_price: Optional[float]            # Giá mua hiện tại; None = không có offer
    brand: str = ""
    category: str = ""
    gtin: str = ""                           # UPC/EAN — dùng để khớp CHÍNH XÁC sản phẩm trên eBay
    amazon_rating: Optional[float] = None    # 1–5 sao
    review_count: Optional[int] = None
    supplier_rating: Optional[float] = None  # % đánh giá tích cực của người bán (nếu nguồn có)
    is_prime: bool = False
    in_stock: bool = True
    stock_qty: Optional[int] = None          # Số lượng tồn (nếu nguồn có)
    bsr: Optional[int] = None                # Best Sellers Rank hiện tại (càng nhỏ càng bán chạy)
    bsr_history: list[tuple[int, int]] = field(default_factory=list)    # [(unix_ts, rank), ...]
    price_history: list[tuple[int, float]] = field(default_factory=list)  # [(unix_ts, giá), ...]
    bullet_points: list[str] = field(default_factory=list)
    description: str = ""
    image_urls: list[str] = field(default_factory=list)
    source: str = ""                         # Tên nguồn dữ liệu đã cung cấp bản ghi này

    @property
    def bsr_avg_90d(self) -> Optional[float]:
        """BSR trung bình 90 ngày — ổn định hơn BSR tức thời để đánh giá nhu cầu."""
        if not self.bsr_history:
            return None
        cutoff = time.time() - 90 * 86400
        recent = [r for ts, r in self.bsr_history if ts >= cutoff and r > 0]
        return statistics.fmean(recent) if recent else None

    @property
    def price_volatility(self) -> Optional[float]:
        """Độ biến động giá Amazon 90 ngày = (max − min) / trung bình. Dùng gợi ý % buffer."""
        cutoff = time.time() - 90 * 86400
        prices = [p for ts, p in self.price_history if ts >= cutoff and p > 0]
        if len(prices) < 2:
            return None
        return (max(prices) - min(prices)) / statistics.fmean(prices)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class EbayMarketData:
    """Tín hiệu thị trường eBay cho một sản phẩm."""

    query: str
    active_count: Optional[int] = None         # Số listing đang bán (đối thủ)
    active_lowest: Optional[float] = None      # Giá thấp nhất đang bán (đã gồm ship)
    active_p25: Optional[float] = None         # Phân vị 25% giá đang bán — loại bớt listing "rác" giá ảo
    sold_30d: Optional[int] = None             # Số lượng đã bán 30 ngày (Sold Listings)
    sold_median_30d: Optional[float] = None    # Giá bán trung vị thực tế 30 ngày
    sold_lowest_30d: Optional[float] = None
    source: str = ""
    note: str = ""                             # Ghi chú (vd: "không có quyền Marketplace Insights")
    reference_price_used: Optional[float] = None  # Giá tham chiếu pipeline đã dùng để định giá

    def reference_price(self, strategy: str) -> Optional[float]:
        """Giá đối thủ dùng để định giá, theo chiến lược người dùng chọn.

        - "sold_median"  : trung vị giá ĐÃ BÁN (sát thực tế nhất, cần dữ liệu sold)
        - "active_p25"   : phân vị 25% giá đang bán (cân bằng)
        - "active_lowest": giá thấp nhất đang bán (an toàn nhất, lời ít nhất)
        Nếu thiếu dữ liệu cho chiến lược đã chọn → lùi về chiến lược kế tiếp.
        """
        order = {
            "sold_median": [self.sold_median_30d, self.active_p25, self.active_lowest],
            "active_p25": [self.active_p25, self.active_lowest],
            "active_lowest": [self.active_lowest],
        }[strategy]
        return next((p for p in order if p), None)


# ---------------------------------------------------------------------------
# GIAO DIỆN NGUỒN DỮ LIỆU
# ---------------------------------------------------------------------------
class ProductSource(ABC):
    """Nguồn dữ liệu phía Amazon."""

    name: str = "base"

    @abstractmethod
    def search(self, keyword: str, category: str = "All", limit: int = 20) -> list[AmazonProduct]:
        """Tìm sản phẩm theo từ khóa/danh mục."""

    def get_products(self, asins: list[str]) -> list[AmazonProduct]:
        """Tra cứu lại giá & tồn kho theo danh sách ASIN (dùng cho monitor).

        ASIN không tìm thấy sẽ KHÔNG có trong kết quả → monitor coi là "không có dữ liệu".
        """
        raise NotImplementedError(f"Nguồn '{self.name}' chưa hỗ trợ tra cứu theo ASIN")


class MarketSource(ABC):
    """Nguồn dữ liệu phía eBay (đối thủ + nhu cầu)."""

    name: str = "base"

    @abstractmethod
    def lookup(self, product: AmazonProduct) -> EbayMarketData:
        """Tra cứu thị trường eBay cho một sản phẩm Amazon."""


# ---------------------------------------------------------------------------
# HTTP HELPER: retry + backoff cho lỗi tạm thời (429 / 5xx / mất mạng)
# ---------------------------------------------------------------------------
class HttpClient:
    """Bọc requests.Session: timeout, retry có backoff, báo lỗi rõ ràng.

    Có thể truyền `session` giả vào để viết test không cần mạng.
    """

    RETRY_STATUS = {429, 500, 502, 503, 504}

    def __init__(self, session: Optional[requests.Session] = None, timeout: float = 30, retries: int = 3):
        self.session = session or requests.Session()
        self.timeout = timeout
        self.retries = retries

    def request(self, method: str, url: str, **kwargs: Any) -> Any:
        last_error: Optional[Exception] = None
        for attempt in range(self.retries + 1):
            try:
                resp = self.session.request(method, url, timeout=self.timeout, **kwargs)
            except requests.RequestException as exc:  # mất mạng, timeout...
                last_error = exc
            else:
                if resp.status_code in self.RETRY_STATUS and attempt < self.retries:
                    last_error = SourceError(f"HTTP {resp.status_code}")
                elif resp.status_code >= 400:
                    raise SourceError(f"{method} {url.split('?')[0]} → HTTP {resp.status_code}: {resp.text[:300]}")
                else:
                    return resp.json()
            if attempt < self.retries:
                time.sleep(2**attempt)  # 1s, 2s, 4s
        raise SourceError(f"{method} {url.split('?')[0]} thất bại sau {self.retries + 1} lần: {last_error}")

    def get(self, url: str, **kwargs: Any) -> Any:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> Any:
        return self.request("POST", url, **kwargs)


def percentile(values: list[float], pct: float) -> Optional[float]:
    """Phân vị đơn giản (nội suy tuyến tính); None nếu danh sách rỗng."""
    if not values:
        return None
    vals = sorted(values)
    k = (len(vals) - 1) * pct
    lo, hi = int(k), min(int(k) + 1, len(vals) - 1)
    return round(vals[lo] + (vals[hi] - vals[lo]) * (k - lo), 2)

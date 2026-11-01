"""
scraper.py — Lớp lấy dữ liệu sản phẩm Amazon (Product Scanner / Fetcher)
=========================================================================

Thiết kế theo kiểu "nguồn dữ liệu có thể thay thế" (Strategy pattern):

    ProductSource (giao diện chung)
      ├── MockProductSource      ← dữ liệu giả lập, dùng ngay để phát triển/test UI
      └── AmazonPAAPISource      ← khung kết nối API chính thức (điền sau)

Phần còn lại của tool (calculator, UI) chỉ làm việc với `ProductSource`,
nên khi đổi từ dữ liệu giả sang API thật KHÔNG phải sửa code chỗ khác.

⚠️ VỀ VIỆC SCRAPE TRỰC TIẾP AMAZON:
   Điều khoản sử dụng của Amazon cấm thu thập dữ liệu tự động, và Amazon chặn
   bot rất mạnh (CAPTCHA, khóa IP). Nên dùng nguồn hợp lệ: Amazon Product
   Advertising API (cần tài khoản Amazon Associates đủ điều kiện) hoặc các
   dịch vụ dữ liệu có giấy phép (Keepa, v.v.).
"""

from __future__ import annotations

import hashlib
import random
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from typing import Optional


@dataclass
class AmazonProduct:
    """Thông tin 1 sản phẩm Amazon + tín hiệu thị trường eBay tương ứng."""

    asin: str
    title: str
    category: str
    amazon_price: float
    amazon_rating: float                  # Điểm đánh giá sản phẩm (1-5 sao)
    amazon_review_count: int
    supplier_rating: float                # Điểm uy tín người bán/nhà cung cấp trên Amazon (0-100%)
    is_prime: bool                        # Prime = thường freeship & giao nhanh
    bullet_points: list[str] = field(default_factory=list)
    image_url: str = ""
    # --- Tín hiệu thị trường eBay (Competitor & Demand) ---
    ebay_sold_30d: int = 0                # Số lượng đã bán trên eBay trong 30 ngày
    ebay_active_listings: int = 0         # Số listing đang cạnh tranh
    ebay_lowest_price: Optional[float] = None  # Giá thấp nhất của đối thủ (đã gồm ship)

    def to_dict(self) -> dict:
        return asdict(self)


class ProductSource(ABC):
    """Giao diện chung mọi nguồn dữ liệu phải tuân theo."""

    @abstractmethod
    def search(self, keyword: str, category: str = "All", limit: int = 20) -> list[AmazonProduct]:
        """Tìm sản phẩm theo từ khóa/danh mục, trả về danh sách AmazonProduct."""


# ---------------------------------------------------------------------------
# NGUỒN DỮ LIỆU GIẢ LẬP
# ---------------------------------------------------------------------------
_ADJECTIVES = ["Premium", "Portable", "Heavy Duty", "Adjustable", "Wireless", "Stainless Steel", "Compact", "Waterproof"]
_NOUNS = ["Organizer", "Holder", "Stand", "Kit", "Set", "Lamp", "Mat", "Bottle", "Charger", "Tool"]


class MockProductSource(ProductSource):
    """Sinh dữ liệu giả lập NHẤT QUÁN: cùng từ khóa → cùng kết quả.

    Dùng để phát triển giao diện và kiểm thử calculator khi chưa có API key.
    """

    def search(self, keyword: str, category: str = "All", limit: int = 20) -> list[AmazonProduct]:
        # Tạo seed từ từ khóa để kết quả lặp lại được (dễ debug).
        seed = int(hashlib.md5(f"{keyword}|{category}".encode()).hexdigest(), 16) % (2**32)
        rng = random.Random(seed)
        keyword_title = keyword.strip().title() or "Gadget"

        products = []
        for i in range(limit):
            price = round(rng.uniform(8, 80), 2)
            # Giá đối thủ eBay dao động quanh 1.3x – 2.2x giá Amazon (một số sẽ không có lời).
            competitor = round(price * rng.uniform(1.3, 2.2), 2) if rng.random() > 0.1 else None
            title = f"{rng.choice(_ADJECTIVES)} {keyword_title} {rng.choice(_NOUNS)} - {rng.randint(1, 6) * 2} Pack"
            products.append(
                AmazonProduct(
                    asin=f"B0{seed % 10_000:04d}{i:04d}",
                    title=title,
                    category=category,
                    amazon_price=price,
                    amazon_rating=round(rng.uniform(3.4, 5.0), 1),
                    amazon_review_count=rng.randint(15, 25_000),
                    supplier_rating=round(rng.uniform(80, 100), 1),
                    is_prime=rng.random() > 0.25,
                    bullet_points=[
                        f"High quality {keyword.lower()} built to last",
                        "Easy to install, no tools required",
                        "Satisfaction guaranteed",
                    ],
                    ebay_sold_30d=rng.randint(0, 400),
                    ebay_active_listings=rng.randint(3, 300),
                    ebay_lowest_price=competitor,
                )
            )
        return products


# ---------------------------------------------------------------------------
# KHUNG KẾT NỐI API CHÍNH THỨC (sẽ hoàn thiện ở bước tiếp theo)
# ---------------------------------------------------------------------------
class AmazonPAAPISource(ProductSource):
    """Kết nối Amazon Product Advertising API.

    Cần: access_key, secret_key, partner_tag (từ tài khoản Amazon Associates).
    Lưu ý: dữ liệu eBay (sold 30 ngày, giá đối thủ) phải lấy từ eBay Browse API
    hoặc công cụ nghiên cứu thị trường riêng — PA-API không cung cấp.
    """

    def __init__(self, access_key: str, secret_key: str, partner_tag: str, region: str = "us-east-1"):
        self.access_key = access_key
        self.secret_key = secret_key
        self.partner_tag = partner_tag
        self.region = region

    def search(self, keyword: str, category: str = "All", limit: int = 20) -> list[AmazonProduct]:
        raise NotImplementedError("Sẽ triển khai ở giai đoạn 2 — hiện hãy dùng MockProductSource.")

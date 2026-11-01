"""
sources/mock.py — Dữ liệu giả lập (không cần API key)
======================================================

Sinh dữ liệu NHẤT QUÁN theo từ khóa (cùng từ khóa → cùng kết quả) để phát triển
giao diện và chạy test. Có cố ý trộn vào vài thương hiệu VeRO, sản phẩm hết hàng
và tiêu đề chứa từ khóa "Amazon" để kiểm tra các bộ lọc.
"""

from __future__ import annotations

import hashlib
import random
import time

from .base import AmazonProduct, EbayMarketData, MarketSource, ProductSource, percentile

_ADJECTIVES = ["Premium", "Portable", "Heavy Duty", "Adjustable", "Stainless Steel", "Compact", "Waterproof", "Foldable"]
_NOUNS = ["Organizer", "Holder", "Stand", "Kit", "Set", "Lamp", "Mat", "Bottle", "Rack", "Tool"]
_BRANDS = ["Generic", "Unbranded", "HomeLux", "Vantro", "Kitchy", "Nike", "Disney", "Yeti", "OXO", "Tidyway"]


def _rng(*parts: str) -> random.Random:
    seed = int(hashlib.md5("|".join(parts).encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


class MockProductSource(ProductSource):
    name = "mock"

    def search(self, keyword: str, category: str = "All", limit: int = 20) -> list[AmazonProduct]:
        rng = _rng(keyword, category)
        kw = keyword.strip().title() or "Gadget"
        now = int(time.time())
        products = []
        for i in range(limit):
            price = round(rng.uniform(6, 70), 2)
            brand = rng.choice(_BRANDS)
            title = f"{brand} {rng.choice(_ADJECTIVES)} {kw} {rng.choice(_NOUNS)}, {rng.randint(1, 6) * 2} Pack"
            if rng.random() < 0.15:
                title += " - Amazon Basics Quality, Prime Shipping"
            bsr = rng.randint(800, 250_000)
            products.append(
                AmazonProduct(
                    asin="B0" + hashlib.md5(f"{keyword}|{category}|{i}".encode()).hexdigest()[:8].upper(),
                    title=title,
                    amazon_price=price,
                    brand=brand,
                    category=category,
                    gtin=f"{rng.randint(10**11, 10**12 - 1)}",
                    amazon_rating=round(rng.uniform(3.4, 5.0), 1),
                    review_count=rng.randint(15, 25_000),
                    supplier_rating=round(rng.uniform(80, 100), 1),
                    is_prime=rng.random() > 0.25,
                    in_stock=rng.random() > 0.08,
                    stock_qty=rng.choice([None, rng.randint(1, 60)]),
                    bsr=bsr,
                    bsr_history=[(now - d * 86400, int(bsr * rng.uniform(0.6, 1.5))) for d in range(0, 90, 7)],
                    price_history=[(now - d * 86400, round(price * rng.uniform(0.9, 1.12), 2)) for d in range(0, 90, 7)],
                    bullet_points=[
                        f"DURABLE BUILD: {kw.lower()} made from high quality materials",
                        "EASY SETUP: no tools required, installs in minutes",
                        "Ships in Amazon packaging; Fulfilled by Amazon",
                        "WHAT YOU GET: product, user manual, 24/7 friendly support",
                    ],
                    description=f"The {kw.lower()} you need for an organized home. Visit amazon.com/shops for more.",
                    image_urls=[f"https://example.com/mock/{i}.jpg"],
                    source=self.name,
                )
            )
        return products


class MockMarketSource(MarketSource):
    name = "mock"

    def lookup(self, product: AmazonProduct) -> EbayMarketData:
        rng = _rng("ebay", product.asin)
        base = product.amazon_price or 20
        # Giá đối thủ dao động 1.4x–3.4x giá Amazon → khoảng 1/4 sản phẩm đạt biên 25% (gần thực tế).
        active = [round(base * rng.uniform(1.4, 3.4), 2) for _ in range(rng.randint(3, 40))]
        sold = [round(base * rng.uniform(1.6, 3.4), 2) for _ in range(rng.randint(0, 60))]
        return EbayMarketData(
            query=product.gtin or product.title,
            active_count=len(active) * rng.randint(1, 8),
            active_lowest=min(active),
            active_p25=percentile(active, 0.25),
            sold_30d=len(sold) * rng.randint(1, 4),
            sold_median_30d=percentile(sold, 0.5),
            sold_lowest_30d=min(sold) if sold else None,
            source=self.name,
        )

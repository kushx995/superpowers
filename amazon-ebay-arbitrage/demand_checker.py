"""
demand_checker.py — Chấm điểm nhu cầu & mức cạnh tranh (Competitor & Demand Checker)
=====================================================================================

Gộp các tín hiệu thành 1 điểm 0-100 để xếp hạng sản phẩm:

    Nhu cầu (40đ)     : số lượng bán trên eBay 30 ngày qua
    Cạnh tranh (20đ)  : tỉ lệ bán / số listing (sell-through) — càng cao càng tốt
    Nguồn hàng (25đ)  : điểm supplier + rating sản phẩm Amazon + số review
    Vận hành (15đ)    : có Prime (giao nhanh, ít rủi ro trễ hàng)

Trọng số là điểm khởi đầu hợp lý — bạn nên chỉnh theo kinh nghiệm thực tế.
"""

from __future__ import annotations

import math

from scraper import AmazonProduct


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def demand_score(p: AmazonProduct) -> float:
    """Trả về điểm tổng hợp 0-100."""
    # Nhu cầu: 100 đơn/30 ngày trở lên coi như tối đa (thang log để tránh lệch).
    demand = _clamp(math.log1p(p.ebay_sold_30d) / math.log1p(100))

    # Sell-through = đã bán / số listing đang hoạt động. ≥ 1.0 là thị trường "nóng".
    sell_through = p.ebay_sold_30d / max(p.ebay_active_listings, 1)
    competition = _clamp(sell_through)

    # Chất lượng nguồn hàng.
    supplier = _clamp((p.supplier_rating - 80) / 20)          # 80% → 0, 100% → 1
    rating = _clamp((p.amazon_rating - 3.5) / 1.5)            # 3.5★ → 0, 5★ → 1
    reviews = _clamp(math.log10(max(p.amazon_review_count, 1)) / 4)  # 10k review → 1
    source = (supplier + rating + reviews) / 3

    ops = 1.0 if p.is_prime else 0.3

    score = demand * 40 + competition * 20 + source * 25 + ops * 15
    return round(score, 1)


def demand_label(score: float) -> str:
    if score >= 70:
        return "🔥 Rất tiềm năng"
    if score >= 50:
        return "👍 Khá"
    if score >= 30:
        return "😐 Trung bình"
    return "❄️ Yếu"

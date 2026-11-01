"""
demand_checker.py — Chấm điểm nhu cầu & mức cạnh tranh (Competitor & Demand Checker)
=====================================================================================

Gộp các tín hiệu thành 1 điểm 0-100 để xếp hạng sản phẩm:

    Nhu cầu eBay (35đ)   : số lượng ĐÃ BÁN 30 ngày (Sold Listings). Không có dữ liệu sold
                           → dùng BSR Amazon làm tín hiệu nhu cầu thay thế.
    Cạnh tranh (20đ)     : sell-through = đã bán / số listing đang bán — càng cao càng tốt.
    Nhu cầu Amazon (15đ) : BSR trung bình 90 ngày (ổn định hơn BSR tức thời).
    Nguồn hàng (20đ)     : rating sản phẩm + số review + điểm người bán (nếu có).
    Vận hành (10đ)       : Prime & còn hàng (giao nhanh, ít rủi ro hủy đơn).

Trọng số là điểm khởi đầu hợp lý — hãy chỉnh theo kinh nghiệm thực tế của bạn.
"""

from __future__ import annotations

import math
from typing import Optional

from sources import AmazonProduct, EbayMarketData


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _bsr_score(bsr: Optional[float]) -> Optional[float]:
    """BSR 1.000 → ~1.0, 100.000 → ~0.4, 1.000.000 → ~0.1 (thang log)."""
    if not bsr or bsr <= 0:
        return None
    return _clamp(1 - (math.log10(bsr) - 3) / 3.3)


def demand_score(p: AmazonProduct, m: Optional[EbayMarketData] = None) -> float:
    """Trả về điểm tổng hợp 0-100."""
    bsr = _bsr_score(p.bsr_avg_90d or p.bsr)

    # --- Nhu cầu eBay ---
    if m and m.sold_30d is not None:
        ebay_demand = _clamp(math.log1p(m.sold_30d) / math.log1p(100))  # ≥100 đơn/30 ngày = tối đa
    else:
        ebay_demand = (bsr or 0.3) * 0.8  # không có sold → suy từ BSR, trừ hao vì kém chắc chắn

    # --- Cạnh tranh ---
    if m and m.sold_30d is not None and m.active_count:
        competition = _clamp(m.sold_30d / m.active_count)
    elif m and m.active_count is not None:
        competition = _clamp(1 - math.log10(max(m.active_count, 1)) / 3)  # ít đối thủ hơn = tốt hơn
    else:
        competition = 0.5

    # --- Nguồn hàng ---
    parts = []
    if p.amazon_rating is not None:
        parts.append(_clamp((p.amazon_rating - 3.5) / 1.5))
    if p.review_count is not None:
        parts.append(_clamp(math.log10(max(p.review_count, 1)) / 4))
    if p.supplier_rating is not None:
        parts.append(_clamp((p.supplier_rating - 80) / 20))
    source = sum(parts) / len(parts) if parts else 0.5

    ops = (0.6 if p.is_prime else 0.2) + (0.4 if p.in_stock else 0.0)

    score = ebay_demand * 35 + competition * 20 + (bsr or 0.3) * 15 + source * 20 + ops * 10
    return round(score, 1)


def demand_label(score: float) -> str:
    if score >= 70:
        return "🔥 Rất tiềm năng"
    if score >= 50:
        return "👍 Khá"
    if score >= 30:
        return "😐 Trung bình"
    return "❄️ Yếu"

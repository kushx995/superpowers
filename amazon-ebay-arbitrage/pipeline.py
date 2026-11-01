"""
pipeline.py — Điều phối toàn bộ quy trình quét sản phẩm
=======================================================

    Amazon source ──► lọc tồn kho ──► VeRO check ──► eBay market ──► định giá ──► chấm điểm
                                        (loại sớm để                   (calculator)
                                         tiết kiệm API eBay)

Tách khỏi giao diện để: (1) test được không cần Streamlit, (2) sau này chạy
định kỳ bằng script/cron, (3) đổi giao diện không phải viết lại logic.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

from calculator import FeeSettings, PriceRecommendation, ProductCost, recommend_price, suggest_buffer_rate
from demand_checker import demand_label, demand_score
from sources import AmazonProduct, EbayMarketData, MarketSource, ProductSource, SourceError
from vero_checker import VeroChecker, VeroResult

WINNING_STATUSES = ("OK", "CẠNH_TRANH")


@dataclass
class ScanConfig:
    keyword: str
    category: str = "All"
    limit: int = 30
    amazon_tax_rate: float = 0.0          # sales tax bang nơi nhận hàng (0–10%)
    target_margin: float = 0.25
    price_strategy: str = "sold_median"   # sold_median | active_p25 | active_lowest
    undercut: float = 0.01
    buffer_mode: str = "auto"             # auto (theo biến động 90 ngày) | fixed
    fixed_buffer_rate: float = 0.03
    non_prime_shipping: float = 5.99      # ước tính phí ship khi sản phẩm không Prime
    other_cost: float = 0.0
    vero_mode: str = "remove"             # remove (loại bỏ) | flag (chỉ đánh dấu)
    min_sold_30d: int = 0
    min_score: float = 0.0
    require_in_stock: bool = True


@dataclass
class ScanResult:
    product: AmazonProduct
    market: Optional[EbayMarketData]
    vero: VeroResult
    recommendation: Optional[PriceRecommendation]
    buffer_rate: float
    score: float
    skipped_reason: str = ""

    @property
    def is_winner(self) -> bool:
        return (not self.skipped_reason and self.recommendation is not None
                and self.recommendation.status in WINNING_STATUSES and self.vero.level != "block")

    def to_row(self) -> dict:
        """Một dòng cho bảng kết quả / CSV nghiên cứu."""
        p, m, rec = self.product, self.market, self.recommendation
        b = rec.breakdown if rec else None
        return {
            "ASIN": p.asin,
            "Sản phẩm": p.title,
            "Thương hiệu": p.brand,
            "VeRO": self.vero.label,
            "VeRO chi tiết": self.vero.summary,
            "Trạng thái": rec.status if rec else self.skipped_reason,
            "Giá Amazon": p.amazon_price,
            "Buffer %": round(self.buffer_rate * 100, 1),
            "Giá tham chiếu eBay": m.reference_price_used if m else None,
            "Đã bán 30 ngày": m.sold_30d if m else None,
            "Đối thủ đang bán": m.active_count if m else None,
            "Giá đề xuất": rec.recommended_price if rec else None,
            "Net Profit": b.net_profit if b else None,
            "Biên LN %": round(b.net_margin * 100, 1) if b else None,
            "ROI %": round(b.roi * 100, 1) if b else None,
            "BSR": p.bsr,
            "Còn hàng": p.in_stock,
            "Prime": p.is_prime,
            "Điểm": self.score,
            "Đánh giá": demand_label(self.score),
            "Ghi chú eBay": m.note if m else "",
            "Nguồn": p.source,
        }


def scan(
    product_source: ProductSource,
    market_source: MarketSource,
    fees: FeeSettings,
    cfg: ScanConfig,
    vero: VeroChecker,
    progress: Optional[Callable[[float, str], None]] = None,
) -> list[ScanResult]:
    """Chạy toàn bộ quy trình; trả về TẤT CẢ sản phẩm (kể cả bị loại, kèm lý do)."""
    products = product_source.search(cfg.keyword, cfg.category, cfg.limit)
    results: list[ScanResult] = []

    for i, p in enumerate(products):
        if progress:
            progress((i + 1) / max(len(products), 1), p.title[:60])
        vero_result = vero.check_product(p)
        buffer_rate = suggest_buffer_rate(p.price_volatility) if cfg.buffer_mode == "auto" else cfg.fixed_buffer_rate

        def skip(reason: str, market: Optional[EbayMarketData] = None) -> None:
            results.append(ScanResult(p, market, vero_result, None, buffer_rate, demand_score(p, market), reason))

        # 1) Loại sớm (trước khi gọi API eBay → tiết kiệm quota)
        if not p.amazon_price:
            skip("KHÔNG_CÓ_GIÁ")
            continue
        if cfg.require_in_stock and not p.in_stock:
            skip("HẾT_HÀNG")
            continue
        if vero_result.level == "block" and cfg.vero_mode == "remove":
            skip("VERO")
            continue

        # 2) Thị trường eBay
        try:
            market = market_source.lookup(p)
        except SourceError as exc:
            skip(f"LỖI_EBAY: {exc}"[:120])
            continue

        # 3) Định giá
        reference = market.reference_price(cfg.price_strategy)
        market.reference_price_used = reference
        cost = ProductCost(
            amazon_price=p.amazon_price,
            amazon_sales_tax_rate=cfg.amazon_tax_rate,
            shipping_cost=0.0 if p.is_prime else cfg.non_prime_shipping,
            other_cost=cfg.other_cost,
            price_buffer_rate=buffer_rate,
        )
        rec = recommend_price(cost, fees, cfg.target_margin, reference, cfg.undercut)
        results.append(ScanResult(p, market, vero_result, rec, buffer_rate, demand_score(p, market)))

    # 4) Lọc theo ngưỡng & sắp xếp: sản phẩm thắng trước, rồi theo lợi nhuận và điểm
    def passes(r: ScanResult) -> bool:
        sold = r.market.sold_30d if r.market else None
        return (sold is None or sold >= cfg.min_sold_30d) and r.score >= cfg.min_score

    def sort_key(r: ScanResult):
        net = r.recommendation.breakdown.net_profit if r.recommendation and r.recommendation.breakdown else -1e9
        return (r.is_winner, net, r.score)

    return sorted((r for r in results if passes(r)), key=sort_key, reverse=True)

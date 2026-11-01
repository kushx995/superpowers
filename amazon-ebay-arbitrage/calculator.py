"""
calculator.py — Bộ tính lợi nhuận Amazon → eBay (Profit Analyzer)
==================================================================

Module này KHÔNG phụ thuộc thư viện ngoài (chỉ dùng thư viện chuẩn Python),
nên có thể dùng lại ở mọi nơi: giao diện Streamlit, script dòng lệnh, test...

Ý tưởng cốt lõi
---------------
Với giá bán eBay P (giả định listing FREE SHIPPING — cách cạnh tranh nhất):

    Doanh thu                 = P
    Phí Final Value (FVF)     = P × (1 + thuế eBay thu hộ người mua) × tỉ lệ FVF
                                (eBay tính FVF trên TỔNG đơn hàng, gồm cả sales tax)
    Phí cố định / đơn         = 0.30$ hoặc 0.40$ (tùy tổng đơn ≤ hay > 10$)
    Phí quảng cáo (Promoted)  = P × tỉ lệ quảng cáo
    Dự phòng hoàn hàng        = P × tỉ lệ dự phòng
    Giá vốn Amazon            = giá Amazon × (1 + sales tax khi mua)
    Phí vận chuyển + chi khác = cố định

    Lợi nhuận trước thuế  = P − tất cả chi phí ở trên
    Thuế thu nhập         = max(0, LN trước thuế) × thuế suất
    Lợi nhuận ròng (Net)  = LN trước thuế − thuế thu nhập

Vì mọi khoản phí đều TUYẾN TÍNH theo P (trừ phí cố định thay đổi theo bậc),
ta giải được CHÍNH XÁC giá bán tối thiểu để đạt biên lợi nhuận mục tiêu,
không cần dò thử (brute-force):

    Đặt a = 1 − (1 + t_mua) × FVF − tỉ lệ QC − tỉ lệ dự phòng   (phần còn lại trên mỗi 1$ doanh thu)
        C = giá vốn Amazon + ship + chi khác + phí cố định     (chi phí không phụ thuộc P)
        k = 1 − thuế thu nhập

    Net = (a·P − C)·k   và ta cần   Net / P ≥ m   (m = biên lợi nhuận mục tiêu)
    ⇒  P ≥ C·k / (a·k − m)      (chỉ khả thi khi a·k > m)

LƯU Ý: Các tỉ lệ phí eBay mặc định bên dưới chỉ để THAM KHẢO. eBay thay đổi
biểu phí định kỳ — hãy kiểm tra lại trang "Selling fees" của eBay trước khi dùng.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Optional

# ---------------------------------------------------------------------------
# 1. BẢNG PHÍ THAM KHẢO
# ---------------------------------------------------------------------------
# Tỉ lệ Final Value Fee theo ngành hàng (giá trị tham khảo, có thể đã thay đổi).
# Giao diện cho phép nhập tay tỉ lệ khác nếu ngành hàng của bạn không có ở đây.
EBAY_CATEGORY_FVF: dict[str, float] = {
    "Hầu hết danh mục (Most categories)": 0.136,
    "Sách / Phim / Nhạc (Books, Movies & Music)": 0.153,
    "Mức 13.25% (biểu phí cũ)": 0.1325,
    "Mức 12.5% (Store có ưu đãi)": 0.125,
}


# ---------------------------------------------------------------------------
# 2. CẤU TRÚC DỮ LIỆU ĐẦU VÀO
# ---------------------------------------------------------------------------
@dataclass
class FeeSettings:
    """Các thông số phí & thuế phía eBay và phía người bán.

    Tất cả tỉ lệ ở dạng số thập phân: 0.136 nghĩa là 13.6%.
    """

    ebay_fvf_rate: float = 0.136            # Final Value Fee theo ngành hàng
    ebay_fixed_fee_low: float = 0.30        # Phí cố định/đơn khi tổng đơn ≤ ngưỡng
    ebay_fixed_fee_high: float = 0.40       # Phí cố định/đơn khi tổng đơn > ngưỡng
    ebay_fixed_fee_threshold: float = 10.0  # Ngưỡng tổng đơn ($) để đổi mức phí cố định
    buyer_sales_tax_rate: float = 0.07      # Sales tax eBay thu hộ người mua (ước tính trung bình).
                                            # Người bán không giữ khoản này, nhưng FVF vẫn tính trên nó!
    promoted_ad_rate: float = 0.05          # Phí Promoted Listings (0 nếu không chạy quảng cáo)
    return_reserve_rate: float = 0.02       # Dự phòng hoàn hàng / hàng lỗi / khiếu nại
    income_tax_rate: float = 0.15           # Thuế thu nhập/kinh doanh dự kiến trên lợi nhuận

    def fixed_fee_for(self, order_total: float) -> float:
        """Trả về phí cố định mỗi đơn dựa trên tổng giá trị đơn hàng."""
        if order_total <= self.ebay_fixed_fee_threshold:
            return self.ebay_fixed_fee_low
        return self.ebay_fixed_fee_high


@dataclass
class ProductCost:
    """Chi phí để có được 1 đơn vị sản phẩm từ Amazon và giao tới khách eBay."""

    amazon_price: float                 # Giá niêm yết trên Amazon
    amazon_sales_tax_rate: float = 0.0  # Sales tax khi mua trên Amazon (0 nếu có tax-exempt)
    shipping_cost: float = 0.0          # Phí ship tới khách (0 nếu Amazon Prime freeship)
    other_cost: float = 0.0             # Chi phí khác: đóng gói, phần mềm, phí chuyển tiền...

    @property
    def amazon_tax(self) -> float:
        return self.amazon_price * self.amazon_sales_tax_rate

    @property
    def amazon_total(self) -> float:
        """Giá mua thực tế trên Amazon (đã gồm thuế)."""
        return self.amazon_price + self.amazon_tax

    @property
    def total_cost_basis(self) -> float:
        """Tổng vốn bỏ ra cho 1 đơn (dùng để tính ROI)."""
        return self.amazon_total + self.shipping_cost + self.other_cost


# ---------------------------------------------------------------------------
# 3. KẾT QUẢ PHÂN TÍCH
# ---------------------------------------------------------------------------
@dataclass
class ProfitBreakdown:
    """Bảng chi tiết từng đồng cho 1 mức giá bán eBay."""

    sale_price: float
    amazon_price: float
    amazon_tax: float
    shipping_cost: float
    other_cost: float
    ebay_order_total: float      # Tổng đơn eBay dùng để tính FVF (gồm thuế người mua)
    ebay_fvf: float
    ebay_fixed_fee: float
    promoted_fee: float
    return_reserve: float
    profit_before_tax: float
    income_tax: float
    net_profit: float
    net_margin: float            # Net profit / giá bán
    roi: float                   # Net profit / tổng vốn bỏ ra

    @property
    def total_ebay_fees(self) -> float:
        return self.ebay_fvf + self.ebay_fixed_fee

    @property
    def total_costs(self) -> float:
        """Tổng tất cả chi phí (kể cả thuế thu nhập)."""
        return self.sale_price - self.net_profit

    def to_rows(self) -> list[tuple[str, float]]:
        """Chuyển thành danh sách (tên khoản mục, số tiền) để hiển thị dạng bảng.

        Chi phí mang dấu âm, doanh thu/lợi nhuận mang dấu dương.
        """
        return [
            ("Giá bán eBay (doanh thu)", self.sale_price),
            ("Giá mua Amazon", -self.amazon_price),
            ("Sales tax khi mua Amazon", -self.amazon_tax),
            ("Phí vận chuyển", -self.shipping_cost),
            ("Chi phí khác", -self.other_cost),
            ("eBay Final Value Fee", -self.ebay_fvf),
            ("eBay phí cố định / đơn", -self.ebay_fixed_fee),
            ("Promoted Listings (quảng cáo)", -self.promoted_fee),
            ("Dự phòng hoàn hàng", -self.return_reserve),
            ("= Lợi nhuận trước thuế", self.profit_before_tax),
            ("Thuế thu nhập dự kiến", -self.income_tax),
            ("= LỢI NHUẬN RÒNG (Net)", self.net_profit),
        ]

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class PriceRecommendation:
    """Kết quả đề xuất giá bán eBay."""

    status: str                         # "OK" | "CẠNH_TRANH" | "ĐẮT_HƠN_ĐỐI_THỦ" | "KHÔNG_KHẢ_THI"
    message: str
    min_price: Optional[float]          # Giá tối thiểu (chưa làm tròn) để đạt biên mục tiêu
    recommended_price: Optional[float]  # Giá đề xuất đăng bán
    breakdown: Optional[ProfitBreakdown]


# ---------------------------------------------------------------------------
# 4. CÁC HÀM TÍNH TOÁN
# ---------------------------------------------------------------------------
def _round_cents(x: float) -> float:
    """Làm tròn về cent; cộng epsilon nhỏ để tránh lỗi số thực (vd 2.675 → 2.68)."""
    return round(x + 1e-9, 2)


def analyze_profit(sale_price: float, cost: ProductCost, fees: FeeSettings) -> ProfitBreakdown:
    """Tính chi tiết lợi nhuận khi bán sản phẩm với giá `sale_price` trên eBay."""
    if sale_price <= 0:
        raise ValueError("Giá bán phải lớn hơn 0")

    # eBay tính FVF trên tổng đơn: giá bán + ship người mua trả (ở đây = 0) + sales tax.
    order_total = sale_price * (1 + fees.buyer_sales_tax_rate)
    fvf = order_total * fees.ebay_fvf_rate
    fixed_fee = fees.fixed_fee_for(order_total)

    promoted = sale_price * fees.promoted_ad_rate
    reserve = sale_price * fees.return_reserve_rate

    profit_before_tax = (
        sale_price
        - cost.amazon_total
        - cost.shipping_cost
        - cost.other_cost
        - fvf
        - fixed_fee
        - promoted
        - reserve
    )
    # Chỉ đóng thuế khi có lãi.
    income_tax = max(0.0, profit_before_tax) * fees.income_tax_rate
    net = profit_before_tax - income_tax

    basis = cost.total_cost_basis
    return ProfitBreakdown(
        sale_price=_round_cents(sale_price),
        amazon_price=_round_cents(cost.amazon_price),
        amazon_tax=_round_cents(cost.amazon_tax),
        shipping_cost=_round_cents(cost.shipping_cost),
        other_cost=_round_cents(cost.other_cost),
        ebay_order_total=_round_cents(order_total),
        ebay_fvf=_round_cents(fvf),
        ebay_fixed_fee=_round_cents(fixed_fee),
        promoted_fee=_round_cents(promoted),
        return_reserve=_round_cents(reserve),
        profit_before_tax=_round_cents(profit_before_tax),
        income_tax=_round_cents(income_tax),
        net_profit=_round_cents(net),
        net_margin=net / sale_price,
        roi=net / basis if basis > 0 else 0.0,
    )


def min_price_for_margin(
    cost: ProductCost, fees: FeeSettings, target_margin: float = 0.25
) -> Optional[float]:
    """Giải chính xác giá bán NHỎ NHẤT để biên lợi nhuận ròng ≥ target_margin.

    Trả về None nếu không thể đạt mục tiêu ở bất kỳ mức giá nào
    (tức là tổng % phí đã "ăn" hết phần biên lợi nhuận).
    """
    if target_margin < 0:
        raise ValueError("Biên lợi nhuận mục tiêu phải ≥ 0")

    # a: phần còn lại trên mỗi 1$ doanh thu sau các khoản phí tính theo %
    a = (
        1
        - (1 + fees.buyer_sales_tax_rate) * fees.ebay_fvf_rate
        - fees.promoted_ad_rate
        - fees.return_reserve_rate
    )
    k = 1 - fees.income_tax_rate
    denom = a * k - target_margin
    if denom <= 0:
        return None

    base_fixed_costs = cost.amazon_total + cost.shipping_cost + cost.other_cost
    candidates: list[float] = []

    # Phí cố định có 2 bậc → giải cho từng bậc rồi kiểm tra nghiệm có rơi đúng bậc đó không.
    for fixed_fee, in_branch in (
        (fees.ebay_fixed_fee_low, lambda total: total <= fees.ebay_fixed_fee_threshold),
        (fees.ebay_fixed_fee_high, lambda total: total > fees.ebay_fixed_fee_threshold),
    ):
        price = (base_fixed_costs + fixed_fee) * k / denom
        if in_branch(price * (1 + fees.buyer_sales_tax_rate)):
            candidates.append(price)

    if not candidates:
        # Trường hợp hiếm sát ngưỡng: lấy nghiệm của bậc phí cao (an toàn hơn).
        candidates.append((base_fixed_costs + fees.ebay_fixed_fee_high) * k / denom)
    return min(candidates)


def _ceil_cents(x: float) -> float:
    """Làm tròn LÊN tới cent (dùng cho giá tối thiểu — không bao giờ được làm tròn xuống)."""
    return math.ceil(x * 100 - 1e-6) / 100


def charm_price(price: float) -> float:
    """Làm tròn LÊN tới giá đuôi .99 gần nhất (vd 23.10 → 23.99, 24.00 → 24.99).

    Giá đuôi .99 tăng tỉ lệ chuyển đổi và vì làm tròn LÊN nên biên lợi nhuận
    không bao giờ thấp hơn mục tiêu.
    """
    cents = math.ceil(price * 100 - 1e-6)  # làm tròn LÊN tới số nguyên cent
    dollars = math.ceil((cents - 99) / 100)
    return dollars + 0.99


def recommend_price(
    cost: ProductCost,
    fees: FeeSettings,
    target_margin: float = 0.25,
    competitor_lowest_price: Optional[float] = None,
    undercut: float = 0.01,
) -> PriceRecommendation:
    """Đề xuất giá đăng bán eBay vừa cạnh tranh vừa đảm bảo biên lợi nhuận.

    Chiến lược:
      1. Tính giá tối thiểu `min_price` đạt biên mục tiêu.
      2. Nếu biết giá thấp nhất của đối thủ:
         - Đối thủ đắt hơn `min_price`  → bán rẻ hơn đối thủ `undercut` $ (lời nhiều hơn mục tiêu).
         - Đối thủ rẻ hơn `min_price`   → vẫn giữ `min_price` (không bán lỗ) và cảnh báo.
      3. Nếu không có dữ liệu đối thủ → dùng `min_price` làm tròn lên đuôi .99.
    """
    min_price = min_price_for_margin(cost, fees, target_margin)
    if min_price is None:
        return PriceRecommendation(
            status="KHÔNG_KHẢ_THI",
            message=(
                f"Không thể đạt biên {target_margin:.0%}: tổng % phí eBay + quảng cáo + thuế "
                "đã vượt mức cho phép. Hãy giảm quảng cáo hoặc hạ biên mục tiêu."
            ),
            min_price=None,
            recommended_price=None,
            breakdown=None,
        )

    if competitor_lowest_price is None:
        price = charm_price(min_price)
        status, msg = "OK", f"Chưa có giá đối thủ — đề xuất giá tối thiểu đạt biên {target_margin:.0%}."
    elif _round_cents(competitor_lowest_price - undercut) >= min_price:
        price = _round_cents(competitor_lowest_price - undercut)
        status = "CẠNH_TRANH"
        msg = f"Rẻ hơn đối thủ rẻ nhất ({competitor_lowest_price:.2f}$) {undercut:.2f}$ mà vẫn vượt biên mục tiêu."
    else:
        price = charm_price(min_price)
        gap = (price - competitor_lowest_price) / competitor_lowest_price
        status = "ĐẮT_HƠN_ĐỐI_THỦ"
        msg = (
            f"Giá cần thiết cao hơn đối thủ rẻ nhất {gap:.1%}. "
            "Cân nhắc: tìm nguồn rẻ hơn, giảm quảng cáo, hoặc bỏ qua sản phẩm này."
        )

    return PriceRecommendation(
        status=status,
        message=msg,
        min_price=_ceil_cents(min_price),
        recommended_price=price,
        breakdown=analyze_profit(price, cost, fees),
    )


# ---------------------------------------------------------------------------
# 5. CHẠY THỬ NHANH TỪ DÒNG LỆNH:  python calculator.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    demo_cost = ProductCost(amazon_price=19.99, amazon_sales_tax_rate=0.0825, shipping_cost=0.0)
    demo_fees = FeeSettings()
    rec = recommend_price(demo_cost, demo_fees, target_margin=0.25, competitor_lowest_price=39.95)

    print(f"Trạng thái : {rec.status} — {rec.message}")
    print(f"Giá tối thiểu: {rec.min_price}$ | Giá đề xuất: {rec.recommended_price}$\n")
    for label, amount in rec.breakdown.to_rows():
        print(f"  {label:<32} {amount:>9.2f}$")
    print(f"\n  Biên LN ròng: {rec.breakdown.net_margin:.1%} | ROI: {rec.breakdown.roi:.1%}")

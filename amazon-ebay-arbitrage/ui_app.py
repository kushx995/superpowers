"""
ui_app.py — Giao diện Web (Streamlit) cho tool Amazon → eBay Arbitrage
=======================================================================

Chạy:   streamlit run ui_app.py

Bố cục:
  • Sidebar  : cấu hình phí eBay, thuế, quảng cáo, biên lợi nhuận mục tiêu (dùng chung)
  • Tab 1    : Tính lợi nhuận chi tiết cho 1 sản phẩm
  • Tab 2    : Quét hàng loạt sản phẩm theo từ khóa → xếp hạng theo lợi nhuận & nhu cầu
"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from calculator import (
    EBAY_CATEGORY_FVF,
    FeeSettings,
    ProductCost,
    analyze_profit,
    recommend_price,
)
from demand_checker import demand_label, demand_score
from scraper import MockProductSource

st.set_page_config(page_title="Amazon → eBay Profit Finder", page_icon="💰", layout="wide")

STATUS_ICON = {
    "OK": "✅",
    "CẠNH_TRANH": "🏆",
    "ĐẮT_HƠN_ĐỐI_THỦ": "⚠️",
    "KHÔNG_KHẢ_THI": "⛔",
}


# ---------------------------------------------------------------------------
# SIDEBAR — CẤU HÌNH PHÍ (áp dụng cho cả 2 tab)
# ---------------------------------------------------------------------------
def sidebar_settings() -> tuple[FeeSettings, float]:
    st.sidebar.header("⚙️ Cấu hình phí & mục tiêu")

    category = st.sidebar.selectbox("Ngành hàng eBay", [*EBAY_CATEGORY_FVF.keys(), "Tùy chỉnh"])
    if category == "Tùy chỉnh":
        fvf_pct = st.sidebar.number_input("Final Value Fee (%)", 0.0, 30.0, 13.6, 0.05)
    else:
        fvf_pct = EBAY_CATEGORY_FVF[category] * 100
        st.sidebar.caption(f"Final Value Fee: **{fvf_pct:.2f}%** (tham khảo — hãy kiểm tra biểu phí eBay hiện hành)")

    col1, col2 = st.sidebar.columns(2)
    fixed_low = col1.number_input("Phí cố định ≤10$", 0.0, 5.0, 0.30, 0.05)
    fixed_high = col2.number_input("Phí cố định >10$", 0.0, 5.0, 0.40, 0.05)

    buyer_tax = st.sidebar.slider(
        "Sales tax người mua (%)", 0.0, 12.0, 7.0, 0.25,
        help="eBay thu hộ khoản này, nhưng Final Value Fee vẫn tính trên cả phần thuế.",
    )
    ad_rate = st.sidebar.slider("Promoted Listings (%)", 0.0, 20.0, 5.0, 0.5, help="Đặt 0 nếu không chạy quảng cáo.")
    reserve = st.sidebar.slider("Dự phòng hoàn hàng (%)", 0.0, 10.0, 2.0, 0.5)
    income_tax = st.sidebar.slider("Thuế thu nhập dự kiến (%)", 0.0, 40.0, 15.0, 1.0)

    st.sidebar.divider()
    target_margin = st.sidebar.slider("🎯 Biên lợi nhuận ròng tối thiểu (%)", 5, 50, 25, 1)

    fees = FeeSettings(
        ebay_fvf_rate=fvf_pct / 100,
        ebay_fixed_fee_low=fixed_low,
        ebay_fixed_fee_high=fixed_high,
        buyer_sales_tax_rate=buyer_tax / 100,
        promoted_ad_rate=ad_rate / 100,
        return_reserve_rate=reserve / 100,
        income_tax_rate=income_tax / 100,
    )
    return fees, target_margin / 100


def breakdown_table(rows: list[tuple[str, float]]) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=["Khoản mục", "Số tiền ($)"])
    return df.style.format({"Số tiền ($)": "{:+.2f}"}).map(
        lambda v: "color: #c0392b" if v < 0 else "color: #1e8449; font-weight: 600",
        subset=["Số tiền ($)"],
    )


# ---------------------------------------------------------------------------
# TAB 1 — TÍNH LỢI NHUẬN 1 SẢN PHẨM
# ---------------------------------------------------------------------------
def tab_single(fees: FeeSettings, target_margin: float) -> None:
    st.subheader("🧮 Phân tích lợi nhuận một sản phẩm")

    c1, c2, c3, c4 = st.columns(4)
    amazon_price = c1.number_input("Giá Amazon ($)", 0.01, 10_000.0, 19.99, 0.5)
    amazon_tax = c2.number_input("Sales tax mua Amazon (%)", 0.0, 15.0, 8.25, 0.25)
    shipping = c3.number_input("Phí ship tới khách ($)", 0.0, 500.0, 0.0, 0.5)
    other = c4.number_input("Chi phí khác ($)", 0.0, 500.0, 0.0, 0.25)

    c5, c6 = st.columns(2)
    has_competitor = c5.checkbox("Tôi biết giá đối thủ rẻ nhất trên eBay", value=True)
    competitor = c6.number_input("Giá đối thủ rẻ nhất ($)", 0.01, 10_000.0, 39.95, 0.5, disabled=not has_competitor)

    cost = ProductCost(amazon_price, amazon_tax / 100, shipping, other)
    rec = recommend_price(cost, fees, target_margin, competitor if has_competitor else None)

    st.markdown(f"### {STATUS_ICON[rec.status]} {rec.message}")
    if rec.breakdown is None:
        return

    b = rec.breakdown
    m1, m2, m3, m4, m5 = st.columns(5)
    m1.metric("Giá đề xuất eBay", f"${rec.recommended_price:,.2f}")
    m2.metric("Giá tối thiểu", f"${rec.min_price:,.2f}")
    m3.metric("Net Profit", f"${b.net_profit:,.2f}")
    m4.metric("Biên LN ròng", f"{b.net_margin:.1%}", f"{(b.net_margin - target_margin) * 100:+.1f} điểm % so với mục tiêu")
    m5.metric("ROI", f"{b.roi:.1%}")

    left, right = st.columns([3, 2])
    with left:
        st.markdown("**Chi tiết từng đồng tại giá đề xuất**")
        st.dataframe(breakdown_table(b.to_rows()), hide_index=True, use_container_width=True)

    # Cho phép thử giá khác ("what-if") để xem lợi nhuận thay đổi thế nào.
    with right:
        st.markdown("**Thử một mức giá khác (what-if)**")
        custom = st.number_input("Giá bán thử ($)", 0.01, 10_000.0, float(rec.recommended_price), 0.5)
        alt = analyze_profit(custom, cost, fees)
        st.metric("Net Profit", f"${alt.net_profit:,.2f}", f"{alt.net_profit - b.net_profit:+.2f}$ so với giá đề xuất")
        st.metric("Biên LN ròng", f"{alt.net_margin:.1%}")
        st.metric("ROI", f"{alt.roi:.1%}")
        if alt.net_margin < target_margin:
            st.warning(f"Giá này cho biên {alt.net_margin:.1%} — thấp hơn mục tiêu {target_margin:.0%}.")


# ---------------------------------------------------------------------------
# TAB 2 — QUÉT HÀNG LOẠT
# ---------------------------------------------------------------------------
def tab_scanner(fees: FeeSettings, target_margin: float) -> None:
    st.subheader("🔎 Quét sản phẩm tiềm năng")
    st.info("Đang dùng **dữ liệu giả lập** (MockProductSource). Kết nối API thật sẽ được thêm ở giai đoạn 2.")

    c1, c2, c3, c4 = st.columns([3, 2, 1, 1])
    keyword = c1.text_input("Từ khóa", "kitchen organizer")
    category = c2.selectbox("Danh mục Amazon", ["All", "Home & Kitchen", "Sports & Outdoors", "Pet Supplies", "Tools", "Toys"])
    limit = c3.number_input("Số SP", 5, 100, 30, 5)
    amazon_tax = c4.number_input("Tax Amazon %", 0.0, 15.0, 8.25, 0.25)

    f1, f2, f3 = st.columns(3)
    min_sold = f1.number_input("Đã bán eBay 30 ngày ≥", 0, 10_000, 10)
    min_supplier = f2.slider("Supplier rating ≥ (%)", 80, 100, 90)
    only_profitable = f3.checkbox("Chỉ hiện SP cạnh tranh được giá", value=True)

    if not st.button("🚀 Quét ngay", type="primary"):
        return

    products = MockProductSource().search(keyword, category, int(limit))
    rows = []
    for p in products:
        if p.ebay_sold_30d < min_sold or p.supplier_rating < min_supplier:
            continue
        # Prime → coi như ship 0$; không Prime → ước tính 5.99$.
        cost = ProductCost(p.amazon_price, amazon_tax / 100, 0.0 if p.is_prime else 5.99)
        rec = recommend_price(cost, fees, target_margin, p.ebay_lowest_price)
        if only_profitable and rec.status not in ("OK", "CẠNH_TRANH"):
            continue
        score = demand_score(p)
        b = rec.breakdown
        rows.append(
            {
                "Trạng thái": STATUS_ICON[rec.status],
                "ASIN": p.asin,
                "Sản phẩm": p.title,
                "Giá Amazon": p.amazon_price,
                "Giá đối thủ eBay": p.ebay_lowest_price,
                "Giá đề xuất": rec.recommended_price,
                "Net Profit": b.net_profit if b else None,
                "Biên LN": b.net_margin * 100 if b else None,
                "ROI": b.roi * 100 if b else None,
                "Bán 30 ngày": p.ebay_sold_30d,
                "Supplier %": p.supplier_rating,
                "Điểm nhu cầu": score,
                "Đánh giá": demand_label(score),
            }
        )

    if not rows:
        st.warning("Không có sản phẩm nào thỏa điều kiện lọc. Hãy nới lỏng bộ lọc.")
        return

    df = pd.DataFrame(rows).sort_values(["Net Profit", "Điểm nhu cầu"], ascending=False)
    st.success(f"Tìm thấy {len(df)} sản phẩm phù hợp.")
    st.dataframe(
        df,
        hide_index=True,
        use_container_width=True,
        column_config={
            "Giá Amazon": st.column_config.NumberColumn(format="$%.2f"),
            "Giá đối thủ eBay": st.column_config.NumberColumn(format="$%.2f"),
            "Giá đề xuất": st.column_config.NumberColumn(format="$%.2f"),
            "Net Profit": st.column_config.NumberColumn(format="$%.2f"),
            "Biên LN": st.column_config.NumberColumn(format="%.1f%%"),
            "ROI": st.column_config.NumberColumn(format="%.1f%%"),
            "Điểm nhu cầu": st.column_config.ProgressColumn(min_value=0, max_value=100, format="%.0f"),
        },
    )
    st.download_button("⬇️ Tải CSV", df.to_csv(index=False).encode("utf-8-sig"), f"scan_{keyword}.csv", "text/csv")


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main() -> None:
    st.title("💰 Amazon → eBay Profit Finder")
    fees, target_margin = sidebar_settings()
    t1, t2 = st.tabs(["🧮 Tính lợi nhuận", "🔎 Quét sản phẩm"])
    with t1:
        tab_single(fees, target_margin)
    with t2:
        tab_scanner(fees, target_margin)


main()

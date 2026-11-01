"""
ui_app.py — Giao diện Web (Streamlit) cho tool Amazon → eBay Profit Finder
==========================================================================

Chạy:   streamlit run ui_app.py

Bố cục:
  • Sidebar : nguồn dữ liệu, phí eBay, thuế bang, hệ số rủi ro, VeRO (dùng chung mọi tab)
  • Tab 1   : Tính lợi nhuận 1 sản phẩm + what-if
  • Tab 2   : Quét sản phẩm (Amazon → VeRO → eBay → định giá → chấm điểm), chọn sản phẩm thắng
  • Tab 3   : AI Listing (Title SEO + HTML Description) & Export CSV eBay Bulk Upload

Kết quả quét được lưu trong st.session_state → Streamlit chạy lại script mỗi lần bạn
bấm/chỉnh gì đó nhưng KHÔNG gọi lại API (tiết kiệm quota/tiền).
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

from calculator import (
    EBAY_CATEGORY_FVF,
    US_STATE_SALES_TAX,
    FeeSettings,
    ProductCost,
    analyze_profit,
    recommend_price,
)
from config import settings
from ebay_export import ExportRow, ExportSettings, to_csv
from listing_generator import EBAY_TITLE_MAX, ListingGenerator, clean_title, contains_sensitive, sanitize_html
from pipeline import ScanConfig, scan
from scraper import (
    MARKET_SOURCE_LABELS,
    PRODUCT_SOURCE_LABELS,
    SourceError,
    get_market_source,
    get_product_source,
)
from vero_checker import VeroChecker

st.set_page_config(page_title="Amazon → eBay Profit Finder", page_icon="💰", layout="wide")

STATUS_ICON = {
    "OK": "✅", "CẠNH_TRANH": "🏆", "ĐẮT_HƠN_ĐỐI_THỦ": "⚠️", "KHÔNG_KHẢ_THI": "⛔",
    "VERO": "🚫", "HẾT_HÀNG": "📦", "KHÔNG_CÓ_GIÁ": "❔",
}
PRICE_STRATEGIES = {
    "sold_median": "Trung vị giá ĐÃ BÁN 30 ngày (sát thực tế nhất)",
    "active_p25": "Phân vị 25% giá ĐANG BÁN (cân bằng)",
    "active_lowest": "Giá thấp nhất ĐANG BÁN (an toàn nhất)",
}


@dataclass
class SidebarState:
    fees: FeeSettings
    target_margin: float
    amazon_tax_rate: float
    buffer_mode: str
    fixed_buffer_rate: float
    product_source: str
    market_source: str
    vero_mode: str
    extra_vero: list[str]


# ---------------------------------------------------------------------------
# SIDEBAR
# ---------------------------------------------------------------------------
def sidebar() -> SidebarState:
    sb = st.sidebar
    sb.header("📡 Nguồn dữ liệu")
    avail_p, avail_m = settings.available_product_sources(), settings.available_market_sources()
    p_opts = [k for k, ok in avail_p.items() if ok]
    m_opts = [k for k, ok in avail_m.items() if ok]
    product_source = sb.selectbox("Dữ liệu Amazon", p_opts, format_func=PRODUCT_SOURCE_LABELS.get)
    market_source = sb.selectbox("Dữ liệu eBay", m_opts, format_func=MARKET_SOURCE_LABELS.get)
    missing = [PRODUCT_SOURCE_LABELS[k] for k, ok in avail_p.items() if not ok] + \
              [MARKET_SOURCE_LABELS[k] for k, ok in avail_m.items() if not ok]
    if missing:
        sb.caption("🔒 Chưa cấu hình key (xem `.env.example`): " + ", ".join(missing))

    sb.header("🧾 Thuế mua hàng Amazon")
    state = sb.selectbox("Bang nhận hàng", list(US_STATE_SALES_TAX), index=list(US_STATE_SALES_TAX).index("Texas (TX)"))
    amazon_tax = sb.slider("Sales tax thực tế (%)", 0.0, 10.0, US_STATE_SALES_TAX[state] * 100, 0.125,
                           key=f"tax_{state}", help="Mặc định là thuế cấp bang; cộng thêm thuế địa phương nếu có.")

    sb.header("🛡️ Rủi ro & mục tiêu")
    target = sb.slider("🎯 Biên lợi nhuận ròng tối thiểu (%)", 5, 50, 25, 1)
    buffer_auto = sb.toggle("Buffer giá tự động theo biến động 90 ngày", value=True,
                            help="Cần nguồn có lịch sử giá (Keepa/giả lập). Không có lịch sử → dùng mức sàn 2%.")
    fixed_buffer = sb.slider("Buffer biến động giá Amazon (%)", 0.0, 20.0, 3.0, 0.5, disabled=buffer_auto)
    reserve = sb.slider("Dự phòng Return/Refund (%)", 0.0, 15.0, 3.0, 0.5)
    ad_rate = sb.slider("Promoted Listings (%)", 0.0, 20.0, 5.0, 0.5, help="Đặt 0 nếu không chạy quảng cáo.")

    with sb.expander("⚙️ Phí eBay & thuế thu nhập"):
        cat = st.selectbox("Ngành hàng eBay", [*EBAY_CATEGORY_FVF, "Tùy chỉnh"])
        fvf = st.number_input("Final Value Fee (%)", 0.0, 30.0, 13.6, 0.05) if cat == "Tùy chỉnh" \
            else EBAY_CATEGORY_FVF[cat] * 100
        st.caption(f"FVF đang dùng: **{fvf:.2f}%** — đối chiếu trang Selling fees của eBay.")
        c1, c2 = st.columns(2)
        fixed_low = c1.number_input("Phí cố định ≤10$", 0.0, 5.0, 0.30, 0.05)
        fixed_high = c2.number_input("Phí cố định >10$", 0.0, 5.0, 0.40, 0.05)
        buyer_tax = st.slider("Sales tax người mua eBay (%)", 0.0, 12.0, 7.0, 0.25,
                              help="eBay thu hộ, nhưng FVF tính trên cả phần thuế này.")
        income_tax = st.slider("Thuế thu nhập dự kiến (%)", 0.0, 40.0, 15.0, 1.0)

    sb.header("🚫 VeRO Brand Checker")
    vero_mode = sb.radio("Sản phẩm dính VeRO", ["remove", "flag"], horizontal=True,
                         format_func={"remove": "Loại bỏ", "flag": "Chỉ đánh dấu"}.get)
    extra = sb.text_area("Thêm thương hiệu cần chặn (mỗi dòng 1 tên)", height=70)

    fees = FeeSettings(
        ebay_fvf_rate=fvf / 100, ebay_fixed_fee_low=fixed_low, ebay_fixed_fee_high=fixed_high,
        buyer_sales_tax_rate=buyer_tax / 100, promoted_ad_rate=ad_rate / 100,
        return_reserve_rate=reserve / 100, income_tax_rate=income_tax / 100,
    )
    return SidebarState(fees, target / 100, amazon_tax / 100, "auto" if buffer_auto else "fixed",
                        fixed_buffer / 100, product_source, market_source, vero_mode,
                        [ln.strip() for ln in extra.splitlines() if ln.strip()])


def money_table(rows: list[tuple[str, float]]):
    df = pd.DataFrame(rows, columns=["Khoản mục", "Số tiền ($)"])
    return df.style.format({"Số tiền ($)": "{:+.2f}"}).map(
        lambda v: "color:#c0392b" if v < 0 else "color:#1e8449;font-weight:600", subset=["Số tiền ($)"])


# ---------------------------------------------------------------------------
# TAB 1 — TÍNH LỢI NHUẬN 1 SẢN PHẨM
# ---------------------------------------------------------------------------
def tab_calculator(s: SidebarState) -> None:
    st.subheader("🧮 Phân tích lợi nhuận một sản phẩm")
    c1, c2, c3, c4 = st.columns(4)
    amazon_price = c1.number_input("Giá Amazon ($)", 0.01, 10_000.0, 19.99, 0.5)
    shipping = c2.number_input("Phí ship tới khách ($)", 0.0, 500.0, 0.0, 0.5)
    other = c3.number_input("Chi phí khác ($)", 0.0, 500.0, 0.0, 0.25)
    buffer_pct = c4.number_input("Buffer giá (%)", 0.0, 30.0, s.fixed_buffer_rate * 100 or 3.0, 0.5)

    c5, c6 = st.columns(2)
    has_comp = c5.checkbox("Tôi biết giá đối thủ trên eBay", value=True)
    comp = c6.number_input("Giá tham chiếu đối thủ ($)", 0.01, 10_000.0, 49.95, 0.5, disabled=not has_comp)

    cost = ProductCost(amazon_price, s.amazon_tax_rate, shipping, other, buffer_pct / 100)
    rec = recommend_price(cost, s.fees, s.target_margin, comp if has_comp else None)
    st.markdown(f"#### {STATUS_ICON[rec.status]} {rec.message}")
    if rec.breakdown is None:
        return

    b = rec.breakdown
    m = st.columns(5)
    m[0].metric("Giá đề xuất eBay", f"${rec.recommended_price:,.2f}")
    m[1].metric("Giá tối thiểu", f"${rec.min_price:,.2f}")
    m[2].metric("Net Profit", f"${b.net_profit:,.2f}")
    m[3].metric("Biên LN ròng", f"{b.net_margin:.1%}", f"{(b.net_margin - s.target_margin) * 100:+.1f} điểm % vs mục tiêu")
    m[4].metric("ROI", f"{b.roi:.1%}")

    left, mid, right = st.columns([5, 3, 4])
    with left:
        st.markdown("**Chi tiết từng đồng tại giá đề xuất**")
        st.dataframe(money_table(b.to_rows()), hide_index=True, use_container_width=True)
    with mid:
        st.markdown("**Mỗi khoản chiếm % giá bán**")
        shares = pd.DataFrame([(k, v * 100) for k, v in b.cost_shares()], columns=["Khoản chi", "% giá bán"])
        st.dataframe(shares, hide_index=True, use_container_width=True,
                     column_config={"% giá bán": st.column_config.ProgressColumn(format="%.1f%%", min_value=0, max_value=100)})
    with right:
        st.markdown("**What-if: thử giá khác**")
        custom = st.number_input("Giá bán thử ($)", 0.01, 10_000.0, float(rec.recommended_price), 0.5)
        alt = analyze_profit(custom, cost, s.fees)
        st.metric("Net Profit", f"${alt.net_profit:,.2f}", f"{alt.net_profit - b.net_profit:+.2f}$ vs giá đề xuất")
        st.metric("Biên LN ròng", f"{alt.net_margin:.1%}")
        st.metric("ROI", f"{alt.roi:.1%}")
        if alt.net_margin < s.target_margin:
            st.warning(f"Biên {alt.net_margin:.1%} thấp hơn mục tiêu {s.target_margin:.0%}.")


# ---------------------------------------------------------------------------
# TAB 2 — QUÉT SẢN PHẨM
# ---------------------------------------------------------------------------
def tab_scanner(s: SidebarState) -> None:
    st.subheader("🔎 Quét sản phẩm tiềm năng")
    if "mock" in (s.product_source, s.market_source):
        st.info("Đang dùng **dữ liệu giả lập** cho ít nhất một nguồn. Điền API key vào `.env` để quét dữ liệu thật.")

    c1, c2, c3 = st.columns([3, 2, 1])
    keyword = c1.text_input("Từ khóa", "silicone baking mat")
    category = c2.selectbox("Danh mục Amazon", ["All", "HomeAndKitchen", "SportsAndOutdoors", "PetSupplies", "ToolsAndHomeImprovement", "ToysAndGames"])
    limit = c3.number_input("Số SP", 5, 100, 30, 5)
    f1, f2, f3, f4 = st.columns(4)
    strategy = f1.selectbox("Giá tham chiếu đối thủ", list(PRICE_STRATEGIES), format_func=PRICE_STRATEGIES.get)
    min_sold = f2.number_input("Đã bán eBay 30 ngày ≥", 0, 10_000, 3)
    min_score = f3.slider("Điểm tiềm năng ≥", 0, 100, 0)
    non_prime_ship = f4.number_input("Ship ước tính SP không Prime ($)", 0.0, 50.0, 5.99, 0.5)

    if st.button("🚀 Quét ngay", type="primary"):
        cfg = ScanConfig(
            keyword=keyword, category=category, limit=int(limit), amazon_tax_rate=s.amazon_tax_rate,
            target_margin=s.target_margin, price_strategy=strategy, buffer_mode=s.buffer_mode,
            fixed_buffer_rate=s.fixed_buffer_rate, non_prime_shipping=non_prime_ship,
            vero_mode=s.vero_mode, min_sold_30d=int(min_sold), min_score=min_score,
        )
        bar = st.progress(0.0, "Đang quét...")
        try:
            results = scan(get_product_source(s.product_source), get_market_source(s.market_source), s.fees, cfg,
                           VeroChecker.from_csv(extra_brands=s.extra_vero),
                           progress=lambda f, msg: bar.progress(f, f"Đang phân tích: {msg}"))
        except SourceError as exc:
            bar.empty()
            st.error(f"Lỗi nguồn dữ liệu: {exc}")
            return
        bar.empty()
        st.session_state["scan"] = results
        st.session_state["scan_keyword"] = keyword
        st.session_state.pop("listings", None)

    results = st.session_state.get("scan")
    if not results:
        return

    winners = [r for r in results if r.is_winner]
    m = st.columns(5)
    m[0].metric("Sản phẩm quét", len(results))
    m[1].metric("🏆 Đạt biên mục tiêu", len(winners))
    m[2].metric("🚫 Dính VeRO", sum(r.vero.level == "block" for r in results))
    m[3].metric("⚠️ VeRO cần kiểm tra", sum(r.vero.level == "warn" for r in results))
    m[4].metric("📦 Hết hàng", sum(r.skipped_reason == "HẾT_HÀNG" for r in results))

    show_all = st.toggle("Hiện cả sản phẩm bị loại", value=False)
    rows = [r for r in results if show_all or r.is_winner or (r.recommendation and not r.skipped_reason)]
    df = pd.DataFrame([{"Chọn": r.is_winner, **r.to_row()} for r in rows])
    if df.empty:
        st.warning("Không có sản phẩm nào phù hợp. Thử nới bộ lọc hoặc hạ biên mục tiêu.")
        return
    df["Trạng thái"] = df["Trạng thái"].map(lambda x: f"{STATUS_ICON.get(str(x).split(':')[0], '')} {x}")

    money = st.column_config.NumberColumn(format="$%.2f")
    edited = st.data_editor(
        df, hide_index=True, use_container_width=True, disabled=[c for c in df.columns if c != "Chọn"],
        column_config={
            "Chọn": st.column_config.CheckboxColumn(help="Chọn để tạo listing & export"),
            "Giá Amazon": money, "Giá tham chiếu eBay": money, "Giá đề xuất": money, "Net Profit": money,
            "Biên LN %": st.column_config.NumberColumn(format="%.1f%%"),
            "ROI %": st.column_config.NumberColumn(format="%.1f%%"),
            "Điểm": st.column_config.ProgressColumn(min_value=0, max_value=100, format="%.0f"),
        },
    )
    st.session_state["selected_asins"] = set(edited.loc[edited["Chọn"], "ASIN"])
    st.caption(f"Đã chọn **{len(st.session_state['selected_asins'])}** sản phẩm → sang tab **📝 Listing & Export**.")
    st.download_button("⬇️ Tải CSV nghiên cứu (toàn bộ chỉ số)", df.to_csv(index=False).encode("utf-8-sig"),
                       f"research_{st.session_state.get('scan_keyword', 'scan')}.csv", "text/csv")


# ---------------------------------------------------------------------------
# TAB 3 — AI LISTING & EXPORT
# ---------------------------------------------------------------------------
def tab_listing() -> None:
    st.subheader("📝 AI Listing Generator & Export eBay Bulk Upload")
    results = st.session_state.get("scan") or []
    selected = [r for r in results if r.product.asin in st.session_state.get("selected_asins", set())
                and r.recommendation and r.recommendation.recommended_price]
    if not selected:
        st.info("Hãy quét và chọn sản phẩm ở tab **🔎 Quét sản phẩm** trước.")
        return
    blocked = [r for r in selected if r.vero.level == "block"]
    if blocked:
        st.error(f"{len(blocked)} sản phẩm đã chọn dính VeRO — đăng bán có rủi ro bị gỡ/khóa tài khoản: "
                 + ", ".join(r.product.brand or r.product.asin for r in blocked))

    c1, c2 = st.columns([1, 2])
    use_ai = c1.toggle("Dùng AI (Claude)", value=bool(settings.anthropic_api_key),
                       disabled=not settings.anthropic_api_key,
                       help="Cần ANTHROPIC_API_KEY trong .env. Tắt → dùng bộ sinh theo quy tắc (miễn phí).")
    c2.caption(f"Model: `{settings.listing_model}`" if use_ai else "Đang dùng bộ sinh theo quy tắc (không gọi AI).")
    with st.expander("Ghi chú vận chuyển & đổi trả hiển thị trong mô tả"):
        shipping_note = st.text_input("Shipping", "Fast, free shipping with tracking. Ships within 1-3 business days.")
        returns_note = st.text_input("Returns", "30-day returns accepted. Please message us if anything is not right.")

    if st.button(f"✨ Tạo listing cho {len(selected)} sản phẩm", type="primary"):
        gen = ListingGenerator(settings.anthropic_api_key, settings.listing_model, use_ai,
                               shipping_note, returns_note)
        listings = {}
        bar = st.progress(0.0)
        for i, r in enumerate(selected):
            bar.progress((i + 1) / len(selected), f"Đang viết: {r.product.title[:60]}")
            listings[r.product.asin] = gen.generate(r.product)
        bar.empty()
        st.session_state["listings"] = listings

    listings = st.session_state.get("listings") or {}
    if not listings:
        return

    export_rows: list[ExportRow] = []
    for r in selected:
        lst = listings.get(r.product.asin)
        if lst is None:
            continue
        with st.expander(f"{'🤖' if lst.copy.generated_by.startswith('ai') else '📐'} {lst.title}  —  "
                         f"${r.recommendation.recommended_price:.2f}"):
            for w in lst.warnings:
                st.warning(w)
            title = st.text_input("Title", lst.title, key=f"t_{r.product.asin}", max_chars=EBAY_TITLE_MAX)
            st.caption(f"{len(title)}/{EBAY_TITLE_MAX} ký tự · tạo bởi `{lst.copy.generated_by}`"
                       + (f" · keywords: {', '.join(lst.copy.keywords[:8])}" if lst.copy.keywords else ""))
            price = st.number_input("Giá đăng ($)", 0.01, 10_000.0, float(r.recommendation.recommended_price),
                                    0.5, key=f"p_{r.product.asin}")
            if price < r.recommendation.min_price:
                st.error(f"Thấp hơn giá tối thiểu ${r.recommendation.min_price:.2f} → không đạt biên mục tiêu.")
            raw = st.text_area("HTML Description (có thể chỉnh)", lst.description_html, height=150, key=f"d_{r.product.asin}")
            html_clean = sanitize_html(raw)  # chỉnh tay xong vẫn phải qua bộ lọc
            components.html(html_clean, height=420, scrolling=True)
            title = clean_title(title)
            if contains_sensitive(title + html_clean):
                st.error("Nội dung vẫn chứa từ nhạy cảm — đã được tự động loại khi export.")
            export_rows.append(ExportRow(r.product.asin, title, html_clean, price, r.product.brand,
                                         r.product.gtin, tuple(r.product.image_urls)))

    st.divider()
    st.markdown("#### ⬇️ Export CSV cho eBay (Seller Hub → Reports → Uploads)")
    e1, e2, e3, e4 = st.columns(4)
    category_id = e1.text_input("*ID danh mục eBay", help="Tra ID khi tạo listing thử trên eBay hoặc trong template danh mục.")
    location = e2.text_input("Vị trí hàng (ZIP / Thành phố)", "United States")
    qty = e3.number_input("Số lượng mỗi listing", 1, 100, 2, help="Dropship nên để thấp để tránh bán quá tồn kho nguồn.")
    dispatch = e4.number_input("Handling time (ngày)", 0, 30, 3)
    p1, p2, p3 = st.columns(3)
    ship_p = p1.text_input("Shipping policy (tên)")
    ret_p = p2.text_input("Return policy (tên)")
    pay_p = p3.text_input("Payment policy (tên)")
    with_imgs = st.checkbox("Đính kèm URL ảnh từ nguồn", value=False,
                            help="Ảnh sản phẩm trên Amazon thường thuộc bản quyền người bán/thương hiệu — dùng lại là "
                                 "nguyên nhân phổ biến bị báo cáo. Khuyến nghị dùng ảnh tự chụp.")
    if with_imgs:
        st.warning("Chỉ dùng ảnh bạn có quyền sử dụng.")
    try:
        data = to_csv(export_rows, ExportSettings(
            category_id=category_id, location=location, quantity=int(qty), dispatch_days=int(dispatch),
            shipping_profile=ship_p, return_profile=ret_p, payment_profile=pay_p, include_source_images=with_imgs))
    except ValueError as exc:
        st.info(f"Chưa thể export: {exc}")
        return
    st.download_button(f"⬇️ Tải file eBay Bulk Upload ({len(export_rows)} listing)", data,
                       "ebay_bulk_upload.csv", "text/csv", type="primary")
    st.caption("Mẹo: upload thử 1–2 dòng trước. Đối chiếu tiêu đề cột với template danh mục tải từ Seller Hub.")


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main() -> None:
    st.title("💰 Amazon → eBay Profit Finder")
    s = sidebar()
    t1, t2, t3 = st.tabs(["🧮 Tính lợi nhuận", "🔎 Quét sản phẩm", "📝 Listing & Export"])
    with t1:
        tab_calculator(s)
    with t2:
        tab_scanner(s)
    with t3:
        tab_listing()


main()

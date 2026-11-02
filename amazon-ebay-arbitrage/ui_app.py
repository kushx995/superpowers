"""
ui_app.py — Giao diện Web (Streamlit) cho tool Amazon → eBay Profit Finder
==========================================================================

Chạy:   streamlit run ui_app.py

Bố cục:
  • Sidebar : nguồn dữ liệu, phí eBay, thuế bang, hệ số rủi ro, VeRO (dùng chung mọi tab)
  • Tab 1   : Tính lợi nhuận 1 sản phẩm + what-if
  • Tab 2   : Quét sản phẩm (Amazon → VeRO → eBay → định giá → chấm điểm), chọn sản phẩm thắng
  • Tab 3   : AI Listing (Title SEO + HTML Description), nút "Đăng lên eBay ngay", Export CSV Bulk Upload
  • Tab 4   : Đang bán & Monitor — listing đã đăng (SQLite), canh giá/tồn kho Amazon, tự cập nhật eBay
  • Tab 5   : Kết nối eBay (token OAuth, kho hàng, business policies) cho tính năng Auto Listing

Kết quả quét được lưu trong st.session_state → Streamlit chạy lại script mỗi lần bạn
bấm/chỉnh gì đó nhưng KHÔNG gọi lại API (tiết kiệm quota/tiền).
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass

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
from database import (
    ACTIVE, DEFAULT_DB_PATH, ENDED, MONITORED_STATUSES, PAUSED_OOS, STATUS_LABELS, Database, ListingRecord,
)
from ebay_export import ExportRow, ExportSettings, to_csv
from ebay_publisher import (
    STEP_LABELS, EbayApiError, EbayPublisher, ListingRequest, PublisherConfig, PublishResult, parse_aspects_text,
)
from monitor import ACTION_LABELS, MonitorSettings, build_source, run_once
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
        st.session_state["scan_fees"] = s.fees           # giả định phí lúc quét → lưu vào DB khi đăng
        st.session_state["scan_target"] = s.target_margin
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
def tab_listing(s: SidebarState) -> None:
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

    cfg = pub_config()
    if cfg.environment == "production":
        st.checkbox("⚠️ Tôi xác nhận các nút 'Đăng lên eBay ngay' sẽ đăng lên tài khoản eBay THẬT (Production).",
                    key="confirm_production")

    export_rows: list[ExportRow] = []
    for r in selected:
        lst = listings.get(r.product.asin)
        if lst is None:
            continue
        with st.expander(f"{'🤖' if lst.copy.generated_by.startswith('ai') else '📐'} {lst.title}  —  "
                         f"${r.recommendation.recommended_price:.2f}",
                         expanded=st.session_state.get("open_asin") == r.product.asin):
            oc = keep_open(r.product.asin)
            for w in lst.warnings:
                st.warning(w)
            title = st.text_input("Title", lst.title, key=f"t_{r.product.asin}", max_chars=EBAY_TITLE_MAX, on_change=oc)
            st.caption(f"{len(title)}/{EBAY_TITLE_MAX} ký tự · tạo bởi `{lst.copy.generated_by}`"
                       + (f" · keywords: {', '.join(lst.copy.keywords[:8])}" if lst.copy.keywords else ""))
            price = st.number_input("Giá đăng ($)", 0.01, 10_000.0, float(r.recommendation.recommended_price),
                                    0.5, key=f"p_{r.product.asin}", on_change=oc)
            if price < r.recommendation.min_price:
                st.error(f"Thấp hơn giá tối thiểu ${r.recommendation.min_price:.2f} → không đạt biên mục tiêu.")
            raw = st.text_area("HTML Description (có thể chỉnh)", lst.description_html, height=150, key=f"d_{r.product.asin}", on_change=oc)
            html_clean = sanitize_html(raw)  # chỉnh tay xong vẫn phải qua bộ lọc
            components.html(html_clean, height=420, scrolling=True)
            title = clean_title(title)
            if contains_sensitive(title + html_clean):
                st.error("Nội dung vẫn chứa từ nhạy cảm — đã được tự động loại khi export.")
            export_rows.append(ExportRow(r.product.asin, title, html_clean, price, r.product.brand,
                                         r.product.gtin, tuple(r.product.image_urls)))
            st.divider()
            publish_box(r, lst, title, html_clean, price, s)

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
# AUTO LISTING — ĐĂNG TRỰC TIẾP LÊN eBay
# ---------------------------------------------------------------------------
def keep_open(asin: str):
    """Callback: ghi nhớ sản phẩm đang chỉnh để expander không tự đóng sau mỗi lần Streamlit chạy lại."""
    return lambda: st.session_state.__setitem__("open_asin", asin)


def pub_config() -> PublisherConfig:
    """Cấu hình đăng bài sống trong session (nạp lần đầu từ config.json / .env)."""
    if "pub_cfg" not in st.session_state:
        st.session_state["pub_cfg"] = PublisherConfig.load()
    return st.session_state["pub_cfg"]


def get_publisher() -> EbayPublisher:
    """Giữ 1 publisher cho tới khi thông tin xác thực đổi (tái dùng token đã xin, đỡ gọi OAuth)."""
    cfg = pub_config()
    key = (cfg.environment, cfg.client_id, cfg.client_secret, cfg.refresh_token, cfg.user_token)
    if st.session_state.get("publisher_key") != key:
        st.session_state["publisher"] = EbayPublisher(cfg)
        st.session_state["publisher_key"] = key
    return st.session_state["publisher"]


def show_ebay_error(step: str, status: int, rows: list[dict]) -> None:
    st.error(f"❌ eBay từ chối ở bước **{STEP_LABELS.get(step, step)}**" + (f" (HTTP {status})" if status else ""))
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
    for hint in dict.fromkeys(r["Gợi ý sửa"] for r in rows):  # bỏ trùng, giữ thứ tự
        st.markdown(f"💡 {hint}")


def show_api_exception(exc: EbayApiError) -> None:
    show_ebay_error(exc.step, exc.status, PublishResult(False, "", step=exc.step, status=exc.status,
                                                        errors=exc.errors).error_rows())


def publish_box(r, lst, title: str, html_clean: str, price: float, s: SidebarState) -> None:
    """Khối "Đăng lên eBay ngay" cho một sản phẩm."""
    cfg, asin = pub_config(), r.product.asin
    env_badge = "🧪 SANDBOX" if cfg.environment == "sandbox" else "🔴 PRODUCTION"
    st.markdown(f"##### 🚀 Đăng trực tiếp lên eBay · `{env_badge}`")
    if not cfg.can_authenticate:
        st.info("Chưa kết nối tài khoản eBay → vào tab **🔌 Kết nối eBay**.")
        return
    pub = get_publisher()
    ss = st.session_state
    oc = keep_open(asin)

    # 1) Danh mục: gợi ý tự động từ tiêu đề (Taxonomy API) hoặc nhập tay
    c1, c2, c3 = st.columns([3, 1, 1])
    if c2.button("🔎 Gợi ý danh mục", key=f"sug_{asin}", on_click=oc):
        try:
            ss[f"sugs_{asin}"] = pub.suggest_categories(title)
        except EbayApiError as exc:
            show_api_exception(exc)
    sugs = ss.get(f"sugs_{asin}") or []
    if sugs:
        picked = c1.selectbox("Danh mục gợi ý", sugs, key=f"pick_{asin}", on_change=oc, format_func=lambda x: f"{x[1]}  ({x[0]})")
        category_id = picked[0]
    else:
        category_id = c1.text_input("Category ID (danh mục lá)", key=f"cat_{asin}", on_change=oc,
                                    placeholder="Bấm 'Gợi ý danh mục' hoặc nhập số ID")
    qty = c3.number_input("Số lượng", 1, 100, 2, key=f"q_{asin}", on_change=oc)

    # 2) Item specifics bắt buộc của danh mục
    if st.button("📋 Kiểm tra thông số bắt buộc", key=f"asp_{asin}", on_click=oc, disabled=not category_id):
        try:
            ss[f"req_{asin}"] = pub.required_aspects(category_id)
        except EbayApiError as exc:
            show_api_exception(exc)
    required = ss.get(f"req_{asin}")
    known = {k: v for k, v in lst.copy.specs.items() if k.lower() != "condition"}
    default_aspects = "\n".join([f"{k}: {v}" for k, v in known.items()]
                                 + [f"{a}: " for a in (required or []) if a not in known and a not in ("Brand", "MPN")])
    a1, a2 = st.columns(2)
    aspects_text = a1.text_area("Item specifics (mỗi dòng `Tên: giá trị1, giá trị2`)", default_aspects,
                                key=f"asptxt_{asin}_{len(required or [])}", on_change=oc, height=120)
    images_text = a2.text_area("URL ảnh HTTPS (mỗi dòng 1 ảnh — ảnh bạn có quyền dùng)", key=f"img_{asin}", on_change=oc, height=120)

    req = ListingRequest(
        sku=f"SKU-{asin}", title=title, description_html=html_clean, price=round(price, 2),
        category_id=str(category_id or "").strip(), quantity=int(qty), brand=r.product.brand, gtin=r.product.gtin,
        image_urls=[u.strip() for u in images_text.splitlines() if u.strip()],
        aspects=parse_aspects_text(aspects_text),
    )

    # 3) Điều kiện chặn đăng
    blockers = pub.validate(req, required)
    if r.vero.level == "block":
        blockers.insert(0, f"Thương hiệu VeRO ({r.vero.summary}) — không cho phép đăng.")
    if price < r.recommendation.min_price:
        blockers.insert(0, f"Giá ${price:.2f} thấp hơn giá tối thiểu ${r.recommendation.min_price:.2f}.")
    if cfg.environment == "production" and not ss.get("confirm_production"):
        blockers.append("Chưa tick xác nhận đăng lên Production (đầu tab).")
    if required is None:
        st.caption("💡 Nên bấm 'Kiểm tra thông số bắt buộc' trước để tránh bị eBay từ chối vì thiếu item specifics.")
    for b in blockers:
        st.warning(b)

    if st.button("🚀 Đăng lên eBay ngay", key=f"pub_{asin}", on_click=oc, type="primary", disabled=bool(blockers)):
        with st.spinner("Đang gửi lên eBay..."):
            ss[f"res_{asin}"] = pub.publish(req, required)
        if ss[f"res_{asin}"].success:
            save_published(r, req, ss[f"res_{asin}"], s)

    res: PublishResult | None = ss.get(f"res_{asin}")
    if res is None:
        return
    if res.success:
        st.success(f"✅ Đã đăng thành công! Listing ID **{res.listing_id}** → [{res.url}]({res.url}) · "
                   "đã lưu vào database, monitor sẽ theo dõi listing này (tab **📊 Đang bán & Monitor**).")
    else:
        show_ebay_error(res.step, res.status, res.error_rows())
    if res.warnings:
        st.warning("Cảnh báo từ eBay: " + "; ".join(f"{w.error_id}: {w.message}" for w in res.warnings))
    if res.log:
        st.caption(" · ".join(res.log))


def get_db() -> Database:
    """Database dùng chung với monitor.py (đổi vị trí bằng biến môi trường ARBITRAGE_DB)."""
    return Database(os.environ.get("ARBITRAGE_DB", DEFAULT_DB_PATH))


def save_published(r, req: ListingRequest, res: PublishResult, s: SidebarState) -> None:
    """Lưu listing vừa đăng + toàn bộ giả định tài chính để monitor tính lại biên sau này."""
    b, cfg = r.recommendation.breakdown, pub_config()
    fees = st.session_state.get("scan_fees") or s.fees
    target = st.session_state.get("scan_target") or s.target_margin
    cost = ProductCost(r.product.amazon_price, round(b.amazon_tax / b.amazon_price, 4) if b.amazon_price else 0.0,
                       b.shipping_cost, b.other_cost, r.buffer_rate)
    db = get_db()
    db.save(ListingRecord(
        sku=req.sku, asin=r.product.asin, environment=cfg.environment, ebay_item_id=res.listing_id,
        offer_id=res.offer_id, title=req.title, source=r.product.source,
        buy_price=r.product.amazon_price, current_buy_price=r.product.amazon_price,
        sell_price=req.price, min_price=r.recommendation.min_price, target_margin=target,
        current_margin=analyze_profit(req.price, cost, fees).net_margin,
        quantity=req.quantity, default_quantity=req.quantity,
        amazon_tax_rate=cost.amazon_sales_tax_rate, price_buffer_rate=cost.price_buffer_rate,
        shipping_cost=cost.shipping_cost, other_cost=cost.other_cost,
        fees_json=json.dumps(asdict(fees)), status=ACTIVE, in_stock=r.product.in_stock,
    ))
    db.log(req.sku, "published", f"Đăng listing {res.listing_id} giá ${req.price:.2f} × {req.quantity}")


def tab_monitor(s: SidebarState) -> None:
    st.subheader("📊 Listing đang bán & Monitor giá / tồn kho")
    db, cfg, ss = get_db(), pub_config(), st.session_state
    envs = ["sandbox", "production"]
    env = st.radio("Môi trường", envs, index=envs.index(cfg.environment), horizontal=True, key="mon_env")

    counts = db.counts(env)
    cols = st.columns(len(STATUS_LABELS))
    for col, (status, label) in zip(cols, STATUS_LABELS.items()):
        col.metric(label, counts.get(status, 0))

    records = db.all(environment=env)
    if not records:
        st.info("Chưa có listing nào. Đăng sản phẩm bằng nút **🚀 Đăng lên eBay ngay** ở tab Listing — "
                "listing đăng thành công sẽ tự động được lưu và theo dõi.")
        return

    item_url = "https://sandbox.ebay.com/itm/" if env == "sandbox" else "https://www.ebay.com/itm/"
    df = pd.DataFrame([{
        "SKU": r.sku, "ASIN": r.asin, "eBay": f"{item_url}{r.ebay_item_id}" if r.ebay_item_id else None,
        "Tiêu đề": r.title, "Trạng thái": STATUS_LABELS.get(r.status, r.status),
        "Giá mua gốc": r.buy_price, "Giá Amazon mới nhất": r.current_buy_price,
        "Δ giá Amazon %": None if r.current_buy_price is None else round((r.current_buy_price / r.buy_price - 1) * 100, 1),
        "Giá bán eBay": r.sell_price,
        "Biên hiện tại %": None if r.current_margin is None else round(r.current_margin * 100, 1),
        "Mục tiêu %": round(r.target_margin * 100), "SL": r.quantity,
        "Kiểm tra lần cuối": r.last_checked_at, "Ghi chú": r.note,
    } for r in records])
    money = st.column_config.NumberColumn(format="$%.2f")
    st.dataframe(df, hide_index=True, use_container_width=True, column_config={
        "eBay": st.column_config.LinkColumn(display_text="Mở listing"),
        "Giá mua gốc": money, "Giá Amazon mới nhất": money, "Giá bán eBay": money,
    })

    # -- Chạy monitor ngay ---------------------------------------------------------------
    st.markdown("#### ▶️ Kiểm tra giá & tồn kho Amazon")
    sources = [k for k, ok in settings.available_product_sources().items() if ok]
    c1, c2, c3, c4 = st.columns(4)
    source_name = c1.selectbox("Nguồn dữ liệu Amazon", sources, format_func=PRODUCT_SOURCE_LABELS.get,
                               help="'Dữ liệu giả lập' mô phỏng tăng giá / hết hàng ngẫu nhiên để thử tính năng.")
    dry_run = c2.toggle("Chạy thử (không sửa eBay)", value=True)
    max_inc = c3.slider("Tăng giá tối đa mỗi lần (%)", 5, 100, 25, 5,
                        help="Cần tăng nhiều hơn mức này → tạm dừng (SL 0) thay vì tăng giá sốc.")
    pause_err = c4.checkbox("Tạm dừng khi không lấy được dữ liệu", value=False)
    blockers = []
    if not dry_run and not cfg.can_authenticate:
        blockers.append("Chưa kết nối eBay (tab 🔌) — chỉ chạy thử được.")
    if not dry_run and env != cfg.environment:
        blockers.append(f"Cấu hình eBay đang ở '{cfg.environment}', khác môi trường đang xem '{env}'.")
    if not dry_run and env == "production":
        if not st.checkbox("⚠️ Tôi xác nhận cho phép monitor sửa giá/số lượng trên tài khoản eBay THẬT", key="mon_confirm"):
            blockers.append("Chưa tick xác nhận Production.")
    for b in blockers:
        st.warning(b)
    if st.button("▶️ Chạy kiểm tra ngay", type="primary", disabled=bool(blockers)):
        with st.spinner("Đang kiểm tra Amazon..."):
            try:
                ss["mon_report"] = run_once(
                    db, build_source(source_name), None if dry_run else get_publisher(),
                    MonitorSettings(dry_run=dry_run, max_increase_pct=max_inc / 100, pause_on_fetch_error=pause_err),
                    environment=env)
            except (SourceError, ValueError) as exc:
                st.error(f"Không chạy được monitor: {exc}")
        st.rerun()  # vẽ lại bảng phía trên với dữ liệu mới

    report = ss.get("mon_report")
    if report is not None:
        (st.info if report.dry_run else st.success)(report.summary())
        for e in report.fetch_errors:
            st.error(f"Lỗi nguồn dữ liệu: {e}")
        rows = report.rows()
        changed = [r for r in rows if r["Hành động"] != ACTION_LABELS["none"]]
        st.dataframe(pd.DataFrame(changed or rows), hide_index=True, use_container_width=True,
                     column_config={"Giá Amazon": money, "Giá mới": money})
        if report.dry_run and changed:
            st.caption("Tắt **Chạy thử** rồi chạy lại để áp dụng các thay đổi này lên eBay.")

    # -- Lịch sử & thao tác tay ---------------------------------------------------------------
    st.markdown("#### 🕘 Lịch sử & thao tác")
    sku = st.selectbox("Chọn SKU", [r.sku for r in records],
                       format_func=lambda k: f"{k} — {next(r.title for r in records if r.sku == k)[:60]}")
    rec = next(r for r in records if r.sku == sku)
    m1, m2 = st.columns(2)
    if rec.status != ENDED and m1.button("⚫ Ngừng theo dõi SKU này"):
        db.update(sku, status=ENDED)
        db.log(sku, "manual", "Ngừng theo dõi (listing trên eBay KHÔNG bị gỡ)")
        st.rerun()
    if rec.status not in MONITORED_STATUSES and m2.button("↩️ Theo dõi lại"):
        db.update(sku, status=ACTIVE if rec.quantity > 0 else PAUSED_OOS)
        db.log(sku, "manual", "Theo dõi lại")
        st.rerun()
    events = db.events(sku)
    if events:
        st.dataframe(pd.DataFrame(events)[["ts", "kind", "old_value", "new_value", "message"]].rename(columns={
            "ts": "Thời điểm (UTC)", "kind": "Loại", "old_value": "Cũ", "new_value": "Mới", "message": "Nội dung"}),
            hide_index=True, use_container_width=True)

    with st.expander("⏰ Chạy monitor tự động theo lịch"):
        st.markdown(
            "Giao diện chỉ chạy khi bạn bấm. Để canh giá **24/7**, chạy `monitor.py` ở một cửa sổ terminal riêng:\n\n"
            "```bash\npython monitor.py --once                 # chạy thử 1 vòng (không sửa eBay)\n"
            "python monitor.py --apply --interval 60 --source keepa   # chạy liên tục mỗi 60 phút\n```\n"
            "Hoặc dùng **Task Scheduler** (Windows) / **cron** (macOS/Linux) gọi `python monitor.py --once --apply` "
            "mỗi giờ. Monitor đọc token từ `config.json` và ghi nhật ký vào `monitor.log`.")


def tab_connection() -> None:
    st.subheader("🔌 Kết nối tài khoản eBay (Auto Listing qua Sell Inventory API)")
    cfg = pub_config()
    ss = st.session_state

    env = st.radio("Môi trường", ["sandbox", "production"], index=["sandbox", "production"].index(cfg.environment),
                   horizontal=True, format_func={"sandbox": "🧪 Sandbox (thử nghiệm — khuyến nghị trước)",
                                                 "production": "🔴 Production (tài khoản thật)"}.get)
    if env != cfg.environment:
        cfg.environment = env
        ss.pop("policies", None)
    st.caption("Sandbox và Production dùng **bộ key khác nhau** và tài khoản khác nhau.")

    st.markdown("##### 1. Application keys (developer.ebay.com → Application Keys)")
    k1, k2, k3 = st.columns(3)
    cfg.client_id = k1.text_input("App ID (Client ID)", cfg.client_id)
    cfg.client_secret = k2.text_input("Cert ID (Client Secret)", cfg.client_secret, type="password")
    cfg.ru_name = k3.text_input("RuName (eBay Redirect URL name)", cfg.ru_name,
                                help="User Tokens → Get a Token from eBay via Your Application → RuName.")

    st.markdown("##### 2. User token của tài khoản bán hàng")
    t_oauth, t_paste = st.tabs(["Cách A — Lấy qua tool (khuyến nghị)", "Cách B — Dán token có sẵn"])
    with t_oauth:
        if cfg.client_id and cfg.ru_name:
            st.markdown(f"① Mở [link cấp quyền eBay]({get_publisher().client.consent_url()}) → đăng nhập tài khoản "
                        "**bán hàng** → bấm **Agree**.\n\n② Trình duyệt chuyển tới trang 'accept URL' của bạn. "
                        "Copy **toàn bộ URL** trên thanh địa chỉ (có `code=...`) và dán vào ô dưới **trong vòng 5 phút**.")
            code = st.text_input("URL sau khi cấp quyền (hoặc chỉ mã code)")
            if st.button("🔑 Đổi lấy refresh token", disabled=not code):
                try:
                    data = get_publisher().client.exchange_code(code)
                    days = int(data.get("refresh_token_expires_in", 0)) // 86400
                    st.success(f"Đã nhận refresh token (hiệu lực ~{days} ngày). Bấm 'Lưu vào config.json' để giữ lại.")
                except EbayApiError as exc:
                    show_api_exception(exc)
        else:
            st.info("Điền App ID và RuName ở trên để tạo link cấp quyền.")
    with t_paste:
        st.caption("Dán xong nhấn **Enter** để tool ghi nhận.")
        cfg.refresh_token = st.text_input("Refresh token (sống ~18 tháng)", cfg.refresh_token, type="password")
        cfg.user_token = st.text_input("Hoặc User access token (sống 2 giờ)", cfg.user_token, type="password")

    st.markdown("##### 3. Kho hàng (Inventory Location)")
    l1, l2, l3 = st.columns(3)
    cfg.location_postal_code = l1.text_input("ZIP code kho/nơi gửi hàng", cfg.location_postal_code)
    cfg.location_country = l2.text_input("Quốc gia (mã 2 ký tự)", cfg.location_country)
    cfg.merchant_location_key = l3.text_input("Mã kho (merchantLocationKey)", cfg.merchant_location_key)

    st.markdown("##### 4. Business policies mặc định (Shipping / Payment / Return)")
    if st.button("📥 Tải chính sách từ tài khoản eBay"):
        if not cfg.can_authenticate:
            st.warning("Chưa có token. Dán refresh token / user token ở bước 2 rồi **nhấn Enter**.")
        else:
            try:
                ss["policies"] = get_publisher().get_policies()
            except EbayApiError as exc:
                show_api_exception(exc)
    policies = ss.get("policies")
    if policies is not None:
        if not any(policies.values()):
            st.warning("Tài khoản chưa có business policy nào (hoặc chưa bật Business Policies).")
            if st.button("Bật Business Policies cho tài khoản"):
                try:
                    get_publisher().opt_in_business_policies()
                    st.success("Đã gửi yêu cầu bật. Tạo policy trong Seller Hub → Account → Business policies rồi tải lại.")
                except EbayApiError as exc:
                    show_api_exception(exc)
        cols = st.columns(3)
        for col, kind, attr, label in ((cols[0], "fulfillment", "fulfillment_policy_id", "Shipping"),
                                       (cols[1], "payment", "payment_policy_id", "Payment"),
                                       (cols[2], "return", "return_policy_id", "Return")):
            opts = policies.get(kind) or []
            if not opts:
                col.error(f"Không có {label} policy")
                continue
            ids = [o[0] for o in opts]
            idx = ids.index(getattr(cfg, attr)) if getattr(cfg, attr) in ids else 0
            setattr(cfg, attr, col.selectbox(f"{label} policy", opts, index=idx,
                                             format_func=lambda o: f"{o[1]} ({o[0]})")[0])
    else:
        st.caption(f"Đang dùng ID: Shipping `{cfg.fulfillment_policy_id or '—'}` · Payment `{cfg.payment_policy_id or '—'}` "
                   f"· Return `{cfg.return_policy_id or '—'}`")

    st.divider()
    ok = {"Token": cfg.can_authenticate, "Kho hàng": bool(cfg.location_postal_code),
          "Policies": bool(cfg.fulfillment_policy_id and cfg.payment_policy_id and cfg.return_policy_id)}
    st.markdown("**Trạng thái:** " + " · ".join(f"{'✅' if v else '❌'} {k}" for k, v in ok.items()))
    if st.button("💾 Lưu vào config.json"):
        cfg.save()
        st.success("Đã lưu `config.json` (chứa bí mật — đã được .gitignore bỏ qua, đừng gửi file này cho ai).")


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main() -> None:
    st.title("💰 Amazon → eBay Profit Finder")
    s = sidebar()
    t1, t2, t3, t4, t5 = st.tabs(["🧮 Tính lợi nhuận", "🔎 Quét sản phẩm", "📝 Listing & Export",
                                  "📊 Đang bán & Monitor", "🔌 Kết nối eBay"])
    with t1:
        tab_calculator(s)
    with t2:
        tab_scanner(s)
    with t3:
        tab_listing(s)
    with t4:
        tab_monitor(s)
    with t5:
        tab_connection()


main()

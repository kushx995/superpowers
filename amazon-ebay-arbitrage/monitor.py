"""
monitor.py — Tự động canh giá & tồn kho Amazon cho các listing đang chạy trên eBay
==================================================================================

Mỗi vòng kiểm tra:

    database (listing đang quản lý) ──► Amazon: giá + tồn kho theo ASIN ──► decide() ──► eBay API
                                                                              │
                                              ghi lại mọi quyết định & kết quả vào bảng events

Quy tắc quyết định (hàm decide — thuần logic, không gọi API, dễ kiểm thử):

  ┌──────────────────────────────────────────────┬─────────────────────────────────────────────┐
  │ Tình huống                                   │ Hành động                                   │
  ├──────────────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Amazon HẾT HÀNG / không có giá               │ Số lượng eBay = 0  → PAUSED_OOS             │
  │ Biên tại giá hiện tại vẫn ≥ mục tiêu         │ Giữ nguyên (khôi phục số lượng nếu đang dừng)│
  │ Biên < mục tiêu, giá mới tăng ≤ giới hạn %   │ Tăng giá (đuôi .99) lên mức đạt biên        │
  │ Biên < mục tiêu, cần tăng giá quá giới hạn   │ Số lượng = 0 → PAUSED_UNPROFITABLE          │
  │ Không lấy được dữ liệu Amazon                │ Bỏ qua (hoặc tạm dừng nếu bật an toàn tối đa)│
  └──────────────────────────────────────────────┴─────────────────────────────────────────────┘

  • Có giới hạn tăng giá mỗi lần (mặc định 25%) để tránh một dữ liệu lỗi đẩy giá lên trời.
  • Monitor KHÔNG tự giảm giá khi Amazon rẻ đi — chỉ ghi chú cơ hội, bạn tự quyết.
  • Biên được tính lại bằng ĐÚNG tham số lúc đăng (thuế, buffer, ship, phí eBay) lưu trong database.

Chạy:
    python monitor.py --once                      # chạy thử 1 vòng, KHÔNG sửa eBay (dry-run)
    python monitor.py --once --apply              # chạy 1 vòng và cập nhật eBay thật
    python monitor.py --apply --interval 60       # chạy liên tục, mỗi 60 phút
    python monitor.py --apply --source keepa      # chọn nguồn dữ liệu Amazon

Lập lịch (thay cho --interval): Windows Task Scheduler / cron gọi `python monitor.py --once --apply`.
"""

from __future__ import annotations

import argparse
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from calculator import FeeSettings, ProductCost, analyze_profit, charm_price, min_price_for_margin
from database import (
    ACTIVE, ERROR, MONITORED_STATUSES, PAUSED_OOS, PAUSED_UNPROFITABLE, Database, ListingRecord, now_iso,
)
from sources import AmazonProduct, MockMonitorSource, ProductSource, SourceError

log = logging.getLogger("monitor")

# Hành động
NONE, REPRICE, PAUSE_OOS, PAUSE_UNPROFITABLE, RESTORE = "none", "reprice", "pause_oos", "pause_unprofitable", "restore"
ACTION_LABELS = {
    NONE: "✔ Giữ nguyên", REPRICE: "💲 Tăng giá", PAUSE_OOS: "📦 Hết hàng → SL 0",
    PAUSE_UNPROFITABLE: "📉 Không đủ lời → SL 0", RESTORE: "🔄 Mở bán lại",
}


@dataclass
class MonitorSettings:
    dry_run: bool = True                 # an toàn: mặc định chỉ báo cáo, không sửa eBay
    max_increase_pct: float = 0.25       # tăng giá tối đa mỗi lần (so với giá đang bán)
    restore_when_back: bool = True       # có hàng / đủ lời trở lại → khôi phục số lượng chuẩn
    pause_on_fetch_error: bool = False   # không lấy được dữ liệu Amazon → tạm dừng cho chắc
    batch_size: int = 50                 # số ASIN mỗi lần gọi nguồn dữ liệu


@dataclass
class Decision:
    sku: str
    action: str
    reason: str
    new_price: Optional[float] = None
    new_quantity: Optional[int] = None
    new_status: Optional[str] = None
    amazon_price: Optional[float] = None
    in_stock: Optional[bool] = None
    margin_now: Optional[float] = None     # biên tại giá ĐANG bán với giá Amazon MỚI
    margin_after: Optional[float] = None   # biên sau khi áp dụng hành động
    min_price: Optional[float] = None

    @property
    def changes_ebay(self) -> bool:
        return self.action != NONE


# ---------------------------------------------------------------------------
# 1. QUYẾT ĐỊNH (thuần logic)
# ---------------------------------------------------------------------------
def decide(rec: ListingRecord, product: Optional[AmazonProduct], settings: MonitorSettings) -> Decision:
    paused = rec.quantity == 0

    # --- Không có dữ liệu ---
    if product is None:
        if settings.pause_on_fetch_error and not paused:
            return Decision(rec.sku, PAUSE_OOS, "Không lấy được dữ liệu Amazon — tạm dừng để an toàn",
                            new_quantity=0, new_status=PAUSED_OOS)
        return Decision(rec.sku, NONE, "Không lấy được dữ liệu Amazon — bỏ qua lần này")

    # --- Hết hàng ---
    if not product.in_stock or not product.amazon_price:
        if paused:
            return Decision(rec.sku, NONE, "Amazon vẫn hết hàng (đang tạm dừng)", in_stock=False)
        return Decision(rec.sku, PAUSE_OOS, "Amazon hết hàng → đưa số lượng eBay về 0",
                        new_quantity=0, new_status=PAUSED_OOS, in_stock=False)

    fees = FeeSettings(**rec.fees) if rec.fees else FeeSettings()
    cost = ProductCost(product.amazon_price, rec.amazon_tax_rate, rec.shipping_cost, rec.other_cost,
                       rec.price_buffer_rate)
    margin_now = analyze_profit(rec.sell_price, cost, fees).net_margin
    min_price = min_price_for_margin(cost, fees, rec.target_margin)
    base = dict(amazon_price=product.amazon_price, in_stock=True, margin_now=margin_now,
                min_price=round(min_price, 2) if min_price else None)
    restore_qty = rec.default_quantity if (paused and settings.restore_when_back) else None
    change = f"Amazon {(product.amazon_price / rec.buy_price - 1):+.1%} so với lúc đăng"

    # --- Vẫn đủ lời ở giá hiện tại ---
    if margin_now >= rec.target_margin - 1e-9:
        if restore_qty:
            return Decision(rec.sku, RESTORE, f"Có hàng & đủ lời trở lại (biên {margin_now:.1%}) → mở bán lại",
                            new_quantity=restore_qty, new_status=ACTIVE, margin_after=margin_now, **base)
        note = ""
        if min_price and rec.sell_price > charm_price(min_price) * 1.10:
            note = f" · Có thể giảm giá xuống ~${charm_price(min_price):.2f} nếu muốn cạnh tranh hơn"
        return Decision(rec.sku, NONE, f"Đủ lời (biên {margin_now:.1%}, {change}){note}",
                        margin_after=margin_now, **base)

    # --- Không còn khả thi ở bất kỳ giá nào ---
    if min_price is None:
        if paused:
            return Decision(rec.sku, NONE, "Vẫn không thể đạt biên mục tiêu (đang tạm dừng)", **base)
        return Decision(rec.sku, PAUSE_UNPROFITABLE, "Phí đã vượt biên mục tiêu ở mọi mức giá → tạm dừng",
                        new_quantity=0, new_status=PAUSED_UNPROFITABLE, **base)

    # --- Cần tăng giá ---
    new_price = charm_price(min_price)
    ceiling = rec.sell_price * (1 + settings.max_increase_pct)
    if new_price > ceiling:
        if paused:
            return Decision(rec.sku, NONE, f"Vẫn cần tăng giá quá giới hạn (cần ${new_price:.2f}) — đang tạm dừng", **base)
        return Decision(rec.sku, PAUSE_UNPROFITABLE,
                        f"{change}: cần giá ${new_price:.2f} (> trần +{settings.max_increase_pct:.0%} "
                        f"= ${ceiling:.2f}) → tạm dừng thay vì tăng giá sốc",
                        new_quantity=0, new_status=PAUSED_UNPROFITABLE, **base)
    margin_after = analyze_profit(new_price, cost, fees).net_margin
    return Decision(rec.sku, REPRICE,
                    f"{change}: biên còn {margin_now:.1%} < {rec.target_margin:.0%} → "
                    f"tăng giá ${rec.sell_price:.2f} → ${new_price:.2f}" + (" và mở bán lại" if restore_qty else ""),
                    new_price=new_price, new_quantity=restore_qty, new_status=ACTIVE,
                    margin_after=margin_after, **base)


# ---------------------------------------------------------------------------
# 2. MỘT VÒNG KIỂM TRA
# ---------------------------------------------------------------------------
@dataclass
class MonitorReport:
    started_at: str
    dry_run: bool
    decisions: list[Decision] = field(default_factory=list)
    applied: dict[str, bool] = field(default_factory=dict)      # sku → cập nhật eBay thành công?
    errors: dict[str, str] = field(default_factory=dict)        # sku → thông điệp lỗi
    fetch_errors: list[str] = field(default_factory=list)

    def rows(self) -> list[dict]:
        out = []
        for d in self.decisions:
            if not d.changes_ebay:
                result = "—"
            elif self.dry_run:
                result = "🧪 Chạy thử (chưa gửi eBay)"
            else:
                result = "✅ Đã cập nhật eBay" if self.applied.get(d.sku) else f"❌ {self.errors.get(d.sku, 'Lỗi')}"
            out.append({
                "SKU": d.sku, "Hành động": ACTION_LABELS[d.action], "Lý do": d.reason,
                "Giá Amazon": d.amazon_price, "Giá mới": d.new_price, "SL mới": d.new_quantity,
                "Biên hiện tại %": None if d.margin_now is None else round(d.margin_now * 100, 1),
                "Biên sau %": None if d.margin_after is None else round(d.margin_after * 100, 1),
                "Kết quả": result,
            })
        return out

    def summary(self) -> str:
        changed = [d for d in self.decisions if d.changes_ebay]
        mode = "DRY-RUN" if self.dry_run else "APPLY"
        ok = sum(self.applied.values())
        return (f"[{mode}] Kiểm tra {len(self.decisions)} listing · {len(changed)} cần thay đổi"
                + ("" if self.dry_run else f" · {ok} cập nhật thành công · {len(self.errors)} lỗi")
                + (f" · {len(self.fetch_errors)} lỗi nguồn dữ liệu" if self.fetch_errors else ""))


def run_once(db: Database, source: ProductSource, publisher, settings: MonitorSettings,
             environment: Optional[str] = None) -> MonitorReport:
    """Kiểm tra toàn bộ listing đang theo dõi. `publisher` có thể là None khi dry-run."""
    report = MonitorReport(started_at=now_iso(), dry_run=settings.dry_run)
    records = db.all(statuses=MONITORED_STATUSES, environment=environment)
    if not records:
        return report

    # Nguồn giả lập cần biết giá gần nhất để mô phỏng biến động hợp lý.
    if isinstance(source, MockMonitorSource):
        source.price_hints.update({r.asin: r.current_buy_price or r.buy_price for r in records})

    # 1) Lấy dữ liệu Amazon theo lô
    products: dict[str, AmazonProduct] = {}
    asins = list(dict.fromkeys(r.asin for r in records))
    for i in range(0, len(asins), settings.batch_size):
        batch = asins[i:i + settings.batch_size]
        try:
            for p in source.get_products(batch):
                products[p.asin] = p
        except (SourceError, NotImplementedError) as exc:
            report.fetch_errors.append(str(exc)[:200])
            log.warning("Lỗi lấy dữ liệu Amazon cho %d ASIN: %s", len(batch), exc)

    # 2) Quyết định + ghi nhận kết quả kiểm tra
    for rec in records:
        product = products.get(rec.asin)
        d = decide(rec, product, settings)
        report.decisions.append(d)
        check = {"last_checked_at": now_iso()}
        if product is not None:
            check.update(current_buy_price=product.amazon_price, in_stock=product.in_stock)
        if d.margin_now is not None:
            check.update(current_margin=d.margin_now)
        if d.min_price is not None:
            check.update(min_price=d.min_price)
        db.update(rec.sku, **check)
        if d.changes_ebay and settings.dry_run:
            db.log(rec.sku, "dry_run", f"[Chạy thử] {d.reason}")

    # 3) Áp dụng lên eBay
    to_apply = [d for d in report.decisions if d.changes_ebay]
    if settings.dry_run or not to_apply:
        return report
    if publisher is None:
        raise ValueError("Cần publisher (cấu hình eBay) để chạy chế độ --apply")

    from ebay_publisher import PriceQtyUpdate  # import muộn: dry-run không cần cấu hình eBay

    by_sku = {r.sku: r for r in records}
    results = publisher.update_price_quantity([
        PriceQtyUpdate(d.sku, by_sku[d.sku].offer_id, d.new_price, d.new_quantity) for d in to_apply])
    for d in to_apply:
        rec, errors = by_sku[d.sku], results.get(d.sku, [])
        if errors:
            msg = "; ".join(f"{e.error_id or ''} {e.message}".strip() for e in errors)[:300]
            report.applied[d.sku], report.errors[d.sku] = False, msg
            # Không hạ được số lượng khi hết hàng/lỗ là rủi ro thật → đánh dấu ERROR để người xem ngay.
            critical = d.action in (PAUSE_OOS, PAUSE_UNPROFITABLE, REPRICE)
            db.update(d.sku, status=ERROR if critical else rec.status, note=msg)
            db.log(d.sku, "error", f"{ACTION_LABELS[d.action]} thất bại: {msg}")
            continue
        report.applied[d.sku] = True
        changes: dict = {"status": d.new_status or rec.status, "note": ""}
        if d.new_price is not None:
            changes["sell_price"] = d.new_price
            db.log(d.sku, "price", d.reason, rec.sell_price, d.new_price)
        if d.new_quantity is not None:
            changes["quantity"] = d.new_quantity
            db.log(d.sku, "quantity", d.reason, rec.quantity, d.new_quantity)
        if d.margin_after is not None:
            changes["current_margin"] = d.margin_after
        if changes["status"] != rec.status:
            db.log(d.sku, "status", "", rec.status, changes["status"])
        db.update(d.sku, **changes)
    return report


# ---------------------------------------------------------------------------
# 3. CHẠY TỪ DÒNG LỆNH
# ---------------------------------------------------------------------------
def build_source(name: str) -> ProductSource:
    if name == "mock":
        return MockMonitorSource()
    from scraper import get_product_source

    return get_product_source(name)


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Canh giá & tồn kho Amazon cho listing eBay đang chạy")
    ap.add_argument("--apply", action="store_true", help="Cập nhật eBay thật (mặc định chỉ chạy thử)")
    ap.add_argument("--once", action="store_true", help="Chạy 1 vòng rồi thoát")
    ap.add_argument("--interval", type=float, default=60, help="Số phút giữa các vòng (khi không có --once)")
    ap.add_argument("--source", default="keepa", choices=["keepa", "rainforest", "paapi", "mock"])
    ap.add_argument("--max-increase", type=float, default=25, help="%% tăng giá tối đa mỗi lần (mặc định 25)")
    ap.add_argument("--pause-on-fetch-error", action="store_true", help="Tạm dừng listing khi không lấy được dữ liệu")
    ap.add_argument("--db", default=None, help="Đường dẫn file SQLite (mặc định data/listings.db)")
    args = ap.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        handlers=[logging.StreamHandler(), logging.FileHandler("monitor.log", encoding="utf-8")])
    db = Database(args.db) if args.db else Database()
    settings = MonitorSettings(dry_run=not args.apply, max_increase_pct=args.max_increase / 100,
                               pause_on_fetch_error=args.pause_on_fetch_error)
    publisher, environment = None, None
    from ebay_publisher import EbayPublisher, PublisherConfig

    cfg = PublisherConfig.load()
    environment = cfg.environment  # chỉ kiểm tra listing của đúng môi trường đang cấu hình
    if args.apply:
        if not cfg.can_authenticate:
            log.error("Chưa có token eBay trong config.json — không thể chạy --apply")
            return 2
        publisher = EbayPublisher(cfg)
    source = build_source(args.source)
    log.info("Bắt đầu monitor · nguồn=%s · môi trường=%s · %s", args.source, environment,
             "CẬP NHẬT eBay" if args.apply else "CHẠY THỬ")

    while True:
        try:
            report = run_once(db, source, publisher, settings, environment)
            log.info(report.summary())
            for row in report.rows():
                if row["Hành động"] != ACTION_LABELS[NONE]:
                    log.info("  %s · %s · %s · %s", row["SKU"], row["Hành động"], row["Lý do"], row["Kết quả"])
        except Exception:  # vòng lặp dài hạn không được chết vì một lỗi bất ngờ
            log.exception("Vòng kiểm tra thất bại")
        if args.once:
            return 0
        time.sleep(max(1.0, args.interval) * 60)


if __name__ == "__main__":
    raise SystemExit(main())

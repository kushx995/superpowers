"""
database.py — Lưu listing đã đăng & lịch sử thay đổi (SQLite, không cần cài thêm gì)
====================================================================================

Hai bảng:

  listings  — MỖI DÒNG LÀ MỘT LISTING ĐANG QUẢN LÝ (khóa chính = SKU)
              • ASIN Amazon, eBay Item ID, offer ID, môi trường (sandbox/production)
              • giá mua gốc lúc đăng + giá Amazon lần kiểm tra gần nhất
              • giá bán hiện tại, số lượng hiện tại / số lượng chuẩn
              • tham số tài chính lúc đăng (thuế, buffer, ship, phí eBay) → monitor tính lại
                biên lợi nhuận bằng ĐÚNG giả định lúc đăng
              • trạng thái: ACTIVE | PAUSED_OOS | PAUSED_UNPROFITABLE | ERROR | ENDED

  events    — NHẬT KÝ: đăng bài, đổi giá, đổi số lượng, lỗi API, lần chạy thử (dry-run)...
              → luôn biết vì sao một listing bị đổi giá / tạm dừng.

Giao diện Streamlit và monitor.py có thể chạy CÙNG LÚC (2 tiến trình): bật chế độ WAL
và mở kết nối ngắn cho mỗi thao tác để tránh khóa database.
"""

from __future__ import annotations

import datetime as dt
import json
import sqlite3
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path
from typing import Iterator, Optional

DEFAULT_DB_PATH = Path(__file__).with_name("data") / "listings.db"

# Trạng thái listing
ACTIVE = "ACTIVE"                            # đang bán bình thường
PAUSED_OOS = "PAUSED_OOS"                    # Amazon hết hàng → số lượng eBay = 0
PAUSED_UNPROFITABLE = "PAUSED_UNPROFITABLE"  # không đạt biên dù tăng giá trong giới hạn → số lượng = 0
ERROR = "ERROR"                              # cập nhật eBay thất bại — cần người xem
ENDED = "ENDED"                              # ngừng theo dõi
STATUSES = (ACTIVE, PAUSED_OOS, PAUSED_UNPROFITABLE, ERROR, ENDED)
MONITORED_STATUSES = (ACTIVE, PAUSED_OOS, PAUSED_UNPROFITABLE, ERROR)

STATUS_LABELS = {
    ACTIVE: "🟢 Đang bán", PAUSED_OOS: "📦 Tạm dừng – hết hàng",
    PAUSED_UNPROFITABLE: "📉 Tạm dừng – không đủ lời", ERROR: "❗ Lỗi cập nhật", ENDED: "⚫ Ngừng theo dõi",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS listings (
    sku                TEXT PRIMARY KEY,
    asin               TEXT NOT NULL,
    environment        TEXT NOT NULL DEFAULT 'sandbox',
    ebay_item_id       TEXT NOT NULL DEFAULT '',
    offer_id           TEXT NOT NULL DEFAULT '',
    title              TEXT NOT NULL DEFAULT '',
    source             TEXT NOT NULL DEFAULT '',
    buy_price          REAL NOT NULL,              -- giá Amazon lúc đăng
    current_buy_price  REAL,                       -- giá Amazon lần kiểm tra gần nhất
    sell_price         REAL NOT NULL,              -- giá bán eBay hiện tại
    min_price          REAL,                       -- giá tối thiểu đạt biên (lần tính gần nhất)
    target_margin      REAL NOT NULL,
    current_margin     REAL,                       -- biên ròng tại giá hiện tại (lần kiểm tra gần nhất)
    quantity           INTEGER NOT NULL,           -- số lượng đang hiển thị trên eBay
    default_quantity   INTEGER NOT NULL,           -- số lượng khôi phục khi có hàng trở lại
    amazon_tax_rate    REAL NOT NULL DEFAULT 0,
    price_buffer_rate  REAL NOT NULL DEFAULT 0,
    shipping_cost      REAL NOT NULL DEFAULT 0,
    other_cost         REAL NOT NULL DEFAULT 0,
    fees_json          TEXT NOT NULL DEFAULT '{}', -- FeeSettings lúc đăng
    status             TEXT NOT NULL DEFAULT 'ACTIVE',
    in_stock           INTEGER,
    note               TEXT NOT NULL DEFAULT '',
    last_checked_at    TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status, environment);

CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    sku        TEXT NOT NULL,
    ts         TEXT NOT NULL,
    kind       TEXT NOT NULL,   -- published | price | quantity | status | check | dry_run | error | manual
    old_value  TEXT,
    new_value  TEXT,
    message    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_events_sku ON events(sku, ts);
"""


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


@dataclass
class ListingRecord:
    sku: str
    asin: str
    buy_price: float
    sell_price: float
    target_margin: float
    quantity: int
    default_quantity: int
    environment: str = "sandbox"
    ebay_item_id: str = ""
    offer_id: str = ""
    title: str = ""
    source: str = ""
    current_buy_price: Optional[float] = None
    min_price: Optional[float] = None
    current_margin: Optional[float] = None
    amazon_tax_rate: float = 0.0
    price_buffer_rate: float = 0.0
    shipping_cost: float = 0.0
    other_cost: float = 0.0
    fees_json: str = "{}"
    status: str = ACTIVE
    in_stock: Optional[bool] = None
    note: str = ""
    last_checked_at: Optional[str] = None
    created_at: str = field(default_factory=now_iso)
    updated_at: str = field(default_factory=now_iso)

    @property
    def fees(self) -> dict:
        return json.loads(self.fees_json or "{}")

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "ListingRecord":
        data = dict(row)
        if data.get("in_stock") is not None:
            data["in_stock"] = bool(data["in_stock"])
        return cls(**data)


_COLUMNS = [f.name for f in fields(ListingRecord)]


class Database:
    def __init__(self, path: Path | str = DEFAULT_DB_PATH):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as c:
            c.execute("PRAGMA journal_mode=WAL")  # cho phép UI và monitor đọc/ghi song song
            c.executescript(SCHEMA)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=30)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    # -- Listings ---------------------------------------------------------------------
    def save(self, rec: ListingRecord) -> None:
        """Thêm mới hoặc ghi đè listing theo SKU (giữ nguyên created_at của bản cũ)."""
        rec.updated_at = now_iso()
        data = asdict(rec)
        cols = ", ".join(_COLUMNS)
        marks = ", ".join(f":{c}" for c in _COLUMNS)
        updates = ", ".join(f"{c}=excluded.{c}" for c in _COLUMNS if c not in ("sku", "created_at"))
        with self._conn() as c:
            c.execute(f"INSERT INTO listings ({cols}) VALUES ({marks}) "
                      f"ON CONFLICT(sku) DO UPDATE SET {updates}", data)

    def get(self, sku: str) -> Optional[ListingRecord]:
        with self._conn() as c:
            row = c.execute("SELECT * FROM listings WHERE sku = ?", (sku,)).fetchone()
        return ListingRecord.from_row(row) if row else None

    def all(self, statuses: Optional[tuple[str, ...]] = None, environment: Optional[str] = None) -> list[ListingRecord]:
        sql, params = "SELECT * FROM listings WHERE 1=1", []
        if statuses:
            sql += f" AND status IN ({','.join('?' * len(statuses))})"
            params += list(statuses)
        if environment:
            sql += " AND environment = ?"
            params.append(environment)
        with self._conn() as c:
            rows = c.execute(sql + " ORDER BY updated_at DESC", params).fetchall()
        return [ListingRecord.from_row(r) for r in rows]

    def update(self, sku: str, **values) -> None:
        """Cập nhật một số cột của listing."""
        bad = set(values) - set(_COLUMNS)
        if bad:
            raise ValueError(f"Cột không hợp lệ: {bad}")
        if "status" in values and values["status"] not in STATUSES:
            raise ValueError(f"Trạng thái không hợp lệ: {values['status']}")
        values["updated_at"] = now_iso()
        assignments = ", ".join(f"{k} = :{k}" for k in values)
        with self._conn() as c:
            c.execute(f"UPDATE listings SET {assignments} WHERE sku = :sku", {**values, "sku": sku})

    def counts(self, environment: Optional[str] = None) -> dict[str, int]:
        sql = "SELECT status, COUNT(*) FROM listings" + (" WHERE environment = ?" if environment else "") + " GROUP BY status"
        with self._conn() as c:
            rows = c.execute(sql, (environment,) if environment else ()).fetchall()
        return {status: n for status, n in rows}

    # -- Events -----------------------------------------------------------------------
    def log(self, sku: str, kind: str, message: str = "", old=None, new=None) -> None:
        with self._conn() as c:
            c.execute("INSERT INTO events (sku, ts, kind, old_value, new_value, message) VALUES (?, ?, ?, ?, ?, ?)",
                      (sku, now_iso(), kind, None if old is None else str(old), None if new is None else str(new), message))

    def events(self, sku: Optional[str] = None, limit: int = 200) -> list[dict]:
        sql = "SELECT * FROM events" + (" WHERE sku = ?" if sku else "") + " ORDER BY id DESC LIMIT ?"
        with self._conn() as c:
            rows = c.execute(sql, ((sku, limit) if sku else (limit,))).fetchall()
        return [dict(r) for r in rows]

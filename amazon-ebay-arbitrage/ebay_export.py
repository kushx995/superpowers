"""
ebay_export.py — Xuất CSV để đăng hàng loạt lên eBay (Seller Hub Reports / File Exchange)
=========================================================================================

Định dạng theo mẫu "File Exchange" mà Seller Hub Reports chấp nhận:
  • Cột đầu tiên chứa "Action" kèm tham số site: *Action(SiteID=US|Country=US|Currency=USD|Version=1193)
  • Cột có dấu * là bắt buộc.
  • Item specifics dùng tiền tố "C:" (vd C:Brand), mã sản phẩm dùng "Product:UPC".

⚠️ eBay thay đổi template theo thời gian và theo DANH MỤC (item specifics bắt buộc khác
   nhau). Cách an toàn nhất: vào Seller Hub → Reports → Uploads → tải template của
   danh mục bạn bán, so tiêu đề cột với COLUMNS bên dưới và chỉnh nếu cần.
   Luôn upload thử 1–2 dòng trước khi upload cả file.

Gợi ý vận hành:
  • Dùng Business Policies (Shipping / Return / Payment profile) đã tạo sẵn trong
    tài khoản → chỉ cần điền TÊN profile, khỏi khai từng dòng.
  • CustomLabel (SKU) là mã nội bộ, người mua không thấy — dùng để đối chiếu đơn với nguồn hàng.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from typing import Iterable, Optional

ACTION_HEADER = "*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)"

COLUMNS = [
    ACTION_HEADER,
    "CustomLabel",
    "*Category",
    "*Title",
    "*ConditionID",
    "*C:Brand",
    "C:MPN",
    "Product:UPC",
    "Product:EAN",
    "PicURL",
    "*Description",
    "*Format",
    "*Duration",
    "*StartPrice",
    "*Quantity",
    "*Location",
    "DispatchTimeMax",
    "ShippingProfileName",
    "ReturnProfileName",
    "PaymentProfileName",
]

CONDITION_NEW = "1000"


@dataclass
class ExportSettings:
    """Thiết lập chung cho cả file upload."""

    category_id: str                 # ID danh mục eBay (tra trong Seller Hub khi tạo listing)
    location: str = "United States"  # Có thể là mã ZIP kho của bạn
    quantity: int = 1                # Dropship nên để thấp để giảm rủi ro hết hàng nguồn
    dispatch_days: int = 3           # Thời gian xử lý đơn (handling time)
    shipping_profile: str = ""
    return_profile: str = ""
    payment_profile: str = ""
    include_source_images: bool = False  # Mặc định TẮT: ảnh từ Amazon thường có bản quyền
    sku_prefix: str = "SKU"


@dataclass
class ExportRow:
    """Một sản phẩm "thắng" đã sẵn sàng đăng."""

    sku_ref: str                     # Mã tham chiếu nguồn (vd ASIN) — sẽ được gắn prefix
    title: str
    description_html: str
    price: float
    brand: str = ""
    gtin: str = ""
    image_urls: tuple[str, ...] = ()
    category_id: Optional[str] = None  # Ghi đè danh mục chung nếu cần


def _gtin_columns(gtin: str) -> tuple[str, str]:
    digits = re.sub(r"\D", "", gtin or "")
    if len(digits) == 12:
        return digits, ""
    if len(digits) == 13:
        return "", digits
    return "Does not apply", ""


def _one_line(text: str) -> str:
    """eBay đọc mô tả trên một dòng CSV ổn định hơn — gộp xuống dòng thành khoảng trắng."""
    return re.sub(r"\s*\n\s*", " ", text or "").strip()


def build_rows(rows: Iterable[ExportRow], cfg: ExportSettings) -> list[dict[str, str]]:
    out = []
    for r in rows:
        if not 0 < len(r.title) <= 80:
            raise ValueError(f"Tiêu đề không hợp lệ (1–80 ký tự): {r.title!r}")
        if r.price <= 0:
            raise ValueError(f"Giá không hợp lệ cho {r.sku_ref}")
        upc, ean = _gtin_columns(r.gtin)
        brand = r.brand.strip() if r.brand and r.brand.strip().lower() not in ("generic",) else "Unbranded"
        out.append({
            ACTION_HEADER: "Add",
            "CustomLabel": f"{cfg.sku_prefix}-{r.sku_ref}",
            "*Category": r.category_id or cfg.category_id,
            "*Title": r.title,
            "*ConditionID": CONDITION_NEW,
            "*C:Brand": brand,
            "C:MPN": "Does not apply",
            "Product:UPC": upc,
            "Product:EAN": ean,
            "PicURL": "|".join(r.image_urls[:12]) if cfg.include_source_images else "",
            "*Description": _one_line(r.description_html),
            "*Format": "FixedPrice",
            "*Duration": "GTC",
            "*StartPrice": f"{r.price:.2f}",
            "*Quantity": str(cfg.quantity),
            "*Location": cfg.location,
            "DispatchTimeMax": str(cfg.dispatch_days),
            "ShippingProfileName": cfg.shipping_profile,
            "ReturnProfileName": cfg.return_profile,
            "PaymentProfileName": cfg.payment_profile,
        })
    return out


def to_csv(rows: Iterable[ExportRow], cfg: ExportSettings) -> bytes:
    """Trả về nội dung file CSV (UTF-8, không BOM — BOM làm hỏng cột *Action)."""
    if not cfg.category_id.strip():
        raise ValueError("Cần nhập ID danh mục eBay (*Category)")
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=COLUMNS, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writeheader()
    writer.writerows(build_rows(rows, cfg))
    return buf.getvalue().encode("utf-8")

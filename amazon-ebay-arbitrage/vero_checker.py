"""
vero_checker.py — Rà soát thương hiệu VeRO (Verified Rights Owner) trước khi đăng bán
======================================================================================

Chủ sở hữu quyền tham gia chương trình VeRO có thể yêu cầu eBay gỡ listing. Bị báo
cáo nhiều lần → tài khoản bị hạ hạng, giới hạn bán hoặc khóa. Module này rà soát
TRƯỚC khi đăng để loại bỏ / đánh dấu sản phẩm rủi ro.

Cách hoạt động:
  1. Đọc danh sách thương hiệu từ `data/vero_brands.csv` (+ danh sách bạn tự thêm).
  2. Chuẩn hóa chữ (bỏ dấu ™®©, chữ thường, bỏ dấu tiếng nước ngoài).
  3. So khớp NGUYÊN TỪ (word boundary) để tránh khớp nhầm ("Nike" ≠ "Nikella").
  4. Áp mức xử lý riêng cho 2 trường hợp:
       • brand_level — trường THƯƠNG HIỆU của sản phẩm khớp → độ tin cậy cao
       • title_level — chỉ xuất hiện trong tiêu đề/bullet  → dễ khớp nhầm hơn
     (vd "Apple": brand khớp → block; chỉ có trong tiêu đề "apple slicer" → warn)

⚠️ Không có API công khai cho danh sách VeRO đầy đủ. Danh sách đi kèm chỉ là điểm
   khởi đầu — bạn PHẢI tự bổ sung và kiểm tra lại thường xuyên.
"""

from __future__ import annotations

import csv
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional

LEVELS = ("safe", "ignore", "warn", "block")  # thứ tự tăng dần mức độ nghiêm trọng
DEFAULT_LIST = Path(__file__).with_name("data") / "vero_brands.csv"


def normalize(text: str) -> str:
    """Chuẩn hóa để so khớp: bỏ ™®©, bỏ dấu, chữ thường, gộp khoảng trắng."""
    text = re.sub(r"[™®©]", " ", text or "")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().replace("&", " and ").replace("-", " ")
    return re.sub(r"\s+", " ", text).strip()


@dataclass
class VeroRule:
    brand: str
    terms: list[str]          # brand + aliases (đã chuẩn hóa)
    brand_level: str = "block"
    title_level: str = "warn"
    note: str = ""

    def __post_init__(self) -> None:
        self._patterns = [re.compile(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])") for t in self.terms if t]

    def match(self, normalized_text: str) -> Optional[str]:
        for term, pat in zip(self.terms, self._patterns):
            if pat.search(normalized_text):
                return term
        return None


@dataclass
class VeroMatch:
    brand: str
    term: str
    where: str      # "brand" | "title" | "bullets"
    level: str


@dataclass
class VeroResult:
    level: str = "safe"                      # safe | warn | block
    matches: list[VeroMatch] = field(default_factory=list)

    @property
    def label(self) -> str:
        return {"safe": "✅ An toàn", "warn": "⚠️ Cần kiểm tra", "block": "⛔ VeRO"}.get(self.level, self.level)

    @property
    def summary(self) -> str:
        return ", ".join(f"{m.brand} ({m.where})" for m in self.matches)


class VeroChecker:
    def __init__(self, rules: Iterable[VeroRule]):
        self.rules = list(rules)

    # -- Nạp danh sách ----------------------------------------------------------
    @classmethod
    def from_csv(cls, path: Path = DEFAULT_LIST, extra_brands: Iterable[str] = ()) -> "VeroChecker":
        rules: list[VeroRule] = []
        with open(path, encoding="utf-8") as f:
            lines = [ln for ln in f if ln.strip() and not ln.lstrip().startswith("#")]
        for row in csv.DictReader(lines):
            terms = [row["brand"], *(row.get("aliases") or "").split("|")]
            rules.append(VeroRule(
                brand=row["brand"].strip(),
                terms=[normalize(t) for t in terms if t.strip()],
                brand_level=(row.get("brand_level") or "block").strip(),
                title_level=(row.get("title_level") or "warn").strip(),
                note=(row.get("note") or "").strip(),
            ))
        # Thương hiệu người dùng tự thêm trong giao diện → luôn chặn ở mọi nơi.
        for b in extra_brands:
            if b.strip():
                rules.append(VeroRule(brand=b.strip(), terms=[normalize(b)], brand_level="block", title_level="block"))
        return cls(rules)

    # -- Kiểm tra ---------------------------------------------------------------
    def check(self, title: str, brand: str = "", bullets: Iterable[str] = ()) -> VeroResult:
        result = VeroResult()
        fields = {
            "brand": normalize(brand),
            "title": normalize(title),
            "bullets": normalize(" ".join(bullets)),
        }
        for rule in self.rules:
            for where, text in fields.items():
                if not text:
                    continue
                term = rule.match(text)
                if term:
                    level = rule.brand_level if where == "brand" else rule.title_level
                    if level != "ignore":
                        result.matches.append(VeroMatch(rule.brand, term, where, level))
                    break  # mỗi thương hiệu chỉ ghi nhận 1 lần (ưu tiên trường brand)
        if result.matches:
            result.level = max((m.level for m in result.matches), key=LEVELS.index)
        return result

    def check_product(self, product) -> VeroResult:
        """Tiện ích cho AmazonProduct."""
        return self.check(product.title, product.brand, product.bullet_points)

"""
listing_generator.py — Tạo Title SEO & HTML Description chuẩn eBay (có AI)
=========================================================================

Quy trình 3 lớp bảo vệ (không tin tưởng tuyệt đối vào AI):

  1. LÀM SẠCH ĐẦU VÀO   : xóa thuật ngữ Amazon khỏi dữ liệu nguồn TRƯỚC khi gửi cho AI.
  2. AI VIẾT NỘI DUNG   : Claude trả về JSON có cấu trúc (title, intro, features, specs).
                          Không có API key / lỗi / bị từ chối → dùng bộ sinh theo quy tắc.
  3. KIỂM TRA ĐẦU RA    : làm sạch lại toàn bộ chữ, ép tiêu đề ≤ 80 ký tự, dựng HTML từ
                          template cố định rồi chạy qua bộ lọc HTML "danh sách trắng".

Vì sao phải xóa dấu vết Amazon?
  • Người mua thấy "Amazon" → biết bạn là trung gian → mất niềm tin / mua thẳng Amazon.
  • eBay cấm link ra ngoài, thông tin liên hệ, nội dung "active" (JavaScript...).
"""

from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Optional

EBAY_TITLE_MAX = 80

# ---------------------------------------------------------------------------
# 1. LÀM SẠCH THUẬT NGỮ NHẠY CẢM
# ---------------------------------------------------------------------------
# Thứ tự quan trọng: cụm dài trước, từ đơn sau.
SENSITIVE_PATTERNS: list[str] = [
    r"(?:ships|sold|dispatched)\s+(?:from|by)\s+amazon(?:\.com)?",
    r"fulfill?ed\s+by\s+amazon",
    r"amazon(?:'s)?\s+choice",
    r"amazon\s+(?:prime|basics?|packaging|exclusive|brand|warehouse|renewed|fresh|smile)",
    r"frustration[\s-]*free\s+packaging",
    r"subscribe\s*(?:&|and)\s*save",
    r"prime\s+(?:eligible|shipping|delivery|day|member(?:s|ship)?)",
    r"free\s+(?:2|two)[\s-]*day\s+shipping",
    r"#?\s*1\s+best[\s-]*sell(?:er|ing)",
    r"best[\s-]*sellers?\s+rank(?:ing)?",
    r"\bASIN\b\s*:?\s*[A-Z0-9]{10}",
    r"\bASIN\b",
    r"\bFBA\b",
    # eBay cấm link ngoài & thông tin liên hệ trong listing (đặt trước "amazon" để xóa trọn URL)
    r"https?://\S+",
    r"\bwww\.\S+",
    r"[\w.+-]+@[\w-]+\.[\w.]+",
    r"\b[\w-]+\.(?:com|net|org|co|io|us)(?:/\S*)?",
    r"\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b",
    r"\bamazon\b",
]
_SENSITIVE_RE = [re.compile(p, re.IGNORECASE) for p in SENSITIVE_PATTERNS]

# Ranh giới "đoạn": hết câu, dấu phẩy, gạch nối/sổ đứng có khoảng trắng hai bên.
_SEGMENT_SPLIT = re.compile(r"((?:[.!?;,]|\s[-–|])\s+)")
# Tiêu đề không phải văn xuôi: chỉ tách ở dấu phẩy và gạch/sổ đứng.
_TITLE_SPLIT = re.compile(r"((?:,|\s[-–|])\s+)")


def _has_sensitive(text: str) -> bool:
    return any(p.search(text) for p in _SENSITIVE_RE)


def _remove_terms(text: str) -> str:
    for pat in _SENSITIVE_RE:
        text = pat.sub(" ", text)
    return text


def scrub_text(text: str, mode: str = "prose") -> str:
    """Xóa nội dung nhạy cảm (Amazon, link, liên hệ) mà KHÔNG để lại câu cụt.

    mode="prose" (mô tả, bullet): bỏ NGUYÊN câu/đoạn chứa từ nhạy cảm
      "Ships in Amazon packaging; Fulfilled by Amazon"          → "" (bỏ cả bullet)
      "Great mat. Visit amazon.com/shops for more."             → "Great mat."
    mode="title": đoạn ĐẦU là tên sản phẩm → chỉ xóa từ; các đoạn phụ phía sau → bỏ nguyên đoạn
      "Mat Set, 6 Pack - Amazon Basics Quality, Prime Shipping" → "Mat Set, 6 Pack"
      "Amazon Basics Silicone Baking Mat"                       → "Silicone Baking Mat"
    Văn bản chỉ có MỘT đoạn luôn được xử lý bằng cách xóa từng từ.
    """
    text = text or ""
    parts = (_TITLE_SPLIT if mode == "title" else _SEGMENT_SPLIT).split(text)
    segments, delimiters = parts[0::2], parts[1::2] + [""]
    if len(segments) == 1:
        kept = _remove_terms(text)
    else:
        kept = "".join(
            (_remove_terms(seg) if (mode == "title" and i == 0) else seg) + d
            for i, (seg, d) in enumerate(zip(segments, delimiters))
            if (mode == "title" and i == 0) or not _has_sensitive(seg)
        )
    kept = _remove_terms(kept)      # lưới an toàn cuối cùng
    kept = re.sub(r"\(\s*\)|\[\s*\]", " ", kept)                # ngoặc rỗng còn sót
    kept = re.sub(r"\s+([,.;:!?])", r"\1", kept)                # khoảng trắng trước dấu câu
    kept = re.sub(r"([,;:\-–|/])\s*(?=[,;:\-–|/.]|$)", "", kept)  # dấu nối mồ côi
    return re.sub(r"\s{2,}", " ", kept).strip(" ,;:-–|/")


def contains_sensitive(text: str) -> list[str]:
    """Trả về các đoạn nhạy cảm còn sót (dùng cho kiểm thử & cảnh báo)."""
    return [m.group(0) for pat in _SENSITIVE_RE for m in pat.finditer(text or "")]


# ---------------------------------------------------------------------------
# 2. TIÊU ĐỀ CHUẨN eBay
# ---------------------------------------------------------------------------
_TITLE_JUNK = re.compile(r"[!*~^#@$%{}<>\"`]|l\s*@\s*@\s*k|\bwow\b", re.IGNORECASE)
# Được phép viết HOA: từ ≤ 3 ký tự (USB, LED, XL), từ có chữ số (4K, USB-C3), và các viết tắt dài quen thuộc.
_KNOWN_ACRONYMS = {"HDMI", "OLED", "QLED", "HEPA", "NEMA", "RGBW", "ANSI", "IPX7", "IPX8", "NSFW"}


def _keep_upper(word: str) -> bool:
    core = word.strip(",.;:()")
    return len(core) <= 3 or any(c.isdigit() for c in core) or core in _KNOWN_ACRONYMS


def clean_title(title: str, max_len: int = EBAY_TITLE_MAX) -> str:
    """Chuẩn hóa tiêu đề theo thực tiễn SEO của eBay.

    - Xóa thuật ngữ Amazon & ký tự spam (!, *, L@@K...)
    - Không viết HOA cả từ dài (eBay coi là spam), trừ từ viết tắt ≤ 4 ký tự
    - Bỏ từ lặp lại liên tiếp, gộp khoảng trắng
    - Cắt ≤ 80 ký tự tại ranh giới từ, không để dấu câu treo ở cuối
    """
    t = _TITLE_JUNK.sub(" ", title or "")
    t = scrub_text(t, mode="title")
    words: list[str] = []
    for w in t.split():
        if w.isupper() and not _keep_upper(w):
            w = w.capitalize()
        if words and w.lower() == words[-1].lower():
            continue
        words.append(w)
    t = " ".join(words)
    if len(t) > max_len:
        t = t[: max_len + 1].rsplit(" ", 1)[0]
    return t.strip(" ,;:-–|/&")[:max_len]


# ---------------------------------------------------------------------------
# 3. BỘ LỌC HTML "DANH SÁCH TRẮNG"
# ---------------------------------------------------------------------------
ALLOWED_TAGS = {
    "div", "p", "br", "span", "strong", "b", "em", "i", "u", "h2", "h3", "h4",
    "ul", "ol", "li", "table", "thead", "tbody", "tr", "td", "th", "hr",
}
VOID_TAGS = {"br", "hr"}
DROP_WITH_CONTENT = {"script", "style", "iframe", "object", "embed", "form", "noscript", "svg", "template"}
_BAD_CSS = re.compile(r"url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:", re.IGNORECASE)


class _Sanitizer(HTMLParser):
    """Chỉ giữ thẻ trong ALLOWED_TAGS, chỉ giữ thuộc tính `style` an toàn.

    • Thẻ nguy hiểm (script, iframe...) bị xóa CẢ nội dung bên trong.
    • Thẻ không cho phép khác (a, img, font...) bị bỏ thẻ nhưng GIỮ chữ bên trong.
    • Mọi đoạn chữ đều được escape lại và lọc thuật ngữ nhạy cảm.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in DROP_WITH_CONTENT:
            self.skip_depth += 1
            return
        if self.skip_depth or tag not in ALLOWED_TAGS:
            return
        safe = ""
        style = dict(attrs).get("style")
        if style and not _BAD_CSS.search(style):
            safe = f' style="{html.escape(style, quote=True)}"'
        self.out.append(f"<{tag}{safe}>" if tag not in VOID_TAGS else f"<{tag}>")

    def handle_startendtag(self, tag, attrs):
        if not self.skip_depth and tag in VOID_TAGS:
            self.out.append(f"<{tag}>")

    def handle_endtag(self, tag):
        if tag in DROP_WITH_CONTENT:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if not self.skip_depth and tag in ALLOWED_TAGS and tag not in VOID_TAGS:
            self.out.append(f"</{tag}>")

    def handle_data(self, data):
        if not self.skip_depth:
            cleaned = scrub_text(data) if data.strip() else data
            # giữ khoảng trắng đầu/cuối để chữ giữa các thẻ không dính vào nhau
            lead = " " if data[:1].isspace() and cleaned else ""
            trail = " " if data[-1:].isspace() and cleaned else ""
            self.out.append(lead + html.escape(cleaned, quote=False) + trail)


def sanitize_html(raw: str) -> str:
    parser = _Sanitizer()
    parser.feed(raw or "")
    parser.close()
    return re.sub(r"\s{2,}", " ", "".join(parser.out)).strip()


# ---------------------------------------------------------------------------
# 4. DỮ LIỆU LISTING & TEMPLATE HTML
# ---------------------------------------------------------------------------
@dataclass
class ListingCopy:
    """Nội dung chữ của listing (do AI hoặc quy tắc tạo ra)."""

    title: str
    intro: str
    features: list[str]
    specs: dict[str, str] = field(default_factory=dict)
    keywords: list[str] = field(default_factory=list)
    generated_by: str = "rules"   # "ai:<model>" | "rules" | "rules (AI lỗi: ...)"


@dataclass
class Listing:
    title: str
    description_html: str
    copy: ListingCopy
    warnings: list[str] = field(default_factory=list)


def render_description(copy: ListingCopy, shipping_note: str, returns_note: str) -> str:
    """Dựng HTML mô tả từ template cố định (CSS inline — eBay hiển thị ổn trên mobile)."""
    e = lambda s: html.escape(s, quote=False)  # noqa: E731
    features = "".join(f'<li style="margin:6px 0">{e(f)}</li>' for f in copy.features)
    specs = "".join(
        f'<tr><th style="text-align:left;padding:6px 10px;background:#f5f5f5;border:1px solid #e5e5e5">{e(k)}</th>'
        f'<td style="padding:6px 10px;border:1px solid #e5e5e5">{e(v)}</td></tr>'
        for k, v in copy.specs.items() if v
    )
    raw = f"""
<div style="font-family:Arial,Helvetica,sans-serif;max-width:900px;margin:0 auto;color:#222;line-height:1.55;font-size:15px">
  <h2 style="font-size:22px;margin:0 0 12px">{e(copy.title)}</h2>
  <p>{e(copy.intro)}</p>
  <h3 style="font-size:18px;margin:20px 0 8px">Key Features</h3>
  <ul style="padding-left:20px">{features}</ul>
  {'<h3 style="font-size:18px;margin:20px 0 8px">Specifications</h3><table style="border-collapse:collapse;width:100%">' + specs + '</table>' if specs else ''}
  <h3 style="font-size:18px;margin:20px 0 8px">Shipping</h3>
  <p>{e(shipping_note)}</p>
  <h3 style="font-size:18px;margin:20px 0 8px">Returns</h3>
  <p>{e(returns_note)}</p>
</div>"""
    return sanitize_html(raw)


# ---------------------------------------------------------------------------
# 5. BỘ SINH NỘI DUNG
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You write eBay.com (US) product listings that rank in eBay search (Cassini) and convert.

Title rules (hard limit 80 characters):
- Front-load what a buyer types: product type + key attributes (material, size, quantity, color, compatibility).
- Include the brand only if it is given and is not "Generic"/"Unbranded".
- No promotional fluff (best, amazing, hot, L@@K), no ALL-CAPS words except short acronyms, no punctuation spam, no repeated words.

Description rules:
- intro: 2-3 plain sentences on the benefit to the buyer. Factual, no hype, no guarantees you cannot verify.
- features: 4-7 concise bullet points rewritten in your own words from the source facts. Never invent specs.
- specs: only attributes explicitly present in the source data.

Never mention Amazon, Prime, FBA, ASIN, Best Seller rank, other marketplaces, URLs, emails or phone numbers. Write in English."""

LISTING_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "eBay title, at most 80 characters"},
        "intro": {"type": "string"},
        "features": {"type": "array", "items": {"type": "string"}},
        "specs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"name": {"type": "string"}, "value": {"type": "string"}},
                "required": ["name", "value"],
                "additionalProperties": False,
            },
        },
        "keywords": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "intro", "features", "specs", "keywords"],
    "additionalProperties": False,
}


def _product_facts(product) -> dict:
    """Trích dữ liệu sản phẩm ĐÃ LÀM SẠCH để gửi cho AI (không gửi ASIN, link, giá nguồn)."""
    return {
        "source_title": scrub_text(product.title, mode="title"),
        "brand": scrub_text(product.brand),
        "category": product.category,
        "bullet_points": [b for b in (scrub_text(x) for x in product.bullet_points) if b],
        "description": scrub_text(product.description)[:2000],
    }


class ListingGenerator:
    """Tạo listing hoàn chỉnh. Dùng Claude nếu có API key, nếu không dùng quy tắc."""

    def __init__(self, api_key: str = "", model: str = "claude-opus-5-5", use_ai: bool = True,
                 shipping_note: str = "Fast, free shipping with tracking. Ships within 1-3 business days.",
                 returns_note: str = "30-day returns accepted. Please message us if anything is not right."):
        self.model = model
        self.shipping_note = shipping_note
        self.returns_note = returns_note
        self.client = None
        if use_ai and api_key:
            import anthropic  # import muộn: tool vẫn chạy được khi chưa cài anthropic

            self.client = anthropic.Anthropic(api_key=api_key)

    # -- Sinh theo quy tắc (dự phòng) --------------------------------------------
    @staticmethod
    def rule_based_copy(product) -> ListingCopy:
        facts = _product_facts(product)
        features = []
        for b in facts["bullet_points"][:7]:
            # "DURABLE BUILD: abc" → "Durable build: abc"
            head, sep, tail = b.partition(":")
            features.append(f"{head.strip().capitalize()}{sep}{tail}" if sep and head.isupper() else b)
        brand = facts["brand"] if facts["brand"].lower() not in ("", "generic", "unbranded") else ""
        return ListingCopy(
            title=clean_title(facts["source_title"]),
            intro=(facts["description"] or facts["source_title"])[:400],
            features=features,
            specs={k: v for k, v in {"Brand": brand or "Unbranded", "Condition": "New"}.items() if v},
            generated_by="rules",
        )

    # -- Sinh bằng Claude ------------------------------------------------------------
    def ai_copy(self, product) -> ListingCopy:
        import anthropic

        facts = _product_facts(product)
        response = self.client.beta.messages.create(
            model=self.model,
            max_tokens=4000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": "Write the listing for this product:\n"
                       + json.dumps(facts, ensure_ascii=False, indent=2)}],
            # Viết listing là việc đơn giản → effort "low" cho nhanh và rẻ.
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": LISTING_SCHEMA}},
            # Nếu model chính từ chối (bộ lọc an toàn), API tự chạy lại trên model dự phòng.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if response.stop_reason == "refusal":
            raise anthropic.AnthropicError("model từ chối yêu cầu")
        if response.stop_reason == "max_tokens":
            raise anthropic.AnthropicError("phản hồi bị cắt do max_tokens")
        text = next(b.text for b in response.content if b.type == "text")
        data = json.loads(text)
        return ListingCopy(
            title=data["title"],
            intro=data["intro"],
            features=data["features"],
            specs={s["name"]: s["value"] for s in data["specs"]},
            keywords=data["keywords"],
            generated_by=f"ai:{response.model}",
        )

    # -- API chính -----------------------------------------------------------------
    def generate(self, product) -> Listing:
        warnings: list[str] = []
        copy: Optional[ListingCopy] = None
        if self.client is not None:
            import anthropic

            try:
                copy = self.ai_copy(product)
            except (anthropic.AnthropicError, json.JSONDecodeError, KeyError, StopIteration) as exc:
                warnings.append(f"AI lỗi, dùng bộ sinh theo quy tắc: {exc}")
        if copy is None:
            copy = self.rule_based_copy(product)
            if warnings:
                copy.generated_by = "rules (AI lỗi)"

        # Lớp 3: KHÔNG tin đầu ra AI — làm sạch & ép chuẩn lại mọi trường.
        copy.title = clean_title(copy.title) or clean_title(product.title)
        copy.intro = scrub_text(copy.intro)
        copy.features = [f for f in (scrub_text(x) for x in copy.features) if f][:7]
        copy.specs = {scrub_text(k): scrub_text(v) for k, v in copy.specs.items() if scrub_text(v)}
        copy.keywords = [k for k in (scrub_text(x) for x in copy.keywords) if k]

        description = render_description(copy, self.shipping_note, self.returns_note)
        leftovers = contains_sensitive(copy.title + " " + description)
        if leftovers:
            warnings.append(f"Còn sót từ nhạy cảm: {leftovers}")
        if len(copy.title) < 40:
            warnings.append("Tiêu đề ngắn (<40 ký tự) — nên bổ sung thuộc tính để tăng khả năng tìm thấy.")
        return Listing(title=copy.title, description_html=description, copy=copy, warnings=warnings)

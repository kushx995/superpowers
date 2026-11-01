"""Kiểm thử VeRO checker, listing generator và export CSV."""

import csv
import io
import json
import random
from types import SimpleNamespace

import anthropic
import pytest

from ebay_export import ACTION_HEADER, COLUMNS, ExportRow, ExportSettings, to_csv
from listing_generator import (
    ListingGenerator, clean_title, contains_sensitive, sanitize_html, scrub_text,
)
from sources import AmazonProduct
from vero_checker import VeroChecker


# --- VeRO -------------------------------------------------------------------------
@pytest.fixture(scope="module")
def vero():
    return VeroChecker.from_csv(extra_brands=["MyBlockedBrand"])


@pytest.mark.parametrize("title,brand,level", [
    ("Running Shoes Men", "Nike", "block"),
    ("NIKE® Air Running Shoes", "", "block"),
    ("Apple Slicer Corer Stainless", "OXO", "warn"),     # tiêu đề "apple" → chỉ cảnh báo
    ("Charging cable", "Apple", "block"),                # trường brand khớp → chặn
    ("Soccer Coach Whistle", "Generic", "safe"),         # "coach" thông dụng → bỏ qua
    ("Leather Bag", "Coach", "block"),
    ("Nikella pattern mug", "", "safe"),                 # không khớp nhầm một phần từ
    ("Tiffany & Co. style pendant", "", "warn"),
    ("Pokémon card sleeves", "", "block"),               # alias có dấu
    ("Plain mug", "MyBlockedBrand", "block"),            # thương hiệu người dùng thêm
    ("Silicone Baking Mat", "Kitchy", "safe"),
])
def test_vero_levels(vero, title, brand, level):
    assert vero.check(title, brand).level == level


def test_vero_bullets_are_checked(vero):
    r = vero.check("Phone case", "Generic", ["Compatible with Samsung Galaxy S24"])
    assert r.level == "warn" and r.matches[0].where == "bullets"


# --- Làm sạch nội dung -----------------------------------------------------------------
@pytest.mark.parametrize("raw,expected", [
    ("Ships in Amazon packaging; Fulfilled by Amazon", ""),
    ("Great mat. Visit amazon.com/shops for more.", "Great mat."),
    ("Amazon Basics Silicone Baking Mat", "Silicone Baking Mat"),
    ("Prime rib roasting rack", "Prime rib roasting rack"),  # "prime" thông thường được giữ
    ("#1 Best Seller kitchen mat", "kitchen mat"),
    ("Great mat. Email us at shop@example.com", "Great mat."),
    ("Email us at shop@example.com", "Email us at"),  # một đoạn → xóa từng từ
])
def test_scrub_text(raw, expected):
    assert scrub_text(raw) == expected


@pytest.mark.parametrize("raw,expected", [
    ("Mat Set, 6 Pack - Amazon Basics Quality, Prime Shipping", "Mat Set, 6 Pack"),
    ("Amazon Basics Silicone Baking Mat, 2 Pack", "Silicone Baking Mat, 2 Pack"),
    ("Steel Rack | Amazon's Choice", "Steel Rack"),
])
def test_title_mode(raw, expected):
    assert clean_title(raw) == expected


def test_clean_title_rules():
    t = clean_title("WOW!!! HEAVY DUTY Steel Rack Rack 2 PACK *** L@@K Amazon's Choice")
    assert t == "Heavy Duty Steel Rack 2 Pack"
    assert clean_title("USB LED Desk Lamp") == "USB LED Desk Lamp"  # từ viết tắt được giữ


def test_clean_title_never_exceeds_80_chars():
    rng = random.Random(0)
    words = ["Stainless", "Steel", "Kitchen", "Organizer", "Amazon", "Prime", "Shipping", "Heavy-Duty", "XL", "2-Pack", ","]
    for _ in range(500):
        t = clean_title(" ".join(rng.choice(words) for _ in range(rng.randint(1, 40))))
        assert len(t) <= 80
        assert not contains_sensitive(t)
        assert not t.endswith((",", "-", " "))


def test_sanitize_html_allowlist():
    raw = ('<div onclick="x()" style="color:red"><script>alert(1)</script><h2>Title</h2>'
           '<a href="https://amazon.com">Buy on Amazon</a> <img src="x.jpg">'
           '<p style="background:url(evil)">Ships from Amazon. Nice mat</p><iframe>bad</iframe></div>')
    out = sanitize_html(raw)
    assert out.startswith('<div style="color:red"><h2>Title</h2>')
    for bad in ("script", "alert", "onclick", "href", "<img", "iframe", "url(", "Amazon"):
        assert bad not in out
    assert "<p>Nice mat</p>" in out


# --- Listing generator ------------------------------------------------------------------
def _product(**kw):
    base = dict(asin="B0TEST", title="Kitchy Silicone Baking Mat, 2 Pack - Amazon Basics Quality",
                amazon_price=10.0, brand="Kitchy",
                bullet_points=["NON-STICK: no oil needed", "Ships in Amazon packaging", "Fits half sheet pans"],
                description="Bake better. Buy more at amazon.com/kitchy.")
    base.update(kw)
    return AmazonProduct(**base)


def test_rule_based_listing_is_clean():
    lst = ListingGenerator(use_ai=False).generate(_product())
    assert lst.title == "Kitchy Silicone Baking Mat, 2 Pack"
    assert "Non-stick: no oil needed" in lst.description_html
    assert not contains_sensitive(lst.title + lst.description_html)
    assert lst.copy.generated_by == "rules"


class _FakeMessages:
    def __init__(self, response=None, error=None):
        self.response, self.error, self.kwargs = response, error, None

    def create(self, **kwargs):
        self.kwargs = kwargs
        if self.error:
            raise self.error
        return self.response


def _gen_with(fake):
    gen = ListingGenerator(use_ai=False)
    gen.client = SimpleNamespace(beta=SimpleNamespace(messages=fake))
    return gen


def test_ai_output_is_revalidated():
    """AI trả về tiêu đề quá dài & có chữ Amazon → vẫn bị làm sạch và cắt ≤ 80."""
    payload = {"title": "Kitchy Silicone Baking Mat Set Non Stick Reusable Food Safe Liner, 2 Pack, Amazon Prime Fast",
               "intro": "Bake cookies evenly. Ships from Amazon.",
               "features": ["Non-stick surface", "Fulfilled by Amazon"],
               "specs": [{"name": "Material", "value": "Silicone"}], "keywords": ["baking mat"]}
    fake = _FakeMessages(SimpleNamespace(stop_reason="end_turn", model="claude-opus-5-5",
                                         content=[SimpleNamespace(type="text", text=json.dumps(payload))]))
    lst = _gen_with(fake).generate(_product())
    assert len(lst.title) <= 80 and not contains_sensitive(lst.title + lst.description_html)
    assert lst.copy.features == ["Non-stick surface"] and lst.copy.intro == "Bake cookies evenly."
    assert lst.copy.generated_by == "ai:claude-opus-5-5"
    # Dữ liệu gửi cho AI đã được làm sạch trước (không lộ Amazon/ASIN/link)
    sent = fake.kwargs["messages"][0]["content"]
    assert "amazon" not in sent.lower() and "B0TEST" not in sent
    assert fake.kwargs["output_config"]["format"]["type"] == "json_schema"


@pytest.mark.parametrize("response,error", [
    (SimpleNamespace(stop_reason="refusal", model="m", content=[]), None),
    (None, anthropic.APIConnectionError(request=None)),
    (SimpleNamespace(stop_reason="end_turn", model="m", content=[SimpleNamespace(type="text", text="{not json")]), None),
])
def test_ai_failure_falls_back_to_rules(response, error):
    lst = _gen_with(_FakeMessages(response, error)).generate(_product())
    assert lst.copy.generated_by == "rules (AI lỗi)"
    assert lst.warnings and lst.title == "Kitchy Silicone Baking Mat, 2 Pack"


# --- Export ----------------------------------------------------------------------------------
def test_export_csv_format():
    rows = [ExportRow("B0TEST", "Silicone Baking Mat, 2 Pack", "<div>\n<p>Hi</p>\n</div>", 24.99, "Kitchy", "012345678905",
                      ("https://img/1.jpg",)),
            ExportRow("B0TWO", "Steel Rack", "<p>x</p>", 10, "", "4006381333931")]
    data = to_csv(rows, ExportSettings(category_id="20625", quantity=2, shipping_profile="Free Ship"))
    assert not data.startswith(b"\xef\xbb\xbf")  # không có BOM
    parsed = list(csv.DictReader(io.StringIO(data.decode())))
    assert list(parsed[0].keys()) == COLUMNS
    r0, r1 = parsed
    assert (r0[ACTION_HEADER], r0["*StartPrice"], r0["*Quantity"], r0["CustomLabel"]) == ("Add", "24.99", "2", "SKU-B0TEST")
    assert r0["Product:UPC"] == "012345678905" and r1["Product:EAN"] == "4006381333931"
    assert r0["*Description"] == "<div> <p>Hi</p> </div>"  # gộp về 1 dòng
    assert r0["PicURL"] == ""  # ảnh nguồn mặc định TẮT
    assert r1["*C:Brand"] == "Unbranded" and r0["ShippingProfileName"] == "Free Ship"


@pytest.mark.parametrize("row,cfg", [
    (ExportRow("A", "x" * 81, "d", 10), ExportSettings("1")),
    (ExportRow("A", "ok", "d", 0), ExportSettings("1")),
    (ExportRow("A", "ok", "d", 10), ExportSettings(" ")),
])
def test_export_validation(row, cfg):
    with pytest.raises(ValueError):
        to_csv([row], cfg)

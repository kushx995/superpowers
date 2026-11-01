"""
ebay_publisher.py — Đăng listing trực tiếp lên eBay qua Sell Inventory API (REST)
=================================================================================

Vì sao chọn Sell Inventory API thay vì Trading API?
  • REST + JSON (Trading API là XML/SOAP cũ), lỗi trả về có cấu trúc rõ ràng.
  • Là hướng eBay khuyến nghị cho tích hợp mới; quản lý theo SKU nên đăng lại không bị trùng.
  ⚠️ Listing tạo bằng Inventory API nên được sửa tiếp bằng Inventory API (không trộn với
     Trading API / trình sửa thông thường) để tránh lệch dữ liệu.

Quy trình đăng 1 sản phẩm (mỗi bước đều có thể báo lỗi riêng):

    0. Lấy User Access Token  (từ refresh token, hoặc token dán tay)
    1. Kiểm tra / tạo Inventory Location   (kho hàng — bắt buộc cho offer)
    2. PUT  inventory_item/{sku}            (title, mô tả, ảnh, aspects, tình trạng, số lượng)
    3. POST offer  (hoặc PUT nếu SKU đã có offer) (danh mục, giá, chính sách, mô tả HTML)
    4. POST offer/{offerId}/publish        → listingId  →  https://www.ebay.com/itm/{listingId}

QUAN TRỌNG VỀ XÁC THỰC:
  App ID + Cert ID một mình KHÔNG đủ để đăng bán — chúng chỉ tạo được "Application token"
  (dùng cho tra cứu như Taxonomy). Đăng bán cần "User token" do CHÍNH TÀI KHOẢN NGƯỜI BÁN
  cấp quyền (OAuth consent). Module hỗ trợ:
    • refresh_token (khuyến nghị, sống ~18 tháng) + App ID/Cert ID → tự xin access token mới mỗi 2 giờ
    • user_token dán tay (sống 2 giờ, tiện để thử nhanh)
"""

from __future__ import annotations

import base64
import json
import os
import re
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote, unquote, urlencode

import requests

CONFIG_PATH = Path(__file__).with_name("config.json")

SCOPES_SELL = [
    "https://api.ebay.com/oauth/api_scope",
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account",
]
SCOPE_APP = "https://api.ebay.com/oauth/api_scope"

ENVIRONMENTS = {
    "sandbox": {"api": "https://api.sandbox.ebay.com", "auth": "https://auth.sandbox.ebay.com",
                "item": "https://sandbox.ebay.com/itm/"},
    "production": {"api": "https://api.ebay.com", "auth": "https://auth.ebay.com",
                   "item": "https://www.ebay.com/itm/"},
}


# ---------------------------------------------------------------------------
# 1. CẤU HÌNH
# ---------------------------------------------------------------------------
@dataclass
class PublisherConfig:
    environment: str = "sandbox"          # LUÔN thử trên sandbox trước!
    client_id: str = ""                   # App ID
    client_secret: str = ""               # Cert ID
    ru_name: str = ""                     # RuName (eBay Redirect URL name) — cho luồng lấy token
    refresh_token: str = ""               # Khuyến nghị
    user_token: str = ""                  # Access token dán tay (2 giờ)
    marketplace_id: str = "EBAY_US"
    content_language: str = "en-US"
    currency: str = "USD"
    merchant_location_key: str = "main-warehouse"
    location_postal_code: str = ""
    location_country: str = "US"
    fulfillment_policy_id: str = ""       # Shipping policy mặc định
    payment_policy_id: str = ""
    return_policy_id: str = ""

    @classmethod
    def load(cls, path: Path = CONFIG_PATH) -> "PublisherConfig":
        """Ưu tiên: config.json  >  biến môi trường EBAY_*  >  mặc định."""
        cfg = cls(
            client_id=os.environ.get("EBAY_CLIENT_ID", ""),
            client_secret=os.environ.get("EBAY_CLIENT_SECRET", ""),
            refresh_token=os.environ.get("EBAY_REFRESH_TOKEN", ""),
            ru_name=os.environ.get("EBAY_RUNAME", ""),
        )
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            for key, value in data.items():
                if hasattr(cfg, key) and value not in (None, ""):
                    setattr(cfg, key, value)
        return cfg

    def save(self, path: Path = CONFIG_PATH) -> None:
        """Lưu config.json (chứa bí mật — file đã nằm trong .gitignore, không chia sẻ file này)."""
        path.write_text(json.dumps(asdict(self), indent=2, ensure_ascii=False), encoding="utf-8")

    @property
    def urls(self) -> dict[str, str]:
        return ENVIRONMENTS[self.environment]

    @property
    def can_authenticate(self) -> bool:
        return bool(self.user_token or (self.refresh_token and self.client_id and self.client_secret))


# ---------------------------------------------------------------------------
# 2. LỖI eBay — giữ nguyên mã lỗi + thông điệp gốc, kèm gợi ý tiếng Việt
# ---------------------------------------------------------------------------
@dataclass
class EbayErrorDetail:
    error_id: Optional[int]
    message: str
    long_message: str = ""
    category: str = ""                    # REQUEST | APPLICATION | BUSINESS
    parameters: dict[str, str] = field(default_factory=dict)

    @property
    def hint(self) -> str:
        return suggest_fix(f"{self.message} {self.long_message} {' '.join(self.parameters.values())}")


# Gợi ý dựa trên TỪ KHÓA trong thông điệp (ổn định hơn so khớp mã số lỗi).
_HINTS: list[tuple[str, str]] = [
    (r"invalid access token|expired|invalid_grant|token",
     "Token hết hạn/sai. Lấy lại token (mục 'Kết nối eBay' → luồng OAuth) hoặc kiểm tra đúng môi trường Sandbox/Production."),
    (r"insufficient permissions|scope",
     "Token thiếu quyền. Khi lấy token phải chọn scope sell.inventory và sell.account."),
    (r"fulfillment ?policy|shipping ?policy",
     "Thiếu/sai Shipping policy. Tạo trong Seller Hub → Account → Business policies rồi bấm 'Tải chính sách'."),
    (r"payment ?policy", "Thiếu/sai Payment policy (Business policies trong tài khoản eBay)."),
    (r"return ?polic", "Thiếu/sai Return policy (Business policies trong tài khoản eBay)."),
    (r"business polic|not opted|opt.?in",
     "Tài khoản chưa bật Business Policies. Bấm 'Bật Business Policies' hoặc bật trong Seller Hub."),
    (r"location|merchantlocationkey", "Thiếu kho hàng (Inventory Location). Nhập ZIP code kho trong mục Kết nối eBay."),
    (r"picture|image|photo", "Cần ít nhất 1 URL ảnh HTTPS công khai (ảnh bạn có quyền sử dụng)."),
    (r"item specific|aspect|brand|mpn",
     "Thiếu item specifics bắt buộc của danh mục. Bấm 'Kiểm tra thông số bắt buộc' và điền vào ô Aspects."),
    (r"category", "Category ID sai hoặc không phải danh mục lá (leaf). Dùng nút 'Gợi ý danh mục'."),
    (r"condition", "Tình trạng hàng không hợp lệ cho danh mục này (một số danh mục không nhận NEW)."),
    (r"title", "Tiêu đề không hợp lệ (tối đa 80 ký tự, không chứa ký tự đặc biệt bị cấm)."),
    (r"price|amount", "Giá không hợp lệ (định dạng 2 số lẻ, > 0, đúng đơn vị tiền tệ)."),
    (r"limit|quota|exceed", "Vượt giới hạn bán (selling limits) của tài khoản hoặc giới hạn gọi API."),
    (r"duplicate|already exists", "Listing/offer đã tồn tại cho SKU này — tool sẽ cập nhật offer cũ khi đăng lại."),
]


def suggest_fix(text: str) -> str:
    low = (text or "").lower()
    for pattern, hint in _HINTS:
        if re.search(pattern, low):
            return hint
    return "Đọc thông điệp gốc của eBay bên cạnh để biết trường nào cần sửa."


class EbayApiError(Exception):
    """Lỗi do eBay trả về (HTTP ≥ 400) — có danh sách lỗi chi tiết."""

    def __init__(self, step: str, status: int, errors: list[EbayErrorDetail], raw: str = ""):
        self.step, self.status, self.errors, self.raw = step, status, errors, raw
        first = errors[0] if errors else None
        super().__init__(f"[{step}] HTTP {status}: " + (f"{first.error_id} {first.message}" if first else raw[:200]))


def parse_errors(payload: Any) -> list[EbayErrorDetail]:
    """Đọc mảng `errors`/`warnings` chuẩn của REST API eBay (và lỗi OAuth dạng error/error_description)."""
    if not isinstance(payload, dict):
        return []
    if "error" in payload and "errors" not in payload:  # lỗi OAuth
        return [EbayErrorDetail(None, str(payload.get("error")), str(payload.get("error_description", "")), "OAUTH")]
    out = []
    for e in payload.get("errors") or payload.get("warnings") or []:
        params = {p.get("name", f"p{i}"): str(p.get("value", "")) for i, p in enumerate(e.get("parameters") or [])}
        out.append(EbayErrorDetail(e.get("errorId"), e.get("message", ""), e.get("longMessage", ""),
                                   e.get("category", ""), params))
    return out


# ---------------------------------------------------------------------------
# 3. HTTP + OAUTH
# ---------------------------------------------------------------------------
class EbayClient:
    """Gọi REST API eBay: tự gắn token, retry lỗi tạm thời, chuyển lỗi thành EbayApiError."""

    RETRY = {429, 500, 502, 503, 504}

    def __init__(self, cfg: PublisherConfig, session: Optional[requests.Session] = None, retries: int = 2):
        self.cfg = cfg
        self.session = session or requests.Session()
        self.retries = retries
        self._user: Optional[tuple[str, float]] = (cfg.user_token, time.time() + 7000) if cfg.user_token else None
        self._app: Optional[tuple[str, float]] = None

    # -- OAuth ------------------------------------------------------------------
    def _basic(self) -> str:
        if not (self.cfg.client_id and self.cfg.client_secret):
            raise EbayApiError("auth", 0, [EbayErrorDetail(None, "Thiếu App ID / Cert ID")])
        return base64.b64encode(f"{self.cfg.client_id}:{self.cfg.client_secret}".encode()).decode()

    def _token_request(self, data: dict) -> dict:
        return self.request("POST", "/identity/v1/oauth2/token", step="auth", auth=False, data=data, headers={
            "Authorization": f"Basic {self._basic()}", "Content-Type": "application/x-www-form-urlencoded"})

    def user_token(self) -> str:
        if self._user and self._user[1] > time.time() + 60:
            return self._user[0]
        if not self.cfg.refresh_token:
            raise EbayApiError("auth", 401, [EbayErrorDetail(None, "Không có token hợp lệ",
                                                             "User token đã hết hạn và chưa có refresh token.")])
        data = self._token_request({"grant_type": "refresh_token", "refresh_token": self.cfg.refresh_token,
                                    "scope": " ".join(SCOPES_SELL)})
        self._user = (data["access_token"], time.time() + int(data.get("expires_in", 7200)))
        return self._user[0]

    def app_token(self) -> str:
        """Application token (client credentials) — đủ cho Taxonomy API."""
        if self._app and self._app[1] > time.time() + 60:
            return self._app[0]
        data = self._token_request({"grant_type": "client_credentials", "scope": SCOPE_APP})
        self._app = (data["access_token"], time.time() + int(data.get("expires_in", 7200)))
        return self._app[0]

    def consent_url(self, state: str = "arbitrage-tool") -> str:
        """Bước 1 của luồng OAuth: mở URL này, đăng nhập tài khoản BÁN HÀNG và bấm 'Agree'."""
        params = {"client_id": self.cfg.client_id, "redirect_uri": self.cfg.ru_name, "response_type": "code",
                  "scope": " ".join(SCOPES_SELL), "state": state}
        return f"{self.cfg.urls['auth']}/oauth2/authorize?" + urlencode(params, quote_via=quote)

    def exchange_code(self, code_or_url: str) -> dict:
        """Bước 2: đổi authorization code (hoặc dán nguyên URL eBay chuyển hướng tới) lấy refresh token."""
        match = re.search(r"[?&]code=([^&]+)", code_or_url)
        code = unquote(match.group(1) if match else code_or_url.strip())
        data = self._token_request({"grant_type": "authorization_code", "code": code, "redirect_uri": self.cfg.ru_name})
        self.cfg.refresh_token = data.get("refresh_token", self.cfg.refresh_token)
        self._user = (data["access_token"], time.time() + int(data.get("expires_in", 7200)))
        return data

    # -- Gọi API ------------------------------------------------------------------
    def request(self, method: str, path: str, *, step: str, auth: str | bool = "user",
                ok_404: bool = False, **kwargs: Any) -> dict:
        headers = kwargs.pop("headers", {})
        if auth:
            headers["Authorization"] = f"Bearer {self.app_token() if auth == 'app' else self.user_token()}"
        url = self.cfg.urls["api"] + path
        for attempt in range(self.retries + 1):
            try:
                resp = self.session.request(method, url, headers=headers, timeout=45, **kwargs)
            except requests.RequestException as exc:
                if attempt == self.retries:
                    raise EbayApiError(step, 0, [EbayErrorDetail(None, "Lỗi mạng khi gọi eBay", str(exc))]) from exc
                time.sleep(2 ** attempt)
                continue
            if resp.status_code in self.RETRY and attempt < self.retries:
                time.sleep(2 ** attempt)
                continue
            break
        if resp.status_code == 404 and ok_404:
            return {}
        body: Any = {}
        if resp.status_code != 204 and resp.text.strip():
            try:
                body = resp.json()
            except ValueError:
                body = {"raw": resp.text}
        if resp.status_code >= 400:
            errors = parse_errors(body) or [EbayErrorDetail(None, f"HTTP {resp.status_code}", resp.text[:300])]
            raise EbayApiError(step, resp.status_code, errors, resp.text[:2000])
        return body if isinstance(body, dict) else {"data": body}


# ---------------------------------------------------------------------------
# 4. DỮ LIỆU ĐĂNG BÀI & KẾT QUẢ
# ---------------------------------------------------------------------------
@dataclass
class ListingRequest:
    sku: str
    title: str
    description_html: str
    price: float                          # Giá đã tính (.99) từ calculator
    category_id: str
    quantity: int = 1
    condition: str = "NEW"
    brand: str = ""
    gtin: str = ""
    image_urls: list[str] = field(default_factory=list)
    aspects: dict[str, list[str]] = field(default_factory=dict)


@dataclass
class PublishResult:
    success: bool
    sku: str
    listing_id: str = ""
    offer_id: str = ""
    url: str = ""
    step: str = ""                        # bước thất bại (nếu có)
    status: int = 0
    errors: list[EbayErrorDetail] = field(default_factory=list)
    warnings: list[EbayErrorDetail] = field(default_factory=list)
    log: list[str] = field(default_factory=list)

    def error_rows(self) -> list[dict]:
        """Bảng lỗi để hiển thị: mã lỗi, thông điệp gốc eBay, trường liên quan, gợi ý sửa."""
        return [{
            "Bước": self.step, "HTTP": self.status, "Mã lỗi eBay": e.error_id, "Loại": e.category,
            "Thông điệp eBay": e.message, "Chi tiết": e.long_message,
            "Tham số": ", ".join(f"{k}={v}" for k, v in e.parameters.items()), "Gợi ý sửa": e.hint,
        } for e in self.errors]


STEP_LABELS = {
    "auth": "Xác thực", "location": "Kho hàng", "inventory_item": "Tạo sản phẩm (inventory item)",
    "offer": "Tạo/cập nhật offer", "publish": "Đăng bán (publish)", "validate": "Kiểm tra trước khi đăng",
    "policies": "Đọc business policies", "taxonomy": "Danh mục / item specifics",
}


# ---------------------------------------------------------------------------
# 5. PUBLISHER
# ---------------------------------------------------------------------------
class EbayPublisher:
    def __init__(self, cfg: PublisherConfig, session: Optional[requests.Session] = None):
        self.cfg = cfg
        self.client = EbayClient(cfg, session)
        self._tree_id: Optional[str] = None

    # -- Tài khoản: business policies -------------------------------------------------
    def get_policies(self) -> dict[str, list[tuple[str, str]]]:
        """Trả về {'fulfillment': [(id, tên)], 'payment': [...], 'return': [...]}."""
        out = {}
        for kind, path, key, id_key in (
            ("fulfillment", "fulfillment_policy", "fulfillmentPolicies", "fulfillmentPolicyId"),
            ("payment", "payment_policy", "paymentPolicies", "paymentPolicyId"),
            ("return", "return_policy", "returnPolicies", "returnPolicyId"),
        ):
            data = self.client.request("GET", f"/sell/account/v1/{path}", step="policies",
                                       params={"marketplace_id": self.cfg.marketplace_id})
            out[kind] = [(p[id_key], p.get("name", p[id_key])) for p in data.get(key) or []]
        return out

    def opt_in_business_policies(self) -> None:
        self.client.request("POST", "/sell/account/v1/program/opt_in", step="policies",
                            json={"programType": "SELLING_POLICY_MANAGEMENT"})

    # -- Taxonomy: gợi ý danh mục & item specifics bắt buộc -----------------------------
    def _category_tree_id(self) -> str:
        if self._tree_id is None:
            data = self.client.request("GET", "/commerce/taxonomy/v1/get_default_category_tree_id", step="taxonomy",
                                       auth="app", params={"marketplace_id": self.cfg.marketplace_id})
            self._tree_id = str(data.get("categoryTreeId", "0"))
        return self._tree_id

    def suggest_categories(self, query: str, limit: int = 5) -> list[tuple[str, str]]:
        """[(categoryId, 'Cha > Con > Lá'), ...] — gợi ý danh mục lá từ tiêu đề."""
        data = self.client.request(
            "GET", f"/commerce/taxonomy/v1/category_tree/{self._category_tree_id()}/get_category_suggestions",
            step="taxonomy", auth="app", params={"q": query[:350]})
        out = []
        for s in (data.get("categorySuggestions") or [])[:limit]:
            cat = s.get("category") or {}
            ancestors = [a.get("categoryName", "") for a in reversed(s.get("categoryTreeNodeAncestors") or [])]
            out.append((str(cat.get("categoryId")), " > ".join([*ancestors, cat.get("categoryName", "")])))
        return out

    def required_aspects(self, category_id: str) -> list[str]:
        """Tên các item specifics BẮT BUỘC của danh mục (thiếu → eBay từ chối khi publish)."""
        data = self.client.request(
            "GET", f"/commerce/taxonomy/v1/category_tree/{self._category_tree_id()}/get_item_aspects_for_category",
            step="taxonomy", auth="app", params={"category_id": category_id})
        return [a.get("localizedAspectName", "") for a in data.get("aspects") or []
                if (a.get("aspectConstraint") or {}).get("aspectRequired")]

    # -- Kiểm tra trước khi đăng (không gọi API) ------------------------------------------
    def validate(self, req: ListingRequest, required_aspects: Optional[list[str]] = None) -> list[str]:
        problems = []
        if not 0 < len(req.title) <= 80:
            problems.append(f"Tiêu đề phải 1–80 ký tự (hiện {len(req.title)}).")
        if req.price <= 0:
            problems.append("Giá phải > 0.")
        if not re.fullmatch(r"\d+", req.category_id or ""):
            problems.append("Category ID phải là số (dùng nút 'Gợi ý danh mục').")
        if not req.image_urls:
            problems.append("Cần ít nhất 1 URL ảnh.")
        bad = [u for u in req.image_urls if not u.lower().startswith("https://")]
        if bad:
            problems.append(f"URL ảnh phải là https://: {bad[:2]}")
        if not 0 < req.quantity <= 10_000:
            problems.append("Số lượng phải từ 1 đến 10.000.")
        if not (self.cfg.fulfillment_policy_id and self.cfg.payment_policy_id and self.cfg.return_policy_id):
            problems.append("Chưa chọn đủ 3 business policies (Shipping / Payment / Return).")
        if not self.cfg.can_authenticate:
            problems.append("Chưa có token eBay (refresh token hoặc user token).")
        have = {k.lower() for k in self._aspects(req)}
        missing = [a for a in (required_aspects or []) if a.lower() not in have]
        if missing:
            problems.append(f"Thiếu item specifics bắt buộc: {', '.join(missing)}")
        return problems

    # -- Đăng bài ------------------------------------------------------------------------
    @staticmethod
    def _aspects(req: ListingRequest) -> dict[str, list[str]]:
        aspects = {k: [v for v in vals if v] for k, vals in req.aspects.items() if any(vals)}
        aspects.setdefault("Brand", [req.brand.strip() if req.brand.strip() and req.brand.lower() != "generic" else "Unbranded"])
        aspects.setdefault("MPN", ["Does Not Apply"])
        return aspects

    def ensure_location(self) -> None:
        key = quote(self.cfg.merchant_location_key, safe="")
        if self.client.request("GET", f"/sell/inventory/v1/location/{key}", step="location", ok_404=True):
            return
        if not self.cfg.location_postal_code:
            raise EbayApiError("location", 0, [EbayErrorDetail(None, "Chưa có kho hàng và thiếu ZIP code để tạo kho")])
        self.client.request("POST", f"/sell/inventory/v1/location/{key}", step="location", json={
            "location": {"address": {"postalCode": self.cfg.location_postal_code, "country": self.cfg.location_country}},
            "locationTypes": ["WAREHOUSE"], "name": "Main warehouse", "merchantLocationStatus": "ENABLED",
        })

    def _inventory_item_body(self, req: ListingRequest) -> dict:
        product: dict[str, Any] = {
            "title": req.title, "description": req.description_html,
            "aspects": self._aspects(req), "imageUrls": req.image_urls[:24],
        }
        digits = re.sub(r"\D", "", req.gtin or "")
        if len(digits) == 12:
            product["upc"] = [digits]
        elif len(digits) == 13:
            product["ean"] = [digits]
        return {"condition": req.condition, "product": product,
                "availability": {"shipToLocationAvailability": {"quantity": req.quantity}}}

    def _offer_body(self, req: ListingRequest) -> dict:
        return {
            "sku": req.sku, "marketplaceId": self.cfg.marketplace_id, "format": "FIXED_PRICE",
            "availableQuantity": req.quantity, "categoryId": req.category_id,
            "listingDescription": req.description_html,
            "listingPolicies": {"fulfillmentPolicyId": self.cfg.fulfillment_policy_id,
                                "paymentPolicyId": self.cfg.payment_policy_id,
                                "returnPolicyId": self.cfg.return_policy_id},
            "pricingSummary": {"price": {"value": f"{req.price:.2f}", "currency": self.cfg.currency}},
            "merchantLocationKey": self.cfg.merchant_location_key,
        }

    def publish(self, req: ListingRequest, required_aspects: Optional[list[str]] = None) -> PublishResult:
        """Đăng (hoặc cập nhật) 1 listing. KHÔNG ném lỗi — mọi lỗi nằm trong PublishResult."""
        result = PublishResult(success=False, sku=req.sku)
        problems = self.validate(req, required_aspects)
        if problems:
            result.step, result.errors = "validate", [EbayErrorDetail(None, p) for p in problems]
            return result
        headers = {"Content-Language": self.cfg.content_language, "Content-Type": "application/json"}
        sku = quote(req.sku, safe="")
        try:
            self.ensure_location()
            result.log.append("✔ Kho hàng sẵn sàng")

            self.client.request("PUT", f"/sell/inventory/v1/inventory_item/{sku}", step="inventory_item",
                                json=self._inventory_item_body(req), headers=dict(headers))
            result.log.append(f"✔ Đã lưu inventory item {req.sku}")

            existing = self.client.request("GET", "/sell/inventory/v1/offer", step="offer", ok_404=True,
                                           params={"sku": req.sku, "marketplace_id": self.cfg.marketplace_id})
            offers = existing.get("offers") or []
            if offers:
                offer = offers[0]
                result.offer_id = offer["offerId"]
                self.client.request("PUT", f"/sell/inventory/v1/offer/{result.offer_id}", step="offer",
                                    json=self._offer_body(req), headers=dict(headers))
                result.log.append(f"✔ Đã cập nhật offer {result.offer_id}")
                # Offer đã PUBLISHED: cập nhật offer = sửa listing đang chạy, không cần publish lại.
                if offer.get("status") == "PUBLISHED" and (offer.get("listing") or {}).get("listingId"):
                    result.listing_id = offer["listing"]["listingId"]
                    result.log.append("✔ Listing đang chạy đã được cập nhật")
            else:
                created = self.client.request("POST", "/sell/inventory/v1/offer", step="offer",
                                              json=self._offer_body(req), headers=dict(headers))
                result.offer_id = created["offerId"]
                result.warnings += parse_errors({"warnings": created.get("warnings")})
                result.log.append(f"✔ Đã tạo offer {result.offer_id}")

            if not result.listing_id:
                published = self.client.request("POST", f"/sell/inventory/v1/offer/{result.offer_id}/publish",
                                                step="publish")
                result.listing_id = str(published.get("listingId", ""))
                result.warnings += parse_errors({"warnings": published.get("warnings")})
                result.log.append(f"✔ Đã đăng: listing {result.listing_id}")
        except EbayApiError as exc:
            result.step, result.status, result.errors = exc.step, exc.status, exc.errors
            return result
        result.success = True
        result.url = self.cfg.urls["item"] + result.listing_id
        return result


def parse_aspects_text(text: str) -> dict[str, list[str]]:
    """'Color: Red, Blue\\nMaterial: Silicone' → {'Color': ['Red','Blue'], 'Material': ['Silicone']}."""
    out: dict[str, list[str]] = {}
    for line in (text or "").splitlines():
        name, sep, values = line.partition(":")
        if sep and name.strip():
            out[name.strip()] = [v.strip() for v in values.split(",") if v.strip()]
    return out

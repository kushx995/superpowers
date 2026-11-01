"""Kiểm thử ebay_publisher bằng "máy chủ eBay giả" (không gọi mạng)."""

import json
import re
from urllib.parse import parse_qs, urlparse

import pytest

import ebay_publisher as ep
from ebay_publisher import EbayPublisher, ListingRequest, PublisherConfig, parse_aspects_text, suggest_fix


class Resp:
    def __init__(self, status, payload=None):
        self.status_code = status
        self.text = "" if payload is None else json.dumps(payload)

    def json(self):
        return json.loads(self.text)


class FakeEbay:
    """Định tuyến theo (METHOD, regex path). Ghi lại mọi request để kiểm tra body."""

    def __init__(self, routes):
        self.routes = routes
        self.calls = []

    def request(self, method, url, **kw):
        path = urlparse(url).path
        self.calls.append((method, path, kw))
        for (m, pattern), handler in self.routes.items():
            if m == method and re.fullmatch(pattern, path):
                status, payload = handler(kw) if callable(handler) else handler
                return Resp(status, payload)
        raise AssertionError(f"Request không mong đợi: {method} {path}")

    def bodies(self, method, pattern):
        return [kw.get("json") for m, p, kw in self.calls if m == method and re.fullmatch(pattern, p)]


TOKEN = {("POST", "/identity/v1/oauth2/token"): (200, {"access_token": "USER", "expires_in": 7200})}


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(ep.time, "sleep", lambda s: None)


def cfg(**kw):
    base = dict(client_id="APP", client_secret="CERT", refresh_token="REFRESH", location_postal_code="95125",
                fulfillment_policy_id="F1", payment_policy_id="P1", return_policy_id="R1")
    base.update(kw)
    return PublisherConfig(**base)


def req(**kw):
    base = dict(sku="SKU-B0TEST", title="Silicone Baking Mat, 2 Pack", description_html="<p>Nice</p>",
                price=24.99, category_id="20625", quantity=2, brand="Kitchy", gtin="012345678905",
                image_urls=["https://img.example/1.jpg"], aspects={"Material": ["Silicone"]})
    base.update(kw)
    return ListingRequest(**base)


def test_publish_happy_path_new_offer():
    fake = FakeEbay({
        **TOKEN,
        ("GET", r"/sell/inventory/v1/location/.+"): (404, {"errors": [{"errorId": 25805, "message": "not found"}]}),
        ("POST", r"/sell/inventory/v1/location/.+"): (204, None),
        ("PUT", r"/sell/inventory/v1/inventory_item/.+"): (204, None),
        ("GET", r"/sell/inventory/v1/offer"): (404, {"errors": [{"errorId": 25713, "message": "no offer"}]}),
        ("POST", r"/sell/inventory/v1/offer"): (201, {"offerId": "OFF1"}),
        ("POST", r"/sell/inventory/v1/offer/OFF1/publish"): (200, {"listingId": "110555"}),
    })
    res = EbayPublisher(cfg(), session=fake).publish(req())
    assert res.success, res.error_rows()
    assert (res.offer_id, res.listing_id) == ("OFF1", "110555")
    assert res.url == "https://sandbox.ebay.com/itm/110555"  # mặc định sandbox

    item = fake.bodies("PUT", r"/sell/inventory/v1/inventory_item/.+")[0]
    assert item["condition"] == "NEW" and item["product"]["upc"] == ["012345678905"]
    assert item["product"]["aspects"] == {"Material": ["Silicone"], "Brand": ["Kitchy"], "MPN": ["Does Not Apply"]}
    assert item["availability"]["shipToLocationAvailability"]["quantity"] == 2
    offer = fake.bodies("POST", r"/sell/inventory/v1/offer")[0]
    assert offer["pricingSummary"]["price"] == {"value": "24.99", "currency": "USD"}
    assert offer["listingPolicies"] == {"fulfillmentPolicyId": "F1", "paymentPolicyId": "P1", "returnPolicyId": "R1"}
    assert offer["categoryId"] == "20625" and offer["format"] == "FIXED_PRICE"
    # header bắt buộc & token user
    _, _, kw = next(c for c in fake.calls if c[0] == "PUT")
    assert kw["headers"]["Content-Language"] == "en-US" and kw["headers"]["Authorization"] == "Bearer USER"
    token_call = next(c for c in fake.calls if "oauth2" in c[1])
    assert token_call[2]["data"]["grant_type"] == "refresh_token"


def test_republish_updates_existing_live_offer():
    fake = FakeEbay({
        **TOKEN,
        ("GET", r"/sell/inventory/v1/location/.+"): (200, {"merchantLocationKey": "main-warehouse"}),
        ("PUT", r"/sell/inventory/v1/inventory_item/.+"): (204, None),
        ("GET", r"/sell/inventory/v1/offer"): (200, {"offers": [
            {"offerId": "OFF9", "status": "PUBLISHED", "listing": {"listingId": "999"}}]}),
        ("PUT", r"/sell/inventory/v1/offer/OFF9"): (204, None),
    }, )
    res = EbayPublisher(cfg(environment="production"), session=fake).publish(req(price=19.99))
    assert res.success and res.listing_id == "999" and res.url == "https://www.ebay.com/itm/999"
    assert not any(p.endswith("/publish") for _, p, _ in fake.calls)  # không publish trùng
    assert fake.bodies("PUT", r"/sell/inventory/v1/offer/OFF9")[0]["pricingSummary"]["price"]["value"] == "19.99"


def test_publish_error_is_reported_with_ebay_details():
    errors = {"errors": [{"errorId": 25002, "domain": "API_INVENTORY", "category": "REQUEST",
                          "message": "A user error has occurred. The item specific Type is missing.",
                          "longMessage": "Add Type to this listing, enter a valid value, and then try again.",
                          "parameters": [{"name": "0", "value": "Type"}]}]}
    fake = FakeEbay({
        **TOKEN,
        ("GET", r"/sell/inventory/v1/location/.+"): (200, {"merchantLocationKey": "x"}),
        ("PUT", r"/sell/inventory/v1/inventory_item/.+"): (204, None),
        ("GET", r"/sell/inventory/v1/offer"): (404, None),
        ("POST", r"/sell/inventory/v1/offer"): (201, {"offerId": "OFF2"}),
        ("POST", r"/sell/inventory/v1/offer/OFF2/publish"): (400, errors),
    })
    res = EbayPublisher(cfg(), session=fake).publish(req())
    assert not res.success and res.step == "publish" and res.status == 400 and res.offer_id == "OFF2"
    row = res.error_rows()[0]
    assert row["Mã lỗi eBay"] == 25002 and "Type is missing" in row["Thông điệp eBay"]
    assert row["Tham số"] == "0=Type" and "item specifics" in row["Gợi ý sửa"]


def test_expired_refresh_token_reports_auth_step():
    fake = FakeEbay({("POST", "/identity/v1/oauth2/token"): (400, {"error": "invalid_grant",
                                                                     "error_description": "the provided authorization refresh token is invalid"})})
    res = EbayPublisher(cfg(), session=fake).publish(req())
    assert res.step == "auth" and res.errors[0].message == "invalid_grant"
    assert "Token" in res.errors[0].hint


def test_retry_on_server_error_then_success():
    state = {"n": 0}

    def flaky(kw):
        state["n"] += 1
        return (503, None) if state["n"] == 1 else (200, {"fulfillmentPolicies": [{"fulfillmentPolicyId": "F", "name": "Free"}]})

    fake = FakeEbay({**TOKEN, ("GET", r"/sell/account/v1/fulfillment_policy"): flaky,
                     ("GET", r"/sell/account/v1/payment_policy"): (200, {"paymentPolicies": []}),
                     ("GET", r"/sell/account/v1/return_policy"): (200, {"returnPolicies": [{"returnPolicyId": "R", "name": "30d"}]})})
    pol = EbayPublisher(cfg(), session=fake).get_policies()
    assert pol == {"fulfillment": [("F", "Free")], "payment": [], "return": [("R", "30d")]}


def test_validation_blocks_before_any_api_call():
    fake = FakeEbay({})
    res = EbayPublisher(cfg(payment_policy_id=""), session=fake).publish(
        req(title="x" * 81, image_urls=["http://insecure.jpg"], category_id="abc", aspects={}),
        required_aspects=["Brand", "Type"])
    msgs = " | ".join(e.message for e in res.errors)
    assert res.step == "validate" and not fake.calls
    for expected in ("80 ký tự", "https://", "Category ID", "business policies", "Type"):
        assert expected in msgs
    assert "Brand" not in msgs.split("Thiếu item specifics bắt buộc:")[1]  # Brand tự điền


def test_taxonomy_suggestions_and_required_aspects():
    fake = FakeEbay({
        ("POST", "/identity/v1/oauth2/token"): (200, {"access_token": "APPTOKEN", "expires_in": 7200}),
        ("GET", "/commerce/taxonomy/v1/get_default_category_tree_id"): (200, {"categoryTreeId": "0"}),
        ("GET", "/commerce/taxonomy/v1/category_tree/0/get_category_suggestions"): (200, {"categorySuggestions": [
            {"category": {"categoryId": "20625", "categoryName": "Baking Mats & Liners"},
             "categoryTreeNodeAncestors": [{"categoryName": "Bakeware"}, {"categoryName": "Home & Garden"}]}]}),
        ("GET", "/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category"): (200, {"aspects": [
            {"localizedAspectName": "Brand", "aspectConstraint": {"aspectRequired": True}},
            {"localizedAspectName": "Type", "aspectConstraint": {"aspectRequired": True}},
            {"localizedAspectName": "Color", "aspectConstraint": {"aspectRequired": False}}]}),
    })
    pub = EbayPublisher(cfg(), session=fake)
    assert pub.suggest_categories("silicone baking mat") == [("20625", "Home & Garden > Bakeware > Baking Mats & Liners")]
    assert pub.required_aspects("20625") == ["Brand", "Type"]
    assert fake.calls[0][2]["data"]["grant_type"] == "client_credentials"  # Taxonomy dùng app token


def test_oauth_consent_url_and_code_exchange():
    fake = FakeEbay({("POST", "/identity/v1/oauth2/token"): (200, {
        "access_token": "AT", "expires_in": 7200, "refresh_token": "RT-NEW", "refresh_token_expires_in": 47304000})})
    c = cfg(refresh_token="", ru_name="My_App-RuName", environment="production")
    pub = EbayPublisher(c, session=fake)
    url = pub.client.consent_url()
    q = parse_qs(urlparse(url).query)
    assert url.startswith("https://auth.ebay.com/oauth2/authorize?")
    assert q["redirect_uri"] == ["My_App-RuName"] and "sell.inventory" in q["scope"][0]
    pub.client.exchange_code("https://example.com/accepted?state=x&code=v%5E1.1%23abc&expires_in=299")
    sent = fake.calls[0][2]["data"]
    assert sent["code"] == "v^1.1#abc" and sent["grant_type"] == "authorization_code"
    assert c.refresh_token == "RT-NEW"


def test_config_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("EBAY_CLIENT_ID", "FROM_ENV")
    path = tmp_path / "config.json"
    assert PublisherConfig.load(path).client_id == "FROM_ENV"
    PublisherConfig(client_id="FROM_FILE", environment="production", payment_policy_id="P").save(path)
    loaded = PublisherConfig.load(path)
    assert (loaded.client_id, loaded.environment, loaded.payment_policy_id) == ("FROM_FILE", "production", "P")


def test_helpers():
    assert parse_aspects_text("Color: Red, Blue\nbad line\nMaterial:Silicone") == {
        "Color": ["Red", "Blue"], "Material": ["Silicone"]}
    assert "Shipping policy" in suggest_fix("Please provide a valid fulfillment policy")
    assert "ảnh" in suggest_fix("At least 1 picture is required")

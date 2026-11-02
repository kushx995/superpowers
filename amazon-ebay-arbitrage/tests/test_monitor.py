"""Kiểm thử database.py, monitor.py và cập nhật giá/số lượng hàng loạt của ebay_publisher."""

import json
from dataclasses import asdict

import pytest

from calculator import FeeSettings, ProductCost, analyze_profit, charm_price, min_price_for_margin
from database import (
    ACTIVE, ENDED, ERROR, PAUSED_OOS, PAUSED_UNPROFITABLE, Database, ListingRecord,
)
from ebay_publisher import EbayErrorDetail, EbayPublisher, PriceQtyUpdate, PublisherConfig
from monitor import (
    NONE, PAUSE_OOS, PAUSE_UNPROFITABLE, REPRICE, RESTORE, MonitorSettings, decide, run_once,
)
from sources import AmazonProduct, MockMonitorSource, ProductSource, SourceError

FEES = FeeSettings()


def make_record(sku="SKU-A1", asin="A1", buy=20.0, quantity=2, status=ACTIVE, **kw) -> ListingRecord:
    """Listing được định giá đúng như lúc đăng: giá bán = charm(giá tối thiểu đạt 25%)."""
    cost = ProductCost(buy, 0.0625, 0, 0, 0.03)
    sell = charm_price(min_price_for_margin(cost, FEES, 0.25))
    base = dict(sku=sku, asin=asin, buy_price=buy, sell_price=sell, target_margin=0.25, quantity=quantity,
                default_quantity=2, amazon_tax_rate=0.0625, price_buffer_rate=0.03,
                fees_json=json.dumps(asdict(FEES)), offer_id=f"OFF-{sku}", ebay_item_id="111", status=status)
    base.update(kw)
    return ListingRecord(**base)


def product(asin="A1", price=20.0, in_stock=True):
    return AmazonProduct(asin=asin, title="t", amazon_price=price, in_stock=in_stock)


S = MonitorSettings()


# ---------------------------------------------------------------------------
# decide(): ma trận tình huống
# ---------------------------------------------------------------------------
def test_unchanged_price_keeps_listing():
    d = decide(make_record(), product(price=20.0), S)
    assert d.action == NONE and d.margin_now >= 0.25


def test_out_of_stock_pauses():
    d = decide(make_record(), product(in_stock=False, price=None), S)
    assert (d.action, d.new_quantity, d.new_status) == (PAUSE_OOS, 0, PAUSED_OOS)


def test_still_out_of_stock_does_nothing():
    d = decide(make_record(quantity=0, status=PAUSED_OOS), product(in_stock=False, price=None), S)
    assert d.action == NONE


def test_small_price_rise_reprices_to_target():
    rec = make_record()
    d = decide(rec, product(price=22.0), S)  # +10%
    assert d.action == REPRICE and d.new_price > rec.sell_price
    assert f"{d.new_price:.2f}".endswith(".99")
    assert d.new_price <= rec.sell_price * 1.25
    # giá mới thực sự đạt biên với giá Amazon mới
    cost = ProductCost(22.0, 0.0625, 0, 0, 0.03)
    assert analyze_profit(d.new_price, cost, FEES).net_margin >= 0.25 and d.margin_after >= 0.25
    assert d.new_quantity is None  # đang bán → không đổi số lượng


def test_big_price_rise_pauses_instead_of_shock_reprice():
    d = decide(make_record(), product(price=30.0), S)  # +50% → vượt trần tăng giá 25%
    assert (d.action, d.new_quantity, d.new_status) == (PAUSE_UNPROFITABLE, 0, PAUSED_UNPROFITABLE)
    assert "trần" in d.reason


def test_max_increase_setting_is_respected():
    d = decide(make_record(), product(price=30.0), MonitorSettings(max_increase_pct=0.80))
    assert d.action == REPRICE


def test_back_in_stock_restores_quantity():
    d = decide(make_record(quantity=0, status=PAUSED_OOS), product(price=20.0), S)
    assert (d.action, d.new_quantity, d.new_status) == (RESTORE, 2, ACTIVE)


def test_back_in_stock_but_pricier_reprices_and_restores():
    d = decide(make_record(quantity=0, status=PAUSED_OOS), product(price=22.0), S)
    assert d.action == REPRICE and d.new_quantity == 2 and d.new_status == ACTIVE


def test_restore_can_be_disabled():
    d = decide(make_record(quantity=0, status=PAUSED_OOS), product(price=20.0),
               MonitorSettings(restore_when_back=False))
    assert d.action == NONE


def test_fetch_error_skips_or_pauses():
    assert decide(make_record(), None, S).action == NONE
    d = decide(make_record(), None, MonitorSettings(pause_on_fetch_error=True))
    assert (d.action, d.new_quantity) == (PAUSE_OOS, 0)


def test_impossible_margin_pauses():
    rec = make_record(fees_json=json.dumps(asdict(FeeSettings(promoted_ad_rate=0.5))))
    assert decide(rec, product(price=20.0), S).action == PAUSE_UNPROFITABLE


def test_cheaper_amazon_never_lowers_price_automatically():
    rec = make_record()
    d = decide(rec, product(price=12.0), S)
    assert d.action == NONE and d.new_price is None and "giảm giá" in d.reason


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
@pytest.fixture
def db(tmp_path):
    return Database(tmp_path / "t.db")


def test_database_roundtrip_and_upsert(db):
    rec = make_record()
    db.save(rec)
    got = db.get("SKU-A1")
    assert got.asin == "A1" and got.sell_price == rec.sell_price and got.fees["ebay_fvf_rate"] == FEES.ebay_fvf_rate
    created = got.created_at
    rec.sell_price = 99.99
    db.save(rec)  # upsert theo SKU
    again = db.get("SKU-A1")
    assert again.sell_price == 99.99 and again.created_at == created and len(db.all()) == 1


def test_database_filters_counts_and_events(db):
    db.save(make_record("S1", "A1"))
    db.save(make_record("S2", "A2", status=ENDED))
    db.save(make_record("S3", "A3", environment="production"))
    assert {r.sku for r in db.all(statuses=(ACTIVE,), environment="sandbox")} == {"S1"}
    assert db.counts("sandbox") == {ACTIVE: 1, ENDED: 1}
    db.update("S1", in_stock=False, quantity=0)
    assert db.get("S1").in_stock is False
    db.log("S1", "price", "msg", 10, 12)
    ev = db.events("S1")[0]
    assert (ev["kind"], ev["old_value"], ev["new_value"]) == ("price", "10", "12")
    with pytest.raises(ValueError):
        db.update("S1", status="WHATEVER")
    with pytest.raises(ValueError):
        db.update("S1", hacked_column=1)


# ---------------------------------------------------------------------------
# run_once()
# ---------------------------------------------------------------------------
class FakeSource(ProductSource):
    name = "fake"

    def __init__(self, products=None, error=None):
        self.products, self.error, self.calls = products or {}, error, []

    def search(self, keyword, category="All", limit=20):
        return []

    def get_products(self, asins):
        self.calls.append(list(asins))
        if self.error:
            raise self.error
        return [self.products[a] for a in asins if a in self.products]


class FakePublisher:
    def __init__(self, fail=()):
        self.fail, self.calls = set(fail), []

    def update_price_quantity(self, updates):
        self.calls.append(updates)
        return {u.sku: ([EbayErrorDetail(25001, "System error")] if u.sku in self.fail else []) for u in updates}


def _seed(db):
    db.save(make_record("S-OK", "A-OK"))
    db.save(make_record("S-OOS", "A-OOS"))
    db.save(make_record("S-UP", "A-UP"))
    db.save(make_record("S-BACK", "A-BACK", quantity=0, status=PAUSED_OOS))
    db.save(make_record("S-END", "A-END", status=ENDED))
    return FakeSource({
        "A-OK": product("A-OK", 20.0), "A-OOS": product("A-OOS", None, in_stock=False),
        "A-UP": product("A-UP", 22.0), "A-BACK": product("A-BACK", 20.0),
    })


def test_dry_run_changes_nothing_on_ebay(db):
    src = _seed(db)
    before = db.get("S-UP").sell_price
    report = run_once(db, src, None, MonitorSettings(dry_run=True))
    actions = {d.sku: d.action for d in report.decisions}
    assert actions == {"S-OK": NONE, "S-OOS": PAUSE_OOS, "S-UP": REPRICE, "S-BACK": RESTORE}  # S-END bị bỏ qua
    assert db.get("S-UP").sell_price == before and db.get("S-OOS").quantity == 2
    assert db.get("S-UP").current_buy_price == 22.0 and db.get("S-UP").last_checked_at
    assert db.events("S-OOS")[0]["kind"] == "dry_run"
    assert all("Chạy thử" in r["Kết quả"] for r in report.rows() if r["Hành động"] != "✔ Giữ nguyên")


def test_apply_updates_ebay_and_database(db):
    src, pub = _seed(db), FakePublisher()
    old_price = db.get("S-UP").sell_price
    report = run_once(db, src, pub, MonitorSettings(dry_run=False))
    sent = {u.sku: u for u in pub.calls[0]}
    assert set(sent) == {"S-OOS", "S-UP", "S-BACK"}
    assert (sent["S-OOS"].quantity, sent["S-OOS"].price) == (0, None)
    assert sent["S-UP"].price > old_price and sent["S-UP"].offer_id == "OFF-S-UP"
    assert sent["S-BACK"].quantity == 2
    assert (db.get("S-OOS").quantity, db.get("S-OOS").status) == (0, PAUSED_OOS)
    assert db.get("S-UP").sell_price == sent["S-UP"].price
    assert (db.get("S-BACK").quantity, db.get("S-BACK").status) == (2, ACTIVE)
    kinds = [e["kind"] for e in db.events("S-UP")]
    assert "price" in kinds and all(report.applied.values())


def test_failed_pause_is_flagged_as_error(db):
    src, pub = _seed(db), FakePublisher(fail={"S-OOS"})
    report = run_once(db, src, pub, MonitorSettings(dry_run=False))
    rec = db.get("S-OOS")
    assert rec.status == ERROR and rec.quantity == 2 and "System error" in rec.note
    assert report.applied["S-OOS"] is False and "System error" in report.errors["S-OOS"]
    assert db.events("S-OOS")[0]["kind"] == "error"
    # lần sau monitor vẫn theo dõi listing ERROR và thử lại
    pub.fail.clear()
    run_once(db, src, pub, MonitorSettings(dry_run=False))
    assert (db.get("S-OOS").status, db.get("S-OOS").quantity) == (PAUSED_OOS, 0)


def test_source_failure_is_reported_not_fatal(db):
    db.save(make_record())
    report = run_once(db, FakeSource(error=SourceError("quota hết")), FakePublisher(), MonitorSettings(dry_run=False))
    assert report.fetch_errors and report.decisions[0].action == NONE


def test_only_matching_environment_is_monitored(db):
    db.save(make_record("S1", "A1", environment="production"))
    src = FakeSource({"A1": product("A1", None, in_stock=False)})
    assert run_once(db, src, None, S, environment="sandbox").decisions == []


def test_batches_asins(db):
    for i in range(5):
        db.save(make_record(f"S{i}", f"A{i}"))
    src = FakeSource({f"A{i}": product(f"A{i}") for i in range(5)})
    run_once(db, src, None, MonitorSettings(batch_size=2))
    assert [len(c) for c in src.calls] == [2, 2, 1]


def test_mock_monitor_source_is_deterministic_with_seed():
    a = MockMonitorSource({"X": 10.0}, seed="s").get_products(["X", "Y"])
    b = MockMonitorSource({"X": 10.0}, seed="s").get_products(["X", "Y"])
    assert [(p.amazon_price, p.in_stock) for p in a] == [(p.amazon_price, p.in_stock) for p in b]


# ---------------------------------------------------------------------------
# ebay_publisher.update_price_quantity
# ---------------------------------------------------------------------------
class _Resp:
    def __init__(self, status, payload):
        self.status_code, self.text = status, json.dumps(payload)

    def json(self):
        return json.loads(self.text)


class _Session:
    def __init__(self, bulk_status=200, bulk_payload=None):
        self.bulk_status, self.bulk_payload, self.bodies = bulk_status, bulk_payload, []

    def request(self, method, url, **kw):
        if "oauth2/token" in url:
            return _Resp(200, {"access_token": "T", "expires_in": 7200})
        assert url.endswith("/sell/inventory/v1/bulk_update_price_quantity") and method == "POST"
        self.bodies.append(kw["json"])
        if self.bulk_payload is not None:
            return _Resp(self.bulk_status, self.bulk_payload)
        return _Resp(200, {"responses": [{"sku": r["sku"], "statusCode": 200} for r in kw["json"]["requests"]]})


def _pub(session):
    return EbayPublisher(PublisherConfig(client_id="a", client_secret="b", refresh_token="r"), session=session)


def test_bulk_update_body_and_chunking():
    s = _Session()
    updates = [PriceQtyUpdate(f"S{i}", f"O{i}", price=19.99 if i % 2 else None, quantity=0 if i % 2 == 0 else None)
               for i in range(30)]
    res = _pub(s).update_price_quantity(updates)
    assert [len(b["requests"]) for b in s.bodies] == [25, 5] and all(v == [] for v in res.values())
    r0, r1 = s.bodies[0]["requests"][0], s.bodies[0]["requests"][1]
    assert r0 == {"sku": "S0", "offers": [{"offerId": "O0", "availableQuantity": 0}],
                  "shipToLocationAvailability": {"quantity": 0}}
    assert r1 == {"sku": "S1", "offers": [{"offerId": "O1", "price": {"value": "19.99", "currency": "USD"}}]}


def test_bulk_update_partial_failure_and_missing_answer():
    payload = {"responses": [
        {"sku": "S1", "statusCode": 200},
        {"sku": "S2", "statusCode": 400, "errors": [{"errorId": 25002, "message": "Offer ended"}]},
    ]}
    res = _pub(_Session(207, payload)).update_price_quantity(
        [PriceQtyUpdate("S1", "O1", quantity=0), PriceQtyUpdate("S2", "O2", quantity=0), PriceQtyUpdate("S3", "O3", quantity=0)])
    assert res["S1"] == [] and res["S2"][0].error_id == 25002
    assert "không trả kết quả" in res["S3"][0].message


def test_bulk_update_request_failure_marks_all():
    res = _pub(_Session(401, {"errors": [{"errorId": 1001, "message": "Invalid access token"}]})).update_price_quantity(
        [PriceQtyUpdate("S1", "O1", quantity=0), PriceQtyUpdate("S2", "O2", quantity=0)])
    assert all(v and v[0].error_id == 1001 for v in res.values())


def test_reason_reports_change_since_listing():
    rec = make_record(current_buy_price=21.0)  # lần kiểm tra trước đã thấy 21$
    d = decide(rec, product(price=22.0), S)
    assert "+10.0% so với lúc đăng" in d.reason  # so với giá lúc đăng (20$), không phải 21$

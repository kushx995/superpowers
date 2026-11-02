"""
sources/paapi.py — Amazon Product Advertising API 5.0 (API chính thức)
=======================================================================

Yêu cầu: tài khoản Amazon Associates đã được duyệt (có doanh số qua link affiliate)
để lấy Access Key / Secret Key / Partner Tag.

Module tự ký request theo chuẩn AWS Signature V4 bằng thư viện chuẩn (hmac,
hashlib) — không cần cài SDK riêng.

⚠️ Amazon đã thông báo thay đổi một số "Resources" của PA-API (ví dụ Offers → OffersV2)
   và có kế hoạch chuyển đổi API. Trước khi chạy thật, hãy kiểm tra tài liệu mới nhất
   tại https://webservices.amazon.com/paapi5/documentation/ và chỉnh RESOURCES nếu cần.
   Hàm parse đã đọc được cả hai dạng Offers và OffersV2.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json
from typing import Optional

from .base import AmazonProduct, HttpClient, ProductSource, SourceError

RESOURCES = [
    "ItemInfo.Title",
    "ItemInfo.ByLineInfo",
    "ItemInfo.Features",
    "ItemInfo.ExternalIds",
    "Images.Primary.Large",
    "BrowseNodeInfo.WebsiteSalesRank",
    "CustomerReviews.Count",
    "CustomerReviews.StarRating",
    "OffersV2.Listings.Price",
    "OffersV2.Listings.Availability",
    "OffersV2.Listings.IsBuyBoxWinner",
]


def sign_v4(*, access_key: str, secret_key: str, region: str, service: str, host: str,
            path: str, target: str, body: str, now: Optional[dt.datetime] = None) -> dict[str, str]:
    """Tạo header đã ký AWS SigV4 cho một request POST JSON tới PA-API."""
    now = now or dt.datetime.now(dt.timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    headers = {
        "content-encoding": "amz-1.0",
        "content-type": "application/json; charset=utf-8",
        "host": host,
        "x-amz-date": amz_date,
        "x-amz-target": target,
    }
    signed_headers = ";".join(sorted(headers))
    canonical_headers = "".join(f"{k}:{headers[k]}\n" for k in sorted(headers))
    payload_hash = hashlib.sha256(body.encode()).hexdigest()
    canonical_request = "\n".join(["POST", path, "", canonical_headers, signed_headers, payload_hash])

    scope = f"{date_stamp}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical_request.encode()).hexdigest()
    ])

    def _hmac(key: bytes, msg: str) -> bytes:
        return hmac.new(key, msg.encode(), hashlib.sha256).digest()

    k_signing = _hmac(_hmac(_hmac(_hmac(f"AWS4{secret_key}".encode(), date_stamp), region), service), "aws4_request")
    signature = hmac.new(k_signing, string_to_sign.encode(), hashlib.sha256).hexdigest()

    headers["Authorization"] = (
        f"AWS4-HMAC-SHA256 Credential={access_key}/{scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    return headers


def _get(d: dict, *path: str, default=None):
    """Đọc giá trị lồng nhau an toàn: _get(item, "ItemInfo", "Title", "DisplayValue")."""
    for key in path:
        if isinstance(d, list):
            d = d[0] if d else None
        if not isinstance(d, dict):
            return default
        d = d.get(key)
    return default if d is None else d


class AmazonPAAPISource(ProductSource):
    name = "paapi"
    HOST = "webservices.amazon.com"

    def __init__(self, access_key: str, secret_key: str, partner_tag: str,
                 region: str = "us-east-1", marketplace: str = "www.amazon.com",
                 http: Optional[HttpClient] = None):
        if not (access_key and secret_key and partner_tag):
            raise SourceError("Thiếu PAAPI_ACCESS_KEY / PAAPI_SECRET_KEY / PAAPI_PARTNER_TAG")
        self.access_key, self.secret_key, self.partner_tag = access_key, secret_key, partner_tag
        self.region, self.marketplace = region, marketplace
        self.http = http or HttpClient()

    def _post(self, operation: str, payload: dict) -> dict:
        """Ký & gửi request tới /paapi5/<operation> (searchitems | getitems)."""
        path = f"/paapi5/{operation.lower()}"
        body = json.dumps({**payload, "PartnerTag": self.partner_tag, "PartnerType": "Associates",
                           "Marketplace": self.marketplace, "Resources": RESOURCES})
        headers = sign_v4(access_key=self.access_key, secret_key=self.secret_key, region=self.region,
                          service="ProductAdvertisingAPI", host=self.HOST, path=path,
                          target=f"com.amazon.paa.sdk.Service.ProductAdvertisingAPIv1.{operation}", body=body)
        return self.http.post(f"https://{self.HOST}{path}", data=body, headers=headers)

    def get_products(self, asins: list[str]) -> list[AmazonProduct]:
        out: list[AmazonProduct] = []
        for i in range(0, len(asins), 10):
            data = self._post("GetItems", {"ItemIds": asins[i:i + 10]})
            out.extend(self.parse_item(it) for it in _get(data, "ItemsResult", "Items", default=[]) or [])
        return out

    def search(self, keyword: str, category: str = "All", limit: int = 20) -> list[AmazonProduct]:
        products: list[AmazonProduct] = []
        page = 1
        while len(products) < limit and page <= 10:  # PA-API: tối đa 10 item/trang, 10 trang
            data = self._post("SearchItems", {
                "Keywords": keyword,
                "SearchIndex": category if category and category != "All" else "All",
                "ItemCount": 10,
                "ItemPage": page,
            })
            items = _get(data, "SearchResult", "Items", default=[])
            if not items:
                break
            products.extend(self.parse_item(it) for it in items)
            page += 1
        return products[:limit]

    def parse_item(self, it: dict) -> AmazonProduct:
        # Đọc giá: ưu tiên OffersV2 (mới), lùi về Offers (cũ).
        price = (_get(it, "OffersV2", "Listings", "Price", "Money", "Amount")
                 or _get(it, "Offers", "Listings", "Price", "Amount"))
        availability = (_get(it, "OffersV2", "Listings", "Availability", "Type")
                        or _get(it, "Offers", "Listings", "Availability", "Type", default=""))
        upcs = _get(it, "ItemInfo", "ExternalIds", "UPCs", "DisplayValues", default=[]) or \
            _get(it, "ItemInfo", "ExternalIds", "EANs", "DisplayValues", default=[])
        return AmazonProduct(
            asin=it.get("ASIN", ""),
            title=_get(it, "ItemInfo", "Title", "DisplayValue", default=""),
            amazon_price=float(price) if price else None,
            brand=_get(it, "ItemInfo", "ByLineInfo", "Brand", "DisplayValue", default=""),
            gtin=upcs[0] if upcs else "",
            amazon_rating=_get(it, "CustomerReviews", "StarRating", "Value"),
            review_count=_get(it, "CustomerReviews", "Count"),
            is_prime=bool(_get(it, "Offers", "Listings", "DeliveryInfo", "IsPrimeEligible", default=False)),
            in_stock=price is not None and availability in ("Now", "IN_STOCK", ""),
            bsr=_get(it, "BrowseNodeInfo", "WebsiteSalesRank", "SalesRank"),
            bullet_points=_get(it, "ItemInfo", "Features", "DisplayValues", default=[]),
            image_urls=[u] if (u := _get(it, "Images", "Primary", "Large", "URL")) else [],
            source=self.name,
        )

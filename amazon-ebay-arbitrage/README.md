# 💰 Amazon → eBay Profit Finder

Tool tìm sản phẩm trên Amazon có thể bán lại trên eBay với **biên lợi nhuận ròng mục tiêu** (mặc định ≥ 25%).
Tool kèm bộ lọc VeRO, AI viết listing và xuất file Bulk Upload cho eBay.

## 1. Kiến trúc

```
amazon-ebay-arbitrage/
├── ui_app.py              # Giao diện Streamlit — 3 tab: Tính lợi nhuận / Quét / Listing & Export
├── pipeline.py            # Điều phối: Amazon → tồn kho → VeRO → eBay → định giá → chấm điểm
├── calculator.py          # Lõi tài chính: phí eBay, thuế bang, buffer giá, giải giá tối thiểu
├── demand_checker.py      # Điểm tiềm năng 0–100 (sold 30 ngày, sell-through, BSR 90 ngày...)
├── vero_checker.py        # Rà soát thương hiệu VeRO (block / warn / ignore)
├── listing_generator.py   # Title SEO ≤80 ký tự + HTML description đã làm sạch (Claude AI + dự phòng)
├── ebay_export.py         # CSV File Exchange cho Seller Hub Reports (đăng hàng loạt)
├── scraper.py             # "Cổng vào" lớp dữ liệu: get_product_source() / get_market_source()
├── config.py              # Đọc API key từ .env
├── sources/
│   ├── base.py            # AmazonProduct, EbayMarketData, ProductSource, MarketSource, HttpClient (retry)
│   ├── mock.py            # Dữ liệu giả lập (không cần key)
│   ├── keepa.py           # Keepa: giá, LỊCH SỬ BSR & giá, tồn kho
│   ├── rainforest.py      # Rainforest: dữ liệu trang Amazon real-time
│   ├── paapi.py           # Amazon PA-API 5 (tự ký AWS SigV4, không cần SDK)
│   └── ebay.py            # eBay Browse (đang bán) + Marketplace Insights (đã bán)
├── data/vero_brands.csv   # Danh sách VeRO khởi đầu — BẠN CẦN BỔ SUNG
├── tests/                 # 890 test, chạy offline bằng HTTP giả
├── .env.example           # Mẫu cấu hình key
└── requirements.txt
```

Luồng dữ liệu:

```
          ┌─────────────── ProductSource ───────────────┐
 Từ khóa ─►  Mock | Keepa | Rainforest | PA-API          ├─► AmazonProduct (giá, BSR, tồn kho, lịch sử)
          └──────────────────────────────────────────────┘          │
                                                                      ▼
                         loại sớm: hết hàng / VeRO (tiết kiệm quota API eBay)
                                                                      ▼
          ┌──────────────── MarketSource ───────────────┐
          │  Mock | eBay Browse (+ Marketplace Insights) ├─► EbayMarketData (đang bán, đã bán 30 ngày)
          └──────────────────────────────────────────────┘          │
                                                                      ▼
            calculator.recommend_price()  ─►  giá đề xuất .99 / undercut đối thủ, Net, ROI
            demand_checker.demand_score() ─►  điểm 0–100
                                                                      ▼
            UI: chọn sản phẩm thắng ─► listing_generator ─► ebay_export ─► ebay_bulk_upload.csv
```

## 2. Công thức lợi nhuận (`calculator.py`)

Với giá bán eBay `P` (listing free shipping):

| Khoản | Công thức |
|---|---|
| Giá vốn Amazon | `giá × (1 + sales tax bang)`, có bảng thuế 20 bang và chỉnh tay 0–10% |
| Buffer biến động giá | `giá vốn × buffer%`. Chế độ tự động lấy ½ biên độ dao động giá 90 ngày, kẹp trong khoảng 2–15% |
| eBay Final Value Fee | `P × (1 + sales tax người mua) × FVF%`, vì **FVF tính trên cả thuế** |
| Phí cố định | 0.30$ nếu tổng đơn ≤ 10$, ngược lại 0.40$ |
| Promoted Listings | `P × ad%` |
| Dự phòng Return/Refund | `P × reserve%` |
| Thuế thu nhập | `max(0, LN trước thuế) × thuế suất` |

Tool **giải chính xác** giá tối thiểu: `P ≥ C·k / (a·k − m)` (xem docstring). Sau đó tool làm tròn **lên**
đuôi .99, hoặc đặt rẻ hơn giá tham chiếu của đối thủ 1 cent. Có 3 chiến lược tham chiếu: **trung vị giá đã
bán 30 ngày**, phân vị 25% giá đang bán, hoặc giá thấp nhất đang bán. Thiếu dữ liệu thì tool tự lùi về
chiến lược kế tiếp. Có test quét 800 mức giá để đảm bảo giá đề xuất **không bao giờ** dưới biên mục tiêu.

## 3. Cài đặt & chạy

```bash
cd amazon-ebay-arbitrage
python -m venv .venv
.venv\Scripts\activate            # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt

cp .env.example .env              # Windows: copy .env.example .env  → điền key (tùy chọn)
streamlit run ui_app.py           # mở http://localhost:8501
python -m pytest -q               # chạy 890 test (không cần mạng/key)
```

Chưa có key nào thì tool vẫn chạy đầy đủ với **dữ liệu giả lập**. Nguồn nào có key thì sẽ tự hiện trong sidebar.

## 4. Lấy API key

| Biến trong `.env` | Lấy ở đâu | Ghi chú |
|---|---|---|
| `KEEPA_API_KEY` | keepa.com → API | Trả phí theo token. Là nguồn **duy nhất có lịch sử BSR/giá**, nên buffer tự động cần nó |
| `RAINFOREST_API_KEY` | trajectdata.com (Rainforest API) | 1 credit/request; mặc định chỉ "làm giàu" top 10 kết quả |
| `PAAPI_*` | Amazon Associates → Tools → Product Advertising API | Cần tài khoản Associates đã có doanh số |
| `EBAY_CLIENT_ID/SECRET` | developer.ebay.com → keyset **Production** | Browse API: dữ liệu listing đang bán |
| `EBAY_ENABLE_INSIGHTS=1` | Xin quyền **Marketplace Insights API** từ eBay | ⚠️ Chỉ API này có dữ liệu **Sold**, và phải được eBay duyệt riêng |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Cho AI Listing. Không có key thì tool dùng bộ sinh theo quy tắc (miễn phí) |

## 5. Tích hợp vào project hiện tại

Nếu bạn đã có bản giai đoạn 1, các thay đổi tương thích ngược như sau:

1. **`calculator.py`**: các hàm cũ vẫn giữ nguyên tên và tham số. Phần mới gồm `ProductCost(price_buffer_rate=...)`,
   `US_STATE_SALES_TAX`, `suggest_buffer_rate()` và `ProfitBreakdown.cost_shares()`. Code cũ gọi `recommend_price()`
   vẫn chạy (buffer mặc định 0).
2. **`scraper.py`** giờ chỉ là "cổng vào"; các adapter nằm trong `sources/`. Import cũ
   `from scraper import MockProductSource, AmazonProduct` vẫn dùng được. Thông tin eBay **được tách** khỏi
   `AmazonProduct` sang `EbayMarketData`, nên code nào đọc `product.ebay_lowest_price` phải chuyển sang
   `market_source.lookup(product).reference_price(...)`.
3. **`demand_checker.demand_score(product, market)`** nhận thêm tham số `market` (có thể là `None`).
4. Dùng trong script riêng, không qua giao diện:

```python
from calculator import FeeSettings
from pipeline import ScanConfig, scan
from scraper import get_product_source, get_market_source
from vero_checker import VeroChecker
from listing_generator import ListingGenerator
from ebay_export import ExportRow, ExportSettings, to_csv
from config import settings

results = scan(get_product_source("keepa"), get_market_source("ebay"), FeeSettings(),
               ScanConfig("silicone baking mat", amazon_tax_rate=0.0625, target_margin=0.25),
               VeroChecker.from_csv(extra_brands=["BrandX"]))
gen = ListingGenerator(settings.anthropic_api_key, settings.listing_model)
rows = []
for r in (r for r in results if r.is_winner):
    lst = gen.generate(r.product)
    rows.append(ExportRow(r.product.asin, lst.title, lst.description_html,
                          r.recommendation.recommended_price, r.product.brand, r.product.gtin))
open("ebay_bulk_upload.csv", "wb").write(to_csv(rows, ExportSettings(category_id="20625")))
```

## 6. Những gì cần kiểm chứng trước khi dùng tiền thật

Các adapter API được viết theo tài liệu của từng nhà cung cấp và được test bằng **phản hồi giả lập**.
Chúng **chưa được chạy với key thật**. Khi có key, hãy chạy thử với `limit=3` và kiểm tra:

- **Keepa**: endpoint `/search` và các chỉ số `csv`/`stats.current` (giá AMAZON=0, NEW=1, BSR=3).
- **PA-API**: Amazon đang chuyển `Offers` sang `OffersV2` và có kế hoạch thay đổi API. Parser đọc được cả hai
  dạng, nhưng hãy đối chiếu tài liệu hiện hành.
- **Rainforest**: trường `stock_level` và bảng `specifications` (UPC) không phải sản phẩm nào cũng có.
- **eBay File Exchange**: tải template của đúng danh mục từ Seller Hub → Reports → Uploads, so tiêu đề cột
  với `ebay_export.COLUMNS`, rồi upload thử 1–2 dòng trước.
- **Phí eBay** (13.6% FVF, 0.30$/0.40$): đối chiếu trang *Selling fees* hiện hành.
- **AI Listing** dùng Claude với structured output và bật `fallbacks: "default"`: nếu model chính từ chối, API
  tự chạy lại trên model dự phòng; model dự phòng cũng từ chối thì tool tự dùng bộ sinh theo quy tắc. Test dùng
  client giả, nên lần đầu có key hãy tạo thử 1 listing và đọc kết quả.

## 7. ⚠️ Rủi ro chính sách — đọc kỹ

1. **eBay cấm "retail arbitrage dropshipping"**: không được đặt hàng từ một nhà bán lẻ khác (Amazon, Walmart...)
   rồi giao thẳng cho khách eBay. Vi phạm có thể khiến tài khoản bị hạ hạng, hạn chế hoặc khóa vĩnh viễn.
   Các bộ lọc trong tool (VeRO, xóa dấu vết Amazon) giúp listing chuyên nghiệp hơn, nhưng **không** làm mô hình
   này trở nên hợp lệ. Mô hình an toàn hơn là mua về kho rồi tự gửi đi, hoặc làm việc với nhà cung cấp/bán sỉ
   cho phép dropship.
2. **VeRO**: danh sách đi kèm chỉ là điểm khởi đầu, không phải danh sách chính thức. Hãy bổ sung từ trang
   *VeRO Participant Profiles* của eBay.
3. **Ảnh sản phẩm**: ảnh trên Amazon thuộc bản quyền của người bán/thương hiệu. Vì vậy export mặc định **không**
   kèm URL ảnh nguồn.
4. **Biên ròng 25% là mục tiêu cao**: thường cần giá bán khoảng **2.2–2.4 lần** giá Amazon.

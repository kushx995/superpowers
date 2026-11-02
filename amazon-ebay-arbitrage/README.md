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
├── ebay_publisher.py      # Auto Listing: đăng trực tiếp qua Sell Inventory API + OAuth + báo lỗi chi tiết
├── database.py            # SQLite: listing đã đăng + nhật ký thay đổi (data/listings.db)
├── monitor.py             # Canh giá/tồn kho Amazon → tự hạ số lượng / tăng giá trên eBay (UI hoặc dòng lệnh)
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
├── tests/                 # 926 test, chạy offline bằng HTTP giả
├── .env.example           # Mẫu cấu hình key
├── config.example.json    # Mẫu config.json cho Auto Listing (copy thành config.json)
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

**Cách nhanh nhất:** sau khi cài Python 3.10+ (Windows: nhớ tick *Add Python to PATH*):
- **Windows:** bấm đúp vào **`run_windows.bat`**.
- **macOS/Linux:** mở Terminal tại thư mục này rồi chạy `bash run_mac_linux.sh`.

Script tự kiểm tra Python, tạo `.venv`, cài thư viện rồi mở tool tại http://localhost:8501. Nếu gặp lỗi, script sẽ
báo đang hỏng ở bước nào. Muốn tự làm từng bước thì xem các lệnh dưới đây.

```bash
cd amazon-ebay-arbitrage
python -m venv .venv
.venv\Scripts\activate            # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt

cp .env.example .env              # Windows: copy .env.example .env  → điền key (tùy chọn)
streamlit run ui_app.py           # mở http://localhost:8501
python -m pytest -q               # chạy 926 test (không cần mạng/key)
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

## 6. Auto Listing: đăng thẳng lên eBay (`ebay_publisher.py`)

Mỗi sản phẩm trong tab **📝 Listing & Export** có khối **🚀 Đăng lên eBay ngay**:

1. **🔎 Gợi ý danh mục**: Taxonomy API đề xuất danh mục lá từ tiêu đề; nếu muốn, bạn có thể nhập ID tay.
2. **📋 Kiểm tra thông số bắt buộc**: tool lấy item specifics bắt buộc của danh mục và điền sẵn vào ô Aspects
   (ví dụ `Type: `), bạn chỉ cần điền giá trị.
3. **Ảnh**: dán URL ảnh HTTPS mà bạn có quyền sử dụng. eBay yêu cầu ít nhất 1 ảnh.
4. Nút đăng **tự khóa** khi gặp một trong các trường hợp sau, kèm lý do hiển thị ngay bên dưới:
   - thiếu thông tin;
   - sản phẩm dính VeRO;
   - giá thấp hơn giá tối thiểu đạt biên;
   - đang ở Production mà chưa tick xác nhận.
5. Tool tự cấu hình: **Condition = NEW**, giá đã tính (.99), SKU = `SKU-<ASIN>`, 3 business policies mặc định
   và kho hàng (tự tạo nếu chưa có). Đăng lại cùng SKU sẽ **cập nhật** offer cũ, không tạo listing trùng.
6. Khi eBay từ chối, tool hiển thị **bước bị lỗi** (Xác thực / Kho hàng / Inventory item / Offer / Publish),
   kèm **HTTP status, mã lỗi eBay (errorId), thông điệp gốc, chi tiết, tham số** và **💡 gợi ý sửa** bằng tiếng Việt.

Quy trình tool gọi API: `token → location → PUT inventory_item/{sku} → POST/PUT offer → POST offer/{id}/publish`.

> Vì sao chọn **Sell Inventory API** thay vì Trading API? Inventory API dùng REST/JSON, lỗi trả về có cấu trúc,
> quản lý theo SKU và là hướng eBay khuyến nghị cho tích hợp mới. Lưu ý: listing tạo bằng Inventory API nên được
> sửa tiếp bằng Inventory API (đăng lại từ tool), không trộn với Trading API.

### Hướng dẫn lấy Token từ eBay Developer Portal

**Bước 1: Tạo tài khoản developer.** Vào https://developer.ebay.com → *Register*. eBay có thể mất tới 1 ngày
làm việc để duyệt.

**Bước 2: Tạo Application Keys.** Đăng nhập → menu tài khoản → **Application Keys** → đặt tên app → tạo keyset
**Sandbox** (và **Production** khi đã sẵn sàng). Mỗi keyset có:
- **App ID (Client ID)**: điền vào ô *App ID*
- **Cert ID (Client Secret)**: điền vào ô *Cert ID*. Giữ bí mật!
- Dev ID: tool không dùng.

> ⚠️ Keyset **Production** thường chỉ được kích hoạt sau khi bạn khai báo cách xử lý thông báo
> *Marketplace Account Deletion*: đăng ký một endpoint, hoặc xin miễn trừ nếu app không lưu dữ liệu người dùng
> eBay. Làm theo hướng dẫn hiện ra trên trang Application Keys.

**Bước 3: Tạo tài khoản test (chỉ cho Sandbox).** Trên developer.ebay.com, mục *Sandbox* → tạo **Sandbox test
user**. Đây là tài khoản bạn sẽ đăng nhập ở bước cấp quyền khi thử trên Sandbox.

**Bước 4: Lấy RuName (eBay Redirect URL name).** Cạnh keyset, bấm **User Tokens** →
*Get a Token from eBay via Your Application* → **Add eBay Redirect URL**:
- Điền *Display Title* và *Privacy Policy URL*.
- Điền **Auth Accepted URL**: một trang HTTPS bất kỳ của bạn. Trang này không cần xử lý gì, vì tool chỉ cần
  đọc `code=` trên thanh địa chỉ.
- Lưu lại, rồi copy giá trị **RuName** (dạng `Ten_Ban-TenApp-SBX-xxxx-yyyy`) vào ô *RuName* trong tool.

**Bước 5: Lấy token, chọn 1 trong 2 cách (tab 🔌 Kết nối eBay):**
- **Cách A, khuyến nghị (có refresh token sống ~18 tháng):**
  1. Bấm *link cấp quyền eBay*, đăng nhập **tài khoản bán hàng** (Sandbox: test user) rồi bấm **Agree**.
  2. eBay chuyển tới Auth Accepted URL. Copy **cả URL** trên thanh địa chỉ (có `code=...`) và dán vào tool
     **trong vòng 5 phút**.
  3. Bấm **🔑 Đổi lấy refresh token**. Từ đây tool tự xin access token mới mỗi 2 giờ.
- **Cách B, thử nhanh:** trên trang *User Tokens* của Developer Portal, chọn *OAuth* → *Sign in* → copy
  **User access token** (sống 2 giờ) rồi dán vào ô tương ứng và **nhấn Enter**. Nếu portal cấp cả refresh token,
  dán refresh token để dùng lâu dài.

Token phải có scope **sell.inventory** và **sell.account**. Link ở Cách A đã tự yêu cầu đủ các scope này.

**Bước 6: Business Policies và kho hàng.**
1. Tạo Shipping / Payment / Return policy trong **Seller Hub → Account → Business policies**. Nếu tài khoản chưa
   bật Business Policies, bấm nút **Bật Business Policies** trong tool trước.
2. Trong tool, bấm **📥 Tải chính sách** và chọn policy mặc định.
3. Nhập **ZIP code** kho hàng.
4. Bấm **💾 Lưu vào config.json**.

> Giao diện Seller Hub của Sandbox khá hạn chế. Nếu không tạo được policy trên Sandbox, có thể cần tạo bằng
> Account API.

**Cấu hình bằng file** (thay vì nhập trên giao diện): `cp config.example.json config.json` rồi điền các trường.
Tool nạp theo thứ tự ưu tiên `config.json` > biến môi trường `EBAY_CLIENT_ID / EBAY_CLIENT_SECRET /
EBAY_REFRESH_TOKEN / EBAY_RUNAME`. File `config.json` chứa bí mật, đã nằm trong `.gitignore`, **đừng gửi cho ai**.

**Luôn thử trên Sandbox trước.** Nếu một trường tool gửi lên bị Sandbox từ chối, bảng lỗi sẽ chỉ rõ trường nào,
và bạn sửa trước khi chuyển sang Production.

## 7. Database & Monitor tự động (`database.py`, `monitor.py`)

**Database:** mỗi listing đăng thành công từ tool được lưu tự động vào `data/listings.db` (SQLite, không cần cài
thêm). Mỗi listing lưu:
- ASIN, eBay Item ID và offer ID;
- giá mua gốc và giá Amazon mới nhất;
- giá bán hiện tại, số lượng và trạng thái;
- **toàn bộ giả định tài chính lúc đăng** (thuế, buffer, ship, phí eBay), để monitor tính lại biên đúng như
  lúc định giá.

Mọi thay đổi được ghi vào bảng nhật ký `events`.

**Quy tắc của monitor** (hàm `decide()` trong `monitor.py`):

| Tình huống | Hành động trên eBay | Trạng thái |
|---|---|---|
| Amazon hết hàng | Số lượng = 0 | 📦 `PAUSED_OOS` |
| Giá Amazon tăng, biên < mục tiêu, giá mới tăng ≤ 25% | Tăng giá lên mức đạt biên (đuôi .99) | 🟢 `ACTIVE` |
| Giá Amazon tăng mạnh, cần tăng giá > 25% | Số lượng = 0 (không tăng giá sốc) | 📉 `PAUSED_UNPROFITABLE` |
| Có hàng / đủ lời trở lại | Khôi phục số lượng chuẩn | 🟢 `ACTIVE` |
| Không lấy được dữ liệu Amazon | Bỏ qua (hoặc tạm dừng nếu bật tùy chọn an toàn) | giữ nguyên |
| Gửi eBay thất bại | Ghi lỗi, **lần sau thử lại** | ❗ `ERROR` |

Monitor **không tự giảm giá** khi Amazon rẻ đi. Nó chỉ ghi chú cơ hội giảm giá để bạn tự quyết.

**Cách chạy:**
- **Trên giao diện:** tab **📊 Đang bán & Monitor** → **▶️ Chạy kiểm tra ngay**. Chế độ *Chạy thử* bật sẵn, nên
  tool chỉ báo cáo; tắt *Chạy thử* đi thì tool mới sửa eBay.
- **Tự động 24/7, chạy ở cửa sổ terminal riêng:**

```bash
python monitor.py --once                                   # chạy thử 1 vòng, KHÔNG sửa eBay
python monitor.py --once --apply --source keepa            # 1 vòng, cập nhật eBay thật
python monitor.py --apply --interval 60 --source keepa     # chạy liên tục mỗi 60 phút
python monitor.py --apply --max-increase 15 --pause-on-fetch-error   # chặt chẽ hơn
```

Thay vì `--interval`, bạn có thể dùng **Task Scheduler** (Windows) hoặc **cron** (macOS/Linux) để gọi
`python monitor.py --once --apply` mỗi giờ. Monitor đọc token từ `config.json`, chỉ xử lý listing thuộc môi trường
đang cấu hình (sandbox/production) và ghi log vào `monitor.log`.

**Lưu ý khi chạy thật:**
- Nguồn **Keepa** cho phép kiểm tra 100 ASIN mỗi lần gọi, rẻ nhất cho monitor. **Rainforest** tốn 1 credit cho
  mỗi ASIN mỗi lần kiểm tra. Hãy tính chi phí theo `số listing × số lần kiểm tra mỗi ngày`.
- Dữ liệu từ API có độ trễ. Giá Amazon có thể đổi giữa hai lần kiểm tra, nên vẫn cần giữ buffer giá.
- Đưa số lượng về 0 có thể làm eBay **kết thúc** listing GTC. Muốn listing chỉ bị ẩn và giữ lịch sử bán, hãy bật
  **Out-of-stock option** trong Seller Hub → Selling preferences. Nếu listing đã bị kết thúc, lệnh khôi phục số
  lượng sẽ báo lỗi và listing chuyển sang trạng thái ❗.
- Nút **Ngừng theo dõi** chỉ dừng monitor cho SKU đó, **không** gỡ listing trên eBay.

## 8. Những gì cần kiểm chứng trước khi dùng tiền thật

Các adapter API được viết theo tài liệu của từng nhà cung cấp và được test bằng **phản hồi giả lập**.
Chúng **chưa được chạy với key thật**. Khi có key, hãy chạy thử với `limit=3` và kiểm tra:

- **Keepa**: endpoint `/search` và các chỉ số `csv`/`stats.current` (giá AMAZON=0, NEW=1, BSR=3).
- **PA-API**: Amazon đang chuyển `Offers` sang `OffersV2` và có kế hoạch thay đổi API. Parser đọc được cả hai
  dạng, nhưng hãy đối chiếu tài liệu hiện hành.
- **Rainforest**: trường `stock_level` và bảng `specifications` (UPC) không phải sản phẩm nào cũng có.
- **eBay File Exchange**: tải template của đúng danh mục từ Seller Hub → Reports → Uploads, so tiêu đề cột
  với `ebay_export.COLUMNS`, rồi upload thử 1–2 dòng trước.
- **Phí eBay** (13.6% FVF, 0.30$/0.40$): đối chiếu trang *Selling fees* hiện hành.
- **Auto Listing**: `ebay_publisher.py` được viết theo cấu trúc Sell Inventory / Account / Taxonomy API mà
  tôi biết. Môi trường phát triển **không truy cập được** trang tài liệu developer.ebay.com để đối chiếu, nên tool
  chỉ được test với một máy chủ eBay giả lập. Hãy chạy trên **Sandbox** trước và đọc kỹ bảng lỗi nếu có.
- **Monitor**: endpoint `bulk_update_price_quantity` (Sell Inventory API) và cách eBay phản hồi từng SKU được viết
  theo hiểu biết của tôi, và mới chỉ test với máy chủ eBay giả lập. Hãy chạy `--once --apply` trên **Sandbox** với
  1–2 listing trước khi bật chạy liên tục trên Production.
- **AI Listing** dùng Claude với structured output và bật `fallbacks: "default"`: nếu model chính từ chối, API
  tự chạy lại trên model dự phòng; model dự phòng cũng từ chối thì tool tự dùng bộ sinh theo quy tắc. Test dùng
  client giả, nên lần đầu có key hãy tạo thử 1 listing và đọc kết quả.

## 9. ⚠️ Rủi ro chính sách — đọc kỹ

1. **eBay cấm "retail arbitrage dropshipping"**: không được đặt hàng từ một nhà bán lẻ khác (Amazon, Walmart...)
   rồi giao thẳng cho khách eBay. Vi phạm có thể khiến tài khoản bị hạ hạng, hạn chế hoặc khóa vĩnh viễn.
   Auto Listing giúp đăng nhanh hơn, nên **vi phạm cũng nhân lên nhanh hơn**.
   Các bộ lọc trong tool (VeRO, xóa dấu vết Amazon) giúp listing chuyên nghiệp hơn, nhưng **không** làm mô hình
   này trở nên hợp lệ. Mô hình an toàn hơn là mua về kho rồi tự gửi đi, hoặc làm việc với nhà cung cấp/bán sỉ
   cho phép dropship.
2. **VeRO**: danh sách đi kèm chỉ là điểm khởi đầu, không phải danh sách chính thức. Hãy bổ sung từ trang
   *VeRO Participant Profiles* của eBay.
3. **Ảnh sản phẩm**: ảnh trên Amazon thuộc bản quyền của người bán/thương hiệu. Vì vậy export mặc định **không**
   kèm URL ảnh nguồn.
4. **Biên ròng 25% là mục tiêu cao**: thường cần giá bán khoảng **2.2–2.4 lần** giá Amazon.

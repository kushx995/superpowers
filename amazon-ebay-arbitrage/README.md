# 💰 Amazon → eBay Profit Finder

Tool tìm sản phẩm trên Amazon có thể bán lại trên eBay với biên lợi nhuận ròng mục tiêu (mặc định ≥ 25%).

## 1. Kiến trúc

```
amazon-ebay-arbitrage/
├── calculator.py        # ✅ Profit Analyzer — lõi tính toán, không phụ thuộc thư viện ngoài
├── scraper.py           # ✅ Giao diện ProductSource + MockProductSource (dữ liệu giả lập)
│                        #    ⏳ AmazonPAAPISource (khung sẵn, triển khai giai đoạn 2)
├── demand_checker.py    # ✅ Chấm điểm nhu cầu/cạnh tranh 0-100
├── ui_app.py            # ✅ Giao diện Streamlit (2 tab: tính 1 SP / quét hàng loạt)
├── listing_generator.py # ⏳ Giai đoạn 3: AI tối ưu Title SEO + Description
├── tests/               # ✅ pytest cho calculator
└── requirements.txt
```

Luồng dữ liệu:

```
 Từ khóa ──► ProductSource.search() ──► [AmazonProduct...]
                                             │
                    ┌────────────────────────┼─────────────────────────┐
                    ▼                        ▼                         ▼
           demand_checker.score()   calculator.recommend_price()   listing_generator
           (nhu cầu, cạnh tranh)    (giá đề xuất, Net, ROI)        (giai đoạn 3)
                    └────────────────────────┬─────────────────────────┘
                                             ▼
                                ui_app.py (bảng xếp hạng, CSV)
```

**Vì sao chọn Streamlit:** viết giao diện hoàn toàn bằng Python, chạy ngay trên máy, có bảng, slider và
nút tải CSV sẵn. Phần lõi (`calculator.py`) tách riêng nên sau này vẫn gọi được từ script dòng lệnh
hoặc từ API.

## 2. Công thức tính lợi nhuận

Giả định listing **Free Shipping** (dễ cạnh tranh nhất), với giá bán eBay `P`:

| Khoản | Công thức |
|---|---|
| Giá vốn Amazon | `giá Amazon × (1 + sales tax khi mua)` |
| eBay Final Value Fee | `P × (1 + sales tax người mua) × FVF%` — eBay tính FVF trên **tổng đơn, gồm cả thuế** |
| Phí cố định / đơn | 0.30$ nếu tổng đơn ≤ 10$, ngược lại 0.40$ |
| Promoted Listings | `P × % quảng cáo` |
| Dự phòng hoàn hàng | `P × % dự phòng` |
| Thuế thu nhập | `max(0, LN trước thuế) × thuế suất` |
| **Net Profit** | `P − tất cả các khoản trên` |
| **Biên LN ròng** | `Net / P` |
| **ROI** | `Net / (giá vốn Amazon + ship + chi khác)` |

Mọi khoản phí đều tỉ lệ thuận với `P`, nên tool **giải chính xác** giá tối thiểu để đạt biên mục tiêu
(`P ≥ C·k / (a·k − m)`, xem docstring `calculator.py`). Sau đó tool làm tròn **lên** giá đuôi .99, hoặc
đặt rẻ hơn đối thủ 1 cent nếu vẫn còn đủ biên. Kết quả không bao giờ thấp hơn biên mục tiêu: test quét
800 mức giá để kiểm tra điều này.

> ⚠️ Tỉ lệ FVF mặc định chỉ để tham khảo. eBay đổi biểu phí định kỳ, nên trước khi dùng hãy đối chiếu
> trang *Selling fees* của eBay rồi chọn "Tùy chỉnh" trong sidebar.

## 3. Cài đặt & chạy (Windows / macOS / Linux)

**Bước 1: cài Python 3.10 trở lên** từ https://www.python.org/downloads/. Trên Windows, nhớ tick
*"Add Python to PATH"* khi cài.

**Bước 2: mở Terminal (hoặc PowerShell), vào thư mục dự án và tạo môi trường ảo:**

```bash
cd amazon-ebay-arbitrage
python -m venv .venv

# Kích hoạt môi trường ảo
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate
```

**Bước 3: cài thư viện:**

```bash
pip install -r requirements.txt
```

**Bước 4: chạy giao diện web:**

```bash
streamlit run ui_app.py
```

Trình duyệt sẽ tự mở http://localhost:8501.

**Các lệnh khác:**

```bash
python calculator.py      # Tính thử 1 ví dụ ngay trên dòng lệnh
python -m pytest -q       # Chạy bộ test
```

## 4. Lưu ý quan trọng trước khi kinh doanh thật

1. **Chính sách dropshipping của eBay.** eBay **không cho phép** đặt hàng từ một nhà bán lẻ khác
   (như Amazon) rồi giao thẳng tới khách eBay. Vi phạm có thể khiến tài khoản bị hạ hạng hoặc khóa.
   Mô hình an toàn hơn là mua về kho của bạn rồi tự gửi đi (retail arbitrage), hoặc làm việc với nhà
   cung cấp bán sỉ. Hãy đọc kỹ chính sách hiện hành của eBay.
2. **Scraping Amazon** vi phạm điều khoản của Amazon và dễ bị chặn. Giai đoạn 2 nên dùng
   Product Advertising API hoặc một dịch vụ dữ liệu có giấy phép.
3. **Biên ròng 25% sau thuế là mục tiêu cao.** Với cấu hình mặc định, giá bán cần khoảng **2.2 lần**
   giá Amazon. Vì vậy chế độ quét thường lọc ra rất ít sản phẩm.

## 5. Lộ trình tiếp theo

- [ ] **Giai đoạn 2:** kết nối dữ liệu thật: Amazon PA-API, cùng eBay Browse API để lấy giá đối thủ và số lượng listing.
- [ ] **Giai đoạn 3:** `listing_generator.py` dùng AI để viết Title SEO (≤ 80 ký tự) và Description.
- [ ] Lưu lịch sử quét (SQLite) và theo dõi biến động giá Amazon.

#!/usr/bin/env bash
# ===================================================================
#  Chạy tool Amazon → eBay Profit Finder trên macOS / Linux
#  Cách dùng: mở Terminal tại thư mục này rồi chạy:  bash run_mac_linux.sh
#  Lần đầu mất 2–5 phút để cài thư viện; các lần sau mở ngay.
# ===================================================================
set -u
cd "$(dirname "$0")"

echo "[1/4] Kiểm tra Python..."
PY=""
for cand in python3 python; do
  if command -v "$cand" >/dev/null 2>&1 && "$cand" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
    PY="$cand"; break
  fi
done
if [ -z "$PY" ]; then
  echo "[LỖI] Không tìm thấy Python 3.9+. Tải tại https://www.python.org/downloads/ rồi chạy lại."
  exit 1
fi
"$PY" --version

echo "[2/4] Tạo môi trường ảo (.venv)..."
if [ ! -x ".venv/bin/python" ]; then
  if ! "$PY" -m venv .venv; then
    echo "[LỖI] Không tạo được .venv. Trên Ubuntu/Debian hãy chạy: sudo apt install python3-venv"
    exit 1
  fi
fi

echo "[3/4] Cài thư viện (lần đầu hơi lâu)..."
.venv/bin/python -m pip install --upgrade pip >/dev/null
if ! .venv/bin/python -m pip install -r requirements.txt; then
  echo "[LỖI] Cài thư viện thất bại. Kiểm tra mạng rồi copy thông báo lỗi ở trên gửi lại."
  exit 1
fi

# Bỏ qua câu hỏi Email của Streamlit ở lần chạy đầu
if [ ! -f "$HOME/.streamlit/credentials.toml" ]; then
  mkdir -p "$HOME/.streamlit" && printf '[general]\nemail = ""\n' > "$HOME/.streamlit/credentials.toml"
fi

echo "[4/4] Mở tool... trình duyệt sẽ tự mở; nếu không, mở địa chỉ ở dòng \"Local URL\" bên dưới (Ctrl+C để tắt)"
exec .venv/bin/python -m streamlit run ui_app.py

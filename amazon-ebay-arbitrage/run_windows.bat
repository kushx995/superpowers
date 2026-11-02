@echo off
REM ===================================================================
REM  Chay tool Amazon -^> eBay Profit Finder tren Windows
REM  Cach dung: bam dup (double-click) vao file nay.
REM  Lan dau mat 2-5 phut de cai thu vien; cac lan sau mo ngay.
REM ===================================================================
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo [1/4] Kiem tra Python...
set "PY="
python --version >nul 2>nul && set "PY=python"
if not defined PY (
    py -3 --version >nul 2>nul && set "PY=py -3"
)
if not defined PY (
    echo.
    echo [LOI] Chua tim thay Python.
    echo   - Tai Python 3.10+ tai https://www.python.org/downloads/
    echo   - Khi cai, NHO TICK o "Add Python to PATH", roi mo lai file nay.
    echo   - Neu go "python" ma Microsoft Store hien len: vao Settings ^> Apps ^>
    echo     Advanced app settings ^> App execution aliases, TAT 2 dong python.exe / python3.exe.
    pause
    exit /b 1
)
%PY% --version

echo.
echo [2/4] Tao moi truong ao (.venv)...
if not exist ".venv\Scripts\python.exe" (
    %PY% -m venv .venv
    if errorlevel 1 (
        echo [LOI] Khong tao duoc .venv. Hay chup man hinh loi nay gui lai.
        pause
        exit /b 1
    )
)

echo.
echo [3/4] Cai thu vien (lan dau hoi lau)...
".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo [LOI] Cai thu vien that bai. Kiem tra ket noi mang, roi chup man hinh loi gui lai.
    pause
    exit /b 1
)

echo.
echo [4/4] Mo tool... Trinh duyet se tu mo http://localhost:8501
echo        (Dong cua so nay = tat tool)
".venv\Scripts\python.exe" -m streamlit run ui_app.py
echo.
echo Tool da dung. Neu co loi o tren, hay chup man hinh gui lai.
pause

"""
config.py — Đọc cấu hình & API key từ biến môi trường / file .env
==================================================================

KHÔNG BAO GIỜ ghi API key trực tiếp vào code. Hãy copy `.env.example` thành `.env`
và điền key vào đó (file .env đã được .gitignore bỏ qua).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:  # python-dotenv là tùy chọn: có thì tự nạp .env, không có thì chỉ đọc biến môi trường.
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).with_name(".env"))
except ImportError:
    pass


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


@dataclass(frozen=True)
class Settings:
    keepa_api_key: str = _env("KEEPA_API_KEY")
    rainforest_api_key: str = _env("RAINFOREST_API_KEY")
    paapi_access_key: str = _env("PAAPI_ACCESS_KEY")
    paapi_secret_key: str = _env("PAAPI_SECRET_KEY")
    paapi_partner_tag: str = _env("PAAPI_PARTNER_TAG")
    ebay_client_id: str = _env("EBAY_CLIENT_ID")
    ebay_client_secret: str = _env("EBAY_CLIENT_SECRET")
    ebay_enable_insights: bool = _env("EBAY_ENABLE_INSIGHTS") in ("1", "true", "yes")
    anthropic_api_key: str = _env("ANTHROPIC_API_KEY")
    listing_model: str = _env("LISTING_MODEL", "claude-opus-5-5")

    def available_product_sources(self) -> dict[str, bool]:
        """Nguồn Amazon nào đã cấu hình đủ key."""
        return {
            "mock": True,
            "keepa": bool(self.keepa_api_key),
            "rainforest": bool(self.rainforest_api_key),
            "paapi": bool(self.paapi_access_key and self.paapi_secret_key and self.paapi_partner_tag),
        }

    def available_market_sources(self) -> dict[str, bool]:
        return {"mock": True, "ebay": bool(self.ebay_client_id and self.ebay_client_secret)}


settings = Settings()

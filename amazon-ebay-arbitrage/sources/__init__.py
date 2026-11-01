"""Gói nguồn dữ liệu: mỗi file là một "adapter" cho một nhà cung cấp dữ liệu."""

from .base import AmazonProduct, EbayMarketData, HttpClient, MarketSource, ProductSource, SourceError
from .ebay import EbayMarketSource
from .keepa import KeepaSource
from .mock import MockMarketSource, MockProductSource
from .paapi import AmazonPAAPISource
from .rainforest import RainforestSource

__all__ = [
    "AmazonProduct", "EbayMarketData", "HttpClient", "MarketSource", "ProductSource", "SourceError",
    "EbayMarketSource", "KeepaSource", "MockMarketSource", "MockProductSource",
    "AmazonPAAPISource", "RainforestSource",
]

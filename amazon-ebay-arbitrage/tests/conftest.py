"""Cấu hình chung cho pytest: thêm thư mục dự án vào sys.path + session HTTP giả."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = str(payload)

    def json(self):
        return self._payload


class FakeSession:
    """Trả lời theo thứ tự đã định sẵn cho từng URL (khớp theo chuỗi con)."""

    def __init__(self, routes):
        self.routes = {k: list(v) for k, v in routes.items()}
        self.calls = []

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        for key, queue in self.routes.items():
            if key in url:
                status, payload = queue.pop(0) if len(queue) > 1 else queue[0]
                return FakeResponse(status, payload)
        raise AssertionError(f"URL không mong đợi: {url}")


@pytest.fixture
def no_sleep(monkeypatch):
    monkeypatch.setattr("sources.base.time.sleep", lambda s: None)

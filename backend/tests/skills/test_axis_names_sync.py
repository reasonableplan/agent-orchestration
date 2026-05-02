"""6축 이름이 backend `scale_expression._AXIS_NAMES` 와 `harness/bin/harness`
의 `_AXIS_NAMES_CLI` 사이에 동기화되어 있는지 검증. drift 회귀 테스트.

배경: backend 는 `dataclasses.fields(ScaleAxes)` 동적 추출 → 새 axis 추가 시
자동 인식. 반면 harness CLI 는 backend 를 import 안 하는 standalone 이라
hardcoded frozenset 사용. 둘이 어긋나면 fragment validator 가 invalid
expression 을 통과시키거나 valid 를 거부할 수 있음.

동기화 전략: 기존 `test_html_tags_sync.py` 와 동일 — 두 frozenset 값 비교.
"""

from __future__ import annotations

import importlib.util
import sys
from importlib.machinery import SourceFileLoader
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
HARNESS_BIN = REPO_ROOT / "harness" / "bin" / "harness"


def _load_harness_axis_names() -> frozenset[str]:
    loader = SourceFileLoader("harness_bin_axis_sync", str(HARNESS_BIN))
    spec = importlib.util.spec_from_loader("harness_bin_axis_sync", loader)
    assert spec is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules["harness_bin_axis_sync"] = mod
    loader.exec_module(mod)
    return mod._AXIS_NAMES_CLI


def test_axis_names_in_sync() -> None:
    """backend `_AXIS_NAMES` (ScaleAxes 동적) ↔ CLI `_AXIS_NAMES_CLI` (hardcoded)."""
    from src.orchestrator.scale_expression import _AXIS_NAMES as backend_names

    cli_names = _load_harness_axis_names()
    assert backend_names == cli_names, (
        "6축 이름이 backend scale_expression 과 harness CLI 사이 drift.\n"
        f"  backend only: {sorted(backend_names - cli_names)}\n"
        f"  CLI only:     {sorted(cli_names - backend_names)}\n"
        "수정: harness/bin/harness 의 _AXIS_NAMES_CLI 또는 ScaleAxes 필드 동기화."
    )

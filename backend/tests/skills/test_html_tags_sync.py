"""H1: `_HTML_TAGS` frozenset 이 `skeleton_assembler.py` 와 `harness/bin/harness` 양쪽에
중복 정의되어 있어 drift 발생 가능. 매 테스트 실행마다 동기화 검증.

해결 옵션 3가지 중 "테스트 assertion" 채택 (B option) — 두 파일 모두 Python 이라
싱글 SoT import 가능하지만 harness bin 은 backend/ 를 path 에 안 쓰는 standalone CLI
라 의존성 추가는 과함. 회귀는 테스트로 잡는다.
"""

from __future__ import annotations

import importlib.util
import sys
from importlib.machinery import SourceFileLoader
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
HARNESS_BIN = REPO_ROOT / "harness" / "bin" / "harness"


def _load_harness_html_tags() -> frozenset[str]:
    loader = SourceFileLoader("harness_bin_sync", str(HARNESS_BIN))
    spec = importlib.util.spec_from_loader("harness_bin_sync", loader)
    assert spec is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules["harness_bin_sync"] = mod
    loader.exec_module(mod)
    return mod._HTML_TAGS


def test_html_tags_frozenset_in_sync() -> None:
    """`skeleton_assembler._HTML_TAGS` == `harness bin._HTML_TAGS`.

    drift 감지 목적 — 한쪽에 태그 추가/제거 후 다른 쪽 잊으면 fail.
    """
    from src.orchestrator.skeleton_assembler import _HTML_TAGS as assembler_tags

    harness_tags = _load_harness_html_tags()
    assert assembler_tags == harness_tags, (
        "_HTML_TAGS 가 skeleton_assembler.py 와 harness bin 사이에 drift 됨.\n"
        f"  assembler only: {sorted(assembler_tags - harness_tags)}\n"
        f"  harness only:   {sorted(harness_tags - assembler_tags)}"
    )

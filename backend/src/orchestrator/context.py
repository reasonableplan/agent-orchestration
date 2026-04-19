"""Skeleton 섹션 ID 기반 컨텍스트 주입 (Harness v2).

`SECTION_TITLES` / `AGENT_SECTIONS_BY_ID` / `extract_section_by_id` /
`build_context` — 섹션 ID 로만 동작. v1 번호 기반 (`SECTION_MAP`,
`extract_section`, `fill_skeleton_template`) 은 Phase 4b (2026-04-19) 제거.
"""

from __future__ import annotations

import re
from pathlib import Path

# 표준 20개 섹션 ID → 조각 frontmatter `name` 과 일치하는 헤딩 제목.
# (~/.claude/harness/templates/skeleton/<id>.md 의 name 필드와 동기화 필수.)
SECTION_TITLES: dict[str, str] = {
    "overview": "프로젝트 개요",
    "requirements": "기능 요구사항",
    "stack": "기술 스택",
    "configuration": "설정 / 환경변수",
    "errors": "에러 핸들링",
    "auth": "인증 / 권한",
    "persistence": "저장소 / 스키마",
    "integrations": "외부 통합",
    "interface.http": "HTTP API",
    "interface.cli": "CLI 커맨드",
    "interface.ipc": "IPC 채널",
    "interface.sdk": "Public API (SDK)",
    "view.screens": "화면 목록",
    "view.components": "컴포넌트 트리",
    "state.flow": "상태 흐름",
    "core.logic": "도메인 로직",
    "observability": "로깅 / 모니터링",
    "deployment": "배포 설정",
    "tasks": "태스크 분해",
    "notes": "구현 노트",
}

# 에이전트별 섹션 ID 매핑. "*" 는 전체.
AGENT_SECTIONS_BY_ID: dict[str, list[str]] = {
    "architect": ["*"],
    "designer": [
        "overview", "requirements", "stack",
        "interface.http", "view.screens", "view.components",
        "state.flow", "errors",
    ],
    "orchestrator": ["overview", "requirements", "stack", "tasks"],
    "backend_coder": [
        "overview", "requirements", "stack",
        "auth", "persistence", "interface.http",
        "errors", "state.flow", "core.logic", "notes",
    ],
    "frontend_coder": [
        "overview", "requirements", "stack",
        "interface.http", "view.screens", "view.components",
        "state.flow", "errors", "core.logic", "notes",
    ],
    "reviewer": ["*"],
    "qa": [
        "overview", "requirements", "interface.http",
        "errors", "state.flow", "core.logic", "notes",
    ],
}

# 에이전트별 추가 문서
EXTRA_DOCS: dict[str, list[str]] = {
    "architect": ["conventions.md", "shared-lessons.md", "adr/"],
    "designer": ["conventions.md", "shared-lessons.md", "guidelines/frontend/style.md"],
    "orchestrator": ["conventions.md", "shared-lessons.md"],
    "backend_coder": [
        "conventions.md",
        "shared-lessons.md",
        "guidelines/backend/structure.md",
        "guidelines/backend/services.md",
        "guidelines/backend/api.md",
    ],
    "frontend_coder": [
        "conventions.md",
        "shared-lessons.md",
        "guidelines/frontend/components.md",
        "guidelines/frontend/state.md",
        "guidelines/frontend/api.md",
        "guidelines/frontend/style.md",
    ],
    "reviewer": ["conventions.md", "shared-lessons.md", "adr/"],
    "qa": ["conventions.md", "shared-lessons.md"],
}


def extract_section_by_id(skeleton_text: str, section_id: str) -> str:
    """섹션 ID 로 skeleton.md 에서 섹션 추출.

    SECTION_TITLES 의 매핑을 통해 `## N. <title>` 헤딩을 찾고
    그 섹션의 텍스트를 반환. 같은 레벨 다음 헤딩 직전까지가 한 섹션.

    Args:
        skeleton_text: skeleton.md 전체 텍스트
        section_id: 표준 섹션 ID (예: "overview", "interface.cli")

    Returns:
        섹션 텍스트. ID 가 표준에 없거나 헤딩을 못 찾으면 빈 문자열.
    """
    if section_id == "*":
        return skeleton_text

    title = SECTION_TITLES.get(section_id)
    if not title:
        return ""

    # `## N. <title>` 또는 `### N-M. <title>` 매칭 (제목 정확히 일치)
    title_pattern = re.escape(title)
    pattern = rf"^(#{{2,4}})\s+\d+(?:-\d+)?\.\s+{title_pattern}\s*$"
    lines = skeleton_text.split("\n")

    start_idx: int | None = None
    start_level: int | None = None
    for i, line in enumerate(lines):
        m = re.match(pattern, line.rstrip())
        if m:
            start_idx = i
            start_level = len(m.group(1))
            break

    if start_idx is None or start_level is None:
        return ""

    end_idx = len(lines)
    for i in range(start_idx + 1, len(lines)):
        nxt = re.match(r"^(#{2,4})\s+\d", lines[i])
        if nxt and len(nxt.group(1)) <= start_level:
            end_idx = i
            break

    return "\n".join(lines[start_idx:end_idx]).strip()


def build_context(
    agent: str,
    skeleton_path: Path,
    docs_dir: Path,
    prompt_path: Path | None = None,
) -> str:
    """에이전트에 주입할 전체 컨텍스트를 조합 (섹션 ID 기반).

    Args:
        agent: 에이전트 이름
        skeleton_path: skeleton.md 경로
        docs_dir: docs/ 디렉토리 경로
        prompt_path: 에이전트별 CLAUDE.md 경로

    Returns:
        조합된 컨텍스트 문자열
    """
    parts: list[str] = []

    # 1. 에이전트 시스템 프롬프트 (CLAUDE.md)
    if prompt_path and prompt_path.exists():
        parts.append(prompt_path.read_text(encoding="utf-8").strip())

    # 2. skeleton 섹션 추출 (ID 기반)
    if skeleton_path.exists():
        skeleton_text = skeleton_path.read_text(encoding="utf-8")
        sections = AGENT_SECTIONS_BY_ID.get(agent, [])
        if sections == ["*"]:
            parts.append(f"# Skeleton\n{skeleton_text.strip()}")
        else:
            extracted: list[str] = []
            for sid in sections:
                content = extract_section_by_id(skeleton_text, sid)
                if content:
                    extracted.append(content)
            if extracted:
                parts.append("# Skeleton (관련 섹션)\n\n" + "\n\n".join(extracted))

    # 3. 추가 문서
    extra = EXTRA_DOCS.get(agent, [])
    for doc_name in extra:
        if doc_name.endswith("/"):
            # 디렉토리 — 하위 .md 파일 전부 읽기
            dir_path = docs_dir / doc_name.rstrip("/")
            if dir_path.is_dir():
                for md_file in sorted(dir_path.glob("*.md")):
                    content = md_file.read_text(encoding="utf-8").strip()
                    if content:
                        parts.append(f"# {md_file.stem}\n{content}")
        else:
            doc_path = docs_dir / doc_name
            if doc_path.exists():
                content = doc_path.read_text(encoding="utf-8").strip()
                if content:
                    parts.append(f"# {doc_name}\n{content}")

    return "\n\n---\n\n".join(parts)

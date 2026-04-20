"""Skeleton 섹션 ID 기반 컨텍스트 주입 테스트 (Harness v2)."""

from pathlib import Path

from src.orchestrator.context import (
    AGENT_SECTIONS_BY_ID,
    SECTION_TITLES,
    build_context,
    extract_section_by_id,
)

# Harness v2 조각 형식 (skeleton_assembler 출력 모방). 헤딩 제목은
# SECTION_TITLES 와 정확히 일치해야 함.
SAMPLE_SKELETON = """\
# Project Skeleton — Sample

## 1. 프로젝트 개요
- **프로젝트명**: Sample App
- **한 줄 설명**: 테스트 프로젝트

## 2. 기술 스택
### 런타임 / 언어
- Python 3.12

## 3. 에러 핸들링
### 에러 분류 체계
| 코드 | 의미 |
|------|------|
| `PARSE_001` | 파싱 실패 |

## 4. HTTP API
### 엔드포인트
| Method | Path |
|--------|------|
| GET    | /api |

## 5. CLI 커맨드
### 엔트리포인트
- 실행: `sample`

## 6. 도메인 로직
### 핵심 비즈니스 규칙
1. 입력 검증

## 7. 태스크 분해
| ID | Component |
|----|-----------|
"""


class TestSectionTitlesMap:
    def test_all_20_standard_sections_present(self) -> None:
        expected_ids = {
            "overview",
            "requirements",
            "stack",
            "configuration",
            "errors",
            "auth",
            "persistence",
            "integrations",
            "interface.http",
            "interface.cli",
            "interface.ipc",
            "interface.sdk",
            "view.screens",
            "view.components",
            "state.flow",
            "core.logic",
            "observability",
            "deployment",
            "tasks",
            "notes",
        }
        assert set(SECTION_TITLES.keys()) == expected_ids


class TestAgentSectionsById:
    def test_all_agents_have_id_mapping(self) -> None:
        expected = {
            "architect",
            "designer",
            "orchestrator",
            "backend_coder",
            "frontend_coder",
            "reviewer",
            "qa",
        }
        assert set(AGENT_SECTIONS_BY_ID.keys()) == expected

    def test_architect_gets_all(self) -> None:
        assert AGENT_SECTIONS_BY_ID["architect"] == ["*"]

    def test_referenced_ids_are_standard(self) -> None:
        """모든 참조된 섹션 ID 는 SECTION_TITLES 에 존재."""
        for agent, sections in AGENT_SECTIONS_BY_ID.items():
            for sid in sections:
                if sid == "*":
                    continue
                assert sid in SECTION_TITLES, f"{agent} → unknown section_id '{sid}'"


class TestExtractSectionById:
    def test_wildcard_returns_full(self) -> None:
        assert extract_section_by_id(SAMPLE_SKELETON, "*") == SAMPLE_SKELETON

    def test_extract_overview(self) -> None:
        result = extract_section_by_id(SAMPLE_SKELETON, "overview")
        assert "Sample App" in result
        assert "테스트 프로젝트" in result

    def test_extract_interface_cli(self) -> None:
        result = extract_section_by_id(SAMPLE_SKELETON, "interface.cli")
        assert "엔트리포인트" in result
        assert "sample" in result

    def test_extract_errors(self) -> None:
        result = extract_section_by_id(SAMPLE_SKELETON, "errors")
        assert "PARSE_001" in result

    def test_section_boundary_respected(self) -> None:
        result = extract_section_by_id(SAMPLE_SKELETON, "stack")
        assert "Python 3.12" in result
        # 다음 섹션 (errors) 내용이 새지 않아야
        assert "PARSE_001" not in result

    def test_unknown_id_returns_empty(self) -> None:
        assert extract_section_by_id(SAMPLE_SKELETON, "totally-fake") == ""

    def test_id_not_in_skeleton_returns_empty(self) -> None:
        # auth 는 표준 ID 이지만 SAMPLE 에 헤딩 없음
        assert extract_section_by_id(SAMPLE_SKELETON, "auth") == ""


class TestBuildContext:
    def test_with_all_files(self, tmp_path: Path) -> None:
        # 에이전트 프롬프트
        prompt_path = tmp_path / "agents" / "architect" / "CLAUDE.md"
        prompt_path.parent.mkdir(parents=True)
        prompt_path.write_text("You are an architect.", encoding="utf-8")

        # skeleton
        docs_dir = tmp_path / "docs"
        docs_dir.mkdir()
        (docs_dir / "skeleton.md").write_text(SAMPLE_SKELETON, encoding="utf-8")

        # 추가 문서
        (docs_dir / "conventions.md").write_text("# Conventions\n- snake_case", encoding="utf-8")
        (docs_dir / "shared-lessons.md").write_text("# Lessons\n- LESSON-001", encoding="utf-8")

        result = build_context(
            agent="architect",
            skeleton_path=docs_dir / "skeleton.md",
            docs_dir=docs_dir,
            prompt_path=prompt_path,
        )

        assert "You are an architect." in result
        assert "Skeleton" in result
        assert "snake_case" in result
        assert "LESSON-001" in result

    def test_with_no_files(self, tmp_path: Path) -> None:
        docs_dir = tmp_path / "docs"
        docs_dir.mkdir()

        result = build_context(
            agent="architect",
            skeleton_path=docs_dir / "skeleton.md",
            docs_dir=docs_dir,
        )

        assert result == ""

    def test_backend_coder_gets_filtered_context(self, tmp_path: Path) -> None:
        docs_dir = tmp_path / "docs"
        docs_dir.mkdir()
        (docs_dir / "skeleton.md").write_text(SAMPLE_SKELETON, encoding="utf-8")

        result = build_context(
            agent="backend_coder",
            skeleton_path=docs_dir / "skeleton.md",
            docs_dir=docs_dir,
        )

        # backend_coder 는 errors, core.logic 포함. 관련 섹션 마커 있음 (전체 아님).
        assert "PARSE_001" in result
        assert "relevant sections" in result

    def test_architect_gets_all_skeleton(self, tmp_path: Path) -> None:
        docs_dir = tmp_path / "docs"
        docs_dir.mkdir()
        (docs_dir / "skeleton.md").write_text(SAMPLE_SKELETON, encoding="utf-8")

        result = build_context(
            agent="architect",
            skeleton_path=docs_dir / "skeleton.md",
            docs_dir=docs_dir,
        )

        assert "Sample App" in result
        # architect 는 전체이므로 "relevant sections" 마커 없음
        assert "relevant sections" not in result

    def test_adr_directory(self, tmp_path: Path) -> None:
        docs_dir = tmp_path / "docs"
        adr_dir = docs_dir / "adr"
        adr_dir.mkdir(parents=True)
        (adr_dir / "001-auth-jwt.md").write_text("# JWT 선택 사유", encoding="utf-8")

        result = build_context(
            agent="architect",
            skeleton_path=docs_dir / "skeleton.md",
            docs_dir=docs_dir,
        )

        assert "JWT 선택 사유" in result

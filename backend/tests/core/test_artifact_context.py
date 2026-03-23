"""산출물 컨텍스트 공유 테스트."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.core.agent.base_code_generator import BaseCodeGeneratorAgent, _MAX_ARTIFACT_CONTEXT_CHARS
from src.core.types import AgentConfig, Task, TaskResult


class ConcreteGenerator(BaseCodeGeneratorAgent):
    _role_description = "Test generator."


def _make_config():
    return AgentConfig(
        id="gen-1",
        domain="backend",
        level=2,
        poll_interval_ms=1000,
    )


def _make_task(epic_id: str | None = "epic-1"):
    return Task(
        id="task-1",
        epic_id=epic_id,
        title="Create API endpoint",
        description="Add GET /users endpoint",
        status="in-progress",
        board_column="In Progress",
    )


def _make_agent(tmp_path: Path):
    llm = AsyncMock()
    bus = MagicMock()
    bus.publish = AsyncMock()
    store = MagicMock()
    store.save_artifact = AsyncMock()
    store.get_completed_artifacts_for_epic = AsyncMock(return_value=[])
    git = MagicMock()

    agent = ConcreteGenerator(
        config=_make_config(),
        message_bus=bus,
        state_store=store,
        git_service=git,
        llm_client=llm,
        work_dir=str(tmp_path),
    )
    return agent, store


class TestCollectArtifactContext:
    @pytest.mark.asyncio
    async def test_empty_when_no_epic(self, tmp_path):
        """에픽 없는 태스크는 빈 문자열을 반환한다."""
        agent, store = _make_agent(tmp_path)
        task = _make_task(epic_id=None)

        result = await agent._collect_artifact_context(task)
        assert result == ""
        store.get_completed_artifacts_for_epic.assert_not_called()

    @pytest.mark.asyncio
    async def test_empty_when_no_artifacts(self, tmp_path):
        """산출물이 없으면 빈 문자열을 반환한다."""
        agent, store = _make_agent(tmp_path)
        store.get_completed_artifacts_for_epic = AsyncMock(return_value=[])

        result = await agent._collect_artifact_context(_make_task())
        assert result == ""

    @pytest.mark.asyncio
    async def test_includes_file_contents(self, tmp_path):
        """산출물 파일 내용이 포함된다."""
        # 파일 생성
        model_file = tmp_path / "models" / "user.py"
        model_file.parent.mkdir(parents=True)
        model_file.write_text("class User:\n    name: str\n    email: str\n")

        artifact = MagicMock()
        artifact.file_path = str(model_file)

        agent, store = _make_agent(tmp_path)
        store.get_completed_artifacts_for_epic = AsyncMock(return_value=[artifact])

        result = await agent._collect_artifact_context(_make_task())
        assert "class User:" in result
        assert "name: str" in result

    @pytest.mark.asyncio
    async def test_priority_files_first(self, tmp_path):
        """model/config 등 핵심 파일이 먼저 포함된다."""
        # 핵심 파일
        model_file = tmp_path / "models.py"
        model_file.write_text("# models")
        # 일반 파일
        util_file = tmp_path / "utils.py"
        util_file.write_text("# utils")

        art_model = MagicMock()
        art_model.file_path = str(model_file)
        art_util = MagicMock()
        art_util.file_path = str(util_file)

        agent, store = _make_agent(tmp_path)
        # 일반 파일이 먼저 오더라도 정렬되어야 함
        store.get_completed_artifacts_for_epic = AsyncMock(
            return_value=[art_util, art_model]
        )

        result = await agent._collect_artifact_context(_make_task())
        # models.py가 utils.py보다 먼저 나와야 함
        model_pos = result.find("models.py")
        util_pos = result.find("utils.py")
        assert model_pos < util_pos

    @pytest.mark.asyncio
    async def test_respects_char_limit(self, tmp_path):
        """컨텍스트 크기가 _MAX_ARTIFACT_CONTEXT_CHARS를 초과하지 않는다."""
        files = []
        for i in range(20):
            f = tmp_path / f"file_{i}.py"
            f.write_text("x" * 2000)
            art = MagicMock()
            art.file_path = str(f)
            files.append(art)

        agent, store = _make_agent(tmp_path)
        store.get_completed_artifacts_for_epic = AsyncMock(return_value=files)

        result = await agent._collect_artifact_context(_make_task())
        # 코드 블록 마커 등 오버헤드 제외하고 실제 내용이 제한 내
        assert len(result) < _MAX_ARTIFACT_CONTEXT_CHARS * 2  # 마크다운 오버헤드 허용

    @pytest.mark.asyncio
    async def test_graceful_on_deleted_file(self, tmp_path):
        """삭제된 파일은 에러 없이 처리된다."""
        artifact = MagicMock()
        artifact.file_path = str(tmp_path / "deleted_file.py")

        agent, store = _make_agent(tmp_path)
        store.get_completed_artifacts_for_epic = AsyncMock(return_value=[artifact])

        result = await agent._collect_artifact_context(_make_task())
        assert "읽기 실패" in result

    @pytest.mark.asyncio
    async def test_graceful_on_db_error(self, tmp_path):
        """DB 조회 실패 시 빈 문자열을 반환한다."""
        agent, store = _make_agent(tmp_path)
        store.get_completed_artifacts_for_epic = AsyncMock(
            side_effect=RuntimeError("DB error")
        )

        result = await agent._collect_artifact_context(_make_task())
        assert result == ""


class TestBuildPromptWithArtifacts:
    def test_includes_artifact_section(self, tmp_path):
        """artifact_context가 프롬프트에 포함된다."""
        agent, _ = _make_agent(tmp_path)
        task = _make_task()

        prompt = agent._build_prompt(
            task, context="", artifact_context="### models.py\nclass User: pass"
        )
        assert "Previously Completed Tasks" in prompt
        assert "class User: pass" in prompt
        assert "MUST use these files" in prompt

    def test_empty_artifact_no_section(self, tmp_path):
        """artifact_context가 비어있으면 섹션이 추가되지 않는다."""
        agent, _ = _make_agent(tmp_path)
        task = _make_task()

        prompt = agent._build_prompt(task, context="", artifact_context="")
        assert "Previously Completed Tasks" not in prompt


class TestEffectiveWorkDir:
    def test_default_is_work_dir(self, tmp_path):
        """worktree 없으면 기본 work_dir을 사용한다."""
        agent, _ = _make_agent(tmp_path)
        assert agent._effective_work_dir == Path(tmp_path).resolve()

    def test_uses_active_worktree(self, tmp_path):
        """worktree가 설정되면 해당 경로를 사용한다."""
        agent, _ = _make_agent(tmp_path)
        wt_path = tmp_path / "worktree-1"
        wt_path.mkdir()
        agent._active_worktree = str(wt_path)
        assert agent._effective_work_dir == wt_path.resolve()

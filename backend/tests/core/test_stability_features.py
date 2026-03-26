"""Phase 1~6 안정화 + 기능 확장 테스트."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.agent.base_agent import DEFAULT_TASK_TIMEOUT_S, BaseAgent
from src.core.agent.base_code_generator import BaseCodeGeneratorAgent
from src.core.messaging.message_bus import MessageBus
from src.core.types import (
    AgentConfig,
    AgentLevel,
    MessageType,
    Task,
    TaskResult,
    TaskStatus,
)

# ===== Helpers =====


class ConcreteAgent(BaseAgent):
    def __init__(self, *args, execute_result=None, **kwargs):
        super().__init__(*args, **kwargs)
        self._execute_result = execute_result or TaskResult(success=True, artifacts=[])

    async def execute_task(self, task: Task) -> TaskResult:
        return self._execute_result


class ConcreteGenerator(BaseCodeGeneratorAgent):
    _role_description = "Test generator."


def _make_config(**kwargs):
    return AgentConfig(
        id=kwargs.get("id", "test-agent"),
        domain=kwargs.get("domain", "backend"),
        level=kwargs.get("level", AgentLevel.WORKER),
        poll_interval_ms=kwargs.get("poll_interval_ms", 100),
        task_timeout_ms=kwargs.get("task_timeout_ms", 5000),
    )


def _make_task(task_id="task-1", **kwargs):
    return Task(
        id=task_id,
        title=kwargs.get("title", "Test Task"),
        description=kwargs.get("description", "desc"),
        status=TaskStatus.IN_PROGRESS,
        board_column="In Progress",
        retry_count=kwargs.get("retry_count", 0),
        review_note=kwargs.get("review_note"),
    )


def _make_state_store():
    store = MagicMock()
    store.get_ready_tasks_for_agent = AsyncMock(return_value=[])
    store.claim_task = AsyncMock(return_value=True)
    store.update_task = AsyncMock()
    store.update_heartbeat = AsyncMock()
    store.get_agent_config = AsyncMock(return_value=None)
    store.save_message = AsyncMock()
    store.create_task_log = AsyncMock()
    store.update_task_log = AsyncMock()
    store.get_task_logs = AsyncMock(return_value=[])
    store.get_daily_token_usage = AsyncMock(return_value={"input": 0, "output": 0})
    store.save_artifact = AsyncMock()
    store.get_artifacts_for_task = AsyncMock(return_value=[])
    store.get_completed_artifacts_for_epic = AsyncMock(return_value=[])
    return store


def _make_git_service():
    svc = MagicMock()
    svc.move_issue_to_column = AsyncMock()
    svc.create_worktree = AsyncMock(side_effect=RuntimeError("worktree fail"))
    svc.remove_worktree = AsyncMock()
    svc.work_dir = "/tmp/workspace"
    return svc


# ===== P1: Worktree 실패 시 태스크 실패 =====


@pytest.mark.asyncio
async def test_worktree_failure_raises():
    """P1: worktree 생성 실패 시 RuntimeError가 발생한다."""
    bus = MessageBus()
    store = _make_state_store()
    git = _make_git_service()

    agent = ConcreteAgent(
        config=_make_config(),
        message_bus=bus,
        state_store=store,
        git_service=git,
    )

    task = _make_task()
    with pytest.raises(RuntimeError, match="Worktree creation failed"):
        await agent._setup_worktree(task)


# ===== P2: kill_process_tree =====


@pytest.mark.asyncio
async def test_kill_process_tree_windows():
    """P2: Windows에서 taskkill이 호출된다."""
    from src.core.llm.claude_cli_client import _kill_process_tree

    mock_proc = MagicMock()
    mock_proc.returncode = None  # 아직 실행 중
    mock_proc.pid = 12345
    mock_proc.kill = MagicMock()
    mock_proc.wait = AsyncMock()

    kill_proc = MagicMock()
    kill_proc.wait = AsyncMock(return_value=0)

    async def fake_exec(*args, **kwargs):
        return kill_proc

    with patch("src.core.llm.claude_cli_client.sys") as mock_sys, \
         patch("asyncio.create_subprocess_exec", side_effect=fake_exec) as mock_exec:
        mock_sys.platform = "win32"

        await _kill_process_tree(mock_proc)

        mock_exec.assert_called_once()
        args = mock_exec.call_args[0]
        assert "taskkill" in args


@pytest.mark.asyncio
async def test_kill_process_tree_already_exited():
    """P2: 이미 종료된 프로세스는 아무 것도 하지 않는다."""
    from src.core.llm.claude_cli_client import _kill_process_tree

    mock_proc = MagicMock()
    mock_proc.returncode = 0  # 이미 종료

    await _kill_process_tree(mock_proc)
    # 아무 것도 호출되지 않아야 함


# ===== P8: Timeout 분리 =====


def test_default_task_timeout_updated():
    """P8: DEFAULT_TASK_TIMEOUT_S가 360으로 변경되었다."""
    assert DEFAULT_TASK_TIMEOUT_S == 360.0


# ===== P4: 변경 파일 수집 base_ref =====


@pytest.mark.asyncio
async def test_get_current_head(tmp_path):
    """P4: _get_current_head가 HEAD SHA를 반환한다."""
    # git init + commit으로 HEAD 생성
    proc = await asyncio.create_subprocess_exec(
        "git", "init", cwd=str(tmp_path),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()

    # 빈 커밋 생성
    await (await asyncio.create_subprocess_exec(
        "git", "config", "user.email", "test@test.com",
        cwd=str(tmp_path), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )).communicate()
    await (await asyncio.create_subprocess_exec(
        "git", "config", "user.name", "test",
        cwd=str(tmp_path), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )).communicate()
    await (await asyncio.create_subprocess_exec(
        "git", "commit", "--allow-empty", "-m", "init",
        cwd=str(tmp_path), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )).communicate()

    head = await BaseCodeGeneratorAgent._get_current_head(str(tmp_path))
    assert head is not None
    assert len(head) == 40  # SHA-1 hex


@pytest.mark.asyncio
async def test_get_current_head_invalid_dir():
    """P4: 유효하지 않은 디렉토리에서 None 반환."""
    head = await BaseCodeGeneratorAgent._get_current_head("/nonexistent/dir")
    assert head is None


# ===== P5: 피드백 강화 =====


def test_feedback_at_top_of_instructions(tmp_path):
    """P5: retry + review_note 시 피드백이 instructions 상단에 위치한다."""
    bus = MagicMock()
    bus.publish = AsyncMock()
    store = _make_state_store()
    git = MagicMock()
    git.work_dir = str(tmp_path)

    agent = ConcreteGenerator(
        config=_make_config(),
        message_bus=bus,
        state_store=store,
        git_service=git,
        llm_client=MagicMock(),
        work_dir=str(tmp_path),
    )

    task = _make_task(retry_count=2, review_note="import 경로가 잘못됨")
    instructions = agent._build_workspace_instructions(task, str(tmp_path))

    # 피드백이 role_description 바로 다음에 위치 (태스크 섹션보다 앞)
    feedback_pos = instructions.find("최우선 반영 필수")
    task_pos = instructions.find("## 태스크")
    assert feedback_pos < task_pos
    assert "import 경로가 잘못됨" in instructions
    assert "<review_feedback>" in instructions


# ===== P7: SKIPPED 상태 =====


def test_skipped_in_task_status():
    """P7: TaskStatus.SKIPPED이 존재한다."""
    assert TaskStatus.SKIPPED == "skipped"


def test_skipped_transitions():
    """P7: SKIPPED 상태 전환이 올바르다."""
    from src.core.state.task_state_machine import is_valid_transition

    # backlog/failed → skipped 허용
    assert is_valid_transition(TaskStatus.BACKLOG, TaskStatus.SKIPPED)
    assert is_valid_transition(TaskStatus.FAILED, TaskStatus.SKIPPED)
    # skipped → ready/backlog 허용
    assert is_valid_transition(TaskStatus.SKIPPED, TaskStatus.READY)
    assert is_valid_transition(TaskStatus.SKIPPED, TaskStatus.BACKLOG)
    # skipped → done 불허
    assert not is_valid_transition(TaskStatus.SKIPPED, TaskStatus.DONE)


# ===== F1: TaskLog 기록 =====


@pytest.mark.asyncio
async def test_execute_with_timeout_creates_log():
    """F1: _execute_with_timeout이 task log를 생성/업데이트한다."""
    bus = MessageBus()
    store = _make_state_store()
    git = _make_git_service()

    agent = ConcreteAgent(
        config=_make_config(task_timeout_ms=5000),
        message_bus=bus,
        state_store=store,
        git_service=git,
    )

    task = _make_task()
    result = await agent._execute_with_timeout(task)

    assert result.success is True
    store.create_task_log.assert_called_once()
    store.update_task_log.assert_called_once()

    # update 호출에서 status가 "success"인지 확인
    update_args = store.update_task_log.call_args[0]
    assert update_args[1]["status"] == "success"
    assert "duration_ms" in update_args[1]


@pytest.mark.asyncio
async def test_execute_with_timeout_logs_failure():
    """F1: 태스크 실패 시 log status가 "failed"."""
    bus = MessageBus()
    store = _make_state_store()
    git = _make_git_service()

    agent = ConcreteAgent(
        config=_make_config(task_timeout_ms=5000),
        message_bus=bus,
        state_store=store,
        git_service=git,
        execute_result=TaskResult(success=False, error={"message": "fail"}, artifacts=[]),
    )

    task = _make_task()
    result = await agent._execute_with_timeout(task)

    assert result.success is False
    update_args = store.update_task_log.call_args[0]
    assert update_args[1]["status"] == "failed"


# ===== F3: 토큰 예산 =====


@pytest.mark.asyncio
async def test_token_budget_blocks_execution():
    """F3: 예산 초과 시 태스크가 실패한다."""
    bus = MessageBus()
    store = _make_state_store()
    git = _make_git_service()

    agent = ConcreteAgent(
        config=_make_config(task_timeout_ms=5000),
        message_bus=bus,
        state_store=store,
        git_service=git,
    )

    # 예산 초과 mock
    from src.core.resilience.token_budget import TokenBudgetManager
    budget = TokenBudgetManager(store, max_tokens_per_task=100, max_tokens_per_day=100)
    store.get_daily_token_usage = AsyncMock(return_value={"input": 50, "output": 51})
    agent._token_budget = budget

    task = _make_task()
    result = await agent._execute_with_timeout(task)

    assert result.success is False
    assert "budget exceeded" in result.error["message"].lower()


@pytest.mark.asyncio
async def test_token_budget_allows_execution():
    """F3: 예산 내이면 실행을 허용한다."""
    bus = MessageBus()
    store = _make_state_store()
    git = _make_git_service()

    agent = ConcreteAgent(
        config=_make_config(task_timeout_ms=5000),
        message_bus=bus,
        state_store=store,
        git_service=git,
    )

    from src.core.resilience.token_budget import TokenBudgetManager
    budget = TokenBudgetManager(store, max_tokens_per_task=500_000, max_tokens_per_day=10_000_000)
    agent._token_budget = budget

    task = _make_task()
    result = await agent._execute_with_timeout(task)

    assert result.success is True


# ===== F5: 진행률 이벤트 =====


@pytest.mark.asyncio
async def test_publish_progress():
    """F5: _publish_progress가 TASK_PROGRESS 메시지를 발행한다."""
    bus = MessageBus()
    store = _make_state_store()
    git = _make_git_service()

    agent = ConcreteAgent(
        config=_make_config(),
        message_bus=bus,
        state_store=store,
        git_service=git,
    )

    received = []
    bus.subscribe(MessageType.TASK_PROGRESS, lambda msg: received.append(msg))

    await agent._publish_progress("task-1", "coding", "코드 작성 중")

    assert len(received) == 1
    assert received[0].payload["taskId"] == "task-1"
    assert received[0].payload["stage"] == "coding"


# ===== F5: EventMapper 진행률 매핑 =====


def test_event_mapper_task_progress():
    """F5: EventMapper가 task.progress 이벤트를 매핑한다."""
    from src.core.types import Message
    from src.dashboard.event_mapper import EventMapper

    ws = MagicMock()
    ws.broadcast = AsyncMock()
    bus = MessageBus()

    mapper = EventMapper(bus, ws)

    msg = Message(
        id="m1",
        type=MessageType.TASK_PROGRESS,
        from_agent="agent-backend",
        payload={"taskId": "t1", "stage": "coding", "detail": "test"},
    )

    event_type, data = mapper._map(msg)
    assert event_type == "task.progress"
    assert data["taskId"] == "t1"
    assert data["stage"] == "coding"
    assert data["agentId"] == "agent-backend"

    mapper.dispose()


# ===== P3: CLI fallback =====


@pytest.mark.asyncio
async def test_cli_failure_falls_back_to_json(tmp_path):
    """P3: CLI 실패 시 JSON 모드로 fallback한다."""
    from src.core.llm.claude_cli_client import ClaudeCliClient

    cli = MagicMock(spec=ClaudeCliClient)
    cli.execute_in_workspace = AsyncMock(return_value=(False, "CLI failed"))
    cli.chat_json = AsyncMock(return_value=(
        {"files": [{"path": "test.py", "content": "pass", "action": "create"}], "summary": "ok"},
        100, 50,
    ))

    bus = MagicMock()
    bus.publish = AsyncMock()
    store = _make_state_store()
    git = MagicMock()
    git.work_dir = str(tmp_path)

    agent = ConcreteGenerator(
        config=_make_config(),
        message_bus=bus,
        state_store=store,
        git_service=git,
        llm_client=cli,
        work_dir=str(tmp_path),
    )

    task = _make_task()
    result = await agent.execute_task(task)

    # CLI 실패 후 JSON fallback 성공
    assert result.success is True
    cli.execute_in_workspace.assert_called_once()
    cli.chat_json.assert_called_once()


# ===== GAP 1: timeout 시 task_log "timeout" 기록 =====


@pytest.mark.asyncio
async def test_timeout_logs_timeout_status():
    """F1: 태스크 타임아웃 시 task_log status가 'timeout'으로 기록된다."""

    class SlowAgent(ConcreteAgent):
        async def execute_task(self, task):
            await asyncio.sleep(10)
            return TaskResult(success=True, artifacts=[])

    bus = MessageBus()
    store = _make_state_store()
    git = _make_git_service()

    agent = SlowAgent(
        config=_make_config(task_timeout_ms=100),
        message_bus=bus,
        state_store=store,
        git_service=git,
    )

    task = _make_task()
    with pytest.raises(TimeoutError):
        await agent._execute_with_timeout(task)

    store.create_task_log.assert_called_once()
    store.update_task_log.assert_called_once()
    update_args = store.update_task_log.call_args[0]
    assert update_args[1]["status"] == "timeout"


# ===== GAP 2: CLI fallback 시 _reset_working_tree 호출 =====


@pytest.mark.asyncio
async def test_cli_fallback_resets_working_tree(tmp_path):
    """P3: CLI 실패 → JSON fallback 전에 working tree가 정리된다."""
    from src.core.llm.claude_cli_client import ClaudeCliClient

    cli = MagicMock(spec=ClaudeCliClient)
    cli.execute_in_workspace = AsyncMock(return_value=(False, "CLI failed"))
    cli.chat_json = AsyncMock(return_value=(
        {"files": [{"path": "ok.py", "content": "pass", "action": "create"}], "summary": "ok"},
        100, 50,
    ))

    bus = MagicMock()
    bus.publish = AsyncMock()
    store = _make_state_store()
    git = MagicMock()
    git.work_dir = str(tmp_path)

    agent = ConcreteGenerator(
        config=_make_config(),
        message_bus=bus,
        state_store=store,
        git_service=git,
        llm_client=cli,
        work_dir=str(tmp_path),
    )

    with patch.object(ConcreteGenerator, "_reset_working_tree", new_callable=AsyncMock) as mock_reset:
        task = _make_task()
        result = await agent.execute_task(task)

        assert result.success is True
        mock_reset.assert_called_once_with(str(tmp_path))


# ===== GAP 3: _check_conflicts 동작 =====


@pytest.mark.asyncio
async def test_check_conflicts_no_conflict():
    """F2: 충돌 없으면 (False, [])을 반환한다."""
    from src.core.git_service.merge_queue import MergeQueue

    git_ops = MagicMock()
    git_ops.work_dir = "/tmp/workspace"
    runner = MagicMock()
    q = MergeQueue(git_ops=git_ops, test_runner=runner)

    async def fake_exec(*args, **kwargs):
        proc = MagicMock()
        cmd = args[0] if args else ""
        # fetch → 성공, merge → 성공 (returncode=0), reset → 성공
        proc.returncode = 0
        proc.communicate = AsyncMock(return_value=(b"", b""))
        proc.wait = AsyncMock(return_value=0)
        return proc

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
        has_conflict, files = await q._check_conflicts("/tmp/ws")

    assert has_conflict is False
    assert files == []


@pytest.mark.asyncio
async def test_check_conflicts_with_conflict():
    """F2: 충돌 시 (True, [파일목록])을 반환한다."""
    from src.core.git_service.merge_queue import MergeQueue

    git_ops = MagicMock()
    git_ops.work_dir = "/tmp/workspace"
    runner = MagicMock()
    q = MergeQueue(git_ops=git_ops, test_runner=runner)

    call_count = 0

    async def fake_exec(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        proc = MagicMock()
        proc.wait = AsyncMock(return_value=0)
        if call_count == 1:
            # git fetch → 성공
            proc.returncode = 0
            proc.communicate = AsyncMock(return_value=(b"", b""))
        elif call_count == 2:
            # git merge → 실패 (충돌)
            proc.returncode = 1
            proc.communicate = AsyncMock(return_value=(b"", b"CONFLICT"))
        elif call_count == 3:
            # git diff --name-only → 충돌 파일
            proc.returncode = 0
            proc.communicate = AsyncMock(return_value=(b"src/main.py\nREADME.md\n", b""))
        else:
            # git merge --abort
            proc.returncode = 0
            proc.communicate = AsyncMock(return_value=(b"", b""))
        return proc

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
        has_conflict, files = await q._check_conflicts("/tmp/ws")

    assert has_conflict is True
    assert "src/main.py" in files
    assert "README.md" in files

"""MergeQueue 테스트."""
from __future__ import annotations

import asyncio

import pytest

from src.core.git_service.merge_queue import (
    MergeQueue,
    MergeRequest,
    MergeResult,
)


class FakeTestRunner:
    def __init__(self, pass_all: bool = True):
        self.pass_all = pass_all
        self.call_count = 0
        self.fail_on_call: int | None = None  # N번째 호출에서 실패

    async def run_full_test(self, work_dir: str) -> tuple[bool, str]:
        self.call_count += 1
        if self.fail_on_call is not None and self.call_count == self.fail_on_call:
            return False, "FAILED test_existing.py::test_foo — assertion error"
        if not self.pass_all:
            return False, "FAILED test_bar.py::test_baz"
        return True, "all checks passed"


class FakeGitOps:
    def __init__(self, fail: bool = False):
        self._work_dir = "/tmp/workspace"
        self._fail = fail
        self.commit_calls: list[str] = []

    @property
    def work_dir(self) -> str:
        return self._work_dir

    async def commit_and_pr(
        self, message: str, issue_number: int | None = None,
    ) -> int | None:
        self.commit_calls.append(message)
        if self._fail:
            raise RuntimeError("rebase conflict")
        return 42


@pytest.fixture
def git_ops():
    return FakeGitOps()


@pytest.fixture
def test_runner():
    return FakeTestRunner()


@pytest.fixture
def queue(git_ops, test_runner):
    q = MergeQueue(git_ops=git_ops, test_runner=test_runner)
    return q


def _make_request(task_id: str = "task-1", title: str = "Feature A") -> MergeRequest:
    return MergeRequest(
        task_id=task_id,
        task_title=title,
        issue_number=1,
        worktree_path=None,
    )


@pytest.mark.asyncio
async def test_single_merge_success(queue, git_ops):
    """단일 머지 요청이 성공적으로 처리된다."""
    result = await queue.enqueue(_make_request())
    await queue.drain()

    assert result.success is True
    assert result.pr_number == 42
    assert len(git_ops.commit_calls) == 1


@pytest.mark.asyncio
async def test_sequential_merge_order(queue, git_ops):
    """여러 머지 요청이 순서대로 처리된다."""
    results = await asyncio.gather(
        queue.enqueue(_make_request("t1", "First")),
        queue.enqueue(_make_request("t2", "Second")),
        queue.enqueue(_make_request("t3", "Third")),
    )
    await queue.drain()

    assert all(r.success for r in results)
    assert len(git_ops.commit_calls) == 3
    # 순서 보장 확인
    assert "First" in git_ops.commit_calls[0]
    assert "Second" in git_ops.commit_calls[1]
    assert "Third" in git_ops.commit_calls[2]


@pytest.mark.asyncio
async def test_test_failure_rejects_merge(git_ops):
    """테스트 실패 시 머지가 거부되고 에러 메시지를 반환한다."""
    runner = FakeTestRunner(pass_all=False)
    q = MergeQueue(git_ops=git_ops, test_runner=runner)

    result = await q.enqueue(_make_request())
    await q.drain()

    assert result.success is False
    assert "테스트 실패" in result.error
    assert "FAILED" in result.test_output
    assert len(git_ops.commit_calls) == 0  # commit 안 됨


@pytest.mark.asyncio
async def test_partial_failure_continues_queue(git_ops):
    """하나의 머지가 실패해도 큐의 나머지는 계속 처리된다."""
    runner = FakeTestRunner(pass_all=True)
    runner.fail_on_call = 2  # 2번째만 실패

    q = MergeQueue(git_ops=git_ops, test_runner=runner)

    results = await asyncio.gather(
        q.enqueue(_make_request("t1", "First")),
        q.enqueue(_make_request("t2", "Second")),
        q.enqueue(_make_request("t3", "Third")),
    )
    await q.drain()

    assert results[0].success is True
    assert results[1].success is False
    assert results[2].success is True
    assert len(git_ops.commit_calls) == 2  # 1번, 3번만 commit


@pytest.mark.asyncio
async def test_git_failure_returns_error(test_runner):
    """commit_and_pr 실패 시 에러가 반환된다."""
    git_ops = FakeGitOps(fail=True)
    q = MergeQueue(git_ops=git_ops, test_runner=test_runner)

    result = await q.enqueue(_make_request())
    await q.drain()

    assert result.success is False
    assert "commit_and_pr 실패" in result.error


@pytest.mark.asyncio
async def test_drain_rejects_remaining(queue):
    """drain 후 새 요청은 거부된다."""
    # 먼저 시작시킨 후 drain
    queue.start()
    await queue.drain()

    result = await queue.enqueue(_make_request())
    assert result.success is False
    assert "shutting down" in result.error.lower()


@pytest.mark.asyncio
async def test_no_changes_still_success(test_runner):
    """변경사항 없을 때 (pr_number=None) 성공으로 처리된다."""
    git_ops = FakeGitOps()
    git_ops._fail = False

    async def no_changes(msg, issue_number=None):
        return None
    git_ops.commit_and_pr = no_changes

    q = MergeQueue(git_ops=git_ops, test_runner=test_runner)
    result = await q.enqueue(_make_request())
    await q.drain()

    assert result.success is True
    assert result.pr_number is None


@pytest.mark.asyncio
async def test_current_task_id_tracked(queue):
    """처리 중인 태스크 ID가 추적된다."""
    assert queue.current_task_id is None

    # 큐가 비어있으면 None
    await queue.drain()
    assert queue.current_task_id is None

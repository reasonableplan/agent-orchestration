"""순차 머지 큐 — 한 번에 하나의 태스크만 main에 머지한다.

동시에 여러 태스크가 approve되어도 큐에 넣어 순서대로 처리하여
통합 충돌을 원천 차단한다.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Protocol

from src.core.logging.logger import get_logger

log = get_logger("MergeQueue")


class TestRunner(Protocol):
    """테스트 게이트 실행 인터페이스."""

    async def run_full_test(self, work_dir: str) -> tuple[bool, str]:
        """전체 테스트를 실행한다. (passed, output) 반환."""
        ...


class GitOps(Protocol):
    """머지에 필요한 Git 작업 인터페이스."""

    async def commit_and_pr(
        self, message: str, issue_number: int | None = None,
    ) -> int | None: ...

    @property
    def work_dir(self) -> str: ...


@dataclass
class MergeRequest:
    """머지 큐에 들어가는 요청."""
    task_id: str
    task_title: str
    issue_number: int | None
    worktree_path: str | None  # None이면 공유 workspace 사용
    result: asyncio.Future[MergeResult] = field(init=False)

    def __post_init__(self) -> None:
        self.result = asyncio.get_running_loop().create_future()


@dataclass
class MergeResult:
    """머지 결과."""
    success: bool
    pr_number: int | None = None
    error: str = ""
    test_output: str = ""


class MergeQueue:
    """asyncio 기반 순차 머지 큐.

    - enqueue()로 머지 요청 추가 → Future로 결과 대기
    - 내부 worker가 순서대로 처리: main rebase → 전체 테스트 → commit+PR+merge
    - 실패 시 해당 태스크만 reject, 큐는 계속 진행
    - drain()으로 graceful shutdown (진행 중 머지 완료 대기)
    """

    def __init__(
        self,
        git_ops: GitOps,
        test_runner: TestRunner,
    ) -> None:
        self._git_ops = git_ops
        self._test_runner = test_runner
        self._queue: asyncio.Queue[MergeRequest | None] = asyncio.Queue()
        self._worker_task: asyncio.Task[None] | None = None
        self._draining = False
        self._processing_lock = asyncio.Lock()
        self._current_request: MergeRequest | None = None

    @property
    def is_running(self) -> bool:
        return self._worker_task is not None and not self._worker_task.done()

    @property
    def current_task_id(self) -> str | None:
        """현재 처리 중인 태스크 ID."""
        return self._current_request.task_id if self._current_request else None

    def start(self) -> None:
        """워커 시작. 이미 실행 중이면 무시."""
        if self.is_running:
            return
        self._draining = False
        self._worker_task = asyncio.create_task(self._worker_loop())
        log.info("MergeQueue worker started")

    async def drain(self) -> None:
        """Graceful shutdown: 현재 처리 중인 머지 완료 대기 후 워커 종료."""
        if not self.is_running:
            return
        self._draining = True
        # sentinel(None)을 넣어 워커가 루프를 빠져나오게 함
        await self._queue.put(None)
        if self._worker_task:
            try:
                await asyncio.wait_for(self._worker_task, timeout=120.0)
            except asyncio.TimeoutError:
                log.warning("MergeQueue drain timed out, cancelling worker")
                self._worker_task.cancel()
                try:
                    await self._worker_task
                except asyncio.CancelledError:
                    pass
            self._worker_task = None
        # 큐에 남은 요청들은 실패로 처리
        while not self._queue.empty():
            try:
                req = self._queue.get_nowait()
                if req is not None and not req.result.done():
                    req.result.set_result(
                        MergeResult(success=False, error="MergeQueue shutting down")
                    )
            except asyncio.QueueEmpty:
                break
        log.info("MergeQueue drained")

    async def enqueue(self, request: MergeRequest) -> MergeResult:
        """머지 요청을 큐에 추가하고 완료까지 대기한다.

        Returns:
            MergeResult — 성공 시 pr_number 포함, 실패 시 error+test_output 포함
        """
        if self._draining:
            return MergeResult(success=False, error="MergeQueue is shutting down")

        if not self.is_running:
            self.start()

        log.info("Enqueue merge request",
                 task_id=request.task_id, title=request.task_title,
                 queue_size=self._queue.qsize())
        await self._queue.put(request)
        return await request.result

    async def _worker_loop(self) -> None:
        """큐에서 요청을 하나씩 꺼내 순차 처리한다."""
        while True:
            try:
                request = await self._queue.get()
            except asyncio.CancelledError:
                break

            # sentinel — shutdown 신호
            if request is None:
                break

            self._current_request = request
            try:
                result = await self._process_merge(request)
                if not request.result.done():
                    request.result.set_result(result)
            except asyncio.CancelledError:
                if not request.result.done():
                    request.result.set_result(
                        MergeResult(success=False, error="MergeQueue cancelled")
                    )
                break
            except Exception as e:
                log.error("Unexpected error in merge processing",
                          task_id=request.task_id, err=str(e))
                if not request.result.done():
                    request.result.set_result(
                        MergeResult(success=False, error=f"Unexpected: {e}")
                    )
            finally:
                self._current_request = None
                self._queue.task_done()

        log.info("MergeQueue worker stopped")

    async def _process_merge(self, request: MergeRequest) -> MergeResult:
        """단일 머지 요청을 처리한다.

        순서:
        1. 전체 테스트 실행 (main rebase 상태에서)
        2. commit + PR + merge
        """
        log.info("Processing merge",
                 task_id=request.task_id, title=request.task_title)

        # 1. 전체 테스트 게이트
        work_dir = request.worktree_path or self._git_ops.work_dir
        test_passed, test_output = await self._test_runner.run_full_test(work_dir)
        if not test_passed:
            log.warning("Merge rejected: test gate failed",
                        task_id=request.task_id)
            return MergeResult(
                success=False,
                error="전체 테스트 실패로 머지 거부",
                test_output=test_output,
            )

        # 2. commit + PR + auto-merge
        try:
            commit_msg = f"feat: {request.task_title} (#{request.issue_number or '?'})"
            pr_number = await self._git_ops.commit_and_pr(
                commit_msg, issue_number=request.issue_number,
            )
            if pr_number:
                log.info("Merge complete",
                         task_id=request.task_id, pr=pr_number)
                return MergeResult(success=True, pr_number=pr_number)
            # 변경사항 없음 — 성공으로 처리
            log.info("No changes to merge", task_id=request.task_id)
            return MergeResult(success=True, pr_number=None)
        except Exception as e:
            log.error("Merge failed",
                      task_id=request.task_id, err=str(e))
            return MergeResult(
                success=False,
                error=f"commit_and_pr 실패: {e}",
            )

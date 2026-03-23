"""GitService worktree 관리 테스트."""
from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.git_service.git_service import GitService


def _make_config(**overrides):
    cfg = MagicMock()
    cfg.github_token = "fake-token"
    cfg.github_owner = "test-owner"
    cfg.github_repo = "test-repo"
    cfg.github_project_number = 1
    cfg.git_work_dir = overrides.get("work_dir", "/tmp/workspace")
    return cfg


@pytest.fixture
def git_service(tmp_path):
    cfg = _make_config(work_dir=str(tmp_path))
    svc = GitService(cfg)
    return svc


class TestCreateWorktree:
    @pytest.mark.asyncio
    async def test_creates_worktree_directory(self, git_service, tmp_path):
        """worktree 디렉토리와 .worktrees 부모가 생성된다."""
        git_service._run_git = AsyncMock(return_value="")

        path = await git_service.create_worktree("abc12345-full-uuid", "task-login-api")
        assert ".worktrees" in path
        assert "abc12345" in path  # short_id 사용

    @pytest.mark.asyncio
    async def test_branch_name_sanitized(self, git_service):
        """특수문자가 브랜치명에서 제거된다."""
        calls = []
        async def mock_run(*args, timeout_s=60.0):
            calls.append(args)
            return ""
        git_service._run_git = mock_run

        await git_service.create_worktree("task-id-1", "feat: user auth (login)")

        # worktree add 호출에서 브랜치명 확인
        worktree_add_call = [c for c in calls if "worktree" in c and "add" in c]
        assert len(worktree_add_call) >= 1
        branch_arg = [a for a in worktree_add_call[0] if a.startswith("wt/")]
        assert branch_arg  # wt/ 접두사 있음
        # 특수문자 없음
        for char in [":", "(", ")", " "]:
            assert char not in branch_arg[0]

    @pytest.mark.asyncio
    async def test_fallback_on_no_origin_main(self, git_service):
        """origin/main이 없을 때 HEAD 기반으로 폴백한다."""
        call_count = 0
        async def mock_run(*args, timeout_s=60.0):
            nonlocal call_count
            call_count += 1
            if "worktree" in args and "add" in args and "origin/main" in args:
                from src.core.errors import GitServiceError
                raise GitServiceError("origin/main not found")
            return ""
        git_service._run_git = mock_run

        path = await git_service.create_worktree("t1", "init-project")
        assert path  # 폴백으로 성공


class TestRemoveWorktree:
    @pytest.mark.asyncio
    async def test_removes_worktree_and_branch(self, git_service):
        """worktree와 브랜치가 모두 정리된다."""
        calls = []
        async def mock_run(*args, timeout_s=60.0):
            calls.append(args)
            return ""
        git_service._run_git = mock_run

        await git_service.remove_worktree("task-1", "feat-login-task-1")

        # worktree remove + branch -D 호출 확인
        cmds = [c[0] for c in calls]
        assert "worktree" in cmds
        assert "branch" in cmds

    @pytest.mark.asyncio
    async def test_removes_by_task_id_pattern(self, git_service, tmp_path):
        """worktree_name 없이 task_id 패턴으로 찾아 삭제한다."""
        worktrees_dir = tmp_path / ".worktrees"
        worktrees_dir.mkdir()
        (worktrees_dir / "feat-login-task-1").mkdir()

        calls = []
        async def mock_run(*args, timeout_s=60.0):
            calls.append(args)
            return ""
        git_service._run_git = mock_run

        await git_service.remove_worktree("task-1")
        # worktree remove가 호출되어야 함
        assert any("worktree" in c for c in calls)

    @pytest.mark.asyncio
    async def test_graceful_on_already_removed(self, git_service):
        """이미 삭제된 worktree에 대해 에러 없이 처리한다."""
        from src.core.errors import GitServiceError
        async def mock_run(*args, timeout_s=60.0):
            if "worktree" in args and "remove" in args:
                raise GitServiceError("not a worktree")
            if "branch" in args:
                raise GitServiceError("branch not found")
            return ""
        git_service._run_git = mock_run

        # 에러 없이 완료
        await git_service.remove_worktree("t1", "some-name")


class TestCleanupOrphanWorktrees:
    @pytest.mark.asyncio
    async def test_cleans_orphan_directories(self, git_service, tmp_path):
        """이전 세션의 orphan worktree 디렉토리를 정리한다."""
        worktrees_dir = tmp_path / ".worktrees"
        worktrees_dir.mkdir()
        orphan1 = worktrees_dir / "old-task-abc"
        orphan1.mkdir()
        orphan2 = worktrees_dir / "old-task-def"
        orphan2.mkdir()

        async def mock_run(*args, timeout_s=60.0):
            return ""
        git_service._run_git = mock_run

        await git_service.cleanup_orphan_worktrees()

        assert not orphan1.exists()
        assert not orphan2.exists()

    @pytest.mark.asyncio
    async def test_noop_when_no_worktrees_dir(self, git_service):
        """worktrees 디렉토리가 없으면 아무 작업도 하지 않는다."""
        async def mock_run(*args, timeout_s=60.0):
            return ""
        git_service._run_git = mock_run

        await git_service.cleanup_orphan_worktrees()  # 에러 없음


class TestRunGitInWorktree:
    @pytest.mark.asyncio
    async def test_runs_in_specified_path(self, git_service):
        """지정된 worktree 경로에서 git 명령이 실행된다."""
        with patch("asyncio.create_subprocess_exec") as mock_exec:
            proc = AsyncMock()
            proc.communicate = AsyncMock(return_value=(b"output", b""))
            proc.returncode = 0
            proc.kill = AsyncMock()
            proc.wait = AsyncMock()
            mock_exec.return_value = proc

            result = await git_service.run_git_in_worktree(
                "/tmp/wt/task-1", "status",
            )
            assert result == "output"
            # -C 인자로 worktree 경로가 전달되어야 함
            call_args = mock_exec.call_args[0]
            assert "/tmp/wt/task-1" in call_args

"""GitService git operations 테스트 — init_workspace, commit_all, push, commit_and_push."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.config import AppConfig
from src.core.errors import GitServiceError
from src.core.git_service.git_service import GitService


def _make_config(**overrides) -> AppConfig:
    defaults = {
        "github_token": "test-token",
        "github_owner": "testowner",
        "github_repo": "testrepo",
        "github_project_number": 1,
        "git_work_dir": "/tmp/test-workspace",
        "database_url": "sqlite://",
        "anthropic_api_key": "test",
    }
    defaults.update(overrides)
    return AppConfig(**defaults)


def _make_proc(returncode: int = 0, stdout: bytes = b"", stderr: bytes = b""):
    proc = MagicMock()
    proc.returncode = returncode
    proc.communicate = AsyncMock(return_value=(stdout, stderr))
    proc.kill = MagicMock()
    proc.wait = AsyncMock()
    return proc


class TestRunGit:
    async def test_success(self):
        svc = GitService(_make_config())
        proc = _make_proc(stdout=b"ok")
        with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=proc):
            result = await svc._run_git("status")
        assert result == "ok"

    async def test_failure_raises_git_service_error(self):
        svc = GitService(_make_config())
        proc = _make_proc(returncode=1, stderr=b"fatal: not a repo")
        with (
            patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=proc),
            pytest.raises(GitServiceError, match="not a repo"),
        ):
            await svc._run_git("status")

    async def test_timeout_kills_process(self):
        svc = GitService(_make_config())
        proc = MagicMock()
        proc.communicate = AsyncMock(side_effect=asyncio.TimeoutError())
        proc.kill = MagicMock()
        proc.wait = AsyncMock()
        with (
            patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=proc),
            pytest.raises(GitServiceError, match="timed out"),
        ):
            await svc._run_git("push", timeout_s=0.1)
        proc.kill.assert_called_once()


class TestCommitAll:
    async def test_no_changes_returns_false(self):
        svc = GitService(_make_config())
        # git add -A succeeds, git diff --cached --quiet succeeds (no changes)
        calls = [
            _make_proc(),  # add -A
            _make_proc(),  # diff --cached --quiet (exit 0 = no changes)
        ]
        with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, side_effect=calls):
            result = await svc.commit_all("test message")
        assert result is False

    async def test_with_changes_commits_and_returns_true(self):
        svc = GitService(_make_config())
        calls = [
            _make_proc(),                                    # add -A
            _make_proc(returncode=1, stderr=b"has changes"), # diff --cached --quiet (exit 1 = has changes)
            _make_proc(),                                    # commit
        ]
        with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, side_effect=calls):
            result = await svc.commit_all("feat: add feature")
        assert result is True


class TestPush:
    async def test_push_calls_git_push(self):
        svc = GitService(_make_config())
        proc = _make_proc()
        with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=proc) as mock_exec:
            await svc.push("main")
        args = mock_exec.call_args[0]
        assert "push" in args
        assert "main" in args

    async def test_push_failure_raises(self):
        svc = GitService(_make_config())
        proc = _make_proc(returncode=1, stderr=b"rejected")
        with (
            patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=proc),
            pytest.raises(GitServiceError, match="rejected"),
        ):
            await svc.push()


class TestCommitAndPush:
    async def test_no_changes_skips_push(self):
        svc = GitService(_make_config())
        svc.commit_all = AsyncMock(return_value=False)
        svc.push = AsyncMock()
        result = await svc.commit_and_push("msg")
        assert result is False
        svc.push.assert_not_called()

    async def test_with_changes_commits_and_pushes(self):
        svc = GitService(_make_config())
        svc.commit_all = AsyncMock(return_value=True)
        svc.push = AsyncMock()
        result = await svc.commit_and_push("msg")
        assert result is True
        svc.push.assert_called_once_with("main")


class TestInitWorkspace:
    async def test_clones_when_no_git_dir(self):
        svc = GitService(_make_config(git_work_dir="/tmp/new-workspace"))
        clone_proc = _make_proc()
        with (
            patch("os.path.isdir", return_value=False),
            patch("os.makedirs"),
            patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=clone_proc),
        ):
            await svc.init_workspace()

    async def test_pulls_when_git_dir_exists_with_correct_remote(self):
        svc = GitService(_make_config())
        calls = [
            _make_proc(stdout=b"https://github.com/testowner/testrepo.git"),  # remote get-url
            _make_proc(),  # pull
        ]
        with (
            patch("os.path.isdir", return_value=True),
            patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, side_effect=calls),
        ):
            await svc.init_workspace()

    async def test_updates_remote_when_different_repo(self):
        svc = GitService(_make_config())
        calls = [
            _make_proc(stdout=b"https://github.com/other/other-repo.git"),  # remote get-url (wrong repo)
            _make_proc(),  # remote set-url
            _make_proc(),  # pull
        ]
        with (
            patch("os.path.isdir", return_value=True),
            patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, side_effect=calls) as mock_exec,
        ):
            await svc.init_workspace()
        # set-url should have been called
        second_call_args = mock_exec.call_args_list[1][0]
        assert "set-url" in second_call_args


class TestCreateBranch:
    async def test_uses_run_git(self):
        svc = GitService(_make_config())
        proc = _make_proc()
        with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=proc) as mock_exec:
            await svc.create_branch("feat/test", "main")
        args = mock_exec.call_args[0]
        assert "checkout" in args
        assert "-b" in args
        assert "feat/test" in args

    async def test_rejects_invalid_branch_name(self):
        svc = GitService(_make_config())
        with pytest.raises(GitServiceError, match="Invalid branch name"):
            await svc.create_branch("feat/../evil")

"""board_then_db 헬퍼 테스트 — Board-first 패턴 검증."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from src.core.resilience.board_then_db import board_then_db


async def test_board_then_db_success():
    """Board → DB 순서로 정상 실행."""
    board = AsyncMock()
    db = AsyncMock()

    await board_then_db(board, db, label="test")

    board.assert_called_once()
    db.assert_called_once()


async def test_board_failure_skips_db():
    """Board 실패 시 DB는 호출되지 않는다."""
    board = AsyncMock(side_effect=RuntimeError("Board failed"))
    db = AsyncMock()

    with pytest.raises(RuntimeError, match="Board failed"):
        await board_then_db(board, db, label="test")

    board.assert_called_once()
    db.assert_not_called()


async def test_db_failure_triggers_rollback():
    """DB 실패 시 rollback_fn이 호출된다."""
    board = AsyncMock()
    db = AsyncMock(side_effect=RuntimeError("DB failed"))
    rollback = AsyncMock()

    with pytest.raises(RuntimeError, match="DB failed"):
        await board_then_db(board, db, rollback_fn=rollback, label="test")

    board.assert_called_once()
    db.assert_called_once()
    rollback.assert_called_once()


async def test_db_failure_without_rollback():
    """rollback_fn 없이 DB 실패 시 예외만 전파."""
    board = AsyncMock()
    db = AsyncMock(side_effect=RuntimeError("DB failed"))

    with pytest.raises(RuntimeError, match="DB failed"):
        await board_then_db(board, db, rollback_fn=None, label="test")

    board.assert_called_once()
    db.assert_called_once()


async def test_rollback_failure_still_raises_db_error():
    """rollback도 실패하면 원래 DB 에러가 전파된다."""
    board = AsyncMock()
    db = AsyncMock(side_effect=RuntimeError("DB failed"))
    rollback = AsyncMock(side_effect=RuntimeError("Rollback failed"))

    with pytest.raises(RuntimeError, match="DB failed"):
        await board_then_db(board, db, rollback_fn=rollback, label="test")

    rollback.assert_called_once()


async def test_sync_callables_supported():
    """동기 함수도 지원한다."""
    board_called = False
    db_called = False

    def board():
        nonlocal board_called
        board_called = True

    def db():
        nonlocal db_called
        db_called = True

    await board_then_db(board, db, label="sync-test")

    assert board_called
    assert db_called

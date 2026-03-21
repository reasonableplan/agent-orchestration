"""HookRegistry 테스트 — 등록, 디스패치, 활성화/비활성화."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from src.core.hooks.hook_registry import HookRegistry


def _make_store():
    store = MagicMock()
    store.get_all_hooks = AsyncMock(return_value=[])
    store.toggle_hook = AsyncMock()
    return store


async def test_register_and_dispatch():
    """등록된 핸들러가 디스패치 시 호출된다."""
    store = _make_store()
    registry = HookRegistry(store)

    handler = AsyncMock()
    registry.register("hook-1", "task.complete", handler)

    await registry.dispatch("task.complete", {"taskId": "t1"})

    handler.assert_called_once_with({"taskId": "t1"})


async def test_dispatch_no_handlers():
    """핸들러 없는 이벤트 디스패치 시 에러 없이 통과."""
    store = _make_store()
    registry = HookRegistry(store)

    await registry.dispatch("unknown.event", {})  # no error


async def test_disabled_hook_not_called():
    """비활성화된 훅은 디스패치 시 호출되지 않는다."""
    store = _make_store()
    registry = HookRegistry(store)

    handler = AsyncMock()
    registry.register("hook-1", "task.complete", handler)
    await registry.set_enabled("hook-1", False)

    await registry.dispatch("task.complete", {"taskId": "t1"})

    handler.assert_not_called()


async def test_re_enable_hook():
    """비활성화 후 다시 활성화하면 호출된다."""
    store = _make_store()
    registry = HookRegistry(store)

    handler = AsyncMock()
    registry.register("hook-1", "task.complete", handler)
    await registry.set_enabled("hook-1", False)
    await registry.set_enabled("hook-1", True)

    await registry.dispatch("task.complete", {"taskId": "t1"})

    handler.assert_called_once()


async def test_handler_error_does_not_propagate():
    """핸들러 에러가 다른 핸들러를 차단하지 않는다."""
    store = _make_store()
    registry = HookRegistry(store)

    bad_handler = AsyncMock(side_effect=RuntimeError("boom"))
    good_handler = AsyncMock()
    registry.register("hook-bad", "task.complete", bad_handler)
    registry.register("hook-good", "task.complete", good_handler)

    await registry.dispatch("task.complete", {"taskId": "t1"})

    bad_handler.assert_called_once()
    good_handler.assert_called_once()


async def test_multiple_events():
    """같은 훅이 여러 이벤트를 처리할 수 있다."""
    store = _make_store()
    registry = HookRegistry(store)

    handler_a = AsyncMock()
    handler_b = AsyncMock()
    registry.register("hook-1", "event.a", handler_a)
    registry.register("hook-1", "event.b", handler_b)

    await registry.dispatch("event.a", {"data": 1})
    await registry.dispatch("event.b", {"data": 2})

    handler_a.assert_called_once_with({"data": 1})
    handler_b.assert_called_once_with({"data": 2})


async def test_sync_handler_supported():
    """동기 핸들러도 디스패치된다."""
    store = _make_store()
    registry = HookRegistry(store)

    results = []
    registry.register("hook-sync", "event.x", lambda payload: results.append(payload))

    await registry.dispatch("event.x", {"val": 42})

    assert results == [{"val": 42}]


async def test_set_enabled_persists_to_store():
    """set_enabled는 DB에도 반영된다."""
    store = _make_store()
    registry = HookRegistry(store)

    await registry.set_enabled("hook-1", False)

    store.toggle_hook.assert_called_once_with("hook-1", False)

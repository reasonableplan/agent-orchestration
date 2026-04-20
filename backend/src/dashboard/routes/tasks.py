"""GET /api/tasks — 태스크 결과 조회."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("")
async def list_tasks() -> list[dict]:
    """StateManager results/ 디렉토리의 모든 태스크 결과를 반환한다."""
    from src.dashboard.routes.deps import get_state_manager

    sm = get_state_manager()
    try:
        return sm.list_task_results()
    except OSError as exc:
        logger.error("tasks: results 디렉토리 접근 실패: %s", exc)
        return []


@router.get("/{task_id}")
async def get_task(
    task_id: str = Path(..., min_length=1, max_length=64),
) -> dict:
    """특정 태스크 결과를 반환한다."""
    from src.dashboard.routes.deps import get_state_manager

    sm = get_state_manager()
    result = sm.load_task_result(task_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return result

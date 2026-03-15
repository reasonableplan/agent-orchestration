from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.core.types import UserInput
from src.dashboard.routes.deps import get_director

router = APIRouter(prefix="/api/command", tags=["command"])


class CommandRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=4096)


@router.post("", status_code=202)
async def send_command(body: CommandRequest, director=Depends(get_director)):
    """사용자 명령을 DirectorAgent에 전달한다. 처리는 비동기로 백그라운드에서 실행된다."""
    user_input = UserInput(source="dashboard", content=body.content)
    asyncio.create_task(director.handle_user_input(user_input))
    return {"status": "accepted"}

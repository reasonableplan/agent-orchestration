"""Docs Agent (Level 2) — 문서 생성 + 전체 작업 기록."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.core.agent.base_code_generator import BaseCodeGeneratorAgent
from src.core.logging.logger import get_logger
from src.core.messaging.message_bus import MessageBus
from src.core.state.state_store import StateStore
from src.core.types import AgentConfig, Message, MessageType

log = get_logger("DocsAgent")


class DocsAgent(BaseCodeGeneratorAgent):
    """문서 전문 에이전트 + 프로젝트 히스토리언.

    일반 태스크(README, API 문서 등)는 BaseCodeGeneratorAgent로 처리하고,
    모든 에이전트 이벤트(리뷰, 상의, 결정)를 구독하여 work-log.md에 기록한다.
    사용자가 언제든 프로젝트 진행 상황을 리뷰할 수 있다.
    """

    _role_description = (
        "You are a technical documentation specialist. Generate clear, comprehensive documentation. "
        "Follow existing project conventions and include architecture diagrams (Mermaid) where appropriate."
    )

    def __init__(
        self,
        config: AgentConfig,
        message_bus: MessageBus,
        state_store: StateStore,
        git_service: Any,
        llm_client: Any,
        work_dir: str = "./workspace",
        code_search: Any = None,
    ) -> None:
        super().__init__(
            config, message_bus, state_store, git_service, llm_client, work_dir,
            temperature=0.3, code_search=code_search,
        )
        self._work_log_path = Path(work_dir).resolve() / "docs" / "work-log.md"
        self._work_log_lock = asyncio.Lock()

        # 모든 주요 이벤트 구독
        self._subscribe(MessageType.REVIEW_REQUEST, self._on_event)
        self._subscribe(MessageType.AGENT_STATUS, self._on_event)
        self._subscribe(MessageType.DIRECTOR_MESSAGE, self._on_event)
        self._subscribe(MessageType.DIRECTOR_COMMITTED, self._on_event)

    async def _on_event(self, msg: Message) -> None:
        """모든 에이전트 이벤트를 work-log.md에 기록한다."""
        try:
            entry = self._format_log_entry(msg)
            if entry:
                await self._append_work_log(entry)
        except Exception as e:
            log.warning("Failed to log event", err=str(e))

    def _format_log_entry(self, msg: Message) -> str:
        """메시지를 work-log 엔트리로 포맷한다."""
        ts = msg.timestamp.strftime("%Y-%m-%d %H:%M:%S") if msg.timestamp else "?"
        payload = msg.payload if isinstance(msg.payload, dict) else {}

        if msg.type == MessageType.REVIEW_REQUEST:
            task_id = payload.get("taskId", "?")
            result = payload.get("result") or {}
            if not isinstance(result, dict):
                result = {}
            success = result.get("success", False)
            data = result.get("data") or {}
            summary = data.get("summary", "") if isinstance(data, dict) else ""
            status = "SUCCESS" if success else "FAILED"
            artifacts = result.get("artifacts", []) if isinstance(result, dict) else []
            return (
                f"### [{ts}] Review Request — {status}\n"
                f"- **Agent**: {msg.from_agent}\n"
                f"- **Task**: {task_id}\n"
                f"- **Summary**: {summary[:200]}\n"
                f"- **Files**: {len(artifacts)}개\n\n"
            )

        if msg.type == MessageType.AGENT_STATUS:
            status = payload.get("status", "?")
            task_id = payload.get("taskId")
            if status in ("busy", "error"):
                task_info = f" (task: {task_id})" if task_id else ""
                return f"- [{ts}] **{msg.from_agent}** → {status}{task_info}\n"
            return ""

        if msg.type == MessageType.DIRECTOR_MESSAGE:
            content = payload.get("content", "")
            # 리뷰 결과 기록
            if "Review:" in content or "Approved" in content or "Rejected" in content:
                return (
                    f"### [{ts}] Director Review\n"
                    f"{content[:500]}\n\n"
                )
            return ""

        if msg.type == MessageType.DIRECTOR_COMMITTED:
            epic_title = payload.get("epicTitle", "?")
            issues = payload.get("issues", [])
            return (
                f"### [{ts}] Epic Committed\n"
                f"- **Epic**: {epic_title}\n"
                f"- **Issues**: {len(issues)}개 생성\n\n"
            )

        return ""

    async def _append_work_log(self, entry: str) -> None:
        """work-log.md에 엔트리를 추가한다. 스레드 안전."""
        async with self._work_log_lock:
            self._work_log_path.parent.mkdir(parents=True, exist_ok=True)

            if not self._work_log_path.exists():
                header = (
                    "# Work Log — 프로젝트 작업 기록\n\n"
                    "> Docs Agent가 자동 기록합니다. 모든 리뷰, 상의, 결정이 포함됩니다.\n\n"
                    "---\n\n"
                )
                await asyncio.to_thread(self._work_log_path.write_text, header, "utf-8")

            await asyncio.to_thread(
                lambda: self._work_log_path.open("a", encoding="utf-8").write(entry)
            )

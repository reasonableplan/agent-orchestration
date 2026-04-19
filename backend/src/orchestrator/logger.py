"""Agent action logging — structured JSON log lines."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


class AgentLogger:
    """Per-agent JSON log writer."""

    def __init__(self, log_dir: str | Path = "logs/agents") -> None:
        self._log_dir = Path(log_dir)
        self._log_dir.mkdir(parents=True, exist_ok=True)

    def _get_log_path(self, agent: str) -> Path:
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        return self._log_dir / f"{today}_{agent}.log"

    def log(
        self,
        agent: str,
        action: str,
        status: str,
        *,
        target: str | None = None,
        duration_ms: int | None = None,
        token_usage: dict[str, int] | None = None,
        error: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        """Write a single JSON log line for an agent action."""
        entry = {
            "timestamp": datetime.now(UTC).isoformat(),
            "agent": agent,
            "action": action,
            "status": status,
            "target": target,
            "duration_ms": duration_ms,
            "token_usage": token_usage,
            "error": error,
        }
        if extra:
            entry["extra"] = extra

        log_path = self._get_log_path(agent)
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def log_run(
        self,
        agent: str,
        prompt: str,
        status: str,
        *,
        duration_ms: int | None = None,
        token_usage: dict[str, int] | None = None,
        error: str | None = None,
    ) -> None:
        """Convenience method to log an agent run."""
        self.log(
            agent=agent,
            action="run",
            status=status,
            target=prompt[:100],  # first 100 chars of prompt
            duration_ms=duration_ms,
            token_usage=token_usage,
            error=error,
        )

    def log_escalation(
        self,
        agent: str,
        reason: str,
        escalated_to: str,
    ) -> None:
        """Log an escalation event."""
        self.log(
            agent=agent,
            action="escalation",
            status="escalated",
            extra={"reason": reason, "escalated_to": escalated_to},
        )

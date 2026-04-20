"""Plan manager — read/write harness-plan.md frontmatter and validate state transitions.

See design doc §6 (pipeline state tracking).

State machine (§6.2):
    init → designed → planned → building → built → verified → reviewed → shipped

Transition rules:
- Forward only (rollback requires explicit backup)
- One step at a time (no skipping)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

_FRONTMATTER_RE = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n?", re.DOTALL)

# State machine — forward progression only
STATE_ORDER: tuple[str, ...] = (
    "init",
    "designed",
    "planned",
    "building",
    "built",
    "verified",
    "reviewed",
    "shipped",
)
ALLOWED_GSTACK_MODES = {"auto", "manual", "prompt"}


# Data models


@dataclass(frozen=True)
class ProfileRef:
    """Profile reference in harness-plan (id + applied path)."""

    id: str
    path: str
    status: str = "confirmed"


@dataclass(frozen=True)
class VerifyRecord:
    """Single /ha-verify execution record."""

    step: str
    at: str  # ISO 8601 UTC
    passed: bool
    summary: str


@dataclass(frozen=True)
class SkeletonSpec:
    """Skeleton section decisions from harness-plan."""

    required: tuple[str, ...]
    optional: tuple[str, ...]
    included: tuple[str, ...]


@dataclass(frozen=True)
class Pipeline:
    """Pipeline progress state."""

    steps: tuple[str, ...]  # order proposed by ha-init (gstack steps included)
    current_step: str  # abstract state (one of STATE_ORDER)
    completed_steps: tuple[str, ...]  # step names that actually ran
    skipped_steps: tuple[str, ...] = ()
    gstack_mode: str = "manual"


@dataclass
class HarnessPlan:
    """Parsed harness-plan.md contents."""

    project_name: str
    project_type: str
    scale: str
    user_description_original: str
    profiles: list[ProfileRef]
    skeleton_sections: SkeletonSpec
    pipeline: Pipeline
    verify_history: list[VerifyRecord] = field(default_factory=list)
    backups: list[dict[str, Any]] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""
    last_activity: str = ""
    harness_version: int = 2
    schema_version: int = 1
    body: str = ""  # markdown body outside the frontmatter


# Exceptions


class PlanNotFoundError(FileNotFoundError):
    """harness-plan.md file does not exist."""


class InvalidStateTransitionError(ValueError):
    """Invalid state transition attempt (backward, skip, or unknown state)."""


class PlanSchemaError(ValueError):
    """harness-plan.md frontmatter schema violation."""


# Manager


class PlanManager:
    """Read/write harness-plan.md with state transition validation."""

    def load(self, path: Path) -> HarnessPlan:
        """Load harness-plan.md.

        Raises:
            PlanNotFoundError: File does not exist.
            PlanSchemaError: Frontmatter schema violation.
        """
        if not path.exists():
            raise PlanNotFoundError(f"harness-plan.md not found: {path}")

        text = path.read_text(encoding="utf-8")
        m = _FRONTMATTER_RE.match(text)
        if not m:
            raise PlanSchemaError(f"{path.name}: missing YAML frontmatter")
        try:
            data = yaml.safe_load(m.group(1))
        except yaml.YAMLError as exc:
            raise PlanSchemaError(f"{path.name}: YAML parse failed: {exc}") from exc
        if not isinstance(data, dict):
            raise PlanSchemaError(f"{path.name}: frontmatter must be a dict")

        body = text[m.end() :].lstrip()
        return _dict_to_plan(data, body)

    def save(self, plan: HarnessPlan, path: Path) -> None:
        """Serialize HarnessPlan to file (frontmatter + body)."""
        plan.updated_at = _now_iso()
        plan.last_activity = plan.updated_at
        data = _plan_to_dict(plan)
        text = (
            "---\n"
            + yaml.safe_dump(data, allow_unicode=True, sort_keys=False)
            + "---\n\n"
            + plan.body
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def create(
        self,
        *,
        project_name: str,
        project_type: str,
        scale: str,
        user_description_original: str,
        profiles: list[ProfileRef],
        skeleton_sections: SkeletonSpec,
        pipeline_steps: list[str],
        gstack_mode: str = "manual",
        body: str = "",
    ) -> HarnessPlan:
        """Create a new plan. Starts at current_step="init"."""
        if gstack_mode not in ALLOWED_GSTACK_MODES:
            raise PlanSchemaError(
                f"gstack_mode must be one of {sorted(ALLOWED_GSTACK_MODES)}, got '{gstack_mode}'"
            )
        if scale not in {"tiny", "small", "medium", "large"}:
            raise PlanSchemaError(f"scale must be tiny|small|medium|large, got '{scale}'")

        now = _now_iso()
        return HarnessPlan(
            project_name=project_name,
            project_type=project_type,
            scale=scale,
            user_description_original=user_description_original,
            profiles=list(profiles),
            skeleton_sections=skeleton_sections,
            pipeline=Pipeline(
                steps=tuple(pipeline_steps),
                current_step="init",
                completed_steps=(),
                skipped_steps=(),
                gstack_mode=gstack_mode,
            ),
            created_at=now,
            updated_at=now,
            last_activity=now,
            body=body,
        )

    def transition(
        self,
        plan: HarnessPlan,
        target_state: str,
        *,
        completed_step: str | None = None,
    ) -> HarnessPlan:
        """Transition current_step to target_state.

        Raises:
            InvalidStateTransitionError: Backward, skip, or unknown state.
        """
        if target_state not in STATE_ORDER:
            raise InvalidStateTransitionError(
                f"unknown state '{target_state}'. allowed: {STATE_ORDER}"
            )

        current_idx = STATE_ORDER.index(plan.pipeline.current_step)
        target_idx = STATE_ORDER.index(target_state)

        if target_idx == current_idx:
            # Same state (idempotent) — only append the new step if given
            pass
        elif target_idx < current_idx:
            raise InvalidStateTransitionError(
                f"cannot move backward: {plan.pipeline.current_step} -> {target_state}. "
                "use explicit backup() for rollback."
            )
        elif target_idx - current_idx > 1:
            # e.g. 'building' → 'verified' (skips 'built')
            raise InvalidStateTransitionError(
                f"cannot skip states: {plan.pipeline.current_step} -> {target_state}. "
                f"missing intermediate {STATE_ORDER[current_idx + 1 : target_idx]}."
            )

        completed = list(plan.pipeline.completed_steps)
        if completed_step and completed_step not in completed:
            completed.append(completed_step)

        plan.pipeline = Pipeline(
            steps=plan.pipeline.steps,
            current_step=target_state,
            completed_steps=tuple(completed),
            skipped_steps=plan.pipeline.skipped_steps,
            gstack_mode=plan.pipeline.gstack_mode,
        )
        plan.last_activity = _now_iso()
        return plan

    def record_verify(
        self,
        plan: HarnessPlan,
        *,
        step: str,
        passed: bool,
        summary: str,
    ) -> HarnessPlan:
        """Append a verification result to verify_history."""
        plan.verify_history.append(
            VerifyRecord(step=step, at=_now_iso(), passed=passed, summary=summary)
        )
        plan.last_activity = _now_iso()
        return plan

    def mark_skipped(self, plan: HarnessPlan, step: str) -> HarnessPlan:
        """Add step to skipped_steps."""
        if step in plan.pipeline.skipped_steps:
            return plan
        plan.pipeline = Pipeline(
            steps=plan.pipeline.steps,
            current_step=plan.pipeline.current_step,
            completed_steps=plan.pipeline.completed_steps,
            skipped_steps=(*plan.pipeline.skipped_steps, step),
            gstack_mode=plan.pipeline.gstack_mode,
        )
        plan.last_activity = _now_iso()
        return plan

    def add_backup(
        self,
        plan: HarnessPlan,
        *,
        path: str,
        reason: str,
    ) -> HarnessPlan:
        """Record a rollback backup entry (actual file copy is caller's responsibility)."""
        plan.backups.append({"path": path, "at": _now_iso(), "reason": reason})
        plan.last_activity = _now_iso()
        return plan


# Serialization helpers


def _now_iso() -> str:
    """Current UTC time as ISO 8601 (microseconds truncated)."""
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _dict_to_plan(data: dict[str, Any], body: str) -> HarnessPlan:
    """Convert frontmatter dict to HarnessPlan."""
    try:
        pipeline_raw = data.get("pipeline") or {}
        skeleton_raw = data.get("skeleton_sections") or {}
        profiles_raw = data.get("profiles") or []
        verify_raw = data.get("verify_history") or []

        return HarnessPlan(
            project_name=data["project_name"],
            project_type=data.get("project_type", ""),
            scale=data.get("scale", "small"),
            user_description_original=data.get("user_description_original", ""),
            profiles=[
                ProfileRef(
                    id=p["id"],
                    path=p.get("path", "."),
                    status=p.get("status", "confirmed"),
                )
                for p in profiles_raw
                if isinstance(p, dict) and "id" in p
            ],
            skeleton_sections=SkeletonSpec(
                required=tuple(skeleton_raw.get("required") or []),
                optional=tuple(skeleton_raw.get("optional") or []),
                included=tuple(skeleton_raw.get("included") or []),
            ),
            pipeline=Pipeline(
                steps=tuple(pipeline_raw.get("steps") or []),
                current_step=pipeline_raw.get("current_step", "init"),
                completed_steps=tuple(pipeline_raw.get("completed_steps") or []),
                skipped_steps=tuple(pipeline_raw.get("skipped_steps") or []),
                gstack_mode=pipeline_raw.get("gstack_mode", "manual"),
            ),
            verify_history=[
                VerifyRecord(
                    step=v["step"],
                    at=v.get("at", ""),
                    passed=bool(v.get("passed", False)),
                    summary=v.get("summary", ""),
                )
                for v in verify_raw
                if isinstance(v, dict) and "step" in v
            ],
            backups=list(data.get("backups") or []),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
            last_activity=data.get("last_activity", ""),
            harness_version=int(data.get("harness_version", 2)),
            schema_version=int(data.get("schema_version", 1)),
            body=body,
        )
    except KeyError as exc:
        raise PlanSchemaError(f"missing required field: {exc}") from exc


def _plan_to_dict(plan: HarnessPlan) -> dict[str, Any]:
    """Convert HarnessPlan to frontmatter dict (preserves key order)."""
    return {
        "harness_version": plan.harness_version,
        "schema_version": plan.schema_version,
        "project_name": plan.project_name,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
        "project_type": plan.project_type,
        "scale": plan.scale,
        "user_description_original": plan.user_description_original,
        "profiles": [{"id": p.id, "path": p.path, "status": p.status} for p in plan.profiles],
        "skeleton_sections": {
            "required": list(plan.skeleton_sections.required),
            "optional": list(plan.skeleton_sections.optional),
            "included": list(plan.skeleton_sections.included),
        },
        "pipeline": {
            "steps": list(plan.pipeline.steps),
            "current_step": plan.pipeline.current_step,
            "completed_steps": list(plan.pipeline.completed_steps),
            "skipped_steps": list(plan.pipeline.skipped_steps),
            "gstack_mode": plan.pipeline.gstack_mode,
        },
        "verify_history": [
            {"step": v.step, "at": v.at, "passed": v.passed, "summary": v.summary}
            for v in plan.verify_history
        ],
        "backups": plan.backups,
        "last_activity": plan.last_activity,
    }

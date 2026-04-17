"""Plan manager — harness-plan.md frontmatter 읽기/쓰기, 상태 전이 검증.

설계 문서 §6 (파이프라인 상태 추적) 참조.

상태 머신 (§6.2):
    init → designed → planned → building → built → verified → reviewed → shipped

전이 규칙:
- 앞 단계로만 (뒤로는 명시적 롤백)
- 한 단계씩 (건너뛰기 금지)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

_FRONTMATTER_RE = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n?", re.DOTALL)

# 상태 머신 — 순서대로 진행만 가능
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


# ── 데이터 모델 ──────────────────────────────────────────────────────────


@dataclass(frozen=True)
class ProfileRef:
    """harness-plan에서 참조하는 프로파일 (id + 적용 경로)."""

    id: str
    path: str
    status: str = "confirmed"


@dataclass(frozen=True)
class VerifyRecord:
    """단일 /ha-verify 실행 결과."""

    step: str
    at: str  # ISO 8601 UTC
    passed: bool
    summary: str


@dataclass(frozen=True)
class SkeletonSpec:
    """harness-plan의 skeleton 섹션 결정사항."""

    required: tuple[str, ...]
    optional: tuple[str, ...]
    included: tuple[str, ...]


@dataclass(frozen=True)
class Pipeline:
    """파이프라인 진행 상태."""

    steps: tuple[str, ...]  # ha-init이 제안한 순서 (gstack 포함)
    current_step: str  # 추상 상태 (STATE_ORDER 중 하나)
    completed_steps: tuple[str, ...]  # 실제 실행된 step 이름들
    skipped_steps: tuple[str, ...] = ()
    gstack_mode: str = "manual"


@dataclass
class HarnessPlan:
    """파싱된 harness-plan.md 전체."""

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
    body: str = ""  # frontmatter 이외 Markdown 본문


# ── 예외 ────────────────────────────────────────────────────────────────


class PlanNotFoundError(FileNotFoundError):
    """harness-plan.md 파일이 존재하지 않음."""


class InvalidStateTransitionError(ValueError):
    """잘못된 상태 전이 시도 (역행, 건너뛰기, 미지정 상태)."""


class PlanSchemaError(ValueError):
    """harness-plan.md frontmatter 스키마 위반."""


# ── 매니저 ──────────────────────────────────────────────────────────────


class PlanManager:
    """harness-plan.md 읽기/쓰기 + 상태 전이.

    - load(path): 파일 → HarnessPlan 객체
    - save(plan, path): HarnessPlan → 파일 (frontmatter + body 직렬화)
    - transition(plan, target_state, completed_step): 상태 전이 검증 + 적용
    - record_verify(plan, step, passed, summary): 검증 이력 추가
    - mark_skipped(plan, step): step 스킵 처리
    """

    def load(self, path: Path) -> HarnessPlan:
        """harness-plan.md 로드.

        Raises:
            PlanNotFoundError: 파일 없음
            PlanSchemaError: frontmatter 형식 위반
        """
        if not path.exists():
            raise PlanNotFoundError(f"harness-plan.md 없음: {path}")

        text = path.read_text(encoding="utf-8")
        m = _FRONTMATTER_RE.match(text)
        if not m:
            raise PlanSchemaError(f"{path.name}: YAML frontmatter 없음")
        try:
            data = yaml.safe_load(m.group(1))
        except yaml.YAMLError as exc:
            raise PlanSchemaError(f"{path.name}: YAML 파싱 실패: {exc}") from exc
        if not isinstance(data, dict):
            raise PlanSchemaError(f"{path.name}: frontmatter 는 dict 여야 함")

        body = text[m.end() :].lstrip()
        return _dict_to_plan(data, body)

    def save(self, plan: HarnessPlan, path: Path) -> None:
        """HarnessPlan → 파일 (frontmatter + body)."""
        plan.updated_at = _now_iso()
        plan.last_activity = plan.updated_at
        data = _plan_to_dict(plan)
        text = "---\n" + yaml.safe_dump(data, allow_unicode=True, sort_keys=False) + "---\n\n" + plan.body
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
        """새 plan 생성. current_step="init", completed_steps=()."""
        if gstack_mode not in ALLOWED_GSTACK_MODES:
            raise PlanSchemaError(
                f"gstack_mode: {sorted(ALLOWED_GSTACK_MODES)} 중 하나여야 함, 현재 '{gstack_mode}'"
            )
        if scale not in {"tiny", "small", "medium", "large"}:
            raise PlanSchemaError(f"scale: tiny|small|medium|large, 현재 '{scale}'")

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
        """current_step 을 target_state 로 전이.

        Args:
            target_state: STATE_ORDER 중 하나
            completed_step: 이번 전이를 일으킨 step 이름 (예: "ha-design").
                            지정되면 completed_steps에 append.

        Raises:
            InvalidStateTransitionError: 역행/건너뛰기/미지정 상태
        """
        if target_state not in STATE_ORDER:
            raise InvalidStateTransitionError(
                f"미지정 상태 '{target_state}'. 허용: {STATE_ORDER}"
            )

        current_idx = STATE_ORDER.index(plan.pipeline.current_step)
        target_idx = STATE_ORDER.index(target_state)

        if target_idx == current_idx:
            # 같은 상태 (idempotent) — 새 step 추가만 처리
            pass
        elif target_idx < current_idx:
            raise InvalidStateTransitionError(
                f"역행 전이 불가: {plan.pipeline.current_step} → {target_state}. "
                "롤백은 명시적 backup() 사용."
            )
        elif target_idx - current_idx > 1:
            # 'building' → 'verified' (built 건너뜀) 같은 경우
            raise InvalidStateTransitionError(
                f"건너뛰기 불가: {plan.pipeline.current_step} → {target_state}. "
                f"중간 상태 {STATE_ORDER[current_idx + 1 : target_idx]} 누락."
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
        """verify 결과를 verify_history에 추가."""
        plan.verify_history.append(
            VerifyRecord(step=step, at=_now_iso(), passed=passed, summary=summary)
        )
        plan.last_activity = _now_iso()
        return plan

    def mark_skipped(self, plan: HarnessPlan, step: str) -> HarnessPlan:
        """step 을 skipped_steps 에 추가."""
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
        """롤백 백업 기록 추가 (실제 파일 복사는 호출자 책임)."""
        plan.backups.append(
            {"path": path, "at": _now_iso(), "reason": reason}
        )
        plan.last_activity = _now_iso()
        return plan


# ── 직렬화/역직렬화 헬퍼 ────────────────────────────────────────────────


def _now_iso() -> str:
    """현재 UTC 시각 ISO 8601 (마이크로초 절단)."""
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _dict_to_plan(data: dict[str, Any], body: str) -> HarnessPlan:
    """frontmatter dict → HarnessPlan."""
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
        raise PlanSchemaError(f"필수 필드 누락: {exc}") from exc


def _plan_to_dict(plan: HarnessPlan) -> dict[str, Any]:
    """HarnessPlan → frontmatter dict (sort 보존)."""
    return {
        "harness_version": plan.harness_version,
        "schema_version": plan.schema_version,
        "project_name": plan.project_name,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
        "project_type": plan.project_type,
        "scale": plan.scale,
        "user_description_original": plan.user_description_original,
        "profiles": [
            {"id": p.id, "path": p.path, "status": p.status} for p in plan.profiles
        ],
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

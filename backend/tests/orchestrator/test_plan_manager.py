"""plan_manager 단위 테스트.

모든 픽스처는 tmp_path 기반.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from src.orchestrator.plan_manager import (
    STATE_ORDER,
    HarnessPlan,
    InvalidStateTransitionError,
    PlanManager,
    PlanNotFoundError,
    PlanSchemaError,
    ProfileRef,
    ScaleAxes,
    SkeletonSpec,
)


def _sample_plan() -> HarnessPlan:
    """테스트용 기본 plan 생성."""
    pm = PlanManager()
    return pm.create(
        project_name="Sample",
        project_type="CLI 개인 도구",
        scale="small",
        user_description_original="간단한 CLI 만들 거야",
        profiles=[ProfileRef(id="python-cli", path="backend/")],
        skeleton_sections=SkeletonSpec(
            required=("overview", "stack", "interface.cli"),
            optional=("persistence",),
            included=("overview", "stack", "interface.cli"),
        ),
        pipeline_steps=["ha-init", "ha-design", "ha-plan", "ha-build", "ha-verify"],
    )


# ── 생성 ─────────────────────────────────────────────────────────────


def test_create_initial_state(tmp_path: Path) -> None:
    plan = _sample_plan()
    assert plan.pipeline.current_step == "init"
    assert plan.pipeline.completed_steps == ()
    assert plan.pipeline.gstack_mode == "manual"
    assert plan.created_at  # 비어있지 않아야


def test_create_invalid_scale_raises() -> None:
    pm = PlanManager()
    with pytest.raises(PlanSchemaError, match="scale"):
        pm.create(
            project_name="X",
            project_type="x",
            scale="huge",  # 잘못된 값
            user_description_original="",
            profiles=[],
            skeleton_sections=SkeletonSpec((), (), ()),
            pipeline_steps=[],
        )


def test_create_invalid_gstack_mode_raises() -> None:
    pm = PlanManager()
    with pytest.raises(PlanSchemaError, match="gstack_mode"):
        pm.create(
            project_name="X",
            project_type="x",
            scale="small",
            user_description_original="",
            profiles=[],
            skeleton_sections=SkeletonSpec((), (), ()),
            pipeline_steps=[],
            gstack_mode="invalid",
        )


# ── 저장/로드 라운드트립 ──────────────────────────────────────────────


def test_save_load_roundtrip(tmp_path: Path) -> None:
    pm = PlanManager()
    original = _sample_plan()
    original.body = "# Sample\n\n## Notes\nhello\n"
    path = tmp_path / "harness-plan.md"
    pm.save(original, path)

    loaded = pm.load(path)
    assert loaded.project_name == original.project_name
    assert loaded.project_type == original.project_type
    assert loaded.scale == original.scale
    assert loaded.user_description_original == original.user_description_original
    assert loaded.profiles == original.profiles
    assert loaded.skeleton_sections == original.skeleton_sections
    assert loaded.pipeline.current_step == original.pipeline.current_step
    assert loaded.pipeline.steps == original.pipeline.steps
    assert "## Notes" in loaded.body


def test_load_missing_raises(tmp_path: Path) -> None:
    pm = PlanManager()
    with pytest.raises(PlanNotFoundError):
        pm.load(tmp_path / "ghost.md")


def test_load_no_frontmatter_raises(tmp_path: Path) -> None:
    pm = PlanManager()
    p = tmp_path / "x.md"
    p.write_text("# Just a heading", encoding="utf-8")
    with pytest.raises(PlanSchemaError, match="frontmatter"):
        pm.load(p)


def test_load_invalid_yaml_raises(tmp_path: Path) -> None:
    pm = PlanManager()
    p = tmp_path / "x.md"
    p.write_text("---\nkey: value: bad\n---\nbody", encoding="utf-8")
    with pytest.raises(PlanSchemaError, match="YAML"):
        pm.load(p)


def test_save_updates_timestamps(tmp_path: Path) -> None:
    pm = PlanManager()
    plan = _sample_plan()
    # save가 updated_at 을 새로 갱신하는지 확인 — 강제 옛 값 주입
    plan.updated_at = "2020-01-01T00:00:00+00:00"
    pm.save(plan, tmp_path / "harness-plan.md")
    assert plan.updated_at != "2020-01-01T00:00:00+00:00"
    assert plan.last_activity == plan.updated_at


# ── 상태 전이 ─────────────────────────────────────────────────────────


def test_transition_one_step_forward() -> None:
    pm = PlanManager()
    plan = _sample_plan()
    assert plan.pipeline.current_step == "init"
    pm.transition(plan, "designed", completed_step="ha-design")
    assert plan.pipeline.current_step == "designed"
    assert "ha-design" in plan.pipeline.completed_steps


def test_transition_full_chain() -> None:
    pm = PlanManager()
    plan = _sample_plan()
    sequence = ["designed", "planned", "building", "built", "verified", "reviewed", "shipped"]
    for state in sequence:
        pm.transition(plan, state, completed_step=f"step-{state}")
    assert plan.pipeline.current_step == "shipped"
    assert len(plan.pipeline.completed_steps) == len(sequence)


def test_transition_skipping_raises() -> None:
    """init → planned 같은 건너뛰기는 불가."""
    pm = PlanManager()
    plan = _sample_plan()
    with pytest.raises(InvalidStateTransitionError, match="skip"):
        pm.transition(plan, "planned")


def test_transition_backward_raises() -> None:
    pm = PlanManager()
    plan = _sample_plan()
    pm.transition(plan, "designed")
    with pytest.raises(InvalidStateTransitionError, match="backward"):
        pm.transition(plan, "init")


def test_transition_unknown_state_raises() -> None:
    pm = PlanManager()
    plan = _sample_plan()
    with pytest.raises(InvalidStateTransitionError, match="unknown"):
        pm.transition(plan, "totally-fake")


def test_transition_idempotent_same_state() -> None:
    """같은 상태로 다시 전이 — 에러 없이 step만 추가."""
    pm = PlanManager()
    plan = _sample_plan()
    pm.transition(plan, "designed", completed_step="ha-design")
    pm.transition(plan, "designed", completed_step="plan-eng-review")
    assert plan.pipeline.current_step == "designed"
    assert "ha-design" in plan.pipeline.completed_steps
    assert "plan-eng-review" in plan.pipeline.completed_steps


def test_transition_no_duplicate_completed_step() -> None:
    pm = PlanManager()
    plan = _sample_plan()
    pm.transition(plan, "designed", completed_step="ha-design")
    pm.transition(plan, "designed", completed_step="ha-design")
    # 같은 step 두 번 — completed_steps에 한 번만
    assert plan.pipeline.completed_steps.count("ha-design") == 1


# ── 검증 이력 ─────────────────────────────────────────────────────────


def test_record_verify_appends_history() -> None:
    pm = PlanManager()
    plan = _sample_plan()
    pm.record_verify(plan, step="ha-verify", passed=True, summary="247 tests")
    assert len(plan.verify_history) == 1
    assert plan.verify_history[0].step == "ha-verify"
    assert plan.verify_history[0].passed is True


def test_record_verify_multiple() -> None:
    pm = PlanManager()
    plan = _sample_plan()
    pm.record_verify(plan, step="ha-verify", passed=False, summary="3 failures")
    pm.record_verify(plan, step="ha-verify", passed=True, summary="all green")
    assert len(plan.verify_history) == 2
    assert plan.verify_history[0].passed is False
    assert plan.verify_history[1].passed is True


# ── 스킵 / 백업 ───────────────────────────────────────────────────────


def test_mark_skipped_adds_step() -> None:
    pm = PlanManager()
    plan = _sample_plan()
    pm.mark_skipped(plan, "office-hours")
    assert "office-hours" in plan.pipeline.skipped_steps


def test_mark_skipped_idempotent() -> None:
    pm = PlanManager()
    plan = _sample_plan()
    pm.mark_skipped(plan, "office-hours")
    pm.mark_skipped(plan, "office-hours")
    assert plan.pipeline.skipped_steps.count("office-hours") == 1


def test_add_backup_records_entry() -> None:
    pm = PlanManager()
    plan = _sample_plan()
    pm.add_backup(plan, path=".backup/skeleton-2026.md", reason="ha-design --reset")
    assert len(plan.backups) == 1
    assert plan.backups[0]["path"] == ".backup/skeleton-2026.md"
    assert plan.backups[0]["reason"] == "ha-design --reset"


# ── 라운드트립 + 상태 전이 통합 ────────────────────────────────────────


def test_save_load_preserves_completed_steps_and_history(tmp_path: Path) -> None:
    pm = PlanManager()
    plan = _sample_plan()
    pm.transition(plan, "designed", completed_step="ha-design")
    pm.transition(plan, "planned", completed_step="ha-plan")
    pm.record_verify(plan, step="ha-verify", passed=True, summary="ok")
    pm.mark_skipped(plan, "office-hours")

    path = tmp_path / "harness-plan.md"
    pm.save(plan, path)
    loaded = pm.load(path)

    assert loaded.pipeline.current_step == "planned"
    assert "ha-design" in loaded.pipeline.completed_steps
    assert "ha-plan" in loaded.pipeline.completed_steps
    assert "office-hours" in loaded.pipeline.skipped_steps
    assert len(loaded.verify_history) == 1
    assert loaded.verify_history[0].summary == "ok"


def test_state_order_constant() -> None:
    """STATE_ORDER 가 변경되면 명시적으로 검토되도록."""
    assert STATE_ORDER == (
        "init",
        "designed",
        "planned",
        "building",
        "built",
        "verified",
        "reviewed",
        "shipped",
    )


# ── ScaleAxes (6축) ──────────────────────────────────────────────────


def test_scale_axes_default_values_on_create() -> None:
    """scale_axes 미지정 시 기본값으로 채워져야."""
    plan = _sample_plan()
    assert plan.scale_axes.user_scale == "small"
    assert plan.scale_axes.data_sensitivity == "none"
    assert plan.scale_axes.team_size == "solo"
    assert plan.scale_axes.availability == "standard"
    assert plan.scale_axes.monetization == "none"
    assert plan.scale_axes.lifecycle == "mvp"


def test_scale_axes_explicit_values_preserved() -> None:
    pm = PlanManager()
    axes = ScaleAxes(
        user_scale="large",
        data_sensitivity="payment",
        team_size="multi",
        availability="high",
        monetization="subscription",
        lifecycle="ga",
    )
    plan = pm.create(
        project_name="X",
        project_type="x",
        scale="medium",
        user_description_original="",
        profiles=[],
        skeleton_sections=SkeletonSpec((), (), ()),
        pipeline_steps=[],
        scale_axes=axes,
    )
    assert plan.scale_axes == axes


def test_scale_axes_round_trip(tmp_path: Path) -> None:
    """save/load 후 6축 값이 보존되어야."""
    pm = PlanManager()
    axes = ScaleAxes(
        user_scale="medium",
        data_sensitivity="pii",
        team_size="small",
        availability="high",
        monetization="ads",
        lifecycle="poc",
    )
    plan = pm.create(
        project_name="RoundTrip",
        project_type="webapp",
        scale="medium",
        user_description_original="",
        profiles=[],
        skeleton_sections=SkeletonSpec((), (), ()),
        pipeline_steps=[],
        scale_axes=axes,
    )
    path = tmp_path / "harness-plan.md"
    pm.save(plan, path)
    loaded = pm.load(path)
    assert loaded.scale_axes == axes


def test_scale_axes_backward_compat_load_without_field(tmp_path: Path) -> None:
    """scale_axes 가 없는 기존 frontmatter 도 로드 가능 — 모두 default."""
    path = tmp_path / "harness-plan.md"
    path.write_text(
        "---\n"
        "harness_version: 2\n"
        "schema_version: 1\n"
        "project_name: Legacy\n"
        "project_type: cli\n"
        "scale: small\n"
        "profiles: []\n"
        "skeleton_sections:\n"
        "  required: []\n"
        "  optional: []\n"
        "  included: []\n"
        "pipeline:\n"
        "  steps: []\n"
        "  current_step: init\n"
        "  completed_steps: []\n"
        "  skipped_steps: []\n"
        "  gstack_mode: manual\n"
        "---\n"
        "body\n",
        encoding="utf-8",
    )
    pm = PlanManager()
    loaded = pm.load(path)
    assert loaded.scale_axes.user_scale == "small"
    assert loaded.scale_axes.data_sensitivity == "none"
    assert loaded.scale_axes.team_size == "solo"
    assert loaded.scale_axes.availability == "standard"
    assert loaded.scale_axes.monetization == "none"
    assert loaded.scale_axes.lifecycle == "mvp"


@pytest.mark.parametrize(
    "field,bad_value",
    [
        ("user_scale", "huge"),
        ("data_sensitivity", "secret"),
        ("team_size", "army"),
        ("availability", "always"),
        ("monetization", "donation"),
        ("lifecycle", "alpha"),
    ],
)
def test_scale_axes_invalid_values_raise(field: str, bad_value: str) -> None:
    """6축 각각의 잘못된 값에 PlanSchemaError."""
    kwargs = {
        "user_scale": "small",
        "data_sensitivity": "none",
        "team_size": "solo",
        "availability": "standard",
        "monetization": "none",
        "lifecycle": "mvp",
    }
    kwargs[field] = bad_value
    with pytest.raises(PlanSchemaError, match=field):
        ScaleAxes(**kwargs)


def test_scale_axes_load_with_partial_fields_uses_defaults(tmp_path: Path) -> None:
    """frontmatter 의 scale_axes 가 일부 축만 가지고 있어도 누락분은 default 로 채움."""
    path = tmp_path / "harness-plan.md"
    path.write_text(
        "---\n"
        "harness_version: 2\n"
        "schema_version: 1\n"
        "project_name: Partial\n"
        "scale: small\n"
        "scale_axes:\n"
        "  user_scale: large\n"
        "  monetization: payment\n"
        "profiles: []\n"
        "skeleton_sections:\n"
        "  required: []\n"
        "  optional: []\n"
        "  included: []\n"
        "pipeline:\n"
        "  steps: []\n"
        "  current_step: init\n"
        "  completed_steps: []\n"
        "  skipped_steps: []\n"
        "  gstack_mode: manual\n"
        "---\n"
        "body\n",
        encoding="utf-8",
    )
    pm = PlanManager()
    loaded = pm.load(path)
    # 명시된 두 축은 그대로
    assert loaded.scale_axes.user_scale == "large"
    assert loaded.scale_axes.monetization == "payment"
    # 누락된 네 축은 default
    assert loaded.scale_axes.data_sensitivity == "none"
    assert loaded.scale_axes.team_size == "solo"
    assert loaded.scale_axes.availability == "standard"
    assert loaded.scale_axes.lifecycle == "mvp"


def test_scale_axes_load_with_invalid_value_raises(tmp_path: Path) -> None:
    """frontmatter 에 invalid scale_axes 값이 저장돼 있으면 load 시 PlanSchemaError.

    수동 편집된 YAML 이 잘못된 값을 가진 채 침묵 통과하면 위험 — strict 거부.
    """
    path = tmp_path / "harness-plan.md"
    path.write_text(
        "---\n"
        "harness_version: 2\n"
        "schema_version: 1\n"
        "project_name: BadAxis\n"
        "scale: small\n"
        "scale_axes:\n"
        "  user_scale: huge\n"  # invalid
        "profiles: []\n"
        "skeleton_sections:\n"
        "  required: []\n"
        "  optional: []\n"
        "  included: []\n"
        "pipeline:\n"
        "  steps: []\n"
        "  current_step: init\n"
        "  completed_steps: []\n"
        "  skipped_steps: []\n"
        "  gstack_mode: manual\n"
        "---\n"
        "body\n",
        encoding="utf-8",
    )
    pm = PlanManager()
    with pytest.raises(PlanSchemaError, match="user_scale"):
        pm.load(path)

#!/usr/bin/env python3
"""HarnessAI v2 — `/ha-init` 백엔드 스크립트.

스킬(SKILL.md)이 호출하는 두 서브커맨드:
- detect <project_dir>          : 매칭 프로파일 JSON 출력
- write --project ... --profiles ... --included ... --description ...
                                : harness-plan.md + skeleton.md 작성

HARNESS_AI_HOME 탐지 로직은 `_ha_shared/utils.py` 에 일원화 (다른 6 스킬과 동일 경로).
env 우선 → 없으면 레포 루트 자동 탐지 (dev mode) → 실패 시 명확한 에러.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# UTF-8 stdout (Windows cp949 호환)
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

# _ha_shared/utils.py 의 HARNESS_HOME 탐지 재사용 — 다른 스킬들과 일관성 유지.
# import 자체가 side effect (sys.path 에 backend 추가) 이므로 이름 안 써도 제거 금지.
sys.path.insert(0, str(Path(__file__).parent.parent / "_ha_shared"))
from utils import HARNESS_HOME  # noqa: E402, F401, I001

from src.orchestrator.plan_manager import (  # noqa: E402
    PlanManager,
    ProfileRef,
    ScaleAxes,
    SkeletonSpec,
)
from src.orchestrator.profile_loader import ProfileLoader  # noqa: E402
from src.orchestrator.skeleton_assembler import SkeletonAssembler  # noqa: E402


# ── 공통 유틸 ──────────────────────────────────────────────────────────


def _docs_dir(project: Path, profile_path: str) -> Path:
    """프로파일 매칭 경로 + 'docs/' 우선, 없으면 project/docs/."""
    base = project if profile_path == "." else (project / profile_path)
    return (base / "docs") if base.exists() else (project / "docs")


# ── detect 서브커맨드 ─────────────────────────────────────────────────


def cmd_detect(args: argparse.Namespace) -> int:
    project = Path(args.project_dir).resolve()
    if not project.exists():
        print(json.dumps({"error": f"project not found: {project}"}), file=sys.stderr)
        return 1

    loader = ProfileLoader(project_dir=project)
    matches = loader.detect()

    output: dict = {"project": str(project), "matches": []}
    for m in matches:
        p = m.profile
        output["matches"].append({
            "profile_id": p.id,
            "name": p.name,
            "path": m.path,
            "status": p.status,
            "required_sections": list(p.skeleton_sections.required),
            "optional_sections": list(p.skeleton_sections.optional),
            "section_order": list(p.skeleton_sections.order),
            "toolchain": {
                "install": p.toolchain.install,
                "test": p.toolchain.test,
                "lint": p.toolchain.lint,
                "type": p.toolchain.type,
                "format": p.toolchain.format,
            },
            "whitelist_runtime": list(p.whitelist.runtime),
            "whitelist_dev": list(p.whitelist.dev),
            "gstack_mode": p.gstack_mode,
            "gstack_recommended": dict(p.gstack_recommended),
        })

    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


# ── write 서브커맨드 ──────────────────────────────────────────────────


def cmd_write(args: argparse.Namespace) -> int:
    project = Path(args.project).resolve()
    if not project.exists():
        print(f"[FAIL] project not found: {project}", file=sys.stderr)
        return 1

    profile_ids = [p.strip() for p in args.profiles.split(",") if p.strip()]
    included = [s.strip() for s in args.included.split(",") if s.strip()]
    if not profile_ids:
        print("[FAIL] --profiles 비어 있음", file=sys.stderr)
        return 2
    if not included:
        print("[FAIL] --included 비어 있음", file=sys.stderr)
        return 2

    loader = ProfileLoader(project_dir=project)

    # 프로파일 로드 + match 정보 (path 결정용)
    matches = {m.profile.id: m for m in loader.detect()}
    profiles_for_plan: list[ProfileRef] = []
    for pid in profile_ids:
        if pid not in matches:
            # detect 안 된 프로파일도 로드 시도 (사용자가 수동 선택한 경우)
            try:
                p = loader.load(pid)
                profiles_for_plan.append(ProfileRef(id=p.id, path=".", status=p.status))
            except Exception as exc:
                print(f"[FAIL] 프로파일 '{pid}' 로드 실패: {exc}", file=sys.stderr)
                return 1
        else:
            m = matches[pid]
            profiles_for_plan.append(
                ProfileRef(id=m.profile.id, path=m.path, status=m.profile.status)
            )

    primary_id = profile_ids[0]
    primary = (
        matches[primary_id].profile if primary_id in matches else loader.load(primary_id)
    )
    primary_path = profiles_for_plan[0].path

    # skeleton 조립 — 사용자가 included 로 지정한 섹션만, primary 의 order 유지
    primary_order = list(primary.skeleton_sections.order)
    seen: set[str] = set()
    ordered_included: list[str] = []
    for sid in primary_order:
        if sid in included and sid not in seen:
            ordered_included.append(sid)
            seen.add(sid)
    for sid in included:  # primary order 에 없으면 끝에 append
        if sid not in seen:
            ordered_included.append(sid)
            seen.add(sid)

    docs_dir = _docs_dir(project, primary_path)
    docs_dir.mkdir(parents=True, exist_ok=True)

    assembler = SkeletonAssembler(project_dir=project)
    title = f"Project Skeleton — {project.name}"
    try:
        skeleton_text = assembler.assemble(ordered_included, title=title)
    except Exception as exc:
        print(f"[FAIL] skeleton 조립 실패: {exc}", file=sys.stderr)
        return 1

    out_skeleton = docs_dir / "skeleton.md"
    if out_skeleton.exists() and not args.overwrite:
        backup = docs_dir / f".backup-skeleton-{_now_tag()}.md"
        backup.write_text(out_skeleton.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"[backup] 기존 skeleton.md → {backup.name}", file=sys.stderr)
    out_skeleton.write_text(skeleton_text, encoding="utf-8")

    # plan 작성
    axes = ScaleAxes(
        user_scale=args.user_scale,
        data_sensitivity=args.data_sensitivity,
        team_size=args.team_size,
        availability=args.availability,
        monetization=args.monetization,
        lifecycle=args.lifecycle,
    )
    pm = PlanManager()
    plan = pm.create(
        project_name=project.name,
        project_type=args.project_type or "(미지정)",
        scale=args.scale,
        user_description_original=args.description or "",
        profiles=profiles_for_plan,
        skeleton_sections=SkeletonSpec(
            required=tuple(primary.skeleton_sections.required),
            optional=tuple(primary.skeleton_sections.optional),
            included=tuple(ordered_included),
        ),
        pipeline_steps=(
            args.pipeline.split(",")
            if args.pipeline
            else [
                "ha-init",
                "ha-design",
                "ha-plan",
                "ha-build",
                "ha-verify",
                "ha-review",
            ]
        ),
        gstack_mode=args.gstack_mode,
        scale_axes=axes,
    )
    plan.body = (
        f"# {project.name}\n\n"
        f"## 원본 설명\n{args.description or '(미입력)'}\n\n"
        f"## 판단 근거\n"
        f"- 타입: {args.project_type or '(미지정)'}\n"
        f"- 규모(legacy): {args.scale}\n"
        f"- 6축:\n"
        f"  - user_scale: {axes.user_scale}\n"
        f"  - data_sensitivity: {axes.data_sensitivity}\n"
        f"  - team_size: {axes.team_size}\n"
        f"  - availability: {axes.availability}\n"
        f"  - monetization: {axes.monetization}\n"
        f"  - lifecycle: {axes.lifecycle}\n"
        f"- 활성 프로파일: {', '.join(p.id + '@' + p.path for p in profiles_for_plan)}\n\n"
        f"## 다음 단계\n- /ha-design — skeleton 채우기\n"
    )

    out_plan = docs_dir / "harness-plan.md"
    if out_plan.exists() and not args.overwrite:
        backup = docs_dir / f".backup-harness-plan-{_now_tag()}.md"
        backup.write_text(out_plan.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"[backup] 기존 harness-plan.md → {backup.name}", file=sys.stderr)
    pm.save(plan, out_plan)

    print(json.dumps({
        "project": str(project),
        "skeleton_path": str(out_skeleton),
        "plan_path": str(out_plan),
        "included_sections": ordered_included,
        "profiles": [{"id": p.id, "path": p.path} for p in profiles_for_plan],
    }, ensure_ascii=False, indent=2))
    return 0


def _now_tag() -> str:
    from datetime import datetime
    return datetime.now().strftime("%Y%m%d-%H%M%S")


# ── CLI ───────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(prog="ha-init")
    sub = parser.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("detect", help="프로젝트 디렉토리에서 매칭 프로파일 JSON 출력")
    d.add_argument("project_dir", help="프로젝트 루트 경로")

    w = sub.add_parser("write", help="harness-plan.md + skeleton.md 작성")
    w.add_argument("--project", required=True, help="프로젝트 루트")
    w.add_argument("--profiles", required=True, help="콤마 구분 프로파일 ID")
    w.add_argument("--included", required=True, help="콤마 구분 섹션 ID (포함할 것)")
    w.add_argument("--description", default="", help="사용자 설명 원문")
    w.add_argument("--project-type", default="", help="프로젝트 타입 한 줄 요약")
    w.add_argument(
        "--scale",
        choices=["tiny", "small", "medium", "large"],
        default="small",
        help="overall project complexity (legacy axis — keep for compatibility)",
    )
    # 6-axis scaling — fed into plan.scale_axes (see ScaleAxes in plan_manager.py)
    w.add_argument(
        "--user-scale",
        choices=["tiny", "small", "medium", "large"],
        default="small",
        help="expected DAU bucket",
    )
    w.add_argument(
        "--data-sensitivity",
        choices=["none", "pii", "payment"],
        default="none",
    )
    w.add_argument(
        "--team-size",
        choices=["solo", "small", "multi"],
        default="solo",
    )
    w.add_argument(
        "--availability",
        choices=["casual", "standard", "high"],
        default="standard",
    )
    w.add_argument(
        "--monetization",
        choices=["none", "ads", "subscription", "payment"],
        default="none",
    )
    w.add_argument(
        "--lifecycle",
        choices=["poc", "mvp", "ga"],
        default="mvp",
    )
    w.add_argument(
        "--gstack-mode",
        choices=["auto", "manual", "prompt"],
        default="manual",
    )
    w.add_argument("--pipeline", default="", help="콤마 구분 파이프라인 step (선택)")
    w.add_argument(
        "--overwrite",
        action="store_true",
        help="기존 파일 백업 없이 덮어쓰기",
    )

    args = parser.parse_args()

    if args.cmd == "detect":
        return cmd_detect(args)
    if args.cmd == "write":
        return cmd_write(args)

    parser.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())

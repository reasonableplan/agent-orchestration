#!/usr/bin/env python3
"""HarnessAI v2 — `/ha-verify` 백엔드."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "_ha_shared"))
from utils import (  # noqa: E402
    assert_state,
    get_active_profiles,
    info,
    load_plan,
    record_verify,
    save_plan,
    transition,
)


def cmd_prepare(args: argparse.Namespace) -> int:
    plan, plan_path, project = load_plan()
    assert_state(plan, ["built", "building"], "/ha-verify")

    profiles = get_active_profiles(plan, project)

    output = {
        "project": str(project),
        "plan_path": str(plan_path),
        "profiles": [
            {
                "id": p.id,
                "path": plan.profiles[i].path if i < len(plan.profiles) else ".",
                "cwd": str(project / plan.profiles[i].path) if i < len(plan.profiles) and plan.profiles[i].path != "." else str(project),
                "toolchain": {
                    "install": p.toolchain.install,
                    "test": p.toolchain.test,
                    "lint": p.toolchain.lint,
                    "type": p.toolchain.type,
                    "format": p.toolchain.format,
                },
            }
            for i, p in enumerate(profiles)
        ],
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


def cmd_record(args: argparse.Namespace) -> int:
    plan, plan_path, project = load_plan()
    assert_state(plan, ["built", "building", "verified"], "/ha-verify record")

    passed = args.passed.lower() in ("true", "1", "yes", "y")

    record_verify(plan, step="ha-verify", passed=passed, summary=args.summary)

    if passed:
        if plan.pipeline.current_step in ("built",):
            transition(plan, "verified", completed_step="ha-verify")
        # 이미 verified 면 verify_history 에만 추가하고 상태 유지
    else:
        if plan.pipeline.current_step == "built":
            # 한 단계 뒤로 (built → building)
            from src.orchestrator.plan_manager import Pipeline
            plan.pipeline = Pipeline(
                steps=plan.pipeline.steps,
                current_step="building",
                completed_steps=plan.pipeline.completed_steps,
                skipped_steps=plan.pipeline.skipped_steps,
                gstack_mode=plan.pipeline.gstack_mode,
            )

    save_plan(plan, plan_path)

    output = {
        "passed": passed,
        "summary": args.summary,
        "current_step": plan.pipeline.current_step,
        "verify_history_count": len(plan.verify_history),
        "next": "/ha-review" if passed else "/ha-build <T-ID> (실패 원인 수정 후)",
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="ha-verify")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("prepare")
    r = sub.add_parser("record")
    r.add_argument("--passed", required=True)
    r.add_argument("--summary", required=True)
    args = parser.parse_args()
    if args.cmd == "prepare":
        return cmd_prepare(args)
    return cmd_record(args)


if __name__ == "__main__":
    sys.exit(main())

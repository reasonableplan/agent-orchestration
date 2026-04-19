#!/usr/bin/env python3
"""HarnessAI latency benchmark — non-LLM operations only.

Measured targets:
  1. Profile detection (profile_loader.detect) on a sample project
  2. Skeleton assembly (SkeletonAssembler.assemble) for all 20 sections
  3. harness validate — schema check across 27 files
  4. harness integrity — on a clean skeleton
  5. find_placeholders scaling — small/medium/large texts

Usage:
  python scripts/benchmark.py                 # stdout + docs/benchmarks/ refresh
  python scripts/benchmark.py --json          # JSON only on stdout
  python scripts/benchmark.py --iterations 10 # 10 repetitions per measurement
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

# Auto-detect repo root — this script only runs inside the HarnessAI repo.
REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = REPO_ROOT / "backend"
HARNESS_BIN = REPO_ROOT / "harness" / "bin" / "harness"
if not BACKEND_SRC.exists() or not HARNESS_BIN.exists():
    sys.stderr.write(
        f"[FAIL] repo root layout check failed — expected:\n"
        f"  {BACKEND_SRC}\n  {HARNESS_BIN}\n"
        "Run from the repo root: `uv run python scripts/benchmark.py`.\n"
    )
    sys.exit(3)
sys.path.insert(0, str(BACKEND_SRC))

from src.orchestrator.profile_loader import ProfileLoader  # noqa: E402
from src.orchestrator.skeleton_assembler import (  # noqa: E402
    SkeletonAssembler,
    find_placeholders,
)


def time_it(fn: Callable[[], Any], iterations: int) -> dict[str, float]:
    """Run ``fn`` N times and return duration statistics in milliseconds."""
    times: list[float] = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        fn()
        times.append(time.perf_counter() - t0)
    return {
        "iterations": iterations,
        "mean_ms": statistics.mean(times) * 1000,
        "median_ms": statistics.median(times) * 1000,
        "stdev_ms": (statistics.stdev(times) * 1000) if len(times) > 1 else 0.0,
        "min_ms": min(times) * 1000,
        "max_ms": max(times) * 1000,
    }


# Benchmark functions


def bench_profile_detect(iterations: int) -> dict[str, Any]:
    """Profile detection against a sample project (expected: fastapi)."""
    loader = ProfileLoader()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "backend").mkdir()
        (root / "backend" / "pyproject.toml").write_text(
            '[project]\nname="test"\ndependencies=["fastapi>=0.100"]\n',
            encoding="utf-8",
        )
        stats = time_it(lambda: loader.detect(root), iterations)
    stats["target"] = "fastapi profile detection (sample pyproject.toml)"
    return stats


def bench_skeleton_assemble(iterations: int) -> dict[str, Any]:
    """Assemble every one of the 20 sections."""
    assembler = SkeletonAssembler()
    all_sections = [
        "overview", "requirements", "stack", "configuration", "errors",
        "auth", "persistence", "integrations",
        "interface.http", "interface.cli", "interface.ipc", "interface.sdk",
        "view.screens", "view.components", "state.flow", "core.logic",
        "observability", "deployment", "tasks", "notes",
    ]
    stats = time_it(lambda: assembler.assemble(all_sections), iterations)
    stats["target"] = f"assemble all {len(all_sections)} sections"
    return stats


def bench_harness_validate(iterations: int) -> dict[str, Any]:
    """harness validate — schema check across 27 files (subprocess)."""
    stats = time_it(
        lambda: subprocess.run(
            [sys.executable, str(HARNESS_BIN), "validate"],
            capture_output=True, check=True,
        ),
        iterations,
    )
    stats["target"] = "schema check over 27 files (subprocess)"
    return stats


def bench_harness_integrity(iterations: int) -> dict[str, Any]:
    """harness integrity — against a clean sample project."""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        docs = root / "docs"
        docs.mkdir()
        (root / "pyproject.toml").touch()
        (root / "src").mkdir()
        (root / "src" / "cli.py").touch()
        (docs / "harness-plan.md").write_text(
            "---\nharness_version: 2\nschema_version: 1\nproject_name: t\n"
            "profiles: []\npipeline:\n  steps: [init]\n  current_step: built\n"
            "  completed_steps: []\n  skipped_steps: []\n  gstack_mode: manual\n"
            "skeleton_sections: {included: [overview]}\nverify_history: []\n---\n",
            encoding="utf-8",
        )
        (docs / "skeleton.md").write_text(
            "# Test\n\n```filesystem\npyproject.toml\nsrc/\n  cli.py\n```\n",
            encoding="utf-8",
        )
        stats = time_it(
            lambda: subprocess.run(
                [sys.executable, str(HARNESS_BIN), "integrity",
                 "--project", str(root)],
                capture_output=True, check=True,
            ),
            iterations,
        )
    stats["target"] = "integrity on a 5-file clean skeleton"
    return stats


def bench_find_placeholders_scaling(iterations: int) -> dict[str, Any]:
    """find_placeholders scaling across small/medium/large texts."""
    texts = {
        "small_100B": "# X\n<pkg> placeholder.\n",
        "medium_10KB": ("# X\n<pkg>\n" + "Lorem ipsum dolor sit amet. " * 400),
        "large_100KB": ("# X\n<pkg>\n" + "Lorem ipsum dolor sit amet. " * 4000),
    }
    result: dict[str, Any] = {"target": "find_placeholders scaling", "sizes": {}}
    for name, text in texts.items():
        stats = time_it(lambda t=text: find_placeholders(t), iterations)
        stats["size_bytes"] = len(text)
        result["sizes"][name] = stats
    return result


def bench_install_script(iterations: int) -> dict[str, Any] | None:
    """Full install.sh run — fresh install only (3 repeats recommended)."""
    install_sh = REPO_ROOT / "install.sh"
    if not install_sh.exists():
        return None

    def _fresh():
        with tempfile.TemporaryDirectory() as tmp:
            # Inherit env + override CLAUDE_HOME (keep PATH for sha256sum, find, ...)
            env = os.environ.copy()
            env["CLAUDE_HOME"] = f"{tmp}/.claude"
            subprocess.run(
                ["bash", str(install_sh), "--force"],
                capture_output=True, check=True, env=env,
            )

    # install.sh is expensive — cap at 5 iterations
    n = min(iterations, 5)
    stats = time_it(_fresh, n)
    stats["target"] = "install.sh fresh install (44 files + manifest)"
    return stats


# Main


def run_all(iterations: int) -> dict[str, Any]:
    results: dict[str, Any] = {
        "repo": str(REPO_ROOT),
        "python": sys.version.split()[0],
        "iterations": iterations,
        "benchmarks": {},
    }
    print("[1/6] profile detect …", file=sys.stderr, flush=True)
    results["benchmarks"]["profile_detect"] = bench_profile_detect(iterations)
    print("[2/6] skeleton assemble …", file=sys.stderr, flush=True)
    results["benchmarks"]["skeleton_assemble"] = bench_skeleton_assemble(iterations)
    print("[3/6] harness validate …", file=sys.stderr, flush=True)
    results["benchmarks"]["harness_validate"] = bench_harness_validate(iterations)
    print("[4/6] harness integrity …", file=sys.stderr, flush=True)
    results["benchmarks"]["harness_integrity"] = bench_harness_integrity(iterations)
    print("[5/6] find_placeholders scaling …", file=sys.stderr, flush=True)
    results["benchmarks"]["find_placeholders"] = bench_find_placeholders_scaling(iterations)
    # install.sh timing varies across shell environments — opt-in only.
    if os.environ.get("HARNESS_BENCH_INSTALL") == "1":
        print("[6/6] install.sh fresh (max 5 runs) …", file=sys.stderr, flush=True)
        try:
            install_result = bench_install_script(iterations)
            if install_result:
                results["benchmarks"]["install_fresh"] = install_result
        except subprocess.CalledProcessError as exc:
            print(f"  [SKIP] install.sh failed: rc={exc.returncode}", flush=True)
    return results


def render_markdown(results: dict[str, Any]) -> str:
    """Render results as a markdown summary."""
    lines: list[str] = []
    lines.append("# HarnessAI Benchmark Results")
    lines.append("")
    lines.append(f"- Python: {results['python']}")
    lines.append(f"- Iterations: {results['iterations']}")
    lines.append("- Scope: non-LLM operations only")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append("| target | mean | median | p_min | p_max |")
    lines.append("|---|---|---|---|---|")
    for name, bench in results["benchmarks"].items():
        if "sizes" in bench:
            for size_name, size_stats in bench["sizes"].items():
                label = f"{name} ({size_name})"
                lines.append(
                    f"| {label} | {size_stats['mean_ms']:.2f} ms | "
                    f"{size_stats['median_ms']:.2f} ms | "
                    f"{size_stats['min_ms']:.2f} ms | "
                    f"{size_stats['max_ms']:.2f} ms |"
                )
        else:
            lines.append(
                f"| {name} | {bench['mean_ms']:.2f} ms | "
                f"{bench['median_ms']:.2f} ms | "
                f"{bench['min_ms']:.2f} ms | "
                f"{bench['max_ms']:.2f} ms |"
            )
    lines.append("")
    lines.append("## Detail")
    lines.append("")
    for name, bench in results["benchmarks"].items():
        lines.append(f"### {name}")
        lines.append(f"- **target**: {bench.get('target', '(n/a)')}")
        if "sizes" in bench:
            for size_name, size_stats in bench["sizes"].items():
                lines.append(
                    f"- `{size_name}` ({size_stats['size_bytes']}B): "
                    f"mean {size_stats['mean_ms']:.2f} ms "
                    f"(±{size_stats['stdev_ms']:.2f})"
                )
        else:
            lines.append(
                f"- mean **{bench['mean_ms']:.2f} ms** "
                f"(±{bench['stdev_ms']:.2f}), "
                f"median {bench['median_ms']:.2f} ms, "
                f"range [{bench['min_ms']:.2f}, {bench['max_ms']:.2f}]"
            )
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--iterations", type=int, default=20, help="repetitions per measurement (default: 20)")
    parser.add_argument("--json", action="store_true", help="emit JSON only on stdout")
    parser.add_argument("--out-dir", type=Path, default=REPO_ROOT / "docs" / "benchmarks", help="markdown output directory")
    args = parser.parse_args()

    results = run_all(args.iterations)

    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
        return 0

    # Write markdown + JSON artifacts
    args.out_dir.mkdir(parents=True, exist_ok=True)
    md = render_markdown(results)
    out = args.out_dir / "results.md"
    out.write_text(md, encoding="utf-8")
    raw = args.out_dir / "results.json"
    raw.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    print()
    print(md)
    print()
    print(f"[OK] results:  {out}")
    print(f"     raw JSON: {raw}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

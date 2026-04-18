#!/usr/bin/env python3
"""HarnessAI v2 — `/ha-deepinit` 백엔드 (코드베이스 스캔)."""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "_ha_shared"))
from utils import info, project_root  # noqa: E402


_EXCLUDE_DIRS = {
    "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
    ".git", ".pytest_cache", ".ruff_cache", ".mypy_cache", "target",
    "coverage", ".next", ".nuxt", ".turbo", ".cache", ".idea", ".vscode",
}

_LANG_BY_EXT = {
    ".py": "python", ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript", ".rs": "rust",
    ".go": "go", ".java": "java", ".kt": "kotlin", ".swift": "swift",
    ".md": "markdown", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
    ".json": "json", ".html": "html", ".css": "css",
}


def _scan_dir(path: Path, depth: int, max_depth: int) -> dict:
    """디렉토리 재귀 스캔."""
    if depth > max_depth or path.name in _EXCLUDE_DIRS:
        return {"path": str(path), "skipped": True}

    entries = []
    file_count = 0
    lang_counter: Counter = Counter()

    try:
        for child in sorted(path.iterdir()):
            if child.name.startswith("."):
                continue
            if child.is_dir():
                if child.name in _EXCLUDE_DIRS:
                    continue
                entries.append(_scan_dir(child, depth + 1, max_depth))
            elif child.is_file():
                file_count += 1
                lang = _LANG_BY_EXT.get(child.suffix.lower())
                if lang:
                    lang_counter[lang] += 1
    except (PermissionError, OSError):
        pass

    # 자식들 합산
    total_files = file_count
    total_lang: Counter = Counter(lang_counter)
    sub_dirs = []
    for entry in entries:
        if entry.get("skipped"):
            continue
        total_files += entry.get("total_files", 0)
        for k, v in entry.get("languages", {}).items():
            total_lang[k] += v
        sub_dirs.append(entry)

    return {
        "path": str(path),
        "name": path.name,
        "depth": depth,
        "direct_files": file_count,
        "total_files": total_files,
        "languages": dict(total_lang),
        "sub_dirs": sub_dirs,
    }


def _flatten_significant(tree: dict, min_files: int = 3) -> list[dict]:
    """의미 있는 디렉토리만 flat 리스트로."""
    out = []
    if tree.get("total_files", 0) >= min_files and tree.get("depth", 0) > 0:
        out.append({
            "path": tree["path"],
            "name": tree["name"],
            "depth": tree["depth"],
            "total_files": tree["total_files"],
            "primary_language": (
                max(tree["languages"], key=tree["languages"].get)
                if tree["languages"] else None
            ),
            "languages": tree["languages"],
        })
    for sub in tree.get("sub_dirs", []):
        out.extend(_flatten_significant(sub, min_files))
    return out


def cmd_scan(args: argparse.Namespace) -> int:
    project = Path(args.project).resolve() if args.project else project_root()
    if not project.exists():
        info(f"[FAIL] project not found: {project}")
        return 1

    tree = _scan_dir(project, depth=0, max_depth=args.depth)
    significant = _flatten_significant(tree, min_files=args.min_files)

    # include 필터
    if args.include:
        keep = set(args.include.split(","))
        significant = [s for s in significant if any(k in s["path"] for k in keep)]

    output = {
        "project": str(project),
        "tree_summary": {
            "total_files": tree.get("total_files", 0),
            "languages": tree.get("languages", {}),
            "primary_language": (
                max(tree["languages"], key=tree["languages"].get)
                if tree["languages"] else None
            ),
        },
        "significant_dirs": significant,
        "agents_md_targets": [
            {"path": s["path"], "agents_md_path": str(Path(s["path"]) / "AGENTS.md")}
            for s in significant
        ],
        "root_agents_md": str(project / "AGENTS.md"),
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="ha-deepinit")
    sub = parser.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("scan", help="프로젝트 디렉토리 스캔 + 의미 있는 디렉토리 식별")
    s.add_argument("--project", default="", help="(기본: git root 또는 cwd)")
    s.add_argument("--depth", type=int, default=3, help="최대 깊이 (기본 3)")
    s.add_argument("--min-files", type=int, default=3, help="significant 임계값")
    s.add_argument("--include", default="", help="콤마 구분 디렉토리 키워드 필터")

    args = parser.parse_args()
    if args.cmd == "scan":
        return cmd_scan(args)
    parser.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())

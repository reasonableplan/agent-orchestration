"""Profile loader — parse _registry.yaml, resolve local/global, merge inheritance, detect projects.

See design doc §3 (profile system spec) and §11 (migration plan).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

DEFAULT_HARNESS_DIR = Path.home() / ".claude" / "harness"

_FRONTMATTER_RE = re.compile(r"^---\r?\n(.*?)\r?\n---", re.DOTALL)


# Data models


@dataclass(frozen=True)
class Toolchain:
    """Profile toolchain commands. None means the tool is not configured."""

    install: str | None
    test: str | None
    lint: str | None
    type: str | None
    format: str | None


@dataclass(frozen=True)
class Whitelist:
    """Allowed dependency lists for a profile."""

    runtime: tuple[str, ...]
    dev: tuple[str, ...]
    prefix_allowed: tuple[str, ...]


@dataclass(frozen=True)
class Component:
    """Profile component type (e.g. persistence, interface.cli)."""

    id: str
    required: bool
    skeleton_section: str
    description: str = ""


@dataclass(frozen=True)
class SkeletonSections:
    """Skeleton section IDs used by a profile."""

    required: tuple[str, ...]
    optional: tuple[str, ...]
    order: tuple[str, ...]


@dataclass(frozen=True)
class Profile:
    """Fully parsed and inheritance-merged profile."""

    id: str
    name: str
    status: str  # "confirmed" | "draft"
    version: int
    extends: str | None
    paths: tuple[str, ...]
    detect: dict[str, Any]
    components: tuple[Component, ...]
    skeleton_sections: SkeletonSections
    toolchain: Toolchain
    whitelist: Whitelist
    file_structure: str
    gstack_mode: str  # "auto" | "manual" | "prompt"
    gstack_recommended: dict[str, list[str]]
    lessons_applied: tuple[str, ...]
    body: str  # markdown body (frontmatter stripped)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProfileMatch:
    """Detection result — profile + relative path from project root."""

    profile: Profile
    path: str


class ProfileNotFoundError(LookupError):
    """Profile file not found in either global or local locations."""


class CyclicInheritanceError(ValueError):
    """Cyclic inheritance detected in extends chain."""


# Loader


class ProfileLoader:
    """Profile loader with local override, inheritance merging, and caching.

    Local override (`{project}/.claude/harness/profiles/<id>.md`) takes
    precedence over global (`~/.claude/harness/profiles/<id>.md`).
    Follows extends chains with `_base` as the lowest ancestor.
    load() results are cached; detect() always scans the filesystem.
    """

    def __init__(
        self,
        harness_dir: Path | None = None,
        project_dir: Path | None = None,
    ) -> None:
        self.harness_dir = (harness_dir or DEFAULT_HARNESS_DIR).resolve()
        self.project_dir = project_dir.resolve() if project_dir else None
        self._cache: dict[str, Profile] = {}

    def load(self, profile_id: str) -> Profile:
        """Load a profile with local override and inheritance merging.

        Raises:
            ProfileNotFoundError: Not found in global or local.
            CyclicInheritanceError: Circular extends chain.
            ValueError: Frontmatter parse failure.
        """
        if profile_id == "_base":
            raise ValueError(
                "_base cannot be loaded directly (it is meant to be extended by other profiles)"
            )
        if profile_id in self._cache:
            return self._cache[profile_id]

        path = self._resolve_profile_path(profile_id)
        raw_data, body = self._parse_file(path)
        merged = self._apply_inheritance(raw_data)
        profile = self._dict_to_profile(merged, body)
        self._cache[profile_id] = profile
        return profile

    def detect(self, project_dir: Path | None = None) -> list[ProfileMatch]:
        """Return every matching profile for the project root (monorepo-aware).

        Each rule uses its first matching path. Multiple rules may match the
        same path independently.
        """
        root = (project_dir or self.project_dir or Path.cwd()).resolve()
        registry = self.load_registry()
        matches: list[ProfileMatch] = []
        for rule in registry.get("rules", []) or []:
            profile_id = rule.get("profile")
            if not profile_id:
                continue
            paths = rule.get("paths") or ["."]
            detect_block = rule.get("detect", {}) or {}
            for rel in paths:
                base = root if rel == "." else (root / rel)
                if _matches_detect(base, detect_block):
                    try:
                        profile = self.load(profile_id)
                    except (ProfileNotFoundError, ValueError):
                        continue
                    matches.append(ProfileMatch(profile=profile, path=rel))
                    break
        return matches

    def load_registry(self) -> dict[str, Any]:
        """Load _registry.yaml."""
        path = self.harness_dir / "profiles" / "_registry.yaml"
        if not path.exists():
            raise FileNotFoundError(f"_registry.yaml not found: {path}")
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    def _resolve_profile_path(self, profile_id: str) -> Path:
        """Resolve profile path — local override first, then global."""
        if self.project_dir:
            local = (
                self.project_dir / ".claude" / "harness" / "profiles" / f"{profile_id}.md"
            )
            if local.exists():
                return local
        global_path = self.harness_dir / "profiles" / f"{profile_id}.md"
        if global_path.exists():
            return global_path
        raise ProfileNotFoundError(f"profile '{profile_id}' file not found")

    def _parse_file(self, path: Path) -> tuple[dict[str, Any], str]:
        """Split file into frontmatter dict + body text."""
        text = path.read_text(encoding="utf-8")
        m = _FRONTMATTER_RE.match(text)
        if not m:
            raise ValueError(f"{path.name}: missing YAML frontmatter")
        try:
            data = yaml.safe_load(m.group(1))
        except yaml.YAMLError as exc:
            raise ValueError(f"{path.name}: YAML parse failed: {exc}") from exc
        if not isinstance(data, dict):
            raise ValueError(f"{path.name}: frontmatter must be a dict")
        body = text[m.end() :].lstrip()
        return data, body

    def _read_base(self) -> dict[str, Any]:
        """Read _base.md raw frontmatter (empty dict if not found)."""
        candidates: list[Path] = []
        if self.project_dir:
            candidates.append(
                self.project_dir / ".claude" / "harness" / "profiles" / "_base.md"
            )
        candidates.append(self.harness_dir / "profiles" / "_base.md")
        for p in candidates:
            if p.exists():
                data, _ = self._parse_file(p)
                return data
        return {}

    def _apply_inheritance(self, data: dict[str, Any]) -> dict[str, Any]:
        """Merge along the extends chain. _base is always the lowest ancestor."""
        chain: list[dict[str, Any]] = [data]
        seen: set[str] = {data.get("id", "")}
        cur = data
        while True:
            parent_id = cur.get("extends")
            if not parent_id or parent_id == "_base":
                break
            if parent_id in seen:
                raise CyclicInheritanceError(
                    f"cyclic inheritance: {' -> '.join([*seen, parent_id])}"
                )
            seen.add(parent_id)
            try:
                parent_path = self._resolve_profile_path(parent_id)
            except ProfileNotFoundError:
                # Parent not found — break to _base
                break
            parent_data, _ = self._parse_file(parent_path)
            chain.append(parent_data)
            cur = parent_data

        base = self._read_base()
        if base:
            chain.append(base)

        # Merge from base upward — child overrides parent
        merged: dict[str, Any] = {}
        for layer in reversed(chain):
            merged = _merge_layer(merged, layer)
        return merged

    def _dict_to_profile(self, data: dict[str, Any], body: str) -> Profile:
        sec = data.get("skeleton_sections") or {}
        wl = data.get("whitelist") or {}
        tc = data.get("toolchain") or {}
        comps = data.get("components") or []

        return Profile(
            id=data["id"],
            name=data.get("name", data["id"]),
            status=data.get("status", "confirmed"),
            version=int(data.get("version", 1)),
            extends=data.get("extends"),
            paths=tuple(data.get("paths") or []),
            detect=data.get("detect") or {},
            components=tuple(
                Component(
                    id=c["id"],
                    required=bool(c.get("required", False)),
                    skeleton_section=c.get("skeleton_section", ""),
                    description=c.get("description", ""),
                )
                for c in comps
                if isinstance(c, dict) and "id" in c
            ),
            skeleton_sections=SkeletonSections(
                required=tuple(sec.get("required") or []),
                optional=tuple(sec.get("optional") or []),
                order=tuple(sec.get("order") or []),
            ),
            toolchain=Toolchain(
                install=tc.get("install"),
                test=tc.get("test"),
                lint=tc.get("lint"),
                type=tc.get("type"),
                format=tc.get("format"),
            ),
            whitelist=Whitelist(
                runtime=tuple(wl.get("runtime") or []),
                dev=tuple(wl.get("dev") or []),
                prefix_allowed=tuple(wl.get("prefix_allowed") or []),
            ),
            file_structure=data.get("file_structure", ""),
            gstack_mode=data.get("gstack_mode", "manual"),
            gstack_recommended=data.get("gstack_recommended") or {},
            lessons_applied=tuple(data.get("lessons_applied") or []),
            body=body,
            raw=data,
        )


# Module-level helpers


def _matches_detect(base: Path, detect: dict[str, Any]) -> bool:
    """Evaluate a single detect block — files / contains / contains_any / not_contains."""
    if "files" in detect:
        for f in detect["files"] or []:
            if not (base / f).exists():
                return False

    for op in ("contains", "contains_any", "not_contains"):
        if op not in detect:
            continue
        for fname, subs in (detect[op] or {}).items():
            fp = base / fname
            if not fp.exists():
                return False
            try:
                text = fp.read_text(encoding="utf-8", errors="replace")
            except OSError:
                return False
            if op == "contains":
                if not all(s in text for s in subs):
                    return False
            elif op == "contains_any":
                if not any(s in text for s in subs):
                    return False
            elif op == "not_contains" and any(s in text for s in subs):
                return False
    return True


def _merge_layer(base: dict[str, Any], child: dict[str, Any]) -> dict[str, Any]:
    """Child overrides base. Merge rules per design doc S3.4."""
    merged = dict(base)
    for key, value in child.items():
        if (
            key == "whitelist"
            and isinstance(value, dict)
            and isinstance(merged.get(key), dict)
        ):
            merged[key] = _merge_whitelist(merged[key], value)
        elif key == "components" and isinstance(value, list):
            base_comps = merged.get(key) or []
            child_ids = {c.get("id") for c in value if isinstance(c, dict)}
            kept = [c for c in base_comps if c.get("id") not in child_ids]
            merged[key] = [*kept, *value]
        elif (
            key == "skeleton_sections"
            and isinstance(value, dict)
            and isinstance(merged.get(key), dict)
        ):
            merged[key] = _merge_skeleton_sections(merged[key], value)
        else:
            merged[key] = value
    return merged


def _merge_whitelist(base: dict[str, Any], child: dict[str, Any]) -> dict[str, Any]:
    """Whitelist lists are unioned (base order first, child appended)."""
    out: dict[str, Any] = dict(base)
    for sub in ("runtime", "dev", "prefix_allowed"):
        seen: set[str] = set()
        combined: list[str] = []
        for item in [*(base.get(sub) or []), *(child.get(sub) or [])]:
            if item not in seen:
                seen.add(item)
                combined.append(item)
        out[sub] = combined
    return out


def _merge_skeleton_sections(
    base: dict[str, Any],
    child: dict[str, Any],
) -> dict[str, Any]:
    """skeleton_sections: required/optional are unioned, order is child-first."""
    out: dict[str, Any] = {}
    for sub in ("required", "optional"):
        seen: set[str] = set()
        combined: list[str] = []
        for item in [*(base.get(sub) or []), *(child.get(sub) or [])]:
            if item not in seen:
                seen.add(item)
                combined.append(item)
        out[sub] = combined
    out["order"] = child.get("order") or base.get("order") or []
    return out

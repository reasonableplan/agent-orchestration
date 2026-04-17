"""Profile loader — _registry.yaml 파싱, 로컬/글로벌 해석, 상속 병합, 프로젝트 감지.

설계 문서 §3 (프로파일 시스템 명세) + §11 (마이그레이션 계획) 참조.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

DEFAULT_HARNESS_DIR = Path.home() / ".claude" / "harness"

_FRONTMATTER_RE = re.compile(r"^---\r?\n(.*?)\r?\n---", re.DOTALL)


# ── 데이터 모델 ──────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Toolchain:
    """프로파일의 검증 도구 명령. None은 해당 도구 없음을 의미."""

    install: str | None
    test: str | None
    lint: str | None
    type: str | None
    format: str | None


@dataclass(frozen=True)
class Whitelist:
    """프로파일이 허용하는 의존성 목록."""

    runtime: tuple[str, ...]
    dev: tuple[str, ...]
    prefix_allowed: tuple[str, ...]


@dataclass(frozen=True)
class Component:
    """프로파일의 컴포넌트 타입 (예: persistence, interface.cli)."""

    id: str
    required: bool
    skeleton_section: str
    description: str = ""


@dataclass(frozen=True)
class SkeletonSections:
    """프로파일이 사용하는 skeleton 섹션 ID 목록."""

    required: tuple[str, ...]
    optional: tuple[str, ...]
    order: tuple[str, ...]


@dataclass(frozen=True)
class Profile:
    """파싱 + 상속 병합 완료된 프로파일."""

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
    body: str  # frontmatter 제외 Markdown 본문
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProfileMatch:
    """detection 결과 — 프로파일 + 프로젝트 root 기준 상대 경로."""

    profile: Profile
    path: str


class ProfileNotFoundError(LookupError):
    """프로파일 파일을 글로벌·로컬 어느 곳에서도 찾을 수 없음."""


class CyclicInheritanceError(ValueError):
    """extends 체인에서 순환 상속 탐지."""


# ── 로더 ────────────────────────────────────────────────────────────────


class ProfileLoader:
    """프로파일 로더.

    - 로컬 override(`{project}/.claude/harness/profiles/<id>.md`) 우선,
      없으면 글로벌(`~/.claude/harness/profiles/<id>.md`) 사용.
    - extends 체인을 따라 병합 (`_base` 항상 최하위).
    - load() 는 캐시. detect() 는 매번 파일 시스템 스캔.
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
        """프로파일 로드 — 로컬 override + 상속 병합 후 반환.

        Raises:
            ProfileNotFoundError: 글로벌·로컬 어느 곳에도 없음
            CyclicInheritanceError: extends 체인 순환
            ValueError: frontmatter 파싱 실패
        """
        if profile_id == "_base":
            raise ValueError(
                "_base 는 직접 로드할 수 없음 (다른 프로파일이 extends하는 용도)"
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
        """프로젝트 루트에서 매칭되는 프로파일 모두 반환 (모노레포 지원).

        각 rule 마다 첫 매칭 경로만 사용. 여러 rule이 같은 경로에 매칭 가능.
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
        """_registry.yaml 로드."""
        path = self.harness_dir / "profiles" / "_registry.yaml"
        if not path.exists():
            raise FileNotFoundError(f"_registry.yaml 없음: {path}")
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    # ── 내부 ────────────────────────────────────────────────────────────

    def _resolve_profile_path(self, profile_id: str) -> Path:
        """로컬 override 우선, 없으면 글로벌."""
        if self.project_dir:
            local = (
                self.project_dir / ".claude" / "harness" / "profiles" / f"{profile_id}.md"
            )
            if local.exists():
                return local
        global_path = self.harness_dir / "profiles" / f"{profile_id}.md"
        if global_path.exists():
            return global_path
        raise ProfileNotFoundError(f"프로파일 '{profile_id}' 파일을 찾을 수 없음")

    def _parse_file(self, path: Path) -> tuple[dict[str, Any], str]:
        """파일에서 frontmatter dict + body 텍스트 분리."""
        text = path.read_text(encoding="utf-8")
        m = _FRONTMATTER_RE.match(text)
        if not m:
            raise ValueError(f"{path.name}: YAML frontmatter 없음")
        try:
            data = yaml.safe_load(m.group(1))
        except yaml.YAMLError as exc:
            raise ValueError(f"{path.name}: YAML 파싱 실패: {exc}") from exc
        if not isinstance(data, dict):
            raise ValueError(f"{path.name}: frontmatter 는 dict 여야 함")
        body = text[m.end() :].lstrip()
        return data, body

    def _read_base(self) -> dict[str, Any]:
        """_base.md raw frontmatter (없으면 빈 dict)."""
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
        """extends 체인 따라 병합. _base 항상 최하위."""
        chain: list[dict[str, Any]] = [data]
        seen: set[str] = {data.get("id", "")}
        cur = data
        while True:
            parent_id = cur.get("extends")
            if not parent_id or parent_id == "_base":
                break
            if parent_id in seen:
                raise CyclicInheritanceError(
                    f"순환 상속: {' -> '.join([*seen, parent_id])}"
                )
            seen.add(parent_id)
            try:
                parent_path = self._resolve_profile_path(parent_id)
            except ProfileNotFoundError:
                # 부모 없으면 즉시 끊고 _base 로
                break
            parent_data, _ = self._parse_file(parent_path)
            chain.append(parent_data)
            cur = parent_data

        base = self._read_base()
        if base:
            chain.append(base)

        # base 부터 거꾸로 병합 — 자식이 override
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


# ── 모듈 레벨 헬퍼 ────────────────────────────────────────────────────


def _matches_detect(base: Path, detect: dict[str, Any]) -> bool:
    """단일 detect 블록 평가 — files / contains / contains_any / not_contains."""
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
    """자식이 base를 override. 병합 규칙은 design doc §3.4."""
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
    """whitelist 리스트는 합집합 (base 순서 우선, 자식 추가만)."""
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
    """skeleton_sections: required/optional 합집합, order 는 자식 우선."""
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

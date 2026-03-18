"""코드 파일을 검색 가능한 청크로 분할한다."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

# 인덱싱 대상 확장자
_CODE_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx",
    ".html", ".css", ".json", ".yaml", ".yml",
    ".md", ".toml", ".sql",
}

# 무시할 디렉토리
_IGNORE_DIRS = {
    "__pycache__", "node_modules", ".git", ".venv", "venv",
    "dist", "build", ".next", ".cache", "coverage",
}

# 민감 파일 — 인덱싱 차단
_SENSITIVE_FILENAMES = {
    ".env", ".env.local", ".env.production", ".env.staging",
    "credentials.json", "serviceAccountKey.json",
    "id_rsa", "id_ed25519", ".npmrc", ".pypirc",
}

_SENSITIVE_PATTERNS = frozenset({
    "secret", "credential", "password", "private_key", "token",
})

_SENSITIVE_EXTENSIONS = {".pem", ".key", ".p12", ".pfx", ".jks", ".keystore"}


def _is_sensitive(file_path: Path) -> bool:
    """민감 파일 여부를 판단한다."""
    name_lower = file_path.name.lower()
    if name_lower in _SENSITIVE_FILENAMES:
        return True
    if file_path.suffix.lower() in _SENSITIVE_EXTENSIONS:
        return True
    return any(pat in name_lower for pat in _SENSITIVE_PATTERNS)

# 청크 최대 크기 (토큰 근사: 1토큰 ≈ 4자)
_MAX_CHUNK_CHARS = 2000
_OVERLAP_CHARS = 200


@dataclass
class CodeChunk:
    """검색 단위 코드 조각."""
    file_path: str
    start_line: int
    end_line: int
    content: str
    language: str
    context: str = ""  # 파일 경로 + 함수/클래스 이름 등 메타정보
    metadata: dict = field(default_factory=dict)


def chunk_file(file_path: Path, work_dir: Path) -> list[CodeChunk]:
    """단일 파일을 청크 리스트로 분할한다."""
    try:
        text = file_path.read_text(encoding="utf-8", errors="replace")
    except (OSError, UnicodeDecodeError):
        return []

    if not text.strip():
        return []

    rel_path = str(file_path.relative_to(work_dir)).replace("\\", "/")
    lang = _detect_language(file_path.suffix)

    if lang == "python":
        chunks = _chunk_python(text, rel_path, lang)
    else:
        chunks = _chunk_by_lines(text, rel_path, lang)

    return chunks


def scan_workspace(work_dir: Path) -> list[CodeChunk]:
    """워크스페이스 전체를 스캔하여 청크 리스트를 반환한다."""
    all_chunks: list[CodeChunk] = []
    work_dir = work_dir.resolve()

    for file_path in work_dir.rglob("*"):
        if not file_path.is_file():
            continue
        if file_path.suffix not in _CODE_EXTENSIONS:
            continue
        if any(d in file_path.parts for d in _IGNORE_DIRS):
            continue
        if _is_sensitive(file_path):
            continue

        all_chunks.extend(chunk_file(file_path, work_dir))

    return all_chunks


def _chunk_python(text: str, rel_path: str, lang: str) -> list[CodeChunk]:
    """Python 파일을 함수/클래스 단위로 분할한다."""
    lines = text.split("\n")
    chunks: list[CodeChunk] = []

    # 함수/클래스 시작 위치 탐지
    boundaries: list[tuple[int, str]] = []
    for i, line in enumerate(lines):
        match = re.match(r"^(class |def |async def )(\w+)", line)
        if match:
            boundaries.append((i, f"{match.group(1).strip()} {match.group(2)}"))

    if not boundaries:
        return _chunk_by_lines(text, rel_path, lang)

    # 파일 상단 (imports 등)
    if boundaries[0][0] > 0:
        header = "\n".join(lines[: boundaries[0][0]])
        if header.strip():
            chunks.append(CodeChunk(
                file_path=rel_path,
                start_line=1,
                end_line=boundaries[0][0],
                content=header,
                language=lang,
                context=f"{rel_path} — imports/module-level",
            ))

    # 각 함수/클래스를 청크로
    for idx, (start, name) in enumerate(boundaries):
        end = boundaries[idx + 1][0] if idx + 1 < len(boundaries) else len(lines)
        content = "\n".join(lines[start:end])

        # 너무 크면 라인 기반으로 재분할
        if len(content) > _MAX_CHUNK_CHARS:
            sub_chunks = _chunk_by_lines(content, rel_path, lang, offset=start)
            for sc in sub_chunks:
                sc.context = f"{rel_path} — {name}"
            chunks.extend(sub_chunks)
        else:
            chunks.append(CodeChunk(
                file_path=rel_path,
                start_line=start + 1,
                end_line=end,
                content=content,
                language=lang,
                context=f"{rel_path} — {name}",
            ))

    return chunks


def _chunk_by_lines(
    text: str, rel_path: str, lang: str, offset: int = 0,
) -> list[CodeChunk]:
    """고정 크기 라인 기반 분할 (오버랩 포함)."""
    chunks: list[CodeChunk] = []
    lines = text.split("\n")
    current: list[str] = []
    current_start = 0
    char_count = 0

    for i, line in enumerate(lines):
        current.append(line)
        char_count += len(line) + 1

        if char_count >= _MAX_CHUNK_CHARS:
            chunks.append(CodeChunk(
                file_path=rel_path,
                start_line=offset + current_start + 1,
                end_line=offset + i + 1,
                content="\n".join(current),
                language=lang,
                context=f"{rel_path}:{offset + current_start + 1}-{offset + i + 1}",
            ))
            # 오버랩: 마지막 몇 줄 유지
            overlap_chars = 0
            overlap_start = len(current)
            for j in range(len(current) - 1, -1, -1):
                overlap_chars += len(current[j]) + 1
                if overlap_chars >= _OVERLAP_CHARS:
                    overlap_start = j
                    break
            current = current[overlap_start:]
            current_start = i - len(current) + 1
            char_count = sum(len(l) + 1 for l in current)

    if current and any(l.strip() for l in current):
        chunks.append(CodeChunk(
            file_path=rel_path,
            start_line=offset + current_start + 1,
            end_line=offset + len(lines),
            content="\n".join(current),
            language=lang,
            context=f"{rel_path}:{offset + current_start + 1}-{offset + len(lines)}",
        ))

    return chunks


def _detect_language(suffix: str) -> str:
    return {
        ".py": "python",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".js": "javascript",
        ".jsx": "javascript",
        ".html": "html",
        ".css": "css",
        ".json": "json",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".md": "markdown",
        ".toml": "toml",
        ".sql": "sql",
    }.get(suffix, "text")

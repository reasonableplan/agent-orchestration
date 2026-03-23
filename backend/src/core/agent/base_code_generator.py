"""LLM으로 파일을 생성하는 에이전트의 공통 기반 클래스."""
from __future__ import annotations

import asyncio
import hashlib
import uuid
import xml.sax.saxutils as saxutils
from pathlib import Path
from typing import Any

from src.core.agent.base_agent import BaseAgent
from src.core.errors import SandboxEscapeError
from src.core.messaging.message_bus import MessageBus
from src.core.state.state_store import StateStore
from src.core.types import AgentConfig, Task, TaskResult

MAX_TOKENS = 64_000
TOKEN_BUDGET = 100_000_000
_MAX_CONTEXT_CHARS = 40_000  # 워크스페이스 컨텍스트 최대 길이
_MAX_FILE_CHARS = 6_000      # 개별 파일 최대 읽기 길이

# 에이전트 도메인별 관심 파일 패턴
_DOMAIN_FILE_PATTERNS: dict[str, list[str]] = {
    "backend": [
        "**/*.py", "**/requirements.txt", "**/pyproject.toml",
        "**/alembic.ini", "**/docker-compose.yml",
    ],
    "frontend": [
        "**/*.ts", "**/*.tsx", "**/package.json", "**/tsconfig.json",
        "**/*.css", "**/vite.config.*",
    ],
    "git": [
        "**/docker-compose.yml", "**/Dockerfile", "**/.gitignore",
        "**/Makefile", "**/*.sh", "**/*.yml", "**/*.yaml",
    ],
    "docs": [
        "**/*.md", "**/*.py", "**/*.ts",  # 문서 작성 시 코드 참조
    ],
}

# 모든 에이전트가 참조해야 하는 공유 파일 패턴
_SHARED_PATTERNS = [
    "**/types/**", "**/models/**", "**/schemas/**",
    "**/domain.ts", "**/base.py", "**/config.py",
]

# 통합 핵심 파일 — 반드시 먼저 읽어야 하는 파일 (import 경로, DB 설정, 앱 구조)
_INTEGRATION_FILES = [
    "pyproject.toml", "package.json",
    "**/conftest.py", "**/database.py", "**/db.py",
    "**/app.py", "**/main.py", "**/config.py", "**/settings.py",
    "**/base.py", "**/models.py",
    "**/router.py", "**/routes.py", "**/urls.py",
]


class BaseCodeGeneratorAgent(BaseAgent):
    """LLM으로 파일을 생성하는 에이전트의 공통 로직.

    서브클래스는 _role_description만 설정하면 된다.
    """

    def __init__(
        self,
        config: AgentConfig,
        message_bus: MessageBus,
        state_store: StateStore,
        git_service: Any,
        llm_client: Any,
        work_dir: str = "./workspace",
        temperature: float = 0.2,
        code_search: Any = None,
    ) -> None:
        super().__init__(config, message_bus, state_store, git_service)
        self._llm = llm_client
        self._work_dir = Path(work_dir).resolve()
        self._temperature = temperature
        self._code_search = code_search

    # 서브클래스에서 오버라이드할 role description
    _role_description: str = "You are a code generation assistant."

    def _build_prompt(self, task: Task, context: str = "") -> str:
        """공통 프롬프트 템플릿. 서브클래스는 _role_description만 설정하면 된다."""
        ctx_section = ""
        if context:
            ctx_section = (
                "\n## Existing codebase (follow these patterns and conventions)\n"
                "<existing_code>\n"
                f"{saxutils.escape(context)}\n"
                "</existing_code>\n\n"
                "CRITICAL RULES for integration:\n"
                "- Use EXACTLY the same import paths as existing files. Do NOT guess import paths.\n"
                "- Check the file tree to know what files exist before importing.\n"
                "- Match existing patterns: if conftest.py uses sync, use sync. If async, use async.\n"
                "- New files MUST be importable by existing tests and code without modification.\n"
                "- Follow the existing file structure and naming conventions exactly.\n\n"
            )
        # Director의 이전 리뷰 피드백 (reject 사유)
        feedback_section = ""
        review_note = getattr(task, "review_note", None)
        retry_count = getattr(task, "retry_count", 0)
        if review_note and retry_count and retry_count > 0:
            feedback_section = (
                f"\n## Previous Review Feedback (MUST address these issues)\n"
                f"This task was REJECTED {retry_count} time(s). Director's feedback:\n"
                f"<review_feedback>\n{saxutils.escape(review_note)}\n</review_feedback>\n"
                f"Fix ALL issues mentioned above before resubmitting.\n\n"
            )

        return (
            f"{self._role_description}\n\n"
            "## Rules (STRICT)\n"
            "1. **TDD**: Write tests FIRST, then implementation. Every file must have a corresponding test.\n"
            "2. **Architecture consistency**: Follow the existing codebase patterns exactly.\n"
            "3. **No magic values**: Use constants, config, or environment variables.\n"
            "4. **Type safety**: Full type annotations (Python: type hints, TypeScript: strict mode).\n"
            "5. **Error handling**: Never empty catch. Log errors, provide meaningful messages.\n"
            "6. **File naming**: Follow the existing naming conventions in the codebase.\n"
            "7. **BE CONCISE**: Keep code short and minimal. No docstrings, no comments unless complex logic. "
            "No boilerplate, no verbose error messages. Minimal imports. "
            "Generate FEWER files with LESS code. Quality over quantity. "
            "Empty marker files (py.typed, __init__.py, .gitkeep) MUST be included with empty content.\n\n"
            f"{feedback_section}"
            'Respond with JSON: {"files": [{"path": str, "content": str, "action": str}], "summary": str}\n'
            "Include test files BEFORE implementation files in the array.\n"
            "CRITICAL: Every file MUST be COMPLETE. Never truncate code mid-function or mid-file. "
            "If output would be too long, generate FEWER files but ensure each one is 100% complete and runnable.\n\n"
            f"{ctx_section}"
            f"<task>\nTitle: {saxutils.escape(task.title)}\n"
            f"Description: {saxutils.escape(task.description)}\n</task>"
        )

    async def execute_task(self, task: Task) -> TaskResult:
        try:
            # 1. RAG 검색 시도
            context = await self._search_codebase(task)
            # 2. RAG 실패 시 workspace 직접 스캔
            if not context:
                context = await self._scan_workspace_context(task)
            prompt = self._build_prompt(task, context=context)
            data, input_tokens, output_tokens = await self._llm.chat_json(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=MAX_TOKENS,
                temperature=self._temperature,
                token_budget=TOKEN_BUDGET,
            )
            await self._publish_token_usage(input_tokens, output_tokens)

            files = data.get("files", []) if isinstance(data, dict) else []
            artifact_paths: list[str] = []

            # 잘린 파일 감지 — 괄호/중괄호가 맞지 않으면 불완전한 파일
            truncated_files = []
            for f in files:
                content = f.get("content", "")
                if content and self._is_likely_truncated(content, f.get("path", "")):
                    truncated_files.append(f.get("path", "unknown"))
            if truncated_files:
                self._log.warning(
                    "Truncated files detected — skipping generation",
                    truncated=truncated_files,
                    task_id=task.id,
                )
                return TaskResult(
                    success=False,
                    error={"message": f"LLM output truncated: {', '.join(truncated_files)}. Retry with fewer files."},
                    artifacts=[],
                )

            for f in files:
                path = f.get("path", "")
                content = f.get("content", "")
                if not path or not content:
                    continue
                abs_path = self._safe_resolve(path)
                abs_path.parent.mkdir(parents=True, exist_ok=True)
                await asyncio.to_thread(abs_path.write_text, content, "utf-8")

                await self._state_store.save_artifact({
                    "id": str(uuid.uuid4()),
                    "task_id": task.id,
                    "file_path": str(abs_path),
                    "content_hash": hashlib.sha256(content.encode()).hexdigest(),
                    "created_by": self.id,
                })
                artifact_paths.append(str(abs_path))

            summary = data.get("summary", "") if isinstance(data, dict) else ""
            self._log.info("Files generated", task_id=task.id, files=len(artifact_paths))
            return TaskResult(
                success=True,
                data={"files": artifact_paths, "summary": summary},
                artifacts=artifact_paths,
            )
        except SandboxEscapeError as e:
            self._log.error(
                "SECURITY: sandbox escape attempted",
                task_id=task.id, path=e.path, sandbox=e.sandbox,
            )
            return TaskResult(
                success=False,
                error={"message": "Security violation: path outside workspace"},
                artifacts=[],
            )
        except Exception as e:
            self._log.error("Code generation failed", task_id=task.id, err=str(e))
            return TaskResult(
                success=False,
                error={"message": f"Code generation failed: {type(e).__name__}"},
                artifacts=[],
            )

    async def _search_codebase(self, task: Task) -> str:
        """RAG: 태스크와 관련된 기존 코드를 검색한다."""
        if not self._code_search:
            return ""
        try:
            query = f"{task.title} {task.description or ''}"
            return await self._code_search.search_formatted(query, top_k=5, min_score=0.3)
        except Exception as e:
            self._log.warning("Code search failed, falling back to workspace scan", err=str(e))
            return ""

    async def _scan_workspace_context(self, task: Task) -> str:
        """workspace 디렉토리의 기존 파일을 스캔하여 컨텍스트로 반환한다.

        3단계로 컨텍스트를 구성:
        1. 전체 파일 트리 (구조 파악)
        2. 통합 핵심 파일 (import 경로, DB, 앱 구조 — 반드시 포함)
        3. 도메인별 + 공유 패턴 파일 (남은 예산으로)
        """
        if not self._work_dir.exists():
            return ""

        # ---- Phase 1: 전체 파일 트리 ----
        all_files: list[str] = []
        skip_dirs = {".git", ".venv", "node_modules", "__pycache__", ".pytest_cache"}
        skip_exts = {".pyc", ".pyo", ".png", ".jpg", ".ico", ".woff", ".lock", ".egg-info"}
        for file_path in sorted(self._work_dir.rglob("*")):
            if not file_path.is_file():
                continue
            if any(d in file_path.parts for d in skip_dirs):
                continue
            if file_path.suffix in skip_exts:
                continue
            all_files.append(str(file_path.relative_to(self._work_dir)))

        tree_section = "## Project File Tree\n```\n" + "\n".join(all_files) + "\n```\n"
        total_chars = len(tree_section)

        # ---- Phase 2: 통합 핵심 파일 (반드시 포함) ----
        collected_files: dict[str, str] = {}

        for pattern in _INTEGRATION_FILES:
            for file_path in sorted(self._work_dir.glob(pattern)):
                if not file_path.is_file() or file_path.stat().st_size > 50_000:
                    continue
                rel = str(file_path.relative_to(self._work_dir))
                if rel in collected_files:
                    continue
                if any(d in file_path.parts for d in skip_dirs):
                    continue
                try:
                    content = await asyncio.to_thread(file_path.read_text, "utf-8", "replace")
                    truncated = content[:_MAX_FILE_CHARS]
                    collected_files[rel] = truncated
                    total_chars += len(truncated)
                except Exception:
                    continue

        # ---- Phase 3: 도메인별 + 공유 파일 (남은 예산으로) ----
        patterns = list(_SHARED_PATTERNS)
        domain_patterns = _DOMAIN_FILE_PATTERNS.get(self.domain, [])
        patterns.extend(domain_patterns)

        for pattern in patterns:
            if total_chars >= _MAX_CONTEXT_CHARS:
                break
            for file_path in sorted(self._work_dir.glob(pattern)):
                if not file_path.is_file():
                    continue
                rel = str(file_path.relative_to(self._work_dir))
                if rel in collected_files:
                    continue
                if file_path.suffix in skip_exts:
                    continue
                if any(d in file_path.parts for d in skip_dirs):
                    continue
                if file_path.stat().st_size > 50_000:
                    continue
                try:
                    content = await asyncio.to_thread(file_path.read_text, "utf-8", "replace")
                    truncated = content[:_MAX_FILE_CHARS]
                    if total_chars + len(truncated) > _MAX_CONTEXT_CHARS:
                        break
                    collected_files[rel] = truncated
                    total_chars += len(truncated)
                except Exception:
                    continue

        # ---- 조합 ----
        parts = [tree_section]
        if collected_files:
            parts.append("## Key Files (MUST follow these patterns for imports and structure)")
            for rel_path, content in collected_files.items():
                parts.append(f"### {rel_path}\n```\n{content}\n```")

        self._log.info("Workspace context loaded",
                       files=len(collected_files), chars=total_chars)
        return "\n\n".join(parts)

    @staticmethod
    def _is_likely_truncated(content: str, path: str) -> bool:
        """파일 내용이 잘렸을 가능성이 높은지 휴리스틱으로 판단한다."""
        stripped = content.rstrip()
        if not stripped:
            return False

        # Python 파일: 열린 괄호/중괄호가 닫히지 않은 경우
        if path.endswith(".py"):
            opens = stripped.count("(") + stripped.count("{") + stripped.count("[")
            closes = stripped.count(")") + stripped.count("}") + stripped.count("]")
            if opens - closes >= 3:
                return True

        # TypeScript/JS: 중괄호 불균형
        if path.endswith((".ts", ".tsx", ".js", ".jsx")):
            opens = stripped.count("{") + stripped.count("(")
            closes = stripped.count("}") + stripped.count(")")
            if opens - closes >= 3:
                return True

        # 일반: 코드가 키워드 중간에서 끊긴 경우
        last_line = stripped.split("\n")[-1].rstrip()
        if last_line.endswith((",", ":", "->", "=>", "=")):
            return True

        return False

    def _safe_resolve(self, rel_path: str) -> Path:
        """Sandbox escape 방지: work_dir 밖 경로 차단."""
        resolved = (self._work_dir / rel_path).resolve()
        if not resolved.is_relative_to(self._work_dir):
            raise SandboxEscapeError(rel_path, str(self._work_dir))
        return resolved

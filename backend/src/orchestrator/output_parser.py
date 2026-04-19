"""Agent output parser — extract structured results from raw text."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import StrEnum


class ReviewVerdict(StrEnum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"


class DesignVerdict(StrEnum):
    ACCEPT = "ACCEPT"
    CONFLICT = "CONFLICT"


@dataclass
class DesignNegotiationResult:
    """Result of a Designer design negotiation."""

    verdict: DesignVerdict
    api_requests: list[str] = field(default_factory=list)
    raw: str = ""


@dataclass
class PRReviewResult:
    """Reviewer PR review result."""

    verdict: ReviewVerdict
    violations: list[str] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)
    raw: str = ""


@dataclass
class PhaseReviewResult:
    """Reviewer phase-level review result."""

    phase: int
    verdict: ReviewVerdict
    missing_items: list[str] = field(default_factory=list)
    integration_errors: list[str] = field(default_factory=list)
    flow_results: list[str] = field(default_factory=list)
    can_proceed: bool = False
    raw: str = ""


@dataclass
class TaskItem:
    """A single task item from Orchestrator breakdown."""

    id: str
    agent: str
    depends_on: list[str]
    description: str
    status: str


@dataclass
class SkeletonSection:
    """A filled skeleton section extracted from agent output.

    section_num: heading number from `## N.` (e.g. "6", "17"). Dedup key.
    section_id:  auto-populated when heading title matches SECTION_TITLES (v2).
                 None if no match.
    """

    section_num: str
    content: str
    section_id: str | None = None


# PR review parsing

_VERDICT_PATTERN = re.compile(
    r"##\s+Review\s+Result\s*:\s*(APPROVE|REJECT)",
    re.IGNORECASE,
)
_VIOLATION_BLOCK = re.compile(
    r"###\s+위반\s*사항.*?\n(.*?)(?=###|\Z)",
    re.DOTALL | re.IGNORECASE,
)
_SUGGESTION_BLOCK = re.compile(
    r"###\s+권장\s*사항.*?\n(.*?)(?=###|\Z)",
    re.DOTALL | re.IGNORECASE,
)
_NUMBERED_LINE = re.compile(r"^\s*\d+\.\s+(.+)$", re.MULTILINE)


def parse_pr_review(output: str) -> PRReviewResult | None:
    """Parse Reviewer PR review output.

    Returns:
        PRReviewResult, or None if no review result marker found.
    """
    verdict_match = _VERDICT_PATTERN.search(output)
    if not verdict_match:
        return None

    verdict = ReviewVerdict(verdict_match.group(1).upper())

    violations: list[str] = []
    violation_match = _VIOLATION_BLOCK.search(output)
    if violation_match:
        violations = _NUMBERED_LINE.findall(violation_match.group(1))

    suggestions: list[str] = []
    suggestion_match = _SUGGESTION_BLOCK.search(output)
    if suggestion_match:
        suggestions = _NUMBERED_LINE.findall(suggestion_match.group(1))

    return PRReviewResult(
        verdict=verdict,
        violations=violations,
        suggestions=suggestions,
        raw=output,
    )


# Phase review parsing

_PHASE_VERDICT_PATTERN = re.compile(
    r"##\s+Phase\s+(\d+)\s+Review\s+Result\s*:\s*(APPROVE|REJECT)",
    re.IGNORECASE,
)
_MISSING_BLOCK = re.compile(
    r"###\s+미구현\s*항목.*?\n(.*?)(?=###|\Z)",
    re.DOTALL | re.IGNORECASE,
)
_INTEGRATION_BLOCK = re.compile(
    r"###\s+연동\s*오류.*?\n(.*?)(?=###|\Z)",
    re.DOTALL | re.IGNORECASE,
)
_FLOW_BLOCK = re.compile(
    r"###\s+흐름\s*검증.*?\n(.*?)(?=###|\Z)",
    re.DOTALL | re.IGNORECASE,
)
_PROCEED_PATTERN = re.compile(
    r"다음\s+Phase\s+진행\s+가능\s+여부.*?(불가능|불가|가능)",
    re.DOTALL | re.IGNORECASE,
)
_BULLET_LINE = re.compile(r"^\s*[-*]\s+(.+)$", re.MULTILINE)


def parse_phase_review(output: str) -> PhaseReviewResult | None:
    """Parse Reviewer phase review output.

    Returns:
        PhaseReviewResult, or None if no phase review marker found.
    """
    verdict_match = _PHASE_VERDICT_PATTERN.search(output)
    if not verdict_match:
        return None

    phase = int(verdict_match.group(1))
    verdict = ReviewVerdict(verdict_match.group(2).upper())

    missing_items: list[str] = []
    missing_match = _MISSING_BLOCK.search(output)
    if missing_match:
        missing_items = _BULLET_LINE.findall(missing_match.group(1))

    integration_errors: list[str] = []
    integration_match = _INTEGRATION_BLOCK.search(output)
    if integration_match:
        integration_errors = _BULLET_LINE.findall(integration_match.group(1))

    flow_results: list[str] = []
    flow_match = _FLOW_BLOCK.search(output)
    if flow_match:
        flow_results = _BULLET_LINE.findall(flow_match.group(1))

    can_proceed = False
    proceed_match = _PROCEED_PATTERN.search(output)
    if proceed_match:
        can_proceed = proceed_match.group(1) == "가능"

    return PhaseReviewResult(
        phase=phase,
        verdict=verdict,
        missing_items=missing_items,
        integration_errors=integration_errors,
        flow_results=flow_results,
        can_proceed=can_proceed,
        raw=output,
    )


# Task list parsing

# Markdown table row — | T-001 | backend_coder | T-000 | description | status |
_TASK_TABLE_ROW = re.compile(
    r"^\|\s*([A-Z0-9\-]+)\s*\|\s*(\w+)\s*\|\s*([^|]*?)\s*\|\s*(.+?)\s*\|\s*(\S+)\s*\|",
    re.MULTILINE,
)
_TASK_HEADER_ROW = re.compile(r"^\|\s*ID\s*\|", re.MULTILINE | re.IGNORECASE)
# Phase header — "### Phase 1", "## Phase 2 — extended" etc.
_PHASE_HEADER = re.compile(r"^#{1,4}\s+Phase\s+(\d+)", re.MULTILINE | re.IGNORECASE)
_TASK_SEPARATOR_ROW = re.compile(r"^\|[-| ]+\|", re.MULTILINE)


def parse_task_list(output: str) -> list[TaskItem]:
    """Parse task list from Orchestrator output."""
    tasks: list[TaskItem] = []

    for match in _TASK_TABLE_ROW.finditer(output):
        task_id = match.group(1).strip()
        agent = match.group(2).strip()
        depends_raw = match.group(3).strip()
        description = match.group(4).strip()
        status = match.group(5).strip()

        # Skip header/separator rows
        if task_id.upper() in ("ID", "----", "---"):
            continue
        if re.match(r"^-+$", task_id):
            continue

        depends_on = (
            [d.strip() for d in depends_raw.split(",") if d.strip() and d.strip() != "-"]
            if depends_raw
            else []
        )

        tasks.append(TaskItem(
            id=task_id,
            agent=agent,
            depends_on=depends_on,
            description=description,
            status=status,
        ))

    return tasks


def parse_phases(output: str) -> list[list[TaskItem]]:
    """Parse per-phase task lists from Orchestrator output.

    Reads markdown tables under ``### Phase N`` headings. If no phase
    headings are found, treats the entire output as a single phase.
    """
    headers = list(_PHASE_HEADER.finditer(output))

    if not headers:
        tasks = parse_task_list(output)
        return [tasks] if tasks else []

    phases: list[list[TaskItem]] = []
    for i, header in enumerate(headers):
        start = header.end()
        end = headers[i + 1].start() if i + 1 < len(headers) else len(output)
        tasks = parse_task_list(output[start:end])
        phases.append(tasks)  # include empty phases for phase-number consistency

    return phases


# QA report parsing

_QA_HEALTH_SCORE = re.compile(
    r"###\s+Health\s+Score\s*:\s*(\d+)\s*/\s*10",
    re.IGNORECASE,
)
_QA_ISSUE_BLOCK = re.compile(
    r"###\s+발견된\s*이슈.*?\n(.*?)(?=###|\Z)",
    re.DOTALL | re.IGNORECASE,
)

# QA pass threshold — health score must be >= this value
QA_PASS_THRESHOLD = 7


@dataclass
class QaResult:
    """QA agent report result."""

    health_score: int  # 0-10
    passed: bool       # health_score >= QA_PASS_THRESHOLD
    issues: list[str] = field(default_factory=list)
    raw: str = ""


def parse_qa_report(output: str) -> QaResult | None:
    """Parse QA agent report output.

    Returns:
        QaResult, or None if the Health Score heading is not found.
    """
    score_match = _QA_HEALTH_SCORE.search(output)
    if not score_match:
        return None

    health_score = int(score_match.group(1))

    issues: list[str] = []
    issue_match = _QA_ISSUE_BLOCK.search(output)
    if issue_match:
        issues = _NUMBERED_LINE.findall(issue_match.group(1))

    return QaResult(
        health_score=health_score,
        passed=health_score >= QA_PASS_THRESHOLD,
        issues=issues,
        raw=output,
    )


# Design negotiation parsing

_DESIGN_VERDICT_PATTERN = re.compile(
    r"##\s+Design\s+Verdict\s*:\s*(ACCEPT|CONFLICT)",
    re.IGNORECASE,
)
_DESIGN_API_REQUEST_BLOCK = re.compile(
    r"###\s+API\s+요청사항.*?\n(.*?)(?=###|\Z)",
    re.DOTALL | re.IGNORECASE,
)


def parse_design_verdict(output: str) -> DesignNegotiationResult | None:
    """Parse design negotiation verdict from Designer output.

    Returns:
        DesignNegotiationResult, or None if no Verdict marker (treated as ACCEPT).
    """
    verdict_match = _DESIGN_VERDICT_PATTERN.search(output)
    if not verdict_match:
        return None

    verdict = DesignVerdict(verdict_match.group(1).upper())

    api_requests: list[str] = []
    api_match = _DESIGN_API_REQUEST_BLOCK.search(output)
    if api_match:
        api_requests = _NUMBERED_LINE.findall(api_match.group(1))

    return DesignNegotiationResult(verdict=verdict, api_requests=api_requests, raw=output)


# Skeleton section parsing

_SECTION_HEADING = re.compile(
    r"^#{2,4}\s+(\d+(?:-\d+)?)[.\s]",
    re.MULTILINE,
)
# Extract title from `## N. <Title>` (for id mapping)
_SECTION_HEADING_WITH_TITLE = re.compile(
    r"^#{2,4}\s+\d+(?:-\d+)?\.\s+(.+?)\s*$",
)


def extract_filled_sections(output: str) -> list[SkeletonSection]:
    """Extract skeleton section markdown blocks from agent output.

    Sections with `## N. <Title>` headings are collected. If the title
    matches SECTION_TITLES, section_id is auto-populated (Harness v2).
    """
    # Deferred import to avoid circular dependency
    from src.orchestrator.context import SECTION_TITLES

    title_to_id = {v: k for k, v in SECTION_TITLES.items()}

    sections: list[SkeletonSection] = []
    lines = output.split("\n")
    i = 0

    while i < len(lines):
        heading_match = _SECTION_HEADING.match(lines[i])
        if heading_match:
            section_num = heading_match.group(1)
            heading_m = re.match(r"^(#+)", lines[i])
            if heading_m is None:
                i += 1
                continue
            heading_level = len(heading_m.group(1))

            # Infer section_id from title
            title_match = _SECTION_HEADING_WITH_TITLE.match(lines[i].rstrip())
            section_id: str | None = None
            if title_match:
                section_id = title_to_id.get(title_match.group(1).strip())

            start = i
            i += 1

            # Collect until next heading at same level or higher
            while i < len(lines):
                next_heading = re.match(r"^(#+)\s+\d", lines[i])
                if next_heading and len(next_heading.group(1)) <= heading_level:
                    break
                i += 1

            content = "\n".join(lines[start:i]).strip()
            if content:
                sections.append(SkeletonSection(
                    section_num=section_num,
                    content=content,
                    section_id=section_id,
                ))
        else:
            i += 1

    return sections


def extract_filled_sections_by_id(output: str) -> dict[str, str]:
    """Extract sections by ID from agent output (Harness v2).

    Only includes headings matching SECTION_TITLES. Unmatched sections are ignored.
    """
    return {
        s.section_id: s.content
        for s in extract_filled_sections(output)
        if s.section_id is not None
    }

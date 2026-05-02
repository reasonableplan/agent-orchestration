"""6축 표현식 파서 + 평가기.

skeleton fragment 의 `required_when` (또는 profile 의 `scale_matrix`) 에 적힌
표현식을 ScaleAxes 인스턴스 + has_keys + scale_tokens 컨텍스트로 평가한다.

지원 syntax (BNF):

    expression := or_expr
    or_expr    := and_expr ('or' and_expr)*
    and_expr   := primary ('and' primary)*
    primary    := '(' expression ')' | atom_or_compare
    atom_or_compare := IDENT [ '==' IDENT | 'in' '[' IDENT (',' IDENT)* ']' ]

지원 atom: `always`, `has.<key>`, `scale.<token>`.
6축 이름 (ScaleAxes 의 필드) 은 == 또는 in 비교가 반드시 필요 — 단독 사용 시 ParseError.

값 위치에 축 이름이 와도 (예: `lifecycle == lifecycle`) 파서는 통과 — 단순 문자열
비교라 무의미하지만 무해. 의도적 허용 (값 위치 토큰의 화이트리스트는 ScaleAxes 의
허용 값 검증에 위임).

Phase 2-b-1 범위: 본 모듈만. ProfileLoader 통합은 2-b-3.
"""

from __future__ import annotations

import dataclasses
import re
from dataclasses import dataclass

from src.orchestrator.plan_manager import ScaleAxes

# Allowed 6-axis names — ScaleAxes 의 필드에서 동적 추출
_AXIS_NAMES: frozenset[str] = frozenset(f.name for f in dataclasses.fields(ScaleAxes))


# ── Errors ───────────────────────────────────────────────────────────


class ExpressionParseError(ValueError):
    """표현식 파싱 또는 평가 실패."""


# ── AST ──────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Atom:
    """always / has.<key> / scale.<token>."""

    token: str


@dataclass(frozen=True)
class Compare:
    """axis == value."""

    axis: str
    value: str


@dataclass(frozen=True)
class Membership:
    """axis in [v1, v2, ...]."""

    axis: str
    values: tuple[str, ...]


@dataclass(frozen=True)
class And:
    left: Node
    right: Node


@dataclass(frozen=True)
class Or:
    left: Node
    right: Node


Node = Atom | Compare | Membership | And | Or


# ── Eval context ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class EvalContext:
    """평가 컨텍스트.

    - axes: 사용자가 /ha-init 에서 답한 6축
    - has_keys: 프로파일 components 등에서 추출된 has.* 키 (예: {'storage', 'http_server'})
    - scale_tokens: 기존 scale.* vocab (예: {'medium_or_larger'})
    """

    axes: ScaleAxes
    has_keys: frozenset[str] = frozenset()
    scale_tokens: frozenset[str] = frozenset()


# ── Tokenizer ────────────────────────────────────────────────────────


@dataclass(frozen=True)
class _Token:
    kind: str
    value: str


_RESERVED = frozenset({"and", "or", "in"})

_TOKEN_RE = re.compile(
    r"""
    \s+                                                       # whitespace (skip)
  | (?P<EQ>==)
  | (?P<LPAREN>\()
  | (?P<RPAREN>\))
  | (?P<LBRACKET>\[)
  | (?P<RBRACKET>\])
  | (?P<COMMA>,)
  | (?P<IDENT>[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)
    """,
    re.VERBOSE,
)


def _tokenize(text: str) -> list[_Token]:
    tokens: list[_Token] = []
    pos = 0
    while pos < len(text):
        m = _TOKEN_RE.match(text, pos)
        if m is None:
            raise ExpressionParseError(f"unexpected character at position {pos}: {text[pos]!r}")
        if m.lastgroup is None:
            # whitespace branch — skip
            pos = m.end()
            continue
        tokens.append(_Token(kind=m.lastgroup, value=m.group()))
        pos = m.end()
    return tokens


# ── Parser ───────────────────────────────────────────────────────────


class _Parser:
    def __init__(self, tokens: list[_Token]) -> None:
        self.tokens = tokens
        self.pos = 0

    def _peek(self) -> _Token | None:
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def _consume(self, kind: str | None = None) -> _Token:
        tok = self._peek()
        if tok is None:
            raise ExpressionParseError("unexpected end of expression")
        if kind is not None and tok.kind != kind:
            raise ExpressionParseError(f"expected {kind}, got {tok.kind} ({tok.value!r})")
        self.pos += 1
        return tok

    def _is_keyword(self, tok: _Token | None, word: str) -> bool:
        return tok is not None and tok.kind == "IDENT" and tok.value == word

    def parse(self) -> Node:
        node = self._parse_or()
        if self._peek() is not None:
            raise ExpressionParseError(
                f"unexpected trailing token: {self._peek().value!r}"  # type: ignore[union-attr]
            )
        return node

    def _parse_or(self) -> Node:
        left = self._parse_and()
        while self._is_keyword(self._peek(), "or"):
            self._consume("IDENT")
            right = self._parse_and()
            left = Or(left, right)
        return left

    def _parse_and(self) -> Node:
        left = self._parse_primary()
        while self._is_keyword(self._peek(), "and"):
            self._consume("IDENT")
            right = self._parse_primary()
            left = And(left, right)
        return left

    def _parse_primary(self) -> Node:
        tok = self._peek()
        if tok is None:
            raise ExpressionParseError("expected expression, got end")
        if tok.kind == "LPAREN":
            self._consume("LPAREN")
            inner = self._parse_or()
            self._consume("RPAREN")
            return inner
        if tok.kind != "IDENT":
            raise ExpressionParseError(f"unexpected token: {tok.value!r}")
        if tok.value in _RESERVED:
            raise ExpressionParseError(f"reserved keyword used as identifier: {tok.value!r}")
        return self._parse_atom_or_compare()

    def _parse_atom_or_compare(self) -> Node:
        ident = self._consume("IDENT")
        nxt = self._peek()

        # comparison: == VALUE
        if nxt is not None and nxt.kind == "EQ":
            self._consume("EQ")
            value = self._consume("IDENT")
            if value.value in _RESERVED:
                raise ExpressionParseError(f"reserved keyword cannot be a value: {value.value!r}")
            self._require_axis(ident.value)
            return Compare(axis=ident.value, value=value.value)

        # membership: in [V, ...]
        if self._is_keyword(nxt, "in"):
            self._consume("IDENT")  # 'in'
            self._consume("LBRACKET")
            values: list[str] = []
            first = self._consume("IDENT")
            if first.value in _RESERVED:
                raise ExpressionParseError(
                    f"reserved keyword cannot be a list value: {first.value!r}"
                )
            values.append(first.value)
            while True:
                cur = self._peek()
                if cur is None:
                    raise ExpressionParseError("unclosed list, expected ',' or ']'")
                if cur.kind == "RBRACKET":
                    break
                self._consume("COMMA")
                v = self._consume("IDENT")
                if v.value in _RESERVED:
                    raise ExpressionParseError(
                        f"reserved keyword cannot be a list value: {v.value!r}"
                    )
                values.append(v.value)
            self._consume("RBRACKET")
            self._require_axis(ident.value)
            return Membership(axis=ident.value, values=tuple(values))

        # bare atom — must be `always` / `has.X` / `scale.X`
        return self._make_atom(ident.value)

    def _require_axis(self, name: str) -> None:
        if name not in _AXIS_NAMES:
            raise ExpressionParseError(f"unknown axis: {name!r} (allowed: {sorted(_AXIS_NAMES)})")

    def _make_atom(self, name: str) -> Atom:
        if name == "always":
            return Atom(token="always")
        if name.startswith("has.") or name.startswith("scale."):
            # 빈 suffix 방어 — 'has.' 만으로 끝나는 경우는 토크나이저가 거름 (dot 다음 word 필수)
            return Atom(token=name)
        if name in _AXIS_NAMES:
            raise ExpressionParseError(f"axis {name!r} requires '==' or 'in' comparison")
        raise ExpressionParseError(
            f"unknown atom: {name!r} (allowed atoms: 'always', 'has.<key>', 'scale.<token>')"
        )


# ── Evaluator ────────────────────────────────────────────────────────


def _evaluate(node: Node, ctx: EvalContext) -> bool:
    if isinstance(node, Atom):
        token = node.token
        if token == "always":
            return True
        if token.startswith("has."):
            return token[len("has.") :] in ctx.has_keys
        if token.startswith("scale."):
            return token[len("scale.") :] in ctx.scale_tokens
        # 도달 불가 — parser 가 이미 거름. 방어적 분기.
        raise ExpressionParseError(f"unknown atom at eval time: {token!r}")
    if isinstance(node, Compare):
        return getattr(ctx.axes, node.axis) == node.value
    if isinstance(node, Membership):
        return getattr(ctx.axes, node.axis) in node.values
    if isinstance(node, And):
        return _evaluate(node.left, ctx) and _evaluate(node.right, ctx)
    if isinstance(node, Or):
        return _evaluate(node.left, ctx) or _evaluate(node.right, ctx)
    raise ExpressionParseError(f"unknown node type at eval time: {type(node).__name__}")


# ── Public API ───────────────────────────────────────────────────────


def evaluate(expression: str, ctx: EvalContext) -> bool:
    """표현식을 파싱하고 ctx 로 평가해 bool 반환.

    Raises:
        ExpressionParseError: 파싱 또는 평가 실패.
    """
    if not expression or not expression.strip():
        raise ExpressionParseError("empty expression")
    tokens = _tokenize(expression)
    if not tokens:
        raise ExpressionParseError("empty expression (no tokens)")
    parser = _Parser(tokens)
    node = parser.parse()
    return _evaluate(node, ctx)


def parse(expression: str) -> Node:
    """표현식만 파싱 — eval 없이 AST 반환 (validation / introspection 용)."""
    if not expression or not expression.strip():
        raise ExpressionParseError("empty expression")
    tokens = _tokenize(expression)
    if not tokens:
        raise ExpressionParseError("empty expression (no tokens)")
    return _Parser(tokens).parse()

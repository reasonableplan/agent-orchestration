"""scale_expression 단위 테스트.

표현식 파서 + 평가기. 외부 의존 없음 (ScaleAxes 만 import).
"""

from __future__ import annotations

import pytest

from src.orchestrator.plan_manager import ScaleAxes
from src.orchestrator.scale_expression import (
    EvalContext,
    ExpressionParseError,
    evaluate,
)


def _ctx(
    *,
    axes: ScaleAxes | None = None,
    has_keys: frozenset[str] | None = None,
    scale_tokens: frozenset[str] | None = None,
) -> EvalContext:
    return EvalContext(
        axes=axes or ScaleAxes(),
        has_keys=has_keys or frozenset(),
        scale_tokens=scale_tokens or frozenset(),
    )


# ── atom ─────────────────────────────────────────────────────────────


def test_always_returns_true() -> None:
    assert evaluate("always", _ctx()) is True


def test_has_token_present() -> None:
    assert evaluate("has.storage", _ctx(has_keys=frozenset({"storage"}))) is True


def test_has_token_absent() -> None:
    assert evaluate("has.storage", _ctx(has_keys=frozenset())) is False


def test_scale_token_present() -> None:
    assert (
        evaluate(
            "scale.medium_or_larger",
            _ctx(scale_tokens=frozenset({"medium_or_larger"})),
        )
        is True
    )


def test_scale_token_absent() -> None:
    assert evaluate("scale.medium_or_larger", _ctx(scale_tokens=frozenset())) is False


# ── comparison ───────────────────────────────────────────────────────


def test_eq_axis_match() -> None:
    axes = ScaleAxes(data_sensitivity="pii")
    assert evaluate("data_sensitivity == pii", _ctx(axes=axes)) is True


def test_eq_axis_mismatch() -> None:
    axes = ScaleAxes(data_sensitivity="none")
    assert evaluate("data_sensitivity == pii", _ctx(axes=axes)) is False


def test_in_membership_hit() -> None:
    axes = ScaleAxes(data_sensitivity="pii")
    assert evaluate("data_sensitivity in [pii, payment]", _ctx(axes=axes)) is True


def test_in_membership_miss() -> None:
    axes = ScaleAxes(data_sensitivity="none")
    assert evaluate("data_sensitivity in [pii, payment]", _ctx(axes=axes)) is False


def test_in_membership_single_element() -> None:
    axes = ScaleAxes(lifecycle="ga")
    assert evaluate("lifecycle in [ga]", _ctx(axes=axes)) is True


# ── boolean combinators ──────────────────────────────────────────────


def test_or_short_circuit_left_true() -> None:
    axes = ScaleAxes(data_sensitivity="pii", availability="casual")
    assert (
        evaluate(
            "data_sensitivity == pii or availability == high",
            _ctx(axes=axes),
        )
        is True
    )


def test_or_both_false() -> None:
    axes = ScaleAxes(data_sensitivity="none", availability="casual")
    assert (
        evaluate(
            "data_sensitivity == pii or availability == high",
            _ctx(axes=axes),
        )
        is False
    )


def test_and_both_true() -> None:
    axes = ScaleAxes(data_sensitivity="pii", availability="high")
    assert (
        evaluate(
            "data_sensitivity == pii and availability == high",
            _ctx(axes=axes),
        )
        is True
    )


def test_and_one_false() -> None:
    axes = ScaleAxes(data_sensitivity="pii", availability="standard")
    assert (
        evaluate(
            "data_sensitivity == pii and availability == high",
            _ctx(axes=axes),
        )
        is False
    )


def test_precedence_and_binds_tighter_than_or() -> None:
    """`a or b and c` == `a or (b and c)`. Python precedence."""
    axes = ScaleAxes(
        data_sensitivity="pii",  # a true
        availability="casual",  # b false
        lifecycle="ga",  # c true
    )
    # a OR (b AND c) — a=true → 전체 True
    assert (
        evaluate(
            "data_sensitivity == pii or availability == high and lifecycle == ga",
            _ctx(axes=axes),
        )
        is True
    )


def test_parens_override_precedence() -> None:
    """(a or b) and c"""
    axes = ScaleAxes(
        data_sensitivity="pii",  # a true
        availability="casual",  # b false
        lifecycle="poc",  # c false
    )
    # (a OR b) AND c — c=false → 전체 False
    assert (
        evaluate(
            "(data_sensitivity == pii or availability == high) and lifecycle == ga",
            _ctx(axes=axes),
        )
        is False
    )


def test_combined_atom_and_comparison() -> None:
    """`has.storage and data_sensitivity in [pii, payment]`"""
    axes = ScaleAxes(data_sensitivity="pii")
    ctx = _ctx(axes=axes, has_keys=frozenset({"storage"}))
    assert evaluate("has.storage and data_sensitivity in [pii, payment]", ctx) is True


# ── error handling ───────────────────────────────────────────────────


def test_parse_error_unknown_operator() -> None:
    with pytest.raises(ExpressionParseError):
        evaluate("data_sensitivity != pii", _ctx())


def test_parse_error_unmatched_paren() -> None:
    with pytest.raises(ExpressionParseError):
        evaluate("(data_sensitivity == pii", _ctx())


def test_parse_error_empty_expression() -> None:
    with pytest.raises(ExpressionParseError):
        evaluate("", _ctx())


def test_parse_error_dangling_operator() -> None:
    with pytest.raises(ExpressionParseError):
        evaluate("data_sensitivity == pii or", _ctx())


def test_eval_error_unknown_axis() -> None:
    """알 수 없는 axis 이름은 ExpressionParseError (eval 단계)."""
    with pytest.raises(ExpressionParseError, match="unknown"):
        evaluate("xyz_axis == foo", _ctx())


def test_whitespace_tolerance() -> None:
    axes = ScaleAxes(data_sensitivity="pii")
    assert (
        evaluate(
            "  data_sensitivity   ==   pii  ",
            _ctx(axes=axes),
        )
        is True
    )


def test_six_axis_names_all_recognized() -> None:
    """6축 모두 ScaleAxes 의 기본값으로 비교 가능해야."""
    ctx = _ctx()
    for axis, default in [
        ("user_scale", "small"),
        ("data_sensitivity", "none"),
        ("team_size", "solo"),
        ("availability", "standard"),
        ("monetization", "none"),
        ("lifecycle", "mvp"),
    ]:
        assert evaluate(f"{axis} == {default}", ctx) is True

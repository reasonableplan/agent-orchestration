"""Phase state machine — manage workflow phase transitions."""

from __future__ import annotations

from enum import StrEnum

from src.orchestrator.state import StateManager


class Phase(StrEnum):
    PLANNING = "planning"
    DESIGNING = "designing"
    TASK_BREAKDOWN = "task_breakdown"
    IMPLEMENTING = "implementing"
    VERIFYING = "verifying"
    DEPLOYING = "deploying"
    DONE = "done"


# Only allowed transitions are defined. All others raise InvalidTransitionError.
VALID_TRANSITIONS: dict[Phase, set[Phase]] = {
    Phase.PLANNING: {Phase.DESIGNING},
    Phase.DESIGNING: {Phase.TASK_BREAKDOWN},
    Phase.TASK_BREAKDOWN: {Phase.IMPLEMENTING},
    Phase.IMPLEMENTING: {Phase.VERIFYING},
    Phase.VERIFYING: {Phase.IMPLEMENTING, Phase.DEPLOYING},  # includes reject loop
    Phase.DEPLOYING: {Phase.DONE},
    Phase.DONE: set(),
}


class InvalidTransitionError(Exception):
    """Attempted an invalid phase transition."""

    def __init__(self, from_phase: Phase, to_phase: Phase) -> None:
        self.from_phase = from_phase
        self.to_phase = to_phase
        super().__init__(
            f"invalid transition: {from_phase} -> {to_phase}. "
            f"allowed: {VALID_TRANSITIONS.get(from_phase, set())}"
        )


class PhaseManager:
    """Manages phase transitions with StateManager persistence."""

    def __init__(self, state: StateManager) -> None:
        self._state = state
        self._current: Phase | None = None

    @property
    def current_phase(self) -> Phase:
        """Current phase. Loaded from state.json on first access."""
        if self._current is None:
            loaded = self._state.load()
            self._current = Phase(loaded.get("phase", "planning"))
        return self._current

    def can_transition(self, to: Phase) -> bool:
        """Check if transition to the given phase is allowed."""
        allowed = VALID_TRANSITIONS.get(self.current_phase, set())
        return to in allowed

    def transition(self, to: Phase, *, data: dict | None = None) -> Phase:
        """Transition to a new phase.

        Raises:
            InvalidTransitionError: If the transition is not allowed.
        """
        if not self.can_transition(to):
            raise InvalidTransitionError(self.current_phase, to)

        # Write phase data first, then state (source of truth).
        # _current is only updated after both succeed — keeps in-memory state consistent on failure.
        if data is not None:
            self._state.save_phase_data(to, data)
        self._state.save(to, data=data)
        self._current = to

        return to

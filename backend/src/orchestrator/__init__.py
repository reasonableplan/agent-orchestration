"""Agent orchestration engine — multi-agent execution via CLI subprocesses."""

from src.orchestrator.config import AgentConfig, OrchestratorConfig, load_agents_config
from src.orchestrator.context import build_context
from src.orchestrator.orchestrate import Orchestra
from src.orchestrator.phase import InvalidTransitionError, Phase, PhaseManager
from src.orchestrator.pipeline import CheckResult, CheckStatus, ValidationPipeline, ValidationResult
from src.orchestrator.runner import AgentRunner, RunResult
from src.orchestrator.state import StateManager

__all__ = [
    "AgentConfig",
    "AgentRunner",
    "CheckResult",
    "CheckStatus",
    "InvalidTransitionError",
    "Orchestra",
    "OrchestratorConfig",
    "Phase",
    "PhaseManager",
    "RunResult",
    "StateManager",
    "ValidationPipeline",
    "ValidationResult",
    "build_context",
    "load_agents_config",
]

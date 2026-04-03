/** Shared formatting utilities for dashboard components */

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

/** Agent domain → brand color mapping */
export const DOMAIN_COLORS: Record<string, string> = {
  architect: '#FFD700',       // 보라+금 → 금색 강조
  designer: '#FF69B4',        // 핑크
  orchestrator: '#00BFFF',    // 딥스카이블루
  backend_coder: '#90EE90',   // 라이트그린
  frontend_coder: '#7FDBFF',  // 밝은 하늘색
  reviewer: '#FF6347',        // 토마토
  qa: '#FFD700',              // 황금
  // 기존 에이전트 ID 호환 (demo 모드/이전 데이터)
  director: '#00BFFF',
  git: '#FF6347',
  frontend: '#7FDBFF',
  backend: '#90EE90',
  docs: '#FFD700',
};

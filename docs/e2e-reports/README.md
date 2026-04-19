# HarnessAI E2E 리포트

실제 프로젝트에 HarnessAI 를 적용한 경험 기록. **"dogfooding 증거"** — 시스템이 자기 실수로 학습하는 루프를 관찰 가능한 형태로.

## 목록

| # | 프로젝트 | 스택 | 상태 | 리포트 |
|---|---|---|---|---|
| 1차 | code-hijack | Python CLI | Phase 2 완료 (APPROVE) | [code-hijack.md](code-hijack.md) |
| 2차 | ui-assistant | fastapi + react-vite monorepo | 진행 중 (backend `building`, frontend `planned`) | [ui-assistant-initial.md](ui-assistant-initial.md) |

## 왜 기록하나

1. **실증 없는 시스템은 vapor** — 코드/문서만 봐서는 "진짜 돌아가는지" 판단 불가.
2. **피드백 루프 가시화** — 1차에서 발견한 갭 → v2 에 직접 반영 → 2차에서 검증. 이 흐름을 보여줘야 시스템이 학습한다는 걸 증명.
3. **포트폴리오 signal** — 시니어 엔지니어가 볼 때 "dogfooded at scale" 은 드문 증거.

## 형식

각 리포트 구조:

```
1. 프로젝트 개요
2. 타임라인 (주요 이벤트 + 커밋)
3. 발견된 이슈
4. HarnessAI 에 어떻게 반영했나 (코드/문서 변경 링크)
5. 정량 지표 (테스트 수, 이슈 수, 소요 시간)
6. 교훈 (meta — 시스템에 대한 학습)
```

## 다음

ui-assistant 완주 후:
- `ui-assistant-initial.md` → `ui-assistant.md` (full) 확장
- **두 프로젝트 통합 리포트** (`combined-insights.md`) — 공통 패턴 + 상반되는 학습
- 비교 실험 리포트 (`vs-plain-claude.md`) — Phase 5 계획

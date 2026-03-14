# Workflow Protocol — Agent Collaboration

## Phase Overview

```
Phase 1: Discovery (사용자 ↔ Director)
Phase 2: Architecture (Director ↔ All Agents)
Phase 3: User Approval (Director → 사용자)
Phase 4: Execution (All Agents, dependency-aware)
Phase 5: Continuous Review & Documentation
```

## Phase 1: Discovery — 요구사항 인터뷰

Director가 사용자와 대화하며 프로젝트를 구체화한다.

### Director의 인터뷰 항목
1. **프로젝트 목적**: 무엇을 만들고, 누가 쓰는가?
2. **핵심 기능**: Must-have vs Nice-to-have 구분
3. **기술 제약**: 특정 스택, 호스팅, 예산 제한?
4. **비기능 요구사항**: 성능, 보안, 접근성, 다국어?
5. **디자인**: 참고 사이트, 브랜드 가이드, 디자인 시스템?
6. **타임라인**: 마일스톤, 우선순위?
7. **기존 자산**: 기존 코드, API, 데이터베이스?

### 산출물
- `docs/requirements.md` — 요구사항 정의서
- `docs/user-stories.md` — 사용자 스토리 목록

## Phase 2: Architecture — 에이전트 합동 설계

Director가 요구사항을 각 전문 에이전트에게 공유하고, 의견을 수집한다.

### 프로세스
1. Director → Backend: "이런 기능인데 API/DB 구조 제안해줘"
2. Director → Frontend: "이런 UI인데 컴포넌트 구조/상태관리 제안해줘"
3. Director → Git: "브랜치 전략, CI/CD 제안해줘"
4. 각 에이전트 → Director: 제안서 제출
5. Director: 종합 검토 → 충돌/누락 확인 → 조정
6. Docs: 전 과정 기록

### 산출물
- `docs/architecture.md` — 시스템 아키텍처 (다이어그램 포함)
- `docs/erd.md` — Entity-Relationship Diagram
- `docs/api-spec.md` — API 명세서 (엔드포인트, 요청/응답 형식)
- `docs/frontend-spec.md` — 컴포넌트 트리, 페이지 구조, 상태 관리
- `docs/workflow.md` — 작업 순서, 의존성 그래프
- `docs/tech-decisions.md` — 기술 결정 로그 (무엇을, 왜 선택했는지)

## Phase 3: User Approval — 사용자 확인

Director가 설계 산출물을 사용자에게 제시하고 승인을 받는다.

### 프로세스
1. Director: 설계 요약을 대시보드/채팅으로 제시
2. 사용자: 검토 → 승인 / 수정 요청 / 질문
3. 수정 시: 해당 에이전트 재소집 → 수정 → 재제출
4. 승인 시: Phase 4로 전환

### 승인 체크리스트
- [ ] 요구사항 정의서 맞는지?
- [ ] API 설계 동의하는지?
- [ ] DB 구조 동의하는지?
- [ ] UI 구조 동의하는지?
- [ ] 작업 순서 동의하는지?
- [ ] 기술 스택/라이브러리 동의하는지?

## Phase 4: Execution — 의존성 기반 작업

### 작업 순서 규칙

**의존성 그래프를 엄격히 따른다:**

```
1. 프로젝트 초기화 (Git Agent)
   ├── repo 생성, 브랜치 전략, CI/CD, lint/format 설정
   └── 공통 패키지 설정 (shared types, validation schemas)

2. 데이터베이스 & 인증 (Backend Agent)
   ├── DB 스키마, 마이그레이션
   ├── 인증/인가 시스템
   └── 핵심 API 엔드포인트

3. 프론트엔드 기반 (Frontend Agent) — Backend API 준비 후
   ├── 프로젝트 셋업, 라우팅, 레이아웃
   ├── 인증 UI (로그인/회원가입)
   └── API 클라이언트 (Backend API 명세 기반)

4. 기능 단위 병렬 작업 — API 완성된 기능부터
   ├── Backend: Feature A API → Frontend: Feature A UI
   ├── Backend: Feature B API → Frontend: Feature B UI
   └── (병렬 가능한 기능은 동시 진행)

5. 통합 & 마무리
   ├── E2E 테스트
   ├── 성능 최적화
   └── 배포 설정
```

### 작업 진행 프로토콜

1. **작업 시작 전**: 의존하는 선행 작업이 `Done` 상태인지 확인
2. **작업 중**: 진행 상태를 `In Progress`로 유지, 주기적 heartbeat
3. **작업 완료 시**: 결과물을 Director에게 결재 요청 (`Review`)
4. **Director 검토**: 전체 아키텍처 정합성, 코드 품질, 의존성 충돌 확인
5. **승인 시**: `Done`으로 이동 → 다음 의존 작업 unblock
6. **반려 시**: 피드백과 함께 `In Progress`로 복귀 → 수정 후 재제출

### 라이브러리 승인 프로세스

1. 에이전트: Director에게 라이브러리 필요성 보고
   - 라이브러리 이름, 버전
   - 왜 필요한지 (구체적 사용 사례)
   - 대안은 없는지
   - 번들 사이즈 영향
   - 라이선스 호환성
   - 유지보수 상태 (마지막 업데이트, 스타 수, 이슈 수)

2. Director: 검토 + 대안 제시 가능
   - "직접 구현이 더 낫다" → 이유 설명
   - "다른 라이브러리가 더 적합하다" → 제안
   - "승인" → 관련 모든 에이전트에게 전파

3. Docs Agent: 토론 과정 및 결정을 `docs/tech-decisions.md`에 기록

## Phase 5: Continuous Review & Documentation

### 리뷰 파이프라인 (3단계)

```
에이전트 작업 완료
  → ① Director 코드 리뷰 (아키텍처, 품질, 보안)
  → ② 크로스 리뷰 (상대 에이전트가 사용성/호환성 검토)
  → ③ QA 검증 (기능 동작, 엣지케이스, 보안, E2E)
  → Done ✅
```

### ① Director 결재 기준
- 코드 표준 준수 여부 (`code-standards.md`)
- 아키텍처 정합성 (설계 문서와 일치하는지)
- 테스트 커버리지 충분한지
- 보안 취약점 없는지
- 성능 문제 없는지
- 이전 피드백이 반영되었는지

### ② 크로스 리뷰 규칙
| 작업한 에이전트 | 크로스 리뷰어 | 검토 포인트 |
|----------------|-------------|------------|
| Backend (API) | Frontend | API 사용하기 편한가? 응답 형식이 UI에 맞는가? 누락 필드? |
| Frontend (API 연동) | Backend | API를 의도대로 호출하는가? 에러 처리가 맞는가? |
| Backend (DB 스키마) | QA | 제약조건 충분? 인덱스? 마이그레이션 롤백 가능? |
| Frontend (UI) | QA | 접근성, 반응형, 로딩/에러/빈 상태 처리? |
| Git (CI/인프라) | Director | 파이프라인 적절? 빌드 시간 합리적? |

### ③ QA 검증
- Director + 크로스 리뷰 통과 후 QA Agent가 기능 테스트
- 엣지케이스, 보안, 통합 테스트 수행
- QA 통과 시 `Done`, 실패 시 구체적 재현 단계와 함께 반려

### Shared Types (프론트-백 타입 공유)
- `packages/shared/` 또는 `src/shared/types/`에 API 요청/응답 타입 + Zod 스키마 정의
- Backend가 스키마를 정의하면, Frontend가 같은 스키마를 import
- 타입 변경 시 양쪽 컴파일이 깨지므로 불일치 방지
- API 계약 변경 = Director 승인 필수 (Breaking Change)

### Docs Agent 기록 항목
- 작업 이력: 누가, 무엇을, 언제 시작/완료
- Git Issue 연결: 어떤 이슈에 대한 작업인지
- 피드백 이력: Director + 크로스 리뷰 + QA 피드백 전부
- 변경 이력: 사용자 요청으로 변경된 사항
- 토론 기록: 에이전트 간 논의 내용 및 결정
- 다음 작업: 현재 작업 완료 후 다음 단계는 무엇인지

## Phase 6: Milestone Retrospective (회고)

마일스톤(주요 기능 묶음) 완료 시 에이전트들이 회고를 진행한다.

### 회고 항목
1. **잘된 점**: 효율적이었던 패턴, 빠르게 통과한 리뷰
2. **문제점**: 반복된 피드백, 병목, 의존성 대기 시간
3. **개선 제안**: 프로세스 변경, 코드 표준 추가, 도구 개선
4. **피드백 패턴 분석**: Docs Agent가 수집한 피드백에서 반복 패턴 식별

### 산출물
- `docs/retrospective-{milestone}.md`
- 개선 사항은 다음 마일스톤부터 적용
- Director가 개선 사항을 각 에이전트에게 전파

### 사용자 난입 프로토콜
1. 사용자가 대시보드에서 메시지 전송
2. 대상 에이전트 or Director에게 전달
3. 작업 일시 중단 (현재 상태 보존)
4. 사용자 요청 처리
5. 변경사항 있으면: Director가 영향 분석 → 관련 에이전트 전파
6. Docs Agent: 난입 내용 및 결과 기록
7. 작업 재개

### 변경 관리 프로세스
1. 사용자 → Director: 변경 요청
2. Director: 영향 분석 (어떤 에이전트, 어떤 코드, 어떤 이슈에 영향?)
3. Director → 관련 에이전트: 변경 내용 전달 + 의견 요청
4. 합의 후: Git Issue 생성 (변경 이유, 영향 범위, 수정 계획)
5. 작업 진행 → Director 결재 → Done
6. Docs Agent: 전 과정 기록

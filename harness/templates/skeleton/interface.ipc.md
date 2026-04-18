---
id: interface.ipc
name: IPC 채널
required_when: has.ipc
description: Electron/데몬의 프로세스 간 통신 채널
---

## {{section_number}}. IPC 채널

### 네이밍 규칙
- 채널명: `<domain>:<action>` — 예: `user:get-all`, `file:open`, `task:update`
- 케밥케이스. 언더스코어 금지.

### 채널 목록

#### `<domain_a>` 도메인
| 채널 | 방향 | 인자 | 반환 | 에러 |
|------|:---:|------|------|------|
| `<domain_a>:get-all` | Renderer→Main | `filters?` | `Array<T>` | `<DOMAIN_A>_FETCH_FAILED` |
| `<domain_a>:create` | Renderer→Main | `CreateInput` | `T` | `<DOMAIN_A>_CREATE_FAILED` |
| `<domain_a>:updated` | Main→Renderer | `T` | — | broadcast |

### contextBridge 노출 (Electron)
```typescript
// src/preload/index.ts
contextBridge.exposeInMainWorld('api', {
  <domain_a>: {
    getAll: (filters?) => ipcRenderer.invoke('<domain_a>:get-all', filters),
    create:  (data) => ipcRenderer.invoke('<domain_a>:create', data),
    onUpdated: (cb) => ipcRenderer.on('<domain_a>:updated', cb),
  }
})
```

### 보안 규칙
- `contextIsolation: true` 필수
- `nodeIntegration: false` 필수
- Renderer는 `window.api` 만 사용 (직접 ipcRenderer 금지)
- Main에서 throw → Renderer Promise reject

> 작성 가이드:
> - 각 채널: 방향(→/←/⇄), 인자 타입, 반환 타입, 에러 코드
> - 데이터베이스는 Main 전용. Renderer에서 직접 접근 금지
> - 모든 채널에 타입 안전 래퍼 (window.api) 제공

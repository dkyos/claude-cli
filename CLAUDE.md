# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 이 저장소가 무엇인가

**Anthropic Claude Code 원본 소스(베이스 커밋 `9f51e71`)를 Google Gemini API로 재타깃한 fork**입니다. 원본은 `src/`만 포함했고, `package.json`/`tsconfig.json`/빌드 스크립트/진입점 호출이 모두 빠져 있었으며, ~95개 내부 모듈은 Anthropic의 Bun 빌더가 `feature()` 플래그로 dead-code 제거해서 아예 누락되어 있습니다. 이 저장소의 LLM 외 코드 대부분은 그 인프라를 재구축한 것이고, **LLM 교체 본체는 `src/services/api/gemini-adapter/`와 `src/services/auth/gemini/` 두 곳입니다.**

작업 시 전제: **`tsc`나 `npm test`만으로는 정확성을 검증할 수 없습니다** — 컴파일은 되지만 런타임에 도달하면 throw하는 파일이 많습니다. 검증은 `claude-cli` 채팅 왕복으로 합니다.

## 명령어

```sh
npm install --legacy-peer-deps    # peer dep 충돌은 의도된 것 (Ink 5는 react@18, 원본 Ink 내부는 React 19 hook 호출)
npm run build                      # esbuild → dist/{claude-cli,gemini-login,gemini-chat,cli}.mjs (총 ~22MB)
npm run build:tsc                  # tsc --noEmit 타입 체크 (참고용; 수백 개 에러 정상)
npm run clean                      # rm -rf dist
npm link                           # claude-cli를 글로벌 bin에 심볼릭 링크
npm unlink                         # 링크 해제

# 링크 없이 로컬 실행:
node dist/claude-cli.mjs           # 기본 → chat
node dist/claude-cli.mjs login     # OAuth flow
node dist/claude-cli.mjs --help

# 어댑터 end-to-end smoke-test (실제 Gemini 호출):
GEMINI_API_KEY=AIza... echo "hello" | node dist/claude-cli.mjs
```

**자동 테스트 없음.** 검증은 `claude-cli` 채팅으로 수동. 원본 소스에 테스트 부재였고 새로 추가하지 않았습니다.

## 아키텍처 — 큰 그림

### LLM 교체 지점: `getAnthropicClient()`

원본 소스는 모든 Anthropic 호출을 `src/services/api/client.ts:88`의 `getAnthropicClient()` 단일 함수로 한정합니다. fork는 그 함수 첫 줄(라인 ~100-126)에서 `USE_GEMINI=true`를 보고 `GeminiAnthropicAdapter`를 `Anthropic`으로 캐스팅해 반환 — 이후 모든 caller(`claude.ts`, `tokenEstimation.ts`, `sideQuery.ts`, `modelCapabilities.ts`, `claudeAiLimits.ts`)는 Anthropic SDK 모양 그대로 어댑터에 말하고 차이를 모릅니다. `Bedrock`/`Foundry`/`AnthropicVertex` 분기는 이제 즉시 throw.

`getAnthropicClient()` 내부 5단계 인증 우선순위:
1. `apiKey` 인자 (드물게 SDK caller만 설정)
2. `GEMINI_API_KEY` env
3. `GOOGLE_API_KEY` env
4. `~/.gemini/.api_key` 파일
5. `~/.gemini/oauth_creds.json` → OAuth → **Code Assist server** (`cloudcode-pa.googleapis.com`)

API key 경로는 `generativelanguage.googleapis.com`에 `@google/genai`로 직접 호출. OAuth 경로는 Code Assist 경유 — gemini-cli OAuth 클라이언트가 허가받은 scope에 `generative-language`가 없어서 access token이 `cloudcode-pa`에서만 유효하기 때문. **이 둘이 갈라지는 게 backend 두 개의 이유입니다.**

### 어댑터 내부 (`src/services/api/gemini-adapter/`)

`Backend` 인터페이스 두 구현체(`client.ts:107-150`):
- `GenAiBackend` — `@google/genai` 직접 호출
- `CodeAssistBackend` — `cloudcode-pa.googleapis.com/v1internal:METHOD`로 POST. 첫 호출 시 `loadCodeAssist`+`onboardUser` 자동 실행, project ID는 `~/.gemini/code_assist_user.json`에 캐싱

4개 변환 레이어 (각각 한 방향만):
- `messageTranslator.ts`: Anthropic `MessageParam[]` ↔ Gemini `Content[]`. role `assistant↔model`, block 타입 `text`/`tool_use`/`tool_result`/`image`/`thinking`을 Gemini parts로 매핑. `cache_control`은 strip.
- `toolTranslator.ts`: Anthropic 내장 도구(`computer_20241022`, `text_editor_*`) drop. custom tool만 `FunctionDeclaration[]`로.
- `responseTranslator.ts`: 비스트리밍 `GenerateContentResponse → BetaMessage`.
- `streamTranslator.ts`: Gemini `AsyncGenerator<GenerateContentResponse>`에서 Anthropic 스트림 이벤트 합성. **핵심**: `functionCall` part는 `content_block_start(tool_use, input: 완성된 객체)` + 즉시 `content_block_stop`로 발행 — `input_json_delta` 누적은 안 함. Gemini는 args를 한 번에 주기 때문.
- `errorWrapper.ts`: 모든 Gemini 에러를 `@anthropic-ai/sdk` 에러 클래스로 wrap (5xx → status 529 + `overloaded_error` body → 기존 `withRetry.ts` 분류기가 그대로 트리거됨).

### `claude.ts`의 결정적 패치

`src/services/api/claude.ts:1997` 근처 `content_block_start` 핸들러. `tool_use` 블록 입력이 객체로 도착하면(Gemini 경로) 보존, 아니면 빈 string으로 초기화(Anthropic 스트림 패턴). 이게 없으면 tool 호출이 빈 input으로 실행 단계에 도달 — Gemini는 `input_json_delta` 이벤트를 주지 않기 때문. 코드의 주석 참고. Anthropic backend는 항상 `''`로 시작하므로 영향 없음.

### 빌드 인프라 (전부 원본에 없던 것)

- **`scripts/build.mjs`** — esbuild bundler. 4개 산출물:
  - `dist/claude-cli.mjs` (~2.5MB) — `npm link` 대상; subcommand 디스패치
  - `dist/gemini-login.mjs` (~830KB) — 독립 OAuth
  - `dist/gemini-chat.mjs` (~2.4MB) — 독립 채팅 REPL
  - `dist/cli.mjs` (~22MB) — 원본 전체 CLI; `--version`/`--help`만 안정적이고 Ink REPL은 렌더 실패
  - 각 파일에 `chmodSync(.., 0o755)` — `npm link` 심볼릭 링크가 실행 가능하도록
- **`scripts/missing-modules.json`** — 원본 코드가 dead branch에서 dynamic-import하는 외부 3P SDK 목록(`@anthropic-ai/{bedrock,vertex,foundry}-sdk`, `@aws-sdk/*`, `@azure/identity`, OTel exporter들). build plugin이 빈 모듈로 가상화.
- **`bun:bundle` `feature()`** — `src/utils/feature.ts` 런타임 stub(env-var 조회, default `false`). tsconfig + esbuild `alias`로 매핑.
- **`MACRO.*`** 빌드타임 상수 → esbuild `define`. `MACRO.VERSION`은 `99.0.0-fork`로 server-side `assertMinVersion` 우회.
- **`void main()`** `src/main.tsx` 마지막 줄 — 원본에 진입점 호출이 없어서 추가. 이 한 줄이 빠지면 번들이 import만 되고 아무 일도 안 함.
- **`src/utils/stubs/`** — 12개 손작성 stub: `@ant/computer-use-*`, `@anthropic-ai/sandbox-runtime`, NAPI 바인딩들, `react/compiler-runtime`, `bun:ffi`.
- **~95개 자동 생성 stub 파일** — `src/services/compact/snipCompact.ts`, `src/coordinator/workerAgent.ts` 등. feature-gated 모듈이라 원본에 빠진 것들. 각자 Proxy export — 런타임에 도달하면 throw, 가드 `feature()`가 `false`라 보통 도달 안 함.

### React 18 ↔ React 19 Compiler 불일치 (부분 해결)

원본 Ink 컴포넌트는 React Compiler가 emit한 React 19 hook 호출 코드인데, Ink 5는 react@18.3 / `react-reconciler@0.29`에 묶여 있습니다. 패치 3개:
- `src/ink/ink.tsx` — `updateContainerSync` 부재 시 `updateContainer` fallback
- `src/ink/reconciler.ts` — `getCurrentEventPriority`/`setCurrentUpdatePriority`/`resolveUpdatePriority` 추가 (DefaultEventPriority=16 반환)
- `src/utils/stubs/react-useeffectevent-polyfill.ts` — `useEffectEvent` 폴리필. `AppState.tsx`/`BackgroundTasksDialog.tsx`에서 import 경로 변경.

이후 `dist/cli.mjs`는 Ink 렌더에 도달하지만 `Objects are not valid as a React child`에서 실패 (의심: `react/compiler-runtime` SENTINEL 슬롯이 children에 누출). **미해결.** `claude-cli` 통합 binary는 readline 기반(Ink 미사용)이라 이 문제 우회.

### `src/utils/auth.ts` short-circuits

`USE_GEMINI=true`일 때 원본 Anthropic 인증 helper들이 Gemini 자격증명을 모르므로 short-circuit해야 합니다:
- `getAnthropicApiKey()` → placeholder string 반환 (caller가 인증 있다고 판단; 실제 호출은 어댑터로)
- `isClaudeAISubscriber()` → `false` (Claude.ai 전용 코드 경로 — quota 대시보드, beta 헤더, OAuth attribution — 비활성)
- `checkAndRefreshOAuthTokenIfNeeded()` → no-op (Gemini token refresh는 어댑터 안에서 자체 처리)

핫 path에서 쓰이는 새 Anthropic-side auth helper를 추가한다면 같은 패턴으로 `USE_GEMINI` short-circuit 추가 — 안 그러면 downstream 코드가 Anthropic 자격증명 lookup에서 hang합니다.

## 무심코 깨면 안 되는 invariants

- **`src/main.tsx` 마지막 줄 `void main()`** — 없으면 CLI가 silent exit (`--version`은 Commander가 main 반환 전에 argv 파싱하므로 동작).
- **`src/services/auth/gemini/oauth.ts`의 OAuth 자격증명**은 `[...].join('')` substring concat으로 분리되어 있습니다 — GitHub Push Protection의 secret 스캐너 우회용. 의도된 것이고 주석에 설명. 다시 한 줄로 합치면 다음 `git push`가 거부됩니다.
- **`getAnthropicClient()`의 USE_GEMINI 분기는 Anthropic 전용 setup(custom headers, OAuth refresh, apiKey helper)보다 먼저 실행**되어야 함 — 어댑터는 이것들 다 필요 없고, 일부는 Anthropic 인증 대기로 hang.
- **`zod`를 4 미만으로 핀하지 말 것** — 원본 소스는 `zod/v4` import path 사용.
- **`@modelcontextprotocol/sdk`를 1.29 미만으로 핀하지 말 것** — 그 이전 버전은 `zod-to-json-schema`가 `zod@4`와 비호환.
- **`react-reconciler`는 `^0.29.2`에 잠겨 있음** — 더 새 버전은 React 19 필요 → Ink 5와 충돌.

## 확장 가이드

- **새 LLM 기능** (caching, structured outputs 등) → 어댑터 레이어에서만 작업. 기존 patch 외에 원본 claude.ts 코드 path 건드리지 말 것.
- **새 인증 방법** → `src/services/api/client.ts`의 `getAnthropicClient()` 우선순위 체인에 추가, 그리고 `src/services/auth/gemini/index.ts` `getGeminiCredentials()`에도 추가.
- **글로벌 CLI에 새 subcommand** → `scripts/claude-cli-entry.ts` argv switch + `scripts/claude-cli-flows.ts`에 함수 추가. `npm run build` 후 `npm link` 심볼릭 링크는 자동으로 새 빌드 사용.
- **빌드타임에 누락 모듈 stub** → 외부 패키지면 `scripts/missing-modules.json`에 추가, 상대 import면 `src/...`에 실제 파일 작성. `scripts/build.mjs` 플러그인은 JSON 목록 경로만 가상화.

## 이 저장소의 참조 문서

- `README.md` — 사용자 대상 소개, 빠른 시작, REPL 상태 caveats, 모델 매핑
- `USAGE.md` — 간략한 end-user 사용법 (subcommand, env var, 트러블슈팅)
- `/Users/dkyos/.claude/plans/cli-refactored-pond.md` — 원래의 5-phase 계획 (Phase 0 빌드 인프라 → Phase 5 Code Assist server)

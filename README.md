# Claude Code — Gemini Fork

Claude Code CLI 소스를 Google Gemini API로 재타깃한 fork입니다.

> **fork에서 바뀐 것**
> - LLM 백엔드: `@anthropic-ai/sdk` 호출을 `@google/genai`로 위임하는 얇은 어댑터로 교체
> - 인증: Google OAuth (Login with Google) **또는** `GEMINI_API_KEY`. `~/.gemini/oauth_creds.json`은 `gemini-cli`와 호환
> - OAuth 경로는 Code Assist server(`cloudcode-pa.googleapis.com`) 경유 — `gemini-cli`의 `LOGIN_WITH_GOOGLE` 인증과 같은 방식
> - 3P provider(AWS Bedrock, Azure Foundry, Anthropic-on-Vertex) 제거
> - 빌드 시스템: 원본 소스는 그대로 빌드 안 됨 — `package.json`, `tsconfig.json`, esbuild bundler, ~95개 feature-flag-gated 모듈 stub, 그 외 자잘한 패치 추가
> - 글로벌 진입점: `claude-cli` 단일 커맨드 (subcommand: `login` / `logout` / `chat` / 기본은 chat)

전체 5-phase 포팅 계획은 `/Users/dkyos/.claude/plans/cli-refactored-pond.md` 참고.

---

## 빠른 시작 — `npm link`로 글로벌 설치 (권장)

```sh
git clone git@github.com:dkyos/claude-cli.git
cd claude-cli
npm install --legacy-peer-deps
npm run build
npm link                              # claude-cli를 글로벌 PATH에 등록

claude-cli login                      # 1회: Google OAuth (브라우저 자동 오픈)
claude-cli                            # 어디서든 채팅 시작
claude-cli --model gemini-2.0-flash   # 가벼운 모델로
claude-cli logout                     # 자격증명 전부 삭제
```

해제: `npm unlink -g claude-cli-gemini-fork` 또는 저장소 디렉터리에서 `npm unlink`.

## 빌드 산출물

`npm run build` 실행 시 `dist/`에 4개 번들:

| 파일 | 크기 | 용도 | 상태 |
|---|---|---|---|
| `dist/claude-cli.mjs` | ~2.5 MB | **통합 CLI.** `npm link` 대상. subcommand 디스패치 (login/logout/chat) | ✅ 동작 |
| `dist/gemini-login.mjs` | ~830 KB | OAuth 로그인 단독 번들 | ✅ 동작 |
| `dist/gemini-chat.mjs` | ~2.4 MB | minimal readline 채팅 REPL 단독 번들 | ✅ 동작 |
| `dist/cli.mjs` | ~22 MB | 원본 전체 CLI (Ink REPL 포함) | ⚠️ `--version`/`--help`만 안정. REPL 미해결 (아래 참고) |

`claude-cli`는 `chat`/`login`/`logout` 모두 한 binary에 통합한 것이고, 나머지 두 분리 번들은 단독 사용용으로 유지.

## 인증 방식

### 옵션 A: API key (가장 간단)

[Google AI Studio](https://aistudio.google.com/app/apikey)에서 발급 후:

```sh
mkdir -p ~/.gemini
echo "AIzaSy..." > ~/.gemini/.api_key && chmod 600 ~/.gemini/.api_key
claude-cli                                # 자동으로 키 사용
```

또는 환경변수: `GEMINI_API_KEY=AIza... claude-cli`

API key는 `generativelanguage.googleapis.com`에 직접 호출.

### 옵션 B: Google OAuth (Login with Google)

```sh
claude-cli login              # 브라우저 → 동의 → ~/.gemini/oauth_creds.json 저장
claude-cli                    # OAuth 토큰 자동 사용
```

**OAuth 경로의 동작 원리**: gemini-cli의 OAuth 클라이언트는 `cloud-platform`/`userinfo.email`/`userinfo.profile` scope만 허가받았고 `generative-language`는 **없음**. 따라서 access token으로 `generativelanguage.googleapis.com` 직접 호출은 거부됩니다 (gemini-cli도 동일). 대신 모든 호출을 **Code Assist server**(`cloudcode-pa.googleapis.com/v1internal:METHOD`) 경유 — `gemini-cli`의 `LOGIN_WITH_GOOGLE` 인증과 같은 흐름. 첫 호출에서 `loadCodeAssist`+`onboardUser`로 사용자 tier/project를 자동 등록하고 결과를 `~/.gemini/code_assist_user.json`에 캐싱.

자격증명 파일은 gemini-cli와 호환 — 이미 `gemini-cli`로 로그인했다면 이 단계 생략 가능.

### 인증 우선순위 (`getAnthropicClient()`가 사용)

1. 명시적으로 전달된 `apiKey` 인자
2. `GEMINI_API_KEY` 환경변수
3. `GOOGLE_API_KEY` 환경변수
4. `~/.gemini/.api_key` 파일
5. `~/.gemini/oauth_creds.json` (OAuth → Code Assist)

먼저 발견되는 것 사용. 모두 없으면 명확한 에러 메시지.

## 모델 매핑

`--model <name>`에 어떤 이름을 넣어도 자동으로 Gemini로 매핑됩니다 (`src/services/api/gemini-adapter/modelMap.ts`):

| 입력 | 호출되는 Gemini 모델 |
|---|---|
| `opus`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-3-7-sonnet-*` | `gemini-2.5-pro` |
| `sonnet`, `claude-sonnet-4-6`, `claude-sonnet-4-5` | `gemini-2.5-pro` |
| `haiku`, `claude-haiku-4-5`, `claude-3-5-haiku-*` | `gemini-2.0-flash` |
| `gemini-*` | 그대로 통과 |
| 그 외 | `gemini-2.5-pro` (기본값) |

가격 데이터는 `src/utils/modelCost.ts`의 `COST_GEMINI_25_PRO` / `COST_GEMINI_25_FLASH` / `COST_GEMINI_20_FLASH`.

## 환경변수

| 변수 | 효과 |
|---|---|
| `GEMINI_API_KEY` | API key 인증 (최우선) |
| `GOOGLE_API_KEY` | API key 별칭 (`gemini-cli`도 동일) |
| `GEMINI_MODEL` | 기본 모델 오버라이드 (없으면 `gemini-2.5-pro`) |
| `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT_ID` | OAuth Standard tier에서 명시적 project ID |
| `CODE_ASSIST_ENDPOINT` | Code Assist 엔드포인트 (기본 `https://cloudcode-pa.googleapis.com`) |
| `CODE_ASSIST_API_VERSION` | API 버전 (기본 `v1internal`) |
| `GEMINI_OAUTH_CLIENT_ID` / `GEMINI_OAUTH_CLIENT_SECRET` | 자체 OAuth 클라이언트 사용 시 |
| `USE_GEMINI` | `dist/cli.mjs`(원본 전체 CLI) 안에서 Gemini 어댑터 활성화 (`gemini-chat.mjs`/`claude-cli`는 항상 활성) |
| `CLAUDE_FORK_VERSION` | fork 버전 문자열 (기본 `99.0.0-fork`, server-side `assertMinVersion` 우회 목적) |
| `CLAUDE_FEATURE_<NAME>` | `feature()` 플래그 런타임 활성화 |

3P provider env(`CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_FOUNDRY`, `CLAUDE_CODE_USE_VERTEX`)는 이제 명시적 에러를 반환합니다.

## 아키텍처 개요

```
src/services/api/gemini-adapter/         ← Anthropic SDK 모양으로 @google/genai를 래핑
├── client.ts                             Anthropic.beta.messages.create / countTokens / models.list
├── messageTranslator.ts                  MessageParam[] ↔ Gemini Content[]
├── toolTranslator.ts                     BetaToolUnion[] → FunctionDeclaration[]
├── responseTranslator.ts                 GenerateContentResponse → BetaMessage (비스트리밍)
├── streamTranslator.ts                   AsyncGenerator → Anthropic 스트림 이벤트
├── stopReasonMap.ts                      finishReason → stop_reason
├── errorWrapper.ts                       Gemini 에러 → APIError / 529 / APIUserAbortError
├── modelMap.ts                           Anthropic 별칭 → Gemini 모델명
├── codeAssistServer.ts                   cloudcode-pa.googleapis.com HTTP 클라이언트
├── codeAssistConverter.ts                request 래핑 / response 언래핑
├── codeAssistSetup.ts                    loadCodeAssist + onboardUser, project ID 캐시
└── codeAssistTypes.ts                    Code Assist API 타입 정의

src/services/auth/gemini/                ← OAuth + API key resolver
├── apiKey.ts                             env / ~/.gemini/.api_key
├── credentials.ts                        ~/.gemini/oauth_creds.json (gemini-cli 호환)
├── oauth.ts                              loopback-redirect PKCE flow + 자동 refresh
└── index.ts                              getGeminiCredentials / ensureFreshCredentials / loginWithGoogle / getOauthClient

src/services/api/client.ts                getAnthropicClient() — USE_GEMINI=true 첫 분기
src/services/api/claude.ts                content_block_start의 tool_use input을 객체로 보존하는 한 줄 패치 (line 1997)
src/utils/auth.ts                         getAnthropicApiKey / isClaudeAISubscriber / checkAndRefreshOAuthTokenIfNeeded short-circuit

scripts/
├── build.mjs                             esbuild + 4개 번들 빌드 + chmod +x
├── claude-cli-entry.ts                   글로벌 binary 진입점, subcommand 디스패치
├── claude-cli-flows.ts                   runLogin / runLogout / runChat 본체
├── gemini-login-entry.ts                 독립 OAuth 진입점
├── gemini-chat-entry.ts                  독립 채팅 REPL 진입점
└── missing-modules.json                  외부 3P SDK 가상 stub 목록
```

## 빌드 인프라 (원본에 없던 것)

원본 소스는 빌드 환경이 통째로 빠져 있어 추가:

- `package.json` — ~70개 의존성 (Bun-specific은 Node 호환으로 대체)
- `tsconfig.json` — `src/*` paths + `bun:bundle`/내부 `@ant/*`/NAPI 바인딩 alias
- `scripts/build.mjs` — esbuild 기반 bundler. `MACRO.*` 빌드타임 상수를 `define`으로 주입. `@anthropic-ai/{bedrock,foundry,vertex}-sdk`, `@aws-sdk/*`, `@azure/identity`, `@opentelemetry/exporter-*` 등 사용 안 하는 SDK는 `scripts/missing-modules.json`로 가상화.
- `src/utils/feature.ts` — `bun:bundle.feature()` 런타임 stub (env-var 조회, default `false`)
- `src/utils/stubs/*.ts` — 12개 내부/네이티브 패키지 stub (`@ant/computer-use-*`, `@anthropic-ai/sandbox-runtime`, `*-napi`, `react/compiler-runtime`, `bun:ffi`)
- 자동 생성 ~95개 stub 파일 — feature 플래그 뒤에서 dead-code였던 모듈들 (`src/services/compact/snipCompact.ts`, `src/coordinator/workerAgent.ts` 등)
- `void main()` `src/main.tsx` 마지막 줄 — 진입점 호출이 원본에 통째로 빠져 있어 추가

## REPL 상태

원본 Ink REPL은 Anthropic이 자체 vendoring한 `react-reconciler` 빌드 + React 19 기능(`useEffectEvent`, React Compiler 슬롯 캐싱, `updateContainerSync`)을 사용. 공개된 매칭 버전을 핀하면 깔끔하지 않은데, Ink 5는 React 18 peer dep이라 React 19 hook을 위에 얹으면 mismatch 연쇄가 발생:

- `reconciler.updateContainerSync is not a function` → 패치됨 (`src/ink/ink.tsx`에서 `updateContainer` fallback)
- `getCurrentEventPriority is not a function` → 패치됨 (`src/ink/reconciler.ts`에 stub 추가)
- `useEffectEvent is not a function` → 패치됨 (폴리필 + import-rewrite)
- `Objects are not valid as a React child` (의심: React Compiler 슬롯 SENTINEL이 children에 누출) → **미해결**

3가지 패치 후 `node dist/cli.mjs`는 Ink 렌더에 도달해 ANSI escape를 출력하지만, 4번째 이슈에서 prompt 표시 전에 throw. 두 가지 진행 가능 경로:

1. `react/compiler-runtime` stub의 SENTINEL을 `null`로 바꾸고 컴파일된 코드가 견디길 기대 (각 슬롯이 쓰기 전에 체크됨)
2. 의존성 트리를 React 19 + 호환 Ink 버전으로 전환 (의존성 churn 큼)

현재로서는 **`claude-cli` 통합 binary가 fork를 인터랙티브하게 사용하는 지원되는 방법**입니다 — 렌더링 레이어가 유일한 차단 요인이고 minimal REPL이 그것을 통째로 우회.

## 알려진 제약

- Prompt caching: Anthropic `cache_control` 블록은 strip (Gemini는 implicit caching만)
- 내장 도구: `computer_use`, `text_editor`, server-side `web_search` (Anthropic 전용) 도구 목록에서 strip
- Refusal regex 매칭: `errors.ts`의 영어 패턴 30+ 곳은 거의 동작 안 함 → generic fallback
- `claudeAiLimits` rate-limit 대시보드는 자연스럽게 inert (subscriber check가 false)
- Vertex AI for Gemini 미연결 (API key 또는 OAuth → Code Assist만; Vertex는 어댑터 추가 작업 필요)
- gemini-cli의 billing / Google One AI credits / `recordCodeAssistMetrics` telemetry / admin-controls / experiments는 미포팅 — 해당 엔드포인트 호출 생략, 요청은 그 기능 없이 진행

## 추가 정보

- 사용법 상세: [USAGE.md](./USAGE.md)
- AI 에이전트용 코드 가이드: [CLAUDE.md](./CLAUDE.md)
- 5-phase 포팅 계획: `/Users/dkyos/.claude/plans/cli-refactored-pond.md`

## Disclaimer

원본 Claude Code 소스 코드의 저작권은 [Anthropic](https://www.anthropic.com)에 있습니다. 이 fork는 학습 및 실험 목적의 비상업적 작업입니다.

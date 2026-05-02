# 사용법

## 빠른 시작 — `npm link`로 글로벌 설치 (권장)

```sh
git clone git@github.com:dkyos/claude-cli.git
cd claude-cli
npm install --legacy-peer-deps
npm run build
npm link

claude-cli login      # 1회: Google OAuth (브라우저 자동 오픈)
claude-cli            # 어느 디렉터리에서나 채팅 시작
```

해제: `npm unlink -g claude-cli-gemini-fork` (또는 저장소에서 `npm unlink`).

## 명령어

```
claude-cli                      → 채팅 시작 (기본)
claude-cli chat                 → 동일
claude-cli login                → Google OAuth 로그인
claude-cli logout               → 자격증명 전부 삭제
claude-cli --help               → 도움말
claude-cli --version            → 버전
```

채팅 옵션:
```
claude-cli --model gemini-2.0-flash
claude-cli --system "You are a Korean translator."
```

## 1. 빌드 (최초 1회)

```sh
npm install --legacy-peer-deps
npm run build
```

`dist/`에 4개 산출물:

| 파일 | 용도 |
|---|---|
| `dist/claude-cli.mjs` | **통합 CLI** — `npm link` 대상 |
| `dist/gemini-login.mjs` | OAuth 로그인 (분리 번들, 단독 실행 가능) |
| `dist/gemini-chat.mjs` | 채팅 REPL (분리 번들, 단독 실행 가능) |
| `dist/cli.mjs` | 유출 소스 전체 CLI (`--version`/`--help`만 안정) |

## 2. 인증 — 둘 중 하나 선택

### 옵션 A: API key (권장, 가장 간단)

[Google AI Studio](https://aistudio.google.com/app/apikey)에서 발급:

```sh
mkdir -p ~/.gemini
echo "AIzaSy..." > ~/.gemini/.api_key
chmod 600 ~/.gemini/.api_key
```

또는 환경변수:
```sh
export GEMINI_API_KEY="AIzaSy..."
```

### 옵션 B: Google OAuth 로그인

```sh
claude-cli login
```

브라우저가 자동으로 열림 → Google 계정 동의 → 토큰이 `~/.gemini/oauth_creds.json`에 저장됨. `gemini-cli`와 자격증명 호환 (이미 로그인했다면 이 단계 생략 가능).

OAuth 경로는 첫 호출에서 `loadCodeAssist`+`onboardUser`를 자동 실행해 사용자 tier/project를 등록 (수 초 소요). 결과는 `~/.gemini/code_assist_user.json`에 캐싱되어 이후엔 즉시 사용.

## 3. 채팅 시작

글로벌 설치 후 어디서든:

```sh
claude-cli
claude-cli --model gemini-2.0-flash
claude-cli --system "You are a Korean translator."
```

또는 빌드 디렉터리에서 직접 실행:

```sh
node dist/claude-cli.mjs
node dist/gemini-chat.mjs       # 채팅만 분리된 작은 번들
```

## 4. REPL 안 명령어

| 입력 | 동작 |
|---|---|
| `/help` | 명령어 목록 |
| `/model NAME` | 모델 전환 (예: `/model gemini-2.0-flash`) |
| `/system "TEXT"` | 시스템 프롬프트 설정/교체 |
| `/clear` | 대화 히스토리 초기화 |
| `/exit` 또는 `/quit` | 종료 |
| **Ctrl+C** | 응답 중인 스트림만 취소 (세션 유지) |
| **Ctrl+D** | 종료 |

빈 줄 입력은 무시됩니다. 슬래시(`/`)로 시작하면 명령어, 그 외엔 모델로 전송.

## 5. 동작 확인

```sh
# 한 발 질문 (stdin으로 보내고 즉시 종료)
echo "hello" | claude-cli
# (실제로는 인터랙티브 모드라 응답 후 EOF에서 종료)

# 모델 별칭 매핑 — Anthropic 이름 입력해도 Gemini로 자동 매핑
claude-cli --model haiku   # → gemini-2.0-flash
claude-cli --model opus    # → gemini-2.5-pro
```

## 6. 모델 매핑 (참고)

| 입력 | 실제 호출되는 모델 |
|---|---|
| `gemini-2.5-pro` | gemini-2.5-pro |
| `gemini-2.5-flash` | gemini-2.5-flash |
| `gemini-2.0-flash` | gemini-2.0-flash |
| `opus`, `claude-opus-*`, `sonnet`, `claude-sonnet-*` | gemini-2.5-pro |
| `haiku`, `claude-haiku-*` | gemini-2.0-flash |

## 7. 자격증명 우선순위

`claude-cli`이 자격증명을 찾는 순서 (먼저 발견되는 것 사용):

1. `GEMINI_API_KEY` 환경변수
2. `GOOGLE_API_KEY` 환경변수
3. `~/.gemini/.api_key` 파일
4. `~/.gemini/oauth_creds.json` (OAuth → Code Assist server 경유)

자격증명이 없으면 안내 메시지 출력하고 종료.

## 8. 로그아웃

```sh
claude-cli logout
```

이 명령은 `~/.gemini/oauth_creds.json`, `~/.gemini/.api_key`, `~/.gemini/code_assist_user.json`을 모두 삭제합니다.

수동으로 일부만 지우고 싶다면:
```sh
rm ~/.gemini/oauth_creds.json     # OAuth만 삭제
rm ~/.gemini/.api_key             # API key만 삭제
rm ~/.gemini/code_assist_user.json   # Code Assist project 캐시만 삭제 (다음 OAuth 호출에서 자동 재생성)
```

## 9. 환경변수

| 변수 | 효과 |
|---|---|
| `GEMINI_API_KEY` | API key (최우선) |
| `GOOGLE_API_KEY` | API key 별칭 |
| `GEMINI_MODEL` | 기본 모델 오버라이드 |
| `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT_ID` | OAuth Standard tier project ID |
| `CODE_ASSIST_ENDPOINT` | Code Assist 엔드포인트 오버라이드 |
| `CODE_ASSIST_API_VERSION` | API 버전 오버라이드 |
| `GEMINI_OAUTH_CLIENT_ID` / `GEMINI_OAUTH_CLIENT_SECRET` | 자체 OAuth 클라이언트 사용 시 |

## 10. 글로벌 해제

```sh
npm unlink -g claude-cli-gemini-fork    # 심볼릭 링크 제거
which claude-cli                         # → 빈 출력 (제거됨)
```

또는 프로젝트 디렉터리에서:
```sh
cd /path/to/claude-cli && npm unlink
```

소스 변경 후엔 `npm run build`만 다시 실행하면 됩니다 (`npm link` 심볼릭 링크는 항상 최신 빌드를 가리킴 — 재링크 불필요).

## 11. 문제 해결

**`No Gemini credentials found`**
→ 위 2단계 (인증) 둘 중 하나 수행.

**`Error 403: restricted_client` (`claude-cli login` 실행 시)**
→ scope 문제. 최신 빌드에서 해결됨 — 다시 `npm run build` 후 재시도.

**`oauth_creds.json` 파일이 0 바이트**
→ 이전 빌드의 race condition 버그. 최신 빌드에서 해결됨. 파일 지우고 재로그인:
```sh
rm ~/.gemini/oauth_creds.json && claude-cli login
```

**OAuth 모드에서 첫 응답이 느림**
→ 첫 호출에서 Code Assist가 사용자 tier/project를 자동 등록 (수 초 소요). 이후 호출은 빠름. `~/.gemini/code_assist_user.json`에 캐시됨.

**API 호출이 느리거나 timeout**
→ 모델을 가벼운 것으로 전환: REPL 안에서 `/model gemini-2.0-flash`.

**`claude-cli: command not found`**
→ `npm link`를 안 했거나 글로벌 npm bin이 PATH에 없음. `npm bin -g`로 경로 확인 후 PATH에 추가, 또는 `node dist/claude-cli.mjs`로 직접 실행.

**`dist/cli.mjs` (전체 Ink REPL)이 응답 없음**
→ 알려진 문제 (React 18 ↔ React 19 Compiler 코드 mismatch). `claude-cli` 통합 binary 사용 (`dist/claude-cli.mjs`). README의 "REPL 상태" 섹션 참고.

## 한 줄 요약

```sh
# 글로벌 설치 + OAuth 로그인 + 채팅
npm install --legacy-peer-deps && npm run build && npm link && claude-cli login && claude-cli

# API key 모드 (OAuth 없이)
echo "$YOUR_KEY" > ~/.gemini/.api_key && chmod 600 ~/.gemini/.api_key && claude-cli
```

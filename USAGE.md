# 사용법

## 1. 빌드 (최초 1회)

```sh
npm install --legacy-peer-deps
npm run build
```

`dist/`에 3개 산출물:

| 파일 | 용도 |
|---|---|
| `dist/gemini-login.mjs` | OAuth 로그인 (Google) |
| `dist/gemini-chat.mjs` | **터미널 채팅 REPL** ← 주력 |
| `dist/cli.mjs` | leaked source 전체 CLI (`--version`/`--help`만 안정) |

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
node dist/gemini-login.mjs
```

브라우저가 자동으로 열림 → Google 계정 동의 → 토큰이 `~/.gemini/oauth_creds.json`에 저장됨. `gemini-cli`와 자격증명 호환 (이미 로그인했다면 이 단계 생략).

## 3. 채팅 시작

```sh
node dist/gemini-chat.mjs
```

기본 모델은 `gemini-2.5-pro`. 다른 모델 지정:

```sh
node dist/gemini-chat.mjs --model gemini-2.0-flash
node dist/gemini-chat.mjs --model gemini-2.5-flash
node dist/gemini-chat.mjs --system "You are a Korean translator."
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
echo "hello" | node dist/gemini-chat.mjs
# (실제로는 인터랙티브 모드라 응답 후 EOF에서 종료)

# 모델 별칭 매핑 확인 — Anthropic 이름 입력해도 Gemini로 자동 매핑
node dist/gemini-chat.mjs --model haiku   # → gemini-2.0-flash
node dist/gemini-chat.mjs --model opus    # → gemini-2.5-pro
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

`gemini-chat.mjs`가 자격증명을 찾는 순서 (먼저 발견되는 것 사용):

1. `GEMINI_API_KEY` 환경변수
2. `GOOGLE_API_KEY` 환경변수
3. `~/.gemini/.api_key` 파일
4. `~/.gemini/oauth_creds.json` (OAuth → Code Assist server 경유)

자격증명이 없으면 안내 메시지 출력하고 종료.

## 8. 로그아웃

```sh
rm ~/.gemini/oauth_creds.json     # OAuth 자격증명 삭제
rm ~/.gemini/.api_key             # API key 삭제
rm ~/.gemini/code_assist_user.json   # Code Assist project 캐시 삭제 (재로그인 시 자동 재생성)
```

## 9. 문제 해결

**`No Gemini credentials found`**
→ 위 2단계 (인증) 둘 중 하나 수행.

**`Error 403: restricted_client` (gemini-login.mjs 실행 시)**
→ scope 문제. 이미 수정됨 — 최신 빌드 사용 (`npm run build`).

**`oauth_creds.json` 파일이 0 바이트**
→ 이전 빌드 race 버그. 최신 빌드에서 해결됨. 파일 지우고 재로그인:
```sh
rm ~/.gemini/oauth_creds.json && node dist/gemini-login.mjs
```

**OAuth 모드에서 응답이 안 옴**
→ 첫 호출에서 Code Assist가 사용자 tier/project를 자동 등록 (수 초 소요). 이후 호출은 빠름. `~/.gemini/code_assist_user.json`에 캐시됨.

**API 호출이 느리거나 timeout**
→ 모델을 가벼운 것으로 전환: REPL 안에서 `/model gemini-2.0-flash`.

## 한 줄 요약

```sh
echo "$YOUR_KEY" > ~/.gemini/.api_key && chmod 600 ~/.gemini/.api_key && node dist/gemini-chat.mjs
```

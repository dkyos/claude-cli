# Claude Code — Gemini Fork (Leaked Source @ 2026-03-31)

This repository is a fork of the leaked Claude Code CLI source that swaps the
LLM and authentication layers for Google's Gemini API.

> **What changed in the fork**
> - LLM backend: `@anthropic-ai/sdk` calls go through a thin adapter wrapping `@google/genai`
> - Auth: Google OAuth (Login with Google) **or** `GEMINI_API_KEY`, compatible with `~/.gemini/oauth_creds.json`
> - 3P providers (AWS Bedrock, Azure Foundry, Anthropic-on-Vertex) removed
> - Build system: leaked source isn't buildable as-is — added `package.json`, `tsconfig.json`, esbuild bundler, ~95 stub files for feature-flag-gated modules, and miscellaneous patches
>
> See `/Users/dkyos/.claude/plans/cli-refactored-pond.md` for the full porting plan.

---

## Quick start

```sh
npm install --legacy-peer-deps
npm run build
```

This produces three executables in `dist/`:

| Bundle | Purpose | Status |
|---|---|---|
| `dist/gemini-login.mjs` (~830 KB) | Google OAuth login flow → `~/.gemini/oauth_creds.json` | ✅ working |
| `dist/gemini-chat.mjs` (~2.4 MB) | **Minimal terminal chat REPL.** No Ink/React UI — just `readline` + Gemini adapter + streaming output | ✅ working |
| `dist/cli.mjs` (~22 MB) | Full Ink-based REPL from the leaked source | ⚠️ partially working — see "REPL status" below |

### Recommended: minimal chat REPL

```sh
# OAuth (one-time login)
node dist/gemini-login.mjs

# Chat
node dist/gemini-chat.mjs                         # uses ~/.gemini/oauth_creds.json
node dist/gemini-chat.mjs --model gemini-2.0-flash
GEMINI_API_KEY=AIzaSy... node dist/gemini-chat.mjs

# Inside the REPL:
#   /help              list commands
#   /model gemini-2.5-flash    switch model
#   /system "you are…" set system prompt
#   /clear             reset conversation
#   /exit              quit
#   Ctrl+C             cancel current response (keeps the session alive)
#   Ctrl+D             quit
```

This bypasses every React/Ink/Yoga dependency. It's purely:
1. `readline` for input
2. `getAnthropicClient()` → Gemini adapter (API key or OAuth → Code Assist)
3. `messages.create({stream: true})` → write `text_delta` tokens to stdout

### Full REPL (experimental)

```sh
USE_GEMINI=true GEMINI_API_KEY=<your-key> node dist/cli.mjs --help
USE_GEMINI=true node dist/cli.mjs        # uses ~/.gemini/oauth_creds.json
```

`--version`/`--help` work. The interactive REPL (`node dist/cli.mjs` with no
flags) currently fails inside Ink rendering — see "REPL status" below.

### Current recommendation: API key

Get a key from [Google AI Studio](https://aistudio.google.com/app/apikey),
then either set it in env or write it to a file:

```sh
mkdir -p ~/.gemini
echo "YOUR_AISTUDIO_KEY" > ~/.gemini/.api_key && chmod 600 ~/.gemini/.api_key
USE_GEMINI=true node dist/cli.mjs --help
```

### OAuth login (Login with Google)

```sh
node dist/gemini-login.mjs    # writes ~/.gemini/oauth_creds.json
USE_GEMINI=true node dist/cli.mjs --help
```

The standalone bundle (`dist/gemini-login.mjs`, ~830 KB) opens Google's
consent page, captures the auth code on a local callback server, and stores
credentials at `~/.gemini/oauth_creds.json` (compatible with `gemini-cli`).
Refresh tokens are rotated automatically — the OAuth2Client emits a `tokens`
event on every refresh and the handler in `src/services/auth/gemini/oauth.ts`
re-saves the file in place.

**Behind the scenes — Code Assist server:** the OAuth client we share with
`gemini-cli` is approved only for the `cloud-platform`, `userinfo.email`,
and `userinfo.profile` scopes, **not** `generative-language`. That means the
access token can't talk to `generativelanguage.googleapis.com` (which
expects API-key auth). Instead, OAuth requests are routed through Google's
**Code Assist server** at `cloudcode-pa.googleapis.com/v1internal:METHOD` —
the same endpoint `gemini-cli` uses for `LOGIN_WITH_GOOGLE`.

The Code Assist adapter lives in `src/services/api/gemini-adapter/`:
- `codeAssistServer.ts` — minimal HTTP client (~160 LOC) for the
  `loadCodeAssist`, `onboardUser`, `generateContent`,
  `streamGenerateContent` (SSE), `countTokens` methods
- `codeAssistConverter.ts` — wraps/unwraps the standard Gemini request as
  `{ model, project, request: { contents, ... } }`
- `codeAssistSetup.ts` — on first OAuth use, calls `loadCodeAssist` to
  resolve the user's tier and Cloud project ID (auto-onboarding to the
  free tier if no project is set), caches the result at
  `~/.gemini/code_assist_user.json`

`GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT_ID` env vars override the
auto-resolved project. Endpoint is overridable via `CODE_ASSIST_ENDPOINT`
and `CODE_ASSIST_API_VERSION` (matching `gemini-cli`'s knobs).

**Auth-resolution priority** in `getAnthropicClient()`:
1. `apiKey` arg explicitly passed in
2. `GEMINI_API_KEY` env var
3. `GOOGLE_API_KEY` env var
4. `~/.gemini/.api_key` file
5. `~/.gemini/oauth_creds.json` → Code Assist server

API-key paths talk to `generativelanguage.googleapis.com` directly via
`@google/genai`. OAuth path goes through Code Assist.

The leaked source's in-REPL `/login` slash command is wired to Anthropic's
own OAuth UI and is **not** redirected to this flow — use the standalone
`dist/gemini-login.mjs` instead.

## Environment variables

| Variable | Effect |
|---|---|
| `USE_GEMINI=true` | Route LLM calls through the Gemini adapter (required) |
| `GEMINI_API_KEY` | Direct API-key auth (highest priority) |
| `GOOGLE_API_KEY` | Alias for `GEMINI_API_KEY` (same shape gemini-cli accepts) |
| `CLAUDE_FORK_VERSION` | Override fork version string (default `99.0.0-fork`, intentionally above any server `assertMinVersion`) |
| `CLAUDE_FEATURE_<NAME>` | Enable a `feature()` flag at runtime (replaces Bun bundler dead-code elimination) |

3P provider env vars (`CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_FOUNDRY`,
`CLAUDE_CODE_USE_VERTEX`) are now an explicit error.

## Model mapping

The Gemini adapter remaps Anthropic model strings to Gemini equivalents:

| Anthropic input | Gemini target |
|---|---|
| `opus`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-3-7-sonnet-*` | `gemini-2.5-pro` |
| `sonnet`, `claude-sonnet-4-6`, `claude-sonnet-4-5` | `gemini-2.5-pro` |
| `haiku`, `claude-haiku-4-5`, `claude-3-5-haiku-*` | `gemini-2.0-flash` |
| `gemini-*` | passes through unchanged |

Pricing for Gemini 2.5 Pro / 2.5 Flash / 2.0 Flash is in
`src/utils/modelCost.ts` (`COST_GEMINI_*`).

## Architecture of the swap

```
src/services/api/gemini-adapter/   ← Anthropic-shape adapter wrapping @google/genai
├── client.ts                       (Anthropic.beta.messages.create / countTokens / models.list)
├── messageTranslator.ts            MessageParam[]   ↔ Gemini Content[]
├── toolTranslator.ts               BetaToolUnion[]  → FunctionDeclaration[]
├── responseTranslator.ts           GenerateContentResponse → BetaMessage  (non-streaming)
├── streamTranslator.ts             AsyncGenerator   → Anthropic stream events
├── stopReasonMap.ts                finishReason     → stop_reason
├── errorWrapper.ts                 Gemini errors    → APIError / 529 / APIUserAbortError
└── modelMap.ts                     Anthropic alias  → Gemini model name

src/services/auth/gemini/          ← OAuth + API-key resolver
├── apiKey.ts                       env / ~/.gemini/.api_key
├── credentials.ts                  ~/.gemini/oauth_creds.json (gemini-cli compatible)
├── oauth.ts                        loopback-redirect PKCE flow + automatic refresh
└── index.ts                        getGeminiCredentials / ensureFreshCredentials / loginWithGoogle

src/services/api/client.ts          getAnthropicClient() — first branch on USE_GEMINI=true
src/services/api/claude.ts          one-line patch at content_block_start tool_use to
                                     accept already-complete input objects (Gemini delivers
                                     functionCall args in one chunk, no input_json_delta stream)
src/utils/auth.ts                   getAnthropicApiKey / isClaudeAISubscriber /
                                     checkAndRefreshOAuthTokenIfNeeded short-circuit on USE_GEMINI
```

## Build infrastructure (didn't ship in the leak)

The leaked source has no `package.json`, no `tsconfig.json`, and no build
script. Added in this fork:

- `package.json` — ~70 dependencies (Bun-only ones replaced with Node-compatible alternatives)
- `tsconfig.json` — paths for `src/*` plus aliases for `bun:bundle`, internal `@ant/*`, NAPI bindings
- `scripts/build.mjs` — esbuild-based bundler. Replaces `MACRO.*` build-time constants via `define`. Virtualizes the unavailable `@anthropic-ai/{bedrock,foundry,vertex}-sdk`, `@aws-sdk/*`, `@azure/identity`, `@opentelemetry/exporter-*` SDKs (listed in `scripts/missing-modules.json`)
- `src/utils/feature.ts` — `bun:bundle.feature()` runtime stub (env-var lookup; default false)
- `src/utils/stubs/*.ts` — 12 internal/native package stubs (`@ant/computer-use-*`, `@anthropic-ai/sandbox-runtime`, `*-napi`, `react/compiler-runtime`, `bun:ffi`)
- ~95 auto-generated stub files for feature-flag-gated modules that didn't ship in the leak (`src/services/compact/snipCompact.ts`, `src/coordinator/coordinatorMode.ts`, etc.)
- `void main()` appended to `src/main.tsx` — the entry-point invocation was missing entirely from the leaked source

The bundle is ~22 MB ESM with sourcemaps. `node dist/cli.mjs --version`
prints `99.0.0-fork (Claude Code)`.

## REPL status

The leaked source's REPL was built against an internal Anthropic-vendored
build of `react-reconciler` plus React 19 features (`useEffectEvent`, the
React Compiler runtime's slot caching, `updateContainerSync`). Pinning to
the matching public versions doesn't work cleanly because Ink 5 has a
React 18 peer dep, so layering the React 19 hooks on top creates a chain
of mismatch errors:

- `reconciler.updateContainerSync is not a function` → patched (fall back to `updateContainer` in `src/ink/ink.tsx`)
- `getCurrentEventPriority is not a function` → patched (added stubs to `src/ink/reconciler.ts`)
- `useEffectEvent is not a function` → patched (polyfill in `src/utils/stubs/react-useeffectevent-polyfill.ts` + import-rewrite in `AppState.tsx` / `BackgroundTasksDialog.tsx`)
- `Objects are not valid as a React child` (suspected: React Compiler slot sentinel leaking into children) → **not fixed**

After fixes 1–3, `node dist/cli.mjs` reaches Ink render and emits ANSI
escapes, but throws on the fourth issue before showing a prompt. Two
plausible paths forward:

1. Replace `react/compiler-runtime` stub's sentinel with `null` and hope the
   compiled code tolerates it (each cache slot is checked before write).
2. Switch the dependency tree to React 19 + a forked Ink (or `@inkjs/ink`
   experimental React 19 builds), accepting the larger churn.

For now, **`dist/gemini-chat.mjs` is the supported way to actually use the
fork interactively** — the rendering layer is the only blocker, and it's
sidestepped entirely by the minimal REPL.

## Known limitations

- Prompt caching: Anthropic `cache_control` blocks are stripped (Gemini API has implicit caching only)
- Built-in tools: `computer_use`, `text_editor`, server-side `web_search` (Anthropic-specific) are stripped from the tool list
- Refusal regex matching: `errors.ts` matches Anthropic-shaped error strings; Gemini errors fall to the generic path (UX degraded but functional)
- `claudeAiLimits` rate-limit dashboard is naturally inert (subscriber check is false)
- Vertex AI for Gemini is not wired (use API key or OAuth → Code Assist; Vertex would require additional adapter work)
- `gemini-cli`'s billing / Google One AI credits / `recordCodeAssistMetrics` telemetry / admin-controls / experiments aren't ported — those endpoints are skipped, requests proceed without those features

## Original disclaimer

This repository archives source code that was leaked from Anthropic's npm registry on **2026-03-31**. All original source code is the property of [Anthropic](https://www.anthropic.com).

---

## How It Leaked

[Chaofan Shou (@Fried_rice)](https://x.com/Fried_rice) discovered the leak and posted it publicly:

> **"Claude code source code has been leaked via a map file in their npm registry!"**
>
> — [@Fried_rice, March 31, 2026](https://x.com/Fried_rice/status/2038894956459290963)

The source map file in the published npm package contained a reference to the full, unobfuscated TypeScript source, which was downloadable as a zip archive from Anthropic's R2 storage bucket.

---

## Overview

Claude Code is Anthropic's official CLI tool that lets you interact with Claude directly from the terminal to perform software engineering tasks — editing files, running commands, searching codebases, managing git workflows, and more.

This repository contains the leaked `src/` directory.

- **Leaked on**: 2026-03-31
- **Language**: TypeScript
- **Runtime**: Bun
- **Terminal UI**: React + [Ink](https://github.com/vadimdemedes/ink) (React for CLI)
- **Scale**: ~1,900 files, 512,000+ lines of code

---

## Directory Structure

```
src/
├── main.tsx                 # Entrypoint (Commander.js-based CLI parser)
├── commands.ts              # Command registry
├── tools.ts                 # Tool registry
├── Tool.ts                  # Tool type definitions
├── QueryEngine.ts           # LLM query engine (core Anthropic API caller)
├── context.ts               # System/user context collection
├── cost-tracker.ts          # Token cost tracking
│
├── commands/                # Slash command implementations (~50)
├── tools/                   # Agent tool implementations (~40)
├── components/              # Ink UI components (~140)
├── hooks/                   # React hooks
├── services/                # External service integrations
├── screens/                 # Full-screen UIs (Doctor, REPL, Resume)
├── types/                   # TypeScript type definitions
├── utils/                   # Utility functions
│
├── bridge/                  # IDE integration bridge (VS Code, JetBrains)
├── coordinator/             # Multi-agent coordinator
├── plugins/                 # Plugin system
├── skills/                  # Skill system
├── keybindings/             # Keybinding configuration
├── vim/                     # Vim mode
├── voice/                   # Voice input
├── remote/                  # Remote sessions
├── server/                  # Server mode
├── memdir/                  # Memory directory (persistent memory)
├── tasks/                   # Task management
├── state/                   # State management
├── migrations/              # Config migrations
├── schemas/                 # Config schemas (Zod)
├── entrypoints/             # Initialization logic
├── ink/                     # Ink renderer wrapper
├── buddy/                   # Companion sprite (Easter egg)
├── native-ts/               # Native TypeScript utils
├── outputStyles/            # Output styling
├── query/                   # Query pipeline
└── upstreamproxy/           # Proxy configuration
```

---

## Core Architecture

### 1. Tool System (`src/tools/`)

Every tool Claude Code can invoke is implemented as a self-contained module. Each tool defines its input schema, permission model, and execution logic.

| Tool | Description |
|---|---|
| `BashTool` | Shell command execution |
| `FileReadTool` | File reading (images, PDFs, notebooks) |
| `FileWriteTool` | File creation / overwrite |
| `FileEditTool` | Partial file modification (string replacement) |
| `GlobTool` | File pattern matching search |
| `GrepTool` | ripgrep-based content search |
| `WebFetchTool` | Fetch URL content |
| `WebSearchTool` | Web search |
| `AgentTool` | Sub-agent spawning |
| `SkillTool` | Skill execution |
| `MCPTool` | MCP server tool invocation |
| `LSPTool` | Language Server Protocol integration |
| `NotebookEditTool` | Jupyter notebook editing |
| `TaskCreateTool` / `TaskUpdateTool` | Task creation and management |
| `SendMessageTool` | Inter-agent messaging |
| `TeamCreateTool` / `TeamDeleteTool` | Team agent management |
| `EnterPlanModeTool` / `ExitPlanModeTool` | Plan mode toggle |
| `EnterWorktreeTool` / `ExitWorktreeTool` | Git worktree isolation |
| `ToolSearchTool` | Deferred tool discovery |
| `CronCreateTool` | Scheduled trigger creation |
| `RemoteTriggerTool` | Remote trigger |
| `SleepTool` | Proactive mode wait |
| `SyntheticOutputTool` | Structured output generation |

### 2. Command System (`src/commands/`)

User-facing slash commands invoked with `/` prefix.

| Command | Description |
|---|---|
| `/commit` | Create a git commit |
| `/review` | Code review |
| `/compact` | Context compression |
| `/mcp` | MCP server management |
| `/config` | Settings management |
| `/doctor` | Environment diagnostics |
| `/login` / `/logout` | Authentication |
| `/memory` | Persistent memory management |
| `/skills` | Skill management |
| `/tasks` | Task management |
| `/vim` | Vim mode toggle |
| `/diff` | View changes |
| `/cost` | Check usage cost |
| `/theme` | Change theme |
| `/context` | Context visualization |
| `/pr_comments` | View PR comments |
| `/resume` | Restore previous session |
| `/share` | Share session |
| `/desktop` | Desktop app handoff |
| `/mobile` | Mobile app handoff |

### 3. Service Layer (`src/services/`)

| Service | Description |
|---|---|
| `api/` | Anthropic API client, file API, bootstrap |
| `mcp/` | Model Context Protocol server connection and management |
| `oauth/` | OAuth 2.0 authentication flow |
| `lsp/` | Language Server Protocol manager |
| `analytics/` | GrowthBook-based feature flags and analytics |
| `plugins/` | Plugin loader |
| `compact/` | Conversation context compression |
| `policyLimits/` | Organization policy limits |
| `remoteManagedSettings/` | Remote managed settings |
| `extractMemories/` | Automatic memory extraction |
| `tokenEstimation.ts` | Token count estimation |
| `teamMemorySync/` | Team memory synchronization |

### 4. Bridge System (`src/bridge/`)

A bidirectional communication layer connecting IDE extensions (VS Code, JetBrains) with the Claude Code CLI.

- `bridgeMain.ts` — Bridge main loop
- `bridgeMessaging.ts` — Message protocol
- `bridgePermissionCallbacks.ts` — Permission callbacks
- `replBridge.ts` — REPL session bridge
- `jwtUtils.ts` — JWT-based authentication
- `sessionRunner.ts` — Session execution management

### 5. Permission System (`src/hooks/toolPermission/`)

Checks permissions on every tool invocation. Either prompts the user for approval/denial or automatically resolves based on the configured permission mode (`default`, `plan`, `bypassPermissions`, `auto`, etc.).

### 6. Feature Flags

Dead code elimination via Bun's `bun:bundle` feature flags:

```typescript
import { feature } from 'bun:bundle'

// Inactive code is completely stripped at build time
const voiceCommand = feature('VOICE_MODE')
  ? require('./commands/voice/index.js').default
  : null
```

Notable flags: `PROACTIVE`, `KAIROS`, `BRIDGE_MODE`, `DAEMON`, `VOICE_MODE`, `AGENT_TRIGGERS`, `MONITOR_TOOL`

---

## Key Files in Detail

### `QueryEngine.ts` (~46K lines)

The core engine for LLM API calls. Handles streaming responses, tool-call loops, thinking mode, retry logic, and token counting.

### `Tool.ts` (~29K lines)

Defines base types and interfaces for all tools — input schemas, permission models, and progress state types.

### `commands.ts` (~25K lines)

Manages registration and execution of all slash commands. Uses conditional imports to load different command sets per environment.

### `main.tsx`

Commander.js-based CLI parser + React/Ink renderer initialization. At startup, parallelizes MDM settings, keychain prefetch, and GrowthBook initialization for faster boot.

---

## Tech Stack

| Category | Technology |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript (strict) |
| Terminal UI | [React](https://react.dev) + [Ink](https://github.com/vadimdemedes/ink) |
| CLI Parsing | [Commander.js](https://github.com/tj/commander.js) (extra-typings) |
| Schema Validation | [Zod v4](https://zod.dev) |
| Code Search | [ripgrep](https://github.com/BurntSushi/ripgrep) (via GrepTool) |
| Protocols | [MCP SDK](https://modelcontextprotocol.io), LSP |
| API | [Anthropic SDK](https://docs.anthropic.com) |
| Telemetry | OpenTelemetry + gRPC |
| Feature Flags | GrowthBook |
| Auth | OAuth 2.0, JWT, macOS Keychain |

---

## Notable Design Patterns

### Parallel Prefetch

Startup time is optimized by prefetching MDM settings, keychain reads, and API preconnect in parallel — before heavy module evaluation begins.

```typescript
// main.tsx — fired as side-effects before other imports
startMdmRawRead()
startKeychainPrefetch()
```

### Lazy Loading

Heavy modules (OpenTelemetry ~400KB, gRPC ~700KB) are deferred via dynamic `import()` until actually needed.

### Agent Swarms

Sub-agents are spawned via `AgentTool`, with `coordinator/` handling multi-agent orchestration. `TeamCreateTool` enables team-level parallel work.

### Skill System

Reusable workflows defined in `skills/` and executed through `SkillTool`. Users can add custom skills.

### Plugin Architecture

Built-in and third-party plugins are loaded through the `plugins/` subsystem.

---

## Disclaimer

This repository archives source code that was leaked from Anthropic's npm registry on **2026-03-31**. All original source code is the property of [Anthropic](https://www.anthropic.com).

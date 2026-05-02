// Flow implementations imported by claude-cli-entry.ts. Kept in a separate
// file so the entry can lazy-load — login/logout don't need the chat
// machinery and vice versa, which keeps each path's startup time low even
// though they all share one bundle.

import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import * as path from 'node:path'
import readline from 'node:readline'

import { GeminiAnthropicAdapter } from '../src/services/api/gemini-adapter/index.js'
import { loadApiKey } from '../src/services/auth/gemini/apiKey.js'
import {
  loginWithGoogle,
  logout as oauthLogout,
} from '../src/services/auth/gemini/oauth.js'
import { getOauthClient } from '../src/services/auth/gemini/index.js'
import {
  DEFAULT_GEMINI_MODEL,
  mapModelName,
} from '../src/services/api/gemini-adapter/modelMap.js'

// ─────────────────────────────────────────────────────────────────────────
// login

export async function runLogin(): Promise<void> {
  process.stdout.write('Starting Google OAuth flow for Gemini...\n')
  const result = await loginWithGoogle({
    onUrlReady(url: string) {
      process.stdout.write(
        `\nIf the browser doesn't open automatically, visit:\n\n  ${url}\n\n`,
      )
    },
    async openUrl(url: string) {
      try {
        const { spawn } = await import('node:child_process')
        const cmd =
          process.platform === 'darwin'
            ? 'open'
            : process.platform === 'win32'
              ? 'cmd'
              : 'xdg-open'
        const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
        spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
      } catch {
        // Browser open failed — user can paste the URL printed above.
      }
    },
  })

  if (result.access_token) {
    process.stdout.write(
      'Authentication successful. Credentials saved to ~/.gemini/oauth_creds.json\n',
    )
    process.exit(0)
  }
  process.stderr.write('Authentication failed.\n')
  process.exit(1)
}

// ─────────────────────────────────────────────────────────────────────────
// logout

export async function runLogout(): Promise<void> {
  await oauthLogout()
  // Also remove the API-key file and the Code Assist project cache so a fresh
  // login can re-onboard cleanly.
  for (const file of ['.api_key', 'code_assist_user.json']) {
    try {
      await fs.rm(path.join(homedir(), '.gemini', file), { force: true })
    } catch {
      /* best-effort */
    }
  }
  process.stdout.write('Logged out. Cleared ~/.gemini/{oauth_creds.json,.api_key,code_assist_user.json}.\n')
  process.exit(0)
}

// ─────────────────────────────────────────────────────────────────────────
// chat REPL (mirrors gemini-chat-entry.ts; lifted here so a single bundle
// covers all subcommands)

type Msg = { role: 'user' | 'assistant'; content: string }

async function makeAdapter(): Promise<GeminiAnthropicAdapter> {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    (await loadApiKey())
  if (apiKey) {
    return new GeminiAnthropicAdapter({ apiKey })
  }
  const oauthClient = await getOauthClient()
  if (oauthClient) {
    return new GeminiAnthropicAdapter({ oauthClient })
  }
  process.stderr.write(
    'No Gemini credentials found.\n' +
      '  Either set GEMINI_API_KEY=... or run `claude-cli login` first.\n',
  )
  process.exit(2)
}

function parseChatArgs(): { model: string; system?: string } {
  const argv = process.argv.slice(2)
  let model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
  let system: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--model' && argv[i + 1]) {
      model = mapModelName(argv[++i])
    } else if (a === '--system' && argv[i + 1]) {
      system = argv[++i]
    }
  }
  return { model, system }
}

export async function runChat(): Promise<void> {
  const { model: initialModel, system: initialSystem } = parseChatArgs()
  let model = initialModel
  let system = initialSystem
  let messages: Msg[] = []
  const adapter = await makeAdapter()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '› ',
    terminal: process.stdin.isTTY,
  })

  process.stdout.write(
    `claude-cli — model=${model}${system ? ' (system prompt set)' : ''}\n` +
      `type /help for commands, /exit to quit, Ctrl+D to send EOF.\n\n`,
  )
  rl.prompt()

  let currentAbort: AbortController | null = null
  process.on('SIGINT', () => {
    if (currentAbort) {
      currentAbort.abort()
      currentAbort = null
      process.stdout.write('\n[cancelled]\n')
    } else {
      process.stdout.write('\n(use /exit or Ctrl+D to quit)\n')
      rl.prompt()
    }
  })

  rl.on('close', () => {
    process.stdout.write('\n')
    process.exit(0)
  })

  for await (const raw of rl) {
    const line = raw.trim()
    if (!line) {
      rl.prompt()
      continue
    }

    if (line.startsWith('/')) {
      const [cmd, ...rest] = line.slice(1).split(/\s+/)
      const arg = rest.join(' ').trim()
      switch (cmd) {
        case 'exit':
        case 'quit':
          rl.close()
          return
        case 'clear':
          messages = []
          process.stdout.write('[conversation cleared]\n')
          break
        case 'model':
          if (arg) {
            model = mapModelName(arg)
            process.stdout.write(`[model = ${model}]\n`)
          } else {
            process.stdout.write(`[model = ${model}]\n`)
          }
          break
        case 'system':
          system = arg.replace(/^"|"$/g, '') || undefined
          process.stdout.write(
            system ? '[system prompt set]\n' : '[system prompt cleared]\n',
          )
          break
        case 'help':
          process.stdout.write(
            '/exit | /quit       quit\n' +
              '/clear              drop conversation history\n' +
              '/model NAME         switch model (e.g. gemini-2.0-flash)\n' +
              '/system "TEXT"      replace system prompt\n' +
              '/help               this message\n',
          )
          break
        default:
          process.stdout.write(`[unknown command: /${cmd}]\n`)
      }
      rl.prompt()
      continue
    }

    messages.push({ role: 'user', content: line })

    currentAbort = new AbortController()
    let assistantText = ''
    try {
      const stream = await (
        adapter as unknown as {
          beta: {
            messages: {
              create(p: unknown, o: unknown): Promise<{
                withResponse(): Promise<{
                  data: AsyncIterable<unknown>
                  request_id: string
                }>
              }>
            }
          }
        }
      ).beta.messages.create(
        {
          model,
          max_tokens: 8192,
          messages,
          ...(system ? { system } : {}),
          stream: true,
        },
        { signal: currentAbort.signal },
      )

      const { data } = await stream.withResponse()
      process.stdout.write('\n')
      for await (const ev of data as AsyncIterable<{
        type: string
        delta?: { type?: string; text?: string }
      }>) {
        if (
          ev.type === 'content_block_delta' &&
          ev.delta?.type === 'text_delta' &&
          typeof ev.delta.text === 'string'
        ) {
          process.stdout.write(ev.delta.text)
          assistantText += ev.delta.text
        }
      }
      process.stdout.write('\n\n')
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string }
      if (e.name === 'APIUserAbortError' || e.name === 'AbortError') {
        // Already printed [cancelled] in SIGINT handler.
      } else {
        process.stdout.write('\n')
        process.stderr.write(`[error] ${e.message ?? String(err)}\n`)
      }
    } finally {
      currentAbort = null
    }

    messages.push({ role: 'assistant', content: assistantText })
    rl.prompt()
  }
}

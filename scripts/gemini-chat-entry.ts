// Standalone minimal REPL for the Gemini fork.
//
// Sidesteps the leaked Claude Code REPL entirely (Ink/React/Yoga/plugins/MCP
// — most of which fights React-version mismatches in this fork). All we need
// to actually use Gemini is: read a line, send it through the adapter, stream
// the response back to stdout. This file is the whole REPL.
//
// Usage:
//   GEMINI_API_KEY=... node dist/gemini-chat.mjs
//   GEMINI_API_KEY=... node dist/gemini-chat.mjs --model gemini-2.5-flash
//   (or after `node dist/gemini-login.mjs`)
//   node dist/gemini-chat.mjs
//
// Slash commands inside the REPL:
//   /exit, /quit   exit
//   /clear         drop conversation history
//   /model X       switch model for this session
//   /system "X"    set/replace system prompt
//   /help          list commands

import readline from 'node:readline'
import { GeminiAnthropicAdapter } from '../src/services/api/gemini-adapter/index.js'
import { loadApiKey } from '../src/services/auth/gemini/apiKey.js'
import { getOauthClient } from '../src/services/auth/gemini/index.js'
import { DEFAULT_GEMINI_MODEL, mapModelName } from '../src/services/api/gemini-adapter/modelMap.js'

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
  console.error(
    'No Gemini credentials found.\n' +
      '  Either set GEMINI_API_KEY=...\n' +
      '  or run `node dist/gemini-login.mjs` first to log in with Google.',
  )
  process.exit(2)
}

function parseArgs(): { model: string; system?: string } {
  const argv = process.argv.slice(2)
  let model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
  let system: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--model' && argv[i + 1]) {
      model = mapModelName(argv[++i])
    } else if (a === '--system' && argv[i + 1]) {
      system = argv[++i]
    } else if (a === '-h' || a === '--help') {
      console.log('Usage: node dist/gemini-chat.mjs [--model NAME] [--system "PROMPT"]')
      process.exit(0)
    }
  }
  return { model, system }
}

async function run(): Promise<void> {
  const { model: initialModel, system: initialSystem } = parseArgs()
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

  console.log(
    `gemini-chat — model=${model}${system ? ' (custom system prompt)' : ''}\n` +
      `type /help for commands, /exit to quit, Ctrl+D to send EOF.\n`,
  )
  rl.prompt()

  // Track in-flight abort so Ctrl+C cancels the current stream rather than
  // the whole process.
  let currentAbort: AbortController | null = null
  process.on('SIGINT', () => {
    if (currentAbort) {
      currentAbort.abort()
      currentAbort = null
      process.stdout.write('\n[cancelled]\n')
    } else {
      console.log('\n(use /exit or Ctrl+D to quit)')
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
          console.log('[conversation cleared]')
          break
        case 'model':
          if (arg) {
            model = mapModelName(arg)
            console.log(`[model = ${model}]`)
          } else {
            console.log(`[model = ${model}]`)
          }
          break
        case 'system':
          system = arg.replace(/^"|"$/g, '') || undefined
          console.log(system ? `[system prompt set]` : `[system prompt cleared]`)
          break
        case 'help':
          console.log(
            '/exit | /quit       quit\n' +
              '/clear              drop conversation history\n' +
              '/model NAME         switch model (e.g. gemini-2.0-flash)\n' +
              '/system "TEXT"      replace system prompt\n' +
              '/help               this message',
          )
          break
        default:
          console.log(`[unknown command: /${cmd}]`)
      }
      rl.prompt()
      continue
    }

    messages.push({ role: 'user', content: line })

    currentAbort = new AbortController()
    let assistantText = ''
    try {
      const stream = await (adapter as unknown as {
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
      }).beta.messages.create(
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
        delta?: { type?: string; text?: string; thinking?: string }
        content_block?: { type?: string; text?: string }
      }>) {
        if (
          ev.type === 'content_block_delta' &&
          ev.delta?.type === 'text_delta' &&
          typeof ev.delta.text === 'string'
        ) {
          process.stdout.write(ev.delta.text)
          assistantText += ev.delta.text
        }
        // (thinking_delta intentionally suppressed — we don't show chain-of-thought
        // in the minimal REPL. Extend here later if you want it.)
      }
      process.stdout.write('\n\n')
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string }
      if (e.name === 'APIUserAbortError' || e.name === 'AbortError') {
        // Already printed [cancelled] in the SIGINT handler.
      } else {
        process.stdout.write('\n')
        console.error(`[error] ${e.message ?? String(err)}`)
      }
    } finally {
      currentAbort = null
    }

    messages.push({ role: 'assistant', content: assistantText })
    rl.prompt()
  }
}

run().catch((err: unknown) => {
  console.error('Fatal:', err instanceof Error ? err.stack : String(err))
  process.exit(1)
})

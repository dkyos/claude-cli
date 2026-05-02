// Unified `claude-cli` entry point for `npm link` global install.
//
// Subcommand dispatch:
//   claude-cli                   → start chat REPL (default)
//   claude-cli chat [opts]       → same as bare invocation
//   claude-cli login             → run Google OAuth flow
//   claude-cli logout            → delete saved credentials
//   claude-cli --help, -h        → usage
//   claude-cli --version, -v     → version
//
// Pass-through options for `chat` (also accepted on bare invocation):
//   --model NAME    pick Gemini model (default gemini-2.5-pro)
//   --system TEXT   set initial system prompt
//
// Auth resolves in this order: GEMINI_API_KEY env, GOOGLE_API_KEY env,
// ~/.gemini/.api_key file, ~/.gemini/oauth_creds.json (Code Assist).

const VERSION = '0.0.1-fork'

function printUsage(): void {
  process.stdout.write(
    `Usage: claude-cli [SUBCOMMAND] [OPTIONS]\n` +
      `\n` +
      `Subcommands:\n` +
      `  chat               Start interactive chat (default if no subcommand)\n` +
      `  login              Sign in with Google (writes ~/.gemini/oauth_creds.json)\n` +
      `  logout             Remove saved credentials\n` +
      `\n` +
      `Chat options (apply to bare invocation or 'chat'):\n` +
      `  --model NAME       Gemini model (default: gemini-2.5-pro)\n` +
      `  --system "TEXT"    Initial system prompt\n` +
      `\n` +
      `Global:\n` +
      `  -h, --help         Show this help\n` +
      `  -v, --version      Show version\n` +
      `\n` +
      `Examples:\n` +
      `  claude-cli login\n` +
      `  claude-cli\n` +
      `  claude-cli --model gemini-2.0-flash\n` +
      `  GEMINI_API_KEY=AIza... claude-cli\n`,
  )
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const sub = argv[0]

  if (sub === '-h' || sub === '--help') {
    printUsage()
    process.exit(0)
  }
  if (sub === '-v' || sub === '--version') {
    process.stdout.write(`claude-cli ${VERSION}\n`)
    process.exit(0)
  }

  if (sub === 'login') {
    const { runLogin } = await import('./claude-cli-flows.js')
    await runLogin()
    return
  }

  if (sub === 'logout') {
    const { runLogout } = await import('./claude-cli-flows.js')
    await runLogout()
    return
  }

  // 'chat' subcommand or no subcommand → chat. Strip the literal 'chat'
  // arg if present so downstream argv parsing sees only options.
  if (sub === 'chat') {
    process.argv = [process.argv[0]!, process.argv[1]!, ...argv.slice(1)]
  }
  const { runChat } = await import('./claude-cli-flows.js')
  await runChat()
}

main().catch((err: unknown) => {
  process.stderr.write(
    `Fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  )
  process.exit(1)
})

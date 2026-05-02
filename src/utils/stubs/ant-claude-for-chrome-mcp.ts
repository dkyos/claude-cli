// Stub for @ant/claude-for-chrome-mcp. The Chrome bridge MCP server isn't
// shipped with this fork.

export type ClaudeForChromeContext = any
export type Logger = any
export type PermissionMode = 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions' | string

export const BROWSER_TOOLS: any[] = []

export const createClaudeForChromeMcpServer: any = (..._args: unknown[]): never => {
  throw new Error('@ant/claude-for-chrome-mcp is not bundled in the Gemini fork')
}

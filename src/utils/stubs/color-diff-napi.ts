// Stub for color-diff-napi. The original is a Rust NAPI binding that powers
// syntax-highlighted diff rendering in the Ink UI. The fork falls back to
// plain text — set CLAUDE_CODE_SYNTAX_HIGHLIGHT=false (the existing env-gate)
// to make the higher layer skip these calls; the stubs below are reached only
// if that gate is bypassed and they explicitly throw so failures are visible.

export type SyntaxTheme = any

export class ColorDiff {
  constructor(..._args: unknown[]) {}
  static diff(..._args: unknown[]): never {
    throw new Error('color-diff-napi.ColorDiff is not bundled in the Gemini fork')
  }
  diff(..._args: unknown[]): never {
    throw new Error('color-diff-napi.ColorDiff is not bundled in the Gemini fork')
  }
}

export class ColorFile {
  constructor(..._args: unknown[]) {}
  static highlight(..._args: unknown[]): never {
    throw new Error('color-diff-napi.ColorFile is not bundled in the Gemini fork')
  }
  highlight(..._args: unknown[]): never {
    throw new Error('color-diff-napi.ColorFile is not bundled in the Gemini fork')
  }
}

export function getSyntaxTheme(_themeName: string): SyntaxTheme | null {
  return null
}

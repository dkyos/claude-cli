// Replacement for `bun:bundle`. The original Anthropic build uses a Bun bundler
// plugin to inline `feature('NAME')` as a compile-time boolean derived from the
// build target. Without that plugin we fall back to environment lookup at
// runtime: CLAUDE_FEATURE_<NAME>=true|1 enables a flag, anything else is false.
//
// Default for every flag is false so the fork starts in a minimal mode and
// optional features can be turned on case-by-case via env vars.

export function feature(name: string): boolean {
  const key = `CLAUDE_FEATURE_${name}`
  const v = process.env[key]
  if (v === undefined) return false
  return v === '1' || v.toLowerCase() === 'true'
}

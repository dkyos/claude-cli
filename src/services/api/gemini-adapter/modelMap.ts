// Maps Anthropic model strings (which the codebase passes through everywhere)
// to Gemini model names. Anything starting with `gemini-` passes through.
// Aliases like 'sonnet'/'opus'/'haiku' map to a current-generation Gemini
// equivalent — best-effort tier matching: Opus → 2.5-pro (most capable),
// Sonnet → 2.5-pro / 2.0-flash mid-tier, Haiku → 2.0-flash (fast/cheap).

const ALIAS_MAP: Record<string, string> = {
  // Bare aliases as users might type
  'opus': 'gemini-2.5-pro',
  'sonnet': 'gemini-2.5-pro',
  'haiku': 'gemini-2.0-flash',
  // Current Anthropic concrete names
  'claude-opus-4-7': 'gemini-2.5-pro',
  'claude-opus-4-7[1m]': 'gemini-2.5-pro',
  'claude-opus-4-6': 'gemini-2.5-pro',
  'claude-sonnet-4-6': 'gemini-2.5-pro',
  'claude-sonnet-4-5': 'gemini-2.5-pro',
  'claude-haiku-4-5': 'gemini-2.0-flash',
  'claude-haiku-4-5-20251001': 'gemini-2.0-flash',
  'claude-3-5-haiku-20241022': 'gemini-2.0-flash',
  'claude-3-5-sonnet-20241022': 'gemini-2.5-pro',
  'claude-3-5-sonnet-latest': 'gemini-2.5-pro',
  'claude-3-7-sonnet-20250219': 'gemini-2.5-pro',
  'claude-3-7-sonnet-latest': 'gemini-2.5-pro',
}

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro'

export function mapModelName(model: string | undefined): string {
  if (!model) return DEFAULT_GEMINI_MODEL
  if (model.startsWith('gemini-')) return model
  if (ALIAS_MAP[model]) return ALIAS_MAP[model]
  // Heuristic for unknown anthropic model strings
  if (model.includes('haiku')) return 'gemini-2.0-flash'
  if (model.includes('opus') || model.includes('sonnet')) return 'gemini-2.5-pro'
  return DEFAULT_GEMINI_MODEL
}

// Reasonable defaults so unknown gemini models still pass token-limit checks
// in the existing modelCapabilities/cost code paths.
export function listSupportedGeminiModels(): Array<{
  id: string
  display_name: string
  type: 'model'
  created_at: string
}> {
  return [
    { id: 'gemini-2.5-pro', display_name: 'Gemini 2.5 Pro', type: 'model', created_at: '2026-01-01T00:00:00Z' },
    { id: 'gemini-2.5-flash', display_name: 'Gemini 2.5 Flash', type: 'model', created_at: '2026-01-01T00:00:00Z' },
    { id: 'gemini-2.0-flash', display_name: 'Gemini 2.0 Flash', type: 'model', created_at: '2025-02-01T00:00:00Z' },
    { id: 'gemini-2.0-flash-lite', display_name: 'Gemini 2.0 Flash-Lite', type: 'model', created_at: '2025-02-01T00:00:00Z' },
  ]
}

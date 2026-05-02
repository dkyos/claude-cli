// Converts Anthropic tool definitions into Gemini FunctionDeclaration[].
//
// The leaked Claude codebase passes tools as a heterogeneous array: most are
// plain `{name, description, input_schema}` (translatable), but a few are
// server-side built-ins like `{type: 'computer_20241022'}` or
// `{type: 'text_editor_20250728'}`. Gemini doesn't know about them — we strip
// them silently. Higher layers detect "tool exists locally" via the tool
// registry, not via what the model echoes back, so dropping the definition
// just means the model won't propose them.

import type { FunctionDeclaration, Tool as GeminiTool } from '@google/genai'

type AnthropicCustomTool = {
  name: string
  description?: string
  input_schema: Record<string, unknown>
  cache_control?: unknown
}

type AnthropicToolUnion = AnthropicCustomTool | { type: string; [k: string]: unknown }

function isCustomTool(t: AnthropicToolUnion): t is AnthropicCustomTool {
  // Heuristic: server-side built-ins always have `type` + a lacking
  // input_schema. Custom tools always have `name` + `input_schema`.
  return typeof (t as AnthropicCustomTool).input_schema === 'object'
    && typeof (t as AnthropicCustomTool).name === 'string'
}

export function translateTools(
  tools: AnthropicToolUnion[] | undefined,
): GeminiTool[] | undefined {
  if (!tools || tools.length === 0) return undefined
  const fns: FunctionDeclaration[] = []
  for (const t of tools) {
    if (!isCustomTool(t)) continue
    fns.push({
      name: t.name,
      description: t.description ?? '',
      parametersJsonSchema: t.input_schema,
    })
  }
  if (fns.length === 0) return undefined
  return [{ functionDeclarations: fns }]
}

export type AnthropicToolChoice =
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'tool'; name: string }
  | { type: 'none' }
  | undefined

export function translateToolChoice(choice: AnthropicToolChoice): {
  toolConfig?: { functionCallingConfig: { mode: 'AUTO' | 'ANY' | 'NONE'; allowedFunctionNames?: string[] } }
} {
  if (!choice) return {}
  switch (choice.type) {
    case 'auto':
      return { toolConfig: { functionCallingConfig: { mode: 'AUTO' } } }
    case 'any':
      return { toolConfig: { functionCallingConfig: { mode: 'ANY' } } }
    case 'tool':
      return {
        toolConfig: {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: [choice.name],
          },
        },
      }
    case 'none':
      return { toolConfig: { functionCallingConfig: { mode: 'NONE' } } }
    default:
      return {}
  }
}

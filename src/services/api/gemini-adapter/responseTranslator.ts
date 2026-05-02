// Translates a Gemini GenerateContentResponse into an Anthropic BetaMessage.
//
// Both shapes encode "an assistant turn", but the field layouts are very
// different. Notable transforms:
//   - candidates[0].content.parts is a heterogeneous list (text, functionCall,
//     thought) → Anthropic content_block list.
//   - usageMetadata → Anthropic usage; cachedContentTokenCount maps to
//     cache_read_input_tokens, cache creation has no Gemini equivalent.
//   - finishReason → stop_reason via stopReasonMap.

import type { GenerateContentResponse } from '@google/genai'
import { randomUUID } from 'crypto'
import { mapFinishReason } from './stopReasonMap.js'

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'thinking'; thinking: string; signature: string }

export type AnthropicBetaMessage = {
  id: string
  type: 'message'
  role: 'assistant'
  content: AnthropicContentBlock[]
  model: string
  stop_reason: ReturnType<typeof mapFinishReason>
  stop_sequence: string | null
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens: number | null
    cache_read_input_tokens: number | null
    server_tool_use?: null
    service_tier?: 'standard' | null
  }
}

export function translateResponse(
  resp: GenerateContentResponse,
  modelName: string,
): AnthropicBetaMessage {
  const candidate = resp.candidates?.[0]
  const parts = candidate?.content?.parts ?? []
  const blocks: AnthropicContentBlock[] = []
  let hasToolUse = false

  for (const p of parts as Array<Record<string, unknown>>) {
    if (p.functionCall) {
      const fc = p.functionCall as { name: string; args?: Record<string, unknown>; id?: string }
      blocks.push({
        type: 'tool_use',
        id: fc.id ?? `toolu_${randomUUID().replace(/-/g, '')}`,
        name: fc.name,
        input: fc.args ?? {},
      })
      hasToolUse = true
      continue
    }
    if (p.thought === true && typeof p.text === 'string') {
      blocks.push({
        type: 'thinking',
        thinking: p.text,
        signature: typeof p.thoughtSignature === 'string' ? p.thoughtSignature : '',
      })
      continue
    }
    if (typeof p.text === 'string') {
      blocks.push({ type: 'text', text: p.text })
      continue
    }
    // inlineData / fileData / executableCode parts: Anthropic has no place to
    // surface them in an assistant message — skip silently.
  }

  if (blocks.length === 0) {
    blocks.push({ type: 'text', text: '' })
  }

  const usage = resp.usageMetadata ?? {}
  const inputTokens = usage.promptTokenCount ?? 0
  const outputTokens = usage.candidatesTokenCount ?? 0
  const cachedTokens = (usage as { cachedContentTokenCount?: number }).cachedContentTokenCount ?? 0

  return {
    id: `msg_${randomUUID().replace(/-/g, '')}`,
    type: 'message',
    role: 'assistant',
    content: blocks,
    model: modelName,
    stop_reason: mapFinishReason(candidate?.finishReason as string | undefined, hasToolUse),
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: cachedTokens,
      server_tool_use: null,
      service_tier: 'standard',
    },
  }
}

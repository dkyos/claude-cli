// Converts Anthropic MessageParam[] to Gemini Content[].
//
// Role mapping: Anthropic 'assistant' → Gemini 'model', 'user' stays.
// Block mapping:
//   text         → { text }
//   tool_use     → { functionCall: { name, args } }
//   tool_result  → { functionResponse: { name, response } } (in user turn)
//   image        → { inlineData: { mimeType, data } }
//   thinking     → { thought: true, text, thoughtSignature? }  (echoed back)
//   redacted_thinking → stripped (Gemini has no equivalent)
//
// cache_control fields are silently dropped on every block.
//
// tool_result.content can be `string` or a list of ContentBlock — when it
// includes nested image blocks we extract them into separate inlineData parts
// alongside the functionResponse so the model can see them.

import type { Content, Part } from '@google/genai'

type CacheControl = { type: 'ephemeral'; ttl?: '5m' | '1h' }

type TextBlock = { type: 'text'; text: string; cache_control?: CacheControl }
type ImageSource =
  | { type: 'base64'; media_type: string; data: string }
  | { type: 'url'; url: string }
type ImageBlock = { type: 'image'; source: ImageSource; cache_control?: CacheControl }
type ToolUseBlock = { type: 'tool_use'; id: string; name: string; input: unknown; cache_control?: CacheControl }
type ToolResultBlock = {
  type: 'tool_result'
  tool_use_id: string
  content?: string | Array<TextBlock | ImageBlock>
  is_error?: boolean
  cache_control?: CacheControl
}
type ThinkingBlock = { type: 'thinking'; thinking: string; signature?: string }
type RedactedThinkingBlock = { type: 'redacted_thinking'; data: string }
type DocumentBlock = { type: 'document'; [k: string]: unknown }

type ContentBlock =
  | TextBlock
  | ImageBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | RedactedThinkingBlock
  | DocumentBlock
  | { type: string; [k: string]: unknown }

type MessageParam = {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

// Track tool_use ids → name across the conversation so tool_result blocks
// (which only carry tool_use_id) can be rebound to the function name Gemini
// expects on the response.
function buildToolNameIndex(messages: MessageParam[]): Map<string, string> {
  const idx = new Map<string, string>()
  for (const m of messages) {
    if (typeof m.content === 'string') continue
    for (const block of m.content) {
      if (block.type === 'tool_use') {
        const tu = block as ToolUseBlock
        idx.set(tu.id, tu.name)
      }
    }
  }
  return idx
}

function imageBlockToInlineData(block: ImageBlock): Part {
  const src = block.source
  if (src.type === 'base64') {
    return { inlineData: { mimeType: src.media_type, data: src.data } }
  }
  // url-typed image — Gemini doesn't accept URLs directly. Defer fetching to
  // the caller; for now emit a text placeholder so the bundle compiles.
  return { text: `[image: ${src.url}]` }
}

function textBlockToPart(block: TextBlock): Part {
  return { text: block.text }
}

function thinkingBlockToPart(block: ThinkingBlock): Part {
  return {
    thought: true,
    text: block.thinking,
    ...(block.signature ? { thoughtSignature: block.signature } : {}),
  } as Part
}

function toolUseBlockToPart(block: ToolUseBlock): Part {
  return {
    functionCall: {
      name: block.name,
      args: (block.input ?? {}) as Record<string, unknown>,
      // Anthropic's tool_use.id is opaque on the wire; Gemini accepts an `id`
      // field on functionCall when present so we forward it. Older Gemini
      // models ignore unknown fields harmlessly.
      id: block.id,
    },
  } as Part
}

function toolResultBlockToParts(
  block: ToolResultBlock,
  toolNameIndex: Map<string, string>,
): Part[] {
  const name = toolNameIndex.get(block.tool_use_id) ?? block.tool_use_id
  const parts: Part[] = []
  let textContent = ''
  if (typeof block.content === 'string') {
    textContent = block.content
  } else if (Array.isArray(block.content)) {
    for (const inner of block.content) {
      if (inner.type === 'text') {
        textContent += (textContent ? '\n' : '') + (inner as TextBlock).text
      } else if (inner.type === 'image') {
        parts.push(imageBlockToInlineData(inner as ImageBlock))
      }
    }
  }
  parts.unshift({
    functionResponse: {
      name,
      // Gemini wants an object response — wrap raw text under `output`.
      response: block.is_error
        ? { error: textContent || 'tool error' }
        : { output: textContent },
      id: block.tool_use_id,
    },
  } as Part)
  return parts
}

export function translateMessages(messages: MessageParam[]): Content[] {
  const idx = buildToolNameIndex(messages)
  const out: Content[] = []
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user'
    if (typeof m.content === 'string') {
      out.push({ role, parts: [{ text: m.content }] })
      continue
    }
    const parts: Part[] = []
    for (const block of m.content) {
      switch (block.type) {
        case 'text':
          parts.push(textBlockToPart(block as TextBlock))
          break
        case 'image':
          parts.push(imageBlockToInlineData(block as ImageBlock))
          break
        case 'tool_use':
          parts.push(toolUseBlockToPart(block as ToolUseBlock))
          break
        case 'tool_result':
          parts.push(...toolResultBlockToParts(block as ToolResultBlock, idx))
          break
        case 'thinking':
          parts.push(thinkingBlockToPart(block as ThinkingBlock))
          break
        case 'redacted_thinking':
          // strip — no Gemini equivalent
          break
        default:
          // Unknown block: best-effort serialize as JSON text so we don't lose
          // information silently.
          parts.push({ text: JSON.stringify(block) })
      }
    }
    if (parts.length === 0) {
      parts.push({ text: '' })
    }
    out.push({ role, parts })
  }
  return out
}

export function translateSystemPrompt(
  system: string | Array<{ type: 'text'; text: string; cache_control?: CacheControl }> | undefined,
): Content | undefined {
  if (!system) return undefined
  if (typeof system === 'string') {
    if (!system.trim()) return undefined
    return { role: 'user', parts: [{ text: system }] }
  }
  const text = system
    .filter((b) => b && b.type === 'text')
    .map((b) => b.text)
    .filter((s) => s && s.trim().length > 0)
    .join('\n\n')
  if (!text) return undefined
  return { role: 'user', parts: [{ text }] }
}

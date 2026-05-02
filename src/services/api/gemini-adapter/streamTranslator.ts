// Phase 2 implementation. Translates Gemini's AsyncGenerator<GenerateContentResponse>
// into the Anthropic Stream<BetaRawMessageStreamEvent> shape that
// `claude.ts` consumes.
//
// Event sequence we synthesize:
//   1. message_start                     (synthetic, with empty usage)
//   2. for each text part chunk:
//        content_block_start (first time only) → content_block_delta(text_delta) → ...
//        content_block_stop (when part finalizes / replaced)
//   3. for each functionCall part:
//        content_block_start (tool_use, input is the COMPLETED object) →
//        content_block_stop (no delta — Gemini delivers full args at once)
//      claude.ts:2087 has been patched to accept input-as-object so we don't
//      need to fake the partial JSON byte stream.
//   4. for each thought part chunk:
//        content_block_start (thinking) → content_block_delta(thinking_delta) → stop
//   5. message_delta (stop_reason, usage)
//   6. message_stop

import type { GenerateContentResponse } from '@google/genai'
import { randomUUID } from 'crypto'
import { mapFinishReason } from './stopReasonMap.js'

type StreamEvent =
  | { type: 'message_start'; message: Record<string, unknown> }
  | {
      type: 'content_block_start'
      index: number
      content_block:
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: unknown }
        | { type: 'thinking'; thinking: string; signature: string }
    }
  | {
      type: 'content_block_delta'
      index: number
      delta:
        | { type: 'text_delta'; text: string }
        | { type: 'thinking_delta'; thinking: string }
        | { type: 'signature_delta'; signature: string }
    }
  | { type: 'content_block_stop'; index: number }
  | {
      type: 'message_delta'
      delta: { stop_reason: string | null; stop_sequence: string | null }
      usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
    }
  | { type: 'message_stop' }

export class GeminiStreamAdapter implements AsyncIterable<StreamEvent> {
  readonly controller = new AbortController()

  constructor(
    private readonly source: AsyncGenerator<GenerateContentResponse>,
    private readonly modelName: string,
  ) {}

  async *[Symbol.asyncIterator](): AsyncGenerator<StreamEvent> {
    const messageId = `msg_${randomUUID().replace(/-/g, '')}`
    yield {
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: this.modelName,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
    }

    let nextIndex = 0
    let openTextIndex: number | null = null
    let openThinkingIndex: number | null = null
    let hasToolUse = false
    let lastFinishReason: string | undefined
    let lastUsage: GenerateContentResponse['usageMetadata'] | undefined

    for await (const chunk of this.source) {
      if (this.controller.signal.aborted) {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      }
      const candidate = chunk.candidates?.[0]
      const parts = candidate?.content?.parts ?? []
      lastFinishReason = (candidate?.finishReason as string | undefined) ?? lastFinishReason
      lastUsage = chunk.usageMetadata ?? lastUsage

      for (const p of parts as Array<Record<string, unknown>>) {
        // functionCall — emit start+stop in the same step.
        if (p.functionCall) {
          if (openTextIndex !== null) {
            yield { type: 'content_block_stop', index: openTextIndex }
            openTextIndex = null
          }
          if (openThinkingIndex !== null) {
            yield { type: 'content_block_stop', index: openThinkingIndex }
            openThinkingIndex = null
          }
          const fc = p.functionCall as { name: string; args?: Record<string, unknown>; id?: string }
          const idx = nextIndex++
          yield {
            type: 'content_block_start',
            index: idx,
            content_block: {
              type: 'tool_use',
              id: fc.id ?? `toolu_${randomUUID().replace(/-/g, '')}`,
              name: fc.name,
              input: fc.args ?? {},
            },
          }
          yield { type: 'content_block_stop', index: idx }
          hasToolUse = true
          continue
        }

        // thought parts
        if (p.thought === true && typeof p.text === 'string') {
          if (openTextIndex !== null) {
            yield { type: 'content_block_stop', index: openTextIndex }
            openTextIndex = null
          }
          if (openThinkingIndex === null) {
            openThinkingIndex = nextIndex++
            yield {
              type: 'content_block_start',
              index: openThinkingIndex,
              content_block: { type: 'thinking', thinking: '', signature: '' },
            }
          }
          yield {
            type: 'content_block_delta',
            index: openThinkingIndex,
            delta: { type: 'thinking_delta', thinking: p.text },
          }
          if (typeof p.thoughtSignature === 'string' && p.thoughtSignature) {
            yield {
              type: 'content_block_delta',
              index: openThinkingIndex,
              delta: { type: 'signature_delta', signature: p.thoughtSignature },
            }
          }
          continue
        }

        // text parts
        if (typeof p.text === 'string') {
          if (openThinkingIndex !== null) {
            yield { type: 'content_block_stop', index: openThinkingIndex }
            openThinkingIndex = null
          }
          if (openTextIndex === null) {
            openTextIndex = nextIndex++
            yield {
              type: 'content_block_start',
              index: openTextIndex,
              content_block: { type: 'text', text: '' },
            }
          }
          yield {
            type: 'content_block_delta',
            index: openTextIndex,
            delta: { type: 'text_delta', text: p.text },
          }
          continue
        }
      }
    }

    if (openTextIndex !== null) yield { type: 'content_block_stop', index: openTextIndex }
    if (openThinkingIndex !== null) yield { type: 'content_block_stop', index: openThinkingIndex }

    const stopReason = mapFinishReason(lastFinishReason, hasToolUse)
    yield {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: {
        input_tokens: lastUsage?.promptTokenCount ?? 0,
        output_tokens: lastUsage?.candidatesTokenCount ?? 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: (lastUsage as { cachedContentTokenCount?: number } | undefined)?.cachedContentTokenCount ?? 0,
      },
    }
    yield { type: 'message_stop' }
  }
}

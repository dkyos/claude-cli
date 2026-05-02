// Maps Gemini finishReason values to Anthropic stop_reason. The contract is
// loose on both sides so we map by intent: STOP/FUNCTION_CALL → end_turn,
// MAX_TOKENS → max_tokens, all safety/blocklist variants → refusal.
//
// MALFORMED_FUNCTION_CALL has no clean equivalent — Anthropic never emits it.
// We surface it as end_turn and let the caller see the broken tool_use shape;
// the retry layer doesn't have a special case for it either.

import type { FinishReason } from '@google/genai'

export type AnthropicStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'stop_sequence'
  | 'tool_use'
  | 'refusal'
  | 'pause_turn'
  | null

export function mapFinishReason(
  reason: FinishReason | string | undefined,
  hasToolUse: boolean,
): AnthropicStopReason {
  if (!reason) return null
  // Tool calls override most other reasons — Anthropic's stop_reason becomes
  // 'tool_use' when the assistant emits a tool_use block, regardless of why
  // generation stopped.
  if (hasToolUse) return 'tool_use'

  switch (reason) {
    case 'STOP':
    case 'FINISH_REASON_UNSPECIFIED':
      return 'end_turn'
    case 'MAX_TOKENS':
      return 'max_tokens'
    case 'SAFETY':
    case 'BLOCKLIST':
    case 'PROHIBITED_CONTENT':
    case 'SPII':
    case 'IMAGE_SAFETY':
    case 'IMAGE_PROHIBITED_CONTENT':
    case 'IMAGE_OTHER':
    case 'LANGUAGE':
      return 'refusal'
    case 'RECITATION':
    case 'OTHER':
    case 'MALFORMED_FUNCTION_CALL':
    case 'UNEXPECTED_TOOL_CALL':
    default:
      return 'end_turn'
  }
}

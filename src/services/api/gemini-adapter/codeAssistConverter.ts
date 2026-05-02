// Wire-shape conversion between standard Gemini API requests and the Code
// Assist server's enveloped form. This is functionally a thin renaming
// layer: Code Assist wraps everything inside `{ model, project, request: {...} }`
// and renames `config` keys to `generationConfig`.

import {
  GenerateContentResponse,
  type CountTokensParameters,
  type GenerateContentParameters,
  type Content,
} from '@google/genai'
import type {
  CaCountTokenRequest,
  CaCountTokenResponse,
  CaGenerateContentRequest,
  CaGenerateContentResponse,
} from './codeAssistTypes.js'

export function toCaGenerateContentRequest(
  req: GenerateContentParameters,
  userPromptId: string,
  project?: string,
  sessionId?: string,
): CaGenerateContentRequest {
  const cfg = req.config ?? {}
  return {
    model: req.model as string,
    project,
    user_prompt_id: userPromptId,
    request: {
      contents: normalizeContents(req.contents),
      systemInstruction: cfg.systemInstruction as Content | undefined,
      cachedContent: cfg.cachedContent as string | undefined,
      tools: cfg.tools,
      toolConfig: cfg.toolConfig,
      safetySettings: cfg.safetySettings as unknown[] | undefined,
      generationConfig: {
        temperature: cfg.temperature,
        topP: cfg.topP,
        topK: cfg.topK,
        maxOutputTokens: cfg.maxOutputTokens,
        stopSequences: cfg.stopSequences,
        responseMimeType: cfg.responseMimeType,
        responseSchema: cfg.responseSchema,
        thinkingConfig: cfg.thinkingConfig,
      },
      session_id: sessionId,
    },
  }
}

export function fromCaGenerateContentResponse(
  resp: CaGenerateContentResponse,
): GenerateContentResponse {
  const out = new GenerateContentResponse()
  out.responseId = resp.traceId
  const inner = resp.response
  if (!inner) {
    out.candidates = []
    return out
  }
  out.candidates = inner.candidates ?? []
  out.usageMetadata = inner.usageMetadata
  out.modelVersion = inner.modelVersion
  return out
}

export function toCaCountTokenRequest(
  req: CountTokensParameters,
): CaCountTokenRequest {
  return {
    request: {
      model: 'models/' + (req.model as string),
      contents: normalizeContents(req.contents),
    },
  }
}

export function fromCaCountTokenResponse(
  resp: CaCountTokenResponse,
): { totalTokens: number } {
  return { totalTokens: resp.totalTokens ?? 0 }
}

// `req.contents` can be Content | Content[] | string | PartUnion[] etc.
// The adapter's translateMessages already produces Content[], so this is
// almost always a passthrough — but accept the looser types defensively.
function normalizeContents(contents: GenerateContentParameters['contents']): Content[] {
  if (Array.isArray(contents)) {
    if (contents.length === 0) return []
    const first = contents[0]
    if (first && typeof first === 'object' && 'role' in first) {
      return contents as Content[]
    }
    // It's a parts array — wrap as a single user-role content.
    return [{ role: 'user', parts: contents as Content['parts'] }]
  }
  if (typeof contents === 'string') {
    return [{ role: 'user', parts: [{ text: contents }] }]
  }
  if (contents && typeof contents === 'object' && 'role' in contents) {
    return [contents as Content]
  }
  return []
}

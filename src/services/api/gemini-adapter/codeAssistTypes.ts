// Type definitions for Google's Code Assist server API
// (cloudcode-pa.googleapis.com/v1internal). Trimmed to the fields this fork
// actually consumes — gemini-cli's full type set in its `code_assist/types.ts`
// is several hundred lines and most fields are billing/telemetry concerns
// we deliberately don't surface.

import type { Content, GenerateContentResponseUsageMetadata, Candidate } from '@google/genai'

export type CaUserTierId = 'free-tier' | 'legacy-tier' | 'standard-tier' | string

export interface CaClientMetadata {
  ideType?: string  // e.g. 'GEMINI_CLI', 'IDE_UNSPECIFIED'
  platform?: string // e.g. 'PLATFORM_UNSPECIFIED', 'DARWIN_ARM64'
  pluginType?: string // e.g. 'GEMINI'
  duetProject?: string
}

export interface CaLoadCodeAssistRequest {
  cloudaicompanionProject?: string
  metadata: CaClientMetadata
  mode?: 'MODE_UNSPECIFIED' | 'FULL_ELIGIBILITY_CHECK' | 'HEALTH_CHECK'
}

export interface CaGeminiUserTier {
  id?: CaUserTierId
  name?: string
  description?: string
  userDefinedCloudaicompanionProject?: boolean | null
  isDefault?: boolean
  hasAcceptedTos?: boolean
  hasOnboardedPreviously?: boolean
}

export interface CaLoadCodeAssistResponse {
  currentTier?: CaGeminiUserTier | null
  allowedTiers?: CaGeminiUserTier[] | null
  cloudaicompanionProject?: string | null
  paidTier?: CaGeminiUserTier | null
}

export interface CaOnboardUserRequest {
  tierId: string | undefined
  cloudaicompanionProject: string | undefined
  metadata: CaClientMetadata | undefined
}

export interface CaLongRunningOperationResponse {
  name?: string
  done?: boolean
  response?: {
    cloudaicompanionProject?: { id?: string; name?: string }
  }
}

// Wire shape for generateContent (Code Assist envelopes the standard Gemini
// request: { model, project, user_prompt_id, request: { contents, ... } }).

export interface CaGenerateContentRequest {
  model: string
  project?: string
  user_prompt_id?: string
  request: {
    contents: Content[]
    systemInstruction?: Content
    cachedContent?: string
    tools?: unknown
    toolConfig?: unknown
    safetySettings?: unknown[]
    generationConfig?: {
      temperature?: number
      topP?: number
      topK?: number
      maxOutputTokens?: number
      stopSequences?: string[]
      responseMimeType?: string
      responseSchema?: unknown
      thinkingConfig?: { includeThoughts?: boolean; thinkingBudget?: number }
    }
    session_id?: string
  }
  enabled_credit_types?: string[]
}

export interface CaGenerateContentResponse {
  response?: {
    candidates?: Candidate[]
    promptFeedback?: unknown
    usageMetadata?: GenerateContentResponseUsageMetadata
    modelVersion?: string
  }
  traceId?: string
}

export interface CaCountTokenRequest {
  request: {
    model: string  // expects 'models/<name>' prefix
    contents: Content[]
  }
}

export interface CaCountTokenResponse {
  totalTokens?: number
}

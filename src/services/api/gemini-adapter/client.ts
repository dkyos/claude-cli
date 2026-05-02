// GeminiAnthropicAdapter — exposes a subset of the @anthropic-ai/sdk
// `Anthropic` instance shape. Two backends, picked at construction time:
//
//   * API-key auth → `@google/genai` directly against
//                    generativelanguage.googleapis.com
//   * OAuth auth   → CodeAssistServer against
//                    cloudcode-pa.googleapis.com (because Google's OAuth
//                    client for gemini-cli isn't approved for the
//                    `auth/generative-language` scope, so the access token
//                    can't talk to generativelanguage.googleapis.com directly)
//
// Methods exposed:
//   - .beta.messages.create({stream: false}) → BetaMessage
//   - .beta.messages.create({stream: true})  → APIPromise-like with .withResponse()
//   - .beta.messages.countTokens()           → { input_tokens }
//   - .models.list()                         → fixed Gemini model list

import { GoogleGenAI } from '@google/genai'
import type {
  CountTokensParameters,
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai'
import type { OAuth2Client } from 'google-auth-library'
import { randomUUID } from 'crypto'
import { translateMessages, translateSystemPrompt } from './messageTranslator.js'
import { translateTools, translateToolChoice } from './toolTranslator.js'
import type { AnthropicToolChoice } from './toolTranslator.js'
import { translateResponse } from './responseTranslator.js'
import type { AnthropicBetaMessage } from './responseTranslator.js'
import { GeminiStreamAdapter } from './streamTranslator.js'
import { wrapGeminiError } from './errorWrapper.js'
import { mapModelName, listSupportedGeminiModels } from './modelMap.js'
import { CodeAssistServer } from './codeAssistServer.js'
import { setupCodeAssistUser } from './codeAssistSetup.js'
import {
  toCaGenerateContentRequest,
  fromCaGenerateContentResponse,
  toCaCountTokenRequest,
  fromCaCountTokenResponse,
} from './codeAssistConverter.js'

export type AdapterAuth =
  | { apiKey: string; accessToken?: undefined; oauthClient?: undefined }
  | { apiKey?: undefined; accessToken: string; oauthClient?: undefined }
  | { apiKey?: undefined; accessToken?: undefined; oauthClient: OAuth2Client }

type AnthropicCreateParams = {
  model: string
  messages: Array<{ role: 'user' | 'assistant'; content: string | unknown[] }>
  system?: string | Array<{ type: 'text'; text: string }>
  tools?: unknown[]
  tool_choice?: AnthropicToolChoice
  max_tokens?: number
  temperature?: number
  top_p?: number
  top_k?: number
  stop_sequences?: string[]
  thinking?: { type?: 'enabled' | 'disabled'; budget_tokens?: number }
  stream?: boolean
  metadata?: { user_id?: string; [k: string]: unknown }
  betas?: string[]
  anthropic_beta?: string[]
  [k: string]: unknown
}

function buildGenerateConfig(params: AnthropicCreateParams) {
  const config: GenerateContentParameters['config'] = {}
  if (typeof params.max_tokens === 'number') config.maxOutputTokens = params.max_tokens
  if (typeof params.temperature === 'number') config.temperature = params.temperature
  if (typeof params.top_p === 'number') config.topP = params.top_p
  if (typeof params.top_k === 'number') config.topK = params.top_k
  if (params.stop_sequences && params.stop_sequences.length > 0) {
    config.stopSequences = params.stop_sequences
  }
  if (params.thinking?.type === 'enabled') {
    config.thinkingConfig = {
      includeThoughts: true,
      ...(typeof params.thinking.budget_tokens === 'number'
        ? { thinkingBudget: params.thinking.budget_tokens }
        : {}),
    }
  } else if (params.thinking?.type === 'disabled') {
    config.thinkingConfig = { includeThoughts: false }
  }
  const tools = translateTools(params.tools as Parameters<typeof translateTools>[0])
  if (tools) config.tools = tools
  const toolChoice = translateToolChoice(params.tool_choice)
  if (toolChoice.toolConfig) config.toolConfig = toolChoice.toolConfig as never
  const sys = translateSystemPrompt(params.system as Parameters<typeof translateSystemPrompt>[0])
  if (sys) config.systemInstruction = sys
  return config
}

// -- Backend interface (uniform shape across API-key and Code Assist paths) --

interface Backend {
  generateContent(
    req: GenerateContentParameters,
    signal?: AbortSignal,
  ): Promise<GenerateContentResponse>
  generateContentStream(
    req: GenerateContentParameters,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<GenerateContentResponse>>
  countTokens(req: CountTokensParameters): Promise<{ totalTokens: number }>
}

class GenAiBackend implements Backend {
  constructor(private readonly genai: GoogleGenAI) {}
  async generateContent(req: GenerateContentParameters): Promise<GenerateContentResponse> {
    return this.genai.models.generateContent(req)
  }
  async generateContentStream(req: GenerateContentParameters): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.genai.models.generateContentStream(req)
  }
  async countTokens(req: CountTokensParameters): Promise<{ totalTokens: number }> {
    const out = await this.genai.models.countTokens(req)
    return { totalTokens: out.totalTokens ?? 0 }
  }
}

class CodeAssistBackend implements Backend {
  constructor(
    private readonly server: CodeAssistServer,
    private readonly sessionId: string,
  ) {}
  private async ensureProject(): Promise<void> {
    if (this.server.projectId) return
    const data = await setupCodeAssistUser(this.server.client)
    if (data.projectId) {
      this.server.projectId = data.projectId
    }
  }
  async generateContent(
    req: GenerateContentParameters,
    signal?: AbortSignal,
  ): Promise<GenerateContentResponse> {
    await this.ensureProject()
    const caReq = toCaGenerateContentRequest(req, randomUUID(), this.server.projectId, this.sessionId)
    const caResp = await this.server.generateContent(caReq, signal)
    return fromCaGenerateContentResponse(caResp)
  }
  async generateContentStream(
    req: GenerateContentParameters,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    await this.ensureProject()
    const caReq = toCaGenerateContentRequest(req, randomUUID(), this.server.projectId, this.sessionId)
    const inner = this.server.streamGenerateContent(caReq, signal)
    return (async function* () {
      for await (const chunk of inner) {
        yield fromCaGenerateContentResponse(chunk)
      }
    })()
  }
  async countTokens(req: CountTokensParameters): Promise<{ totalTokens: number }> {
    const caResp = await this.server.countTokens(toCaCountTokenRequest(req))
    return fromCaCountTokenResponse(caResp)
  }
}

// -- Anthropic-shape facade -------------------------------------------------

class BetaMessages {
  constructor(private readonly client: GeminiAnthropicAdapter) {}

  create(params: AnthropicCreateParams, options?: { signal?: AbortSignal; timeout?: number; headers?: Record<string, string> }): any {
    if (params.stream) {
      return this.client._createStreaming(params, options)
    }
    return this.client._createNonStreaming(params, options)
  }

  async countTokens(params: {
    model: string
    messages: AnthropicCreateParams['messages']
    system?: AnthropicCreateParams['system']
    tools?: AnthropicCreateParams['tools']
  }): Promise<{ input_tokens: number }> {
    const model = mapModelName(params.model)
    const contents = translateMessages(params.messages as Parameters<typeof translateMessages>[0])
    const sys = translateSystemPrompt(params.system as Parameters<typeof translateSystemPrompt>[0])
    try {
      const out = await this.client._backend.countTokens({
        model,
        contents: sys ? [sys, ...contents] : contents,
      })
      return { input_tokens: out.totalTokens ?? 0 }
    } catch (err) {
      wrapGeminiError(err)
    }
  }
}

class Beta {
  readonly messages: BetaMessages
  constructor(client: GeminiAnthropicAdapter) {
    this.messages = new BetaMessages(client)
  }
}

class Models {
  list() {
    const data = listSupportedGeminiModels()
    return Object.assign(
      {
        async *[Symbol.asyncIterator]() {
          for (const m of data) yield m
        },
        data,
        has_more: false,
        first_id: data[0]?.id ?? null,
        last_id: data[data.length - 1]?.id ?? null,
      },
    )
  }
}

export class GeminiAnthropicAdapter {
  readonly _backend: Backend
  readonly beta: Beta
  readonly models = new Models()
  readonly messages: BetaMessages

  constructor(auth: AdapterAuth, sessionId?: string) {
    if ('oauthClient' in auth && auth.oauthClient) {
      const server = new CodeAssistServer(auth.oauthClient, undefined, sessionId ?? '')
      this._backend = new CodeAssistBackend(server, sessionId ?? '')
    } else if ('apiKey' in auth && auth.apiKey) {
      const genai = new GoogleGenAI({ apiKey: auth.apiKey })
      this._backend = new GenAiBackend(genai)
    } else if ('accessToken' in auth && auth.accessToken) {
      // Plain access token (no refresh capability) — talk to Code Assist
      // with a static Bearer header. This path is used when the caller has
      // already loaded ~/.gemini/oauth_creds.json themselves and just wants
      // a one-shot adapter without setting up an OAuth2Client.
      throw new Error(
        'GeminiAnthropicAdapter: pass `oauthClient` (OAuth2Client) instead of bare `accessToken` — required for token refresh and Code Assist server compatibility.',
      )
    } else {
      throw new Error('GeminiAnthropicAdapter: no auth provided')
    }
    this.beta = new Beta(this)
    this.messages = this.beta.messages
  }

  async _createNonStreaming(
    params: AnthropicCreateParams,
    options?: { signal?: AbortSignal },
  ): Promise<AnthropicBetaMessage> {
    const model = mapModelName(params.model)
    const contents = translateMessages(params.messages as Parameters<typeof translateMessages>[0])
    const config = buildGenerateConfig(params)
    try {
      const resp = await this._backend.generateContent(
        { model, contents, config },
        options?.signal,
      )
      return translateResponse(resp, model)
    } catch (err) {
      wrapGeminiError(err, options?.signal)
    }
  }

  _createStreaming(
    params: AnthropicCreateParams,
    options?: { signal?: AbortSignal },
  ): {
    withResponse(): Promise<{ data: GeminiStreamAdapter; response: Response; request_id: string }>
    asResponse(): Promise<Response>
    then<T>(onfulfilled?: (value: GeminiStreamAdapter) => T | PromiseLike<T>): Promise<T>
  } {
    const model = mapModelName(params.model)
    const contents = translateMessages(params.messages as Parameters<typeof translateMessages>[0])
    const config = buildGenerateConfig(params)
    const requestId = randomUUID()

    const startStream = async (): Promise<AsyncGenerator<GenerateContentResponse>> => {
      try {
        return await this._backend.generateContentStream(
          { model, contents, config },
          options?.signal,
        )
      } catch (err) {
        wrapGeminiError(err, options?.signal)
      }
    }

    const dataPromise: Promise<GeminiStreamAdapter> = (async () => {
      const gen = await startStream()
      const adapter = new GeminiStreamAdapter(gen, model)
      if (options?.signal) {
        if (options.signal.aborted) adapter.controller.abort()
        else options.signal.addEventListener('abort', () => adapter.controller.abort(), { once: true })
      }
      return adapter
    })()

    const fakeResponse = (): Response => new Response(null, {
      status: 200,
      headers: {
        'x-request-id': requestId,
        'content-type': 'text/event-stream',
      },
    })

    return {
      async withResponse() {
        const data = await dataPromise
        return { data, response: fakeResponse(), request_id: requestId }
      },
      async asResponse() {
        await dataPromise
        return fakeResponse()
      },
      then(onfulfilled) {
        return dataPromise.then(onfulfilled as never) as never
      },
    } as never
  }
}

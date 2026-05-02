// Resolves the user's Code Assist project ID and tier on first OAuth use.
//
// Flow (mirrors gemini-cli's setup.ts but trimmed):
//   1. POST loadCodeAssist  → server tells us the user's tier and the
//                             cloudaicompanionProject they're attached to.
//   2. If response already has cloudaicompanionProject, we're done.
//   3. Otherwise POST onboardUser with the chosen tier (default: FREE) and
//      poll the long-running operation until done — the response carries
//      the new project ID.
//
// Result is cached in a JSON sidecar at ~/.gemini/code_assist_user.json so
// subsequent runs skip the round trip. The cache is keyed by Google account
// email when available, but in practice the OAuth token already pins us to
// a single account, so the simpler one-file cache is fine.

import type { OAuth2Client } from 'google-auth-library'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import * as path from 'node:path'
import { CodeAssistServer } from './codeAssistServer.js'
import type { CaUserTierId } from './codeAssistTypes.js'

const CACHE_FILE = path.join(homedir(), '.gemini', 'code_assist_user.json')

export type CaUserData = {
  projectId?: string
  userTier: CaUserTierId
}

const CLIENT_METADATA = {
  ideType: 'GEMINI_CLI' as const,
  platform: 'PLATFORM_UNSPECIFIED' as const,
  pluginType: 'GEMINI' as const,
}

let memoryCache: Promise<CaUserData> | null = null

export function resetCodeAssistUserCache(): void {
  memoryCache = null
}

export async function setupCodeAssistUser(
  client: OAuth2Client,
): Promise<CaUserData> {
  if (memoryCache) return memoryCache
  memoryCache = (async () => {
    // First: try the disk cache.
    try {
      const raw = await fs.readFile(CACHE_FILE, 'utf-8')
      const cached = JSON.parse(raw) as CaUserData
      if (cached.userTier) return cached
    } catch {}

    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT_ID ||
      undefined

    const server = new CodeAssistServer(client, projectId)
    const loadRes = await server.loadCodeAssist({
      cloudaicompanionProject: projectId,
      metadata: { ...CLIENT_METADATA, duetProject: projectId },
    })

    let resolvedProjectId =
      loadRes.cloudaicompanionProject ?? projectId ?? undefined
    let tier: CaUserTierId =
      loadRes.paidTier?.id ?? loadRes.currentTier?.id ?? 'standard-tier'

    // If the user has a tier but no project, try to onboard them. The free
    // tier uses a managed Google project (no project arg); standard requires
    // an explicit projectId.
    if (!resolvedProjectId && loadRes.allowedTiers?.length) {
      const target =
        loadRes.allowedTiers.find((t) => t.isDefault) ?? loadRes.allowedTiers[0]
      tier = target?.id ?? 'free-tier'

      let lro = await server.onboardUser({
        tierId: tier,
        cloudaicompanionProject:
          tier === 'free-tier' ? undefined : projectId,
        metadata: tier === 'free-tier'
          ? CLIENT_METADATA
          : { ...CLIENT_METADATA, duetProject: projectId },
      })
      // Poll the LRO for up to ~2 minutes.
      const deadline = Date.now() + 120_000
      while (!lro.done && lro.name && Date.now() < deadline) {
        await new Promise((f) => setTimeout(f, 3000))
        lro = await server.getOperation(lro.name)
      }
      resolvedProjectId = lro.response?.cloudaicompanionProject?.id
    }

    const result: CaUserData = {
      projectId: resolvedProjectId,
      userTier: tier,
    }

    // Persist for next session.
    try {
      await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true })
      await fs.writeFile(CACHE_FILE, JSON.stringify(result, null, 2), {
        mode: 0o600,
      })
    } catch {
      // Cache write is best-effort.
    }

    return result
  })()
  return memoryCache
}

// Stub for @anthropic-ai/sandbox-runtime. The original ships fs/network
// sandboxing primitives. The fork keeps the API surface as no-ops so any code
// path that references the sandbox compiles, but the actual sandboxing is not
// enforced — callers should treat these as best-effort hints.

export type FsReadRestrictionConfig = any
export type FsWriteRestrictionConfig = any
export type IgnoreViolationsConfig = any
export type NetworkHostPattern = any
export type NetworkRestrictionConfig = any
export type SandboxAskCallback = any
export type SandboxDependencyCheck = any
export type SandboxRuntimeConfig = any
export type SandboxViolationEvent = any

export class SandboxManager {
  constructor(..._args: unknown[]) {}
  async start(..._args: unknown[]): Promise<void> {}
  async stop(..._args: unknown[]): Promise<void> {}
  async checkDependencies(..._args: unknown[]): Promise<{ ok: boolean; reason?: string }> {
    return { ok: false, reason: 'sandbox-runtime stubbed in fork' }
  }
  on(..._args: unknown[]): this { return this }
  off(..._args: unknown[]): this { return this }
  emit(..._args: unknown[]): boolean { return false }
}

export const SandboxRuntimeConfigSchema: any = {
  parse: (v: unknown) => v,
  safeParse: (v: unknown) => ({ success: true, data: v }),
}

export class SandboxViolationStore {
  constructor(..._args: unknown[]) {}
  add(..._args: unknown[]): void {}
  list(..._args: unknown[]): SandboxViolationEvent[] { return [] }
  clear(): void {}
}

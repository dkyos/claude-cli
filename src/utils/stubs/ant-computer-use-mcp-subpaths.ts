// Stub for @ant/computer-use-mcp subpaths (`/types`, `/sentinelApps`).
// Re-exports any-typed values so consumers that read named exports compile.

export type CoordinateMode = 'physical' | 'logical' | string
export type CuSubGates = any
export type CuPermissionRequest = any
export type CuPermissionResponse = any

export const DEFAULT_GRANT_FLAGS: any = {}

export function getSentinelCategory(_app: unknown): string {
  return 'unknown'
}

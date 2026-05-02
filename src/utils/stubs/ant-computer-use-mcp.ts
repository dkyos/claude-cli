// Stub for @ant/computer-use-mcp. Disabled in the Gemini fork — the screen
// capture / coordinate translation pipeline has no equivalent under Gemini and
// isn't on the path of the basic REPL + file tools.

export type ComputerExecutor = any
export type ComputerUseSessionContext = any
export type CuCallToolResult = any
export type CuPermissionRequest = any
export type CuPermissionResponse = any
export type DisplayGeometry = any
export type FrontmostApp = any
export type InstalledApp = any
export type ResolvePrepareCaptureResult = any
export type RunningApp = any
export type ScreenshotDims = { width: number; height: number }
export type ScreenshotResult = any

export const API_RESIZE_PARAMS: any = {
  maxWidth: 1024,
  maxHeight: 768,
}

export const DEFAULT_GRANT_FLAGS: any = {}

export function targetImageSize(_w: number, _h: number): ScreenshotDims {
  return { width: 0, height: 0 }
}

const unavailable = (..._args: unknown[]): never => {
  throw new Error('@ant/computer-use-mcp is not bundled in the Gemini fork')
}

export const bindSessionContext: any = unavailable
export const buildComputerUseTools: any = () => []
export const createComputerUseMcpServer: any = unavailable

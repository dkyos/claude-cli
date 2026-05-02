// Stub for `bun:ffi`. This fork runs on Node, so any code that relies on Bun's
// FFI (loading native dylibs in-process) must take a degraded path. Throwing
// here is intentional: the calling site should be guarded by a feature flag or
// platform check, and if it isn't, we want a loud failure rather than silent
// no-op behavior.

export const dlopen = (..._args: unknown[]): never => {
  throw new Error('bun:ffi.dlopen is unavailable in the Node-runtime fork')
}

export const FFIType = {} as Record<string, never>
export const suffix = ''
export const ptr = (..._args: unknown[]): never => {
  throw new Error('bun:ffi.ptr is unavailable in the Node-runtime fork')
}
export const toBuffer = (..._args: unknown[]): never => {
  throw new Error('bun:ffi.toBuffer is unavailable in the Node-runtime fork')
}
export const toArrayBuffer = (..._args: unknown[]): never => {
  throw new Error('bun:ffi.toArrayBuffer is unavailable in the Node-runtime fork')
}
export const CString = class {
  constructor(..._args: unknown[]) {
    throw new Error('bun:ffi.CString is unavailable in the Node-runtime fork')
  }
}
export const read = {} as Record<string, never>

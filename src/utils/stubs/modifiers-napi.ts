// Stub for modifiers-napi (keyboard modifier inspection). Disabled in the fork.
const unavailable = (..._args: unknown[]): never => {
  throw new Error('modifiers-napi is not bundled in the Gemini fork')
}
export default { read: unavailable, isSupported: false }

// Stub for url-handler-napi (macOS URL scheme handler). Disabled in the fork.
const unavailable = (..._args: unknown[]): never => {
  throw new Error('url-handler-napi is not bundled in the Gemini fork')
}
export default { register: unavailable, isSupported: false }

// Stub for image-processor-napi. Disabled in the fork.
const unavailable = (..._args: unknown[]): never => {
  throw new Error('image-processor-napi is not bundled in the Gemini fork')
}
export default { resize: unavailable, encode: unavailable, isSupported: false }

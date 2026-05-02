// Stub for audio-capture-napi (voice mode). Disabled in the fork.
const unavailable = (..._args: unknown[]): never => {
  throw new Error('audio-capture-napi is not bundled in the Gemini fork')
}
export default { capture: unavailable, isSupported: false }

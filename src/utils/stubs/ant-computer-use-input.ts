// Stub for @ant/computer-use-input. The original is a Rust/enigo NAPI binding
// for mouse/keyboard input on macOS. This fork doesn't ship native bindings —
// computer-use is disabled. Anything that tries to load it will throw.

export type ComputerUseInputAPI = any
export type ComputerUseInput = any

export const isSupported = false

const noop = (..._args: unknown[]): never => {
  throw new Error('@ant/computer-use-input is not bundled in the Gemini fork')
}

export default { isSupported: false, key: noop, keys: noop, mouseDown: noop, mouseUp: noop }

// auto-stub for dynamic-import / side-effect-import path. Original was behind
// a feature flag in the Anthropic build; reaching this at runtime is a bug.

const _err = (..._a: unknown[]): never => {
  throw new Error('stubbed module reached at runtime')
}
const _proxy: any = new Proxy(function () {} as any, {
  get(_t, _p) { return _proxy },
  apply: _err,
  construct: _err,
})
export default _proxy
export const __stubbed = true
export const DEFAULT_UPLOAD_CONCURRENCY: any = 1
export const FILE_COUNT_LIMIT: any = 1000
export const OUTPUTS_SUBDIR: any = 'outputs'

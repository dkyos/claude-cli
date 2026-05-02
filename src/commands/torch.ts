// auto-stub for missing internal module
// Behind a feature() flag in the original Bun build.
// Reaching this at runtime is a bug — the gate above should have skipped it.

const _err = (..._a: unknown[]): never => {
  throw new Error('stubbed module ./commands/torch.js reached at runtime')
}
const _proxy: any = new Proxy(function () {} as any, {
  get(_t, _p) { return _proxy },
  apply: _err,
  construct: _err,
})


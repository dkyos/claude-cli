// auto-stub for missing internal module
// Behind a feature() flag in the original Bun build.
// Reaching this at runtime is a bug — the gate above should have skipped it.

const _err = (..._a: unknown[]): never => {
  throw new Error('stubbed module ./sdk/runtimeTypes.js reached at runtime')
}
const _proxy: any = new Proxy(function () {} as any, {
  get(_t, _p) { return _proxy },
  apply: _err,
  construct: _err,
})

export const AnyZodRawShape: any = _proxy
export const ForkSessionOptions: any = _proxy
export const ForkSessionResult: any = _proxy
export const GetSessionInfoOptions: any = _proxy
export const GetSessionMessagesOptions: any = _proxy
export const InferShape: any = _proxy
export const InternalOptions: any = _proxy
export const InternalQuery: any = _proxy
export const ListSessionsOptions: any = _proxy
export const McpSdkServerConfigWithInstance: any = _proxy
export const Options: any = _proxy
export const Query: any = _proxy
export const SDKSession: any = _proxy
export const SDKSessionOptions: any = _proxy
export const SdkMcpToolDefinition: any = _proxy
export const SessionMessage: any = _proxy
export const SessionMutationOptions: any = _proxy

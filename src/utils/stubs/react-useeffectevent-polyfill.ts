// Polyfill for React 19's `useEffectEvent`. The leaked source imports it
// directly from 'react', but on React 18.3 the export doesn't exist (it's
// behind an experimental flag and was renamed several times before landing
// in React 19). The shim below matches the documented semantics: returns a
// stable callback whose body always invokes the latest `fn` provided.
//
// We monkey-patch React's exports module on first load so any later
// `import { useEffectEvent } from 'react'` resolves through us. esbuild
// inlines the import binding, so we also export it for direct re-import via
// our alias (`react/use-effect-event-polyfill`).

import { useCallback, useLayoutEffect, useRef } from 'react'
import * as ReactNS from 'react'

export function useEffectEvent<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  const ref = useRef<(...args: TArgs) => TReturn>(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  return useCallback((...args: TArgs) => ref.current(...args), [])
}

// Patch React's namespace so `import { useEffectEvent } from 'react'` works.
// React's exports object is normally read-only (CJS namespace from interop),
// but Object.defineProperty on the live module object usually succeeds — and
// if it doesn't, the failure is non-fatal because consumers can still import
// from this stub file directly.
try {
  if (!('useEffectEvent' in ReactNS) || typeof (ReactNS as { useEffectEvent?: unknown }).useEffectEvent !== 'function') {
    Object.defineProperty(ReactNS, 'useEffectEvent', {
      value: useEffectEvent,
      configurable: true,
      enumerable: true,
      writable: true,
    })
  }
} catch {
  // Patch failed (frozen module). Consumers must use the explicit export.
}

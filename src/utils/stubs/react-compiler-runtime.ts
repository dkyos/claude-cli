// Stub for `react/compiler-runtime`. The React Compiler emits memo-cache reads
// against `_c` (an array of slots) — but it ships only with React 19+, while
// this fork runs on React 18 (constrained by ink@5). The runtime semantics of
// `_c` are: given a hint length, return a sentinel-backed array; the compiler-
// emitted code stores intermediate values in slots and rereads them to short-
// circuit re-renders. Returning a fresh array of `undefined` slots is correct
// but loses memoization (every render is a "first render"). That's
// functionally fine — the rendered output is identical, just slower. For a
// terminal CLI that's fine.

const SENTINEL: any = {}

export function c(size: number): any[] {
  const arr = new Array(size)
  for (let i = 0; i < size; i++) arr[i] = SENTINEL
  return arr
}

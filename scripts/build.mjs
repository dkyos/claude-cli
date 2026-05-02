// Bundles src/main.tsx into dist/cli.mjs using esbuild. Replaces the `MACRO.*`
// build-time constants the original Anthropic Bun bundler injected.

import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

mkdirSync(resolve(root, 'dist'), { recursive: true })

// Plugin: virtualize a fixed list of internal paths that the original Anthropic
// build dead-code-eliminated via `feature()` flags. These modules don't ship
// in the leaked source tree. Behind a `feature(...)` ternary they're never
// reached at runtime, so an empty module satisfies the bundle.
//
// To use: list paths exactly as they appear in import/require call sites
// (relative path string, .js extension included as written by the source).
import { readFileSync } from 'node:fs'
const missingListPath = resolve(here, 'missing-modules.json')
let MISSING = []
try { MISSING = JSON.parse(readFileSync(missingListPath, 'utf8')) } catch (err) {
  console.warn('No missing-modules.json:', err.message)
}

const MISSING_SET = new Set(MISSING)

const stubMissingInternal = {
  name: 'stub-missing-internal',
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (MISSING_SET.has(args.path)) {
        return { path: args.path, namespace: 'virtual-stub' }
      }
      return null
    })
    b.onLoad({ filter: /.*/, namespace: 'virtual-stub' }, (args) => ({
      contents: `// auto-stubbed missing module: ${args.path}
const _proxy = new Proxy(function () {}, {
  get(_t, _p) { return _proxy; },
  apply() { throw new Error('stubbed module ${args.path} reached at runtime'); },
  construct() { throw new Error('stubbed module ${args.path} reached at runtime'); },
});
export default _proxy;
export const __stubbed = true;
`,
      loader: 'js',
    }))
  },
}

const define = {
  // Version intentionally far higher than any server-side minVersion check
  // (`assertMinVersion` in autoUpdater.ts) so the fork doesn't refuse to run.
  'MACRO.VERSION': JSON.stringify(process.env.CLAUDE_FORK_VERSION ?? '99.0.0-fork'),
  'MACRO.BUILD_TIME': JSON.stringify(new Date().toISOString()),
  'MACRO.PACKAGE_URL': JSON.stringify('https://example.invalid/claude-cli-gemini-fork'),
  'MACRO.NATIVE_PACKAGE_URL': JSON.stringify('https://example.invalid/claude-cli-gemini-fork/native'),
  'MACRO.ISSUES_EXPLAINER': JSON.stringify('Report issues to your fork maintainer'),
  'MACRO.FEEDBACK_CHANNEL': JSON.stringify('https://example.invalid/feedback'),
  'MACRO.VERSION_CHANGELOG': JSON.stringify('https://example.invalid/changelog'),
}

await build({
  entryPoints: [resolve(root, 'src/main.tsx')],
  outfile: resolve(root, 'dist/cli.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: 'linked',
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as __cr } from "module"; const require = __cr(import.meta.url);' },
  define,
  alias: {
    'bun:bundle': resolve(root, 'src/utils/feature.ts'),
    'bun:ffi': resolve(root, 'src/utils/bunFfiStub.ts'),
    'react/compiler-runtime': resolve(root, 'src/utils/stubs/react-compiler-runtime.ts'),
    '@ant/computer-use-input': resolve(root, 'src/utils/stubs/ant-computer-use-input.ts'),
    '@ant/computer-use-mcp': resolve(root, 'src/utils/stubs/ant-computer-use-mcp.ts'),
    '@ant/computer-use-mcp/types': resolve(root, 'src/utils/stubs/ant-computer-use-mcp-subpaths.ts'),
    '@ant/computer-use-mcp/sentinelApps': resolve(root, 'src/utils/stubs/ant-computer-use-mcp-subpaths.ts'),
    '@ant/computer-use-swift': resolve(root, 'src/utils/stubs/ant-computer-use-swift.ts'),
    '@ant/claude-for-chrome-mcp': resolve(root, 'src/utils/stubs/ant-claude-for-chrome-mcp.ts'),
    '@anthropic-ai/sandbox-runtime': resolve(root, 'src/utils/stubs/ant-sandbox-runtime.ts'),
    '@anthropic-ai/claude-agent-sdk': resolve(root, 'src/utils/stubs/ant-claude-agent-sdk.ts'),
    '@anthropic-ai/mcpb': resolve(root, 'src/utils/stubs/ant-mcpb.ts'),
    'color-diff-napi': resolve(root, 'src/utils/stubs/color-diff-napi.ts'),
    'audio-capture-napi': resolve(root, 'src/utils/stubs/audio-capture-napi.ts'),
    'image-processor-napi': resolve(root, 'src/utils/stubs/image-processor-napi.ts'),
    'modifiers-napi': resolve(root, 'src/utils/stubs/modifiers-napi.ts'),
    'url-handler-napi': resolve(root, 'src/utils/stubs/url-handler-napi.ts'),
  },
  loader: {
    '.node': 'empty',
    '.txt': 'text',
    '.md': 'text',
  },
  plugins: [stubMissingInternal],
  tsconfig: resolve(root, 'tsconfig.json'),
  logLevel: 'info',
})

console.log('built dist/cli.mjs')

await build({
  entryPoints: [resolve(root, 'scripts/gemini-login-entry.ts')],
  outfile: resolve(root, 'dist/gemini-login.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as __cr } from "module"; const require = __cr(import.meta.url);' },
  tsconfig: resolve(root, 'tsconfig.json'),
  logLevel: 'info',
})

console.log('built dist/gemini-login.mjs')

await build({
  entryPoints: [resolve(root, 'scripts/gemini-chat-entry.ts')],
  outfile: resolve(root, 'dist/gemini-chat.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as __cr } from "module"; const require = __cr(import.meta.url);' },
  tsconfig: resolve(root, 'tsconfig.json'),
  logLevel: 'info',
})

console.log('built dist/gemini-chat.mjs')

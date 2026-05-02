process.on('exit', code => process._rawDebug(`[debug] process.exit(${code})`));
process.on('uncaughtException', e => process._rawDebug(`[debug] uncaught:`, e?.stack || e));
process.on('unhandledRejection', e => process._rawDebug(`[debug] unhandled rejection:`, e?.stack || e));
const orig = process.exit;
process.exit = (code) => { process._rawDebug(`[debug] process.exit called code=${code}`); orig(code); };
const url = new URL('../dist/cli.mjs', import.meta.url);
import(url.href).catch(e => process._rawDebug('[debug] dynamic import failed:', e?.stack || e));

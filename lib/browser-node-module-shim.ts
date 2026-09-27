/**
 * Browser-only Turbopack alias for Node's "module" builtin.
 *
 * harfbuzzjs' generated Emscripten runtime conditionally imports
 * createRequire only when it detects Node. That branch is unreachable in the
 * browser, but Turbopack resolves it statically. Keeping this shim empty makes
 * the browser graph buildable without polyfilling Node or changing HarfBuzz
 * runtime authority. Server targets continue to resolve the real builtin.
 */
export {};

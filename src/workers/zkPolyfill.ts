// snarkjs / ffjavascript expect Node globals (`Buffer`, `process`) that aren't
// defined in a browser worker. This module installs them and must be imported
// BEFORE snarkjs so the globals exist when its module code evaluates. (ES
// import evaluation order is source order, so `import './zkPolyfill'` first.)
//
// `Buffer` comes from the real `buffer` package. `process` is a hand-rolled
// browser shim: importing the `process` module gets externalized by Vite into a
// stub that throws on `process.versions`, so we define just the fields snarkjs
// touches (it reads `versions` to detect node-vs-browser).
import { Buffer } from 'buffer';

const g = globalThis as unknown as { Buffer?: unknown; process?: unknown; global?: unknown };
if (!g.Buffer) g.Buffer = Buffer;
if (!g.global) g.global = globalThis;
if (!g.process) {
  g.process = {
    browser: true,
    env: {} as Record<string, string>,
    argv: [] as string[],
    version: '',
    versions: {} as Record<string, string>, // no `.node` → snarkjs picks the browser path
    platform: 'browser',
    nextTick: (fn: (...a: unknown[]) => void, ...args: unknown[]) => setTimeout(() => fn(...args), 0),
  };
}

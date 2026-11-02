// Uso: node --experimental-strip-types --import ./scripts/tests/support/register.mjs scripts/generate.ts
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);
await import("./preload.mjs");

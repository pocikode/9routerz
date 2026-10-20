#!/usr/bin/env bun
// Run the built standalone server.
//
// 9router's own `start:bun` script runs `.next/standalone/custom-server.js`
// without a port, and the standalone server reads PORT from the environment
// (not from --port), so it would silently fall back to :3000. This wrapper
// keeps the project's port and forwards any extra CLI args.

import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const WORK = join(ROOT, ".work", "9router");
const ENTRY = join(WORK, ".next", "standalone", "custom-server.js");

if (!existsSync(ENTRY)) {
  console.error(
    "\x1b[31m[start]\x1b[0m no production build found.\n" +
    "        Run: bun run build"
  );
  process.exit(1);
}

const DEFAULT_PORT = process.env.PORT || "20127";

// --port on the CLI wins, then PORT from the environment.
const args = process.argv.slice(2);
let port = DEFAULT_PORT;
const flagIndex = args.findIndex((a) => a === "--port" || a === "-p");
if (flagIndex !== -1 && args[flagIndex + 1]) {
  port = args[flagIndex + 1];
  args.splice(flagIndex, 2);
}

const proc = Bun.spawn(["bun", ENTRY, ...args], {
  cwd: WORK,
  env: { ...process.env, PORT: String(port) },
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const forward = (signal) => {
  try {
    proc.kill(signal);
  } catch {
    /* already gone */
  }
};
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

const code = await proc.exited;
process.exit(code ?? 0);

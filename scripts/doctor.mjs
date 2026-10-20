#!/usr/bin/env bun
// Dry-run every patch against a fresh materialization of the submodule and
// report drift. Read-only: writes only inside .work/doctor (removed on exit).
//
// Usage: bun run doctor

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, copyFileSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { PATCHES } from "../patches/registry.mjs";

const ROOT = join(import.meta.dir, "..");
const SUBMODULE = join(ROOT, "9router");
const SCRATCH = join(ROOT, ".work", "doctor");
const OVERLAY = join(ROOT, "overlay");

const SKIP = new Set([
  ".git", "node_modules", ".next", ".next-cli-build", "graphify-out",
  ".ruff_cache", "._.ruff_cache", "._graphify-out",
]);

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith("._") || entry.name === ".DS_Store") continue;
    const abs = join(dir, entry.name);
    const rel = relative(base, abs);
    if (entry.isDirectory()) walk(abs, base, out);
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function copy(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

function count(haystack, needle) {
  let n = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n++;
    i += needle.length;
  }
  return n;
}

function readSubmoduleVersion() {
  try {
    return JSON.parse(readFileSync(join(SUBMODULE, "package.json"), "utf8")).version;
  } catch {
    return "unknown";
  }
}

function main() {
  if (!existsSync(join(SUBMODULE, "package.json"))) {
    console.error(red("9router submodule missing. Run: git submodule update --init --recursive"));
    process.exit(1);
  }

  console.log(`9router version: ${readSubmoduleVersion()}`);
  console.log(`patches:         ${PATCHES.length}`);
  console.log(`overlay files:   ${existsSync(OVERLAY) ? walk(OVERLAY, OVERLAY).length : 0}\n`);

  if (existsSync(SCRATCH)) rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(SCRATCH, { recursive: true });

  for (const rel of walk(SUBMODULE)) copy(join(SUBMODULE, rel), join(SCRATCH, rel));
  if (existsSync(OVERLAY)) {
    for (const rel of walk(OVERLAY, OVERLAY)) copy(join(OVERLAY, rel), join(SCRATCH, rel));
  }

  const failures = [];
  const applied = new Set();

  for (const patch of PATCHES) {
    const path = join(SCRATCH, patch.file);
    if (!existsSync(path)) {
      failures.push({ patch, reason: "file not found" });
      continue;
    }
    const content = readFileSync(path, "utf8");
    const found = count(content, patch.find);
    const expected = patch.count ?? 1;

    if (found === expected) {
      applied.add(patch.id);
      continue;
    }
    if (found === 0 && count(content, patch.replace) >= 1) {
      // Overlay file already contains the final shape — nothing to do.
      applied.add(patch.id);
      continue;
    }
    failures.push({ patch, reason: `expected ${expected}, found ${found}` });
  }

  // Second pass: apply the ones that matched, then re-verify, so overlapping
  // patches (two edits in one file) are checked against the final text.
  for (const patch of PATCHES) {
    if (!applied.has(patch.id)) continue;
    const path = join(SCRATCH, patch.file);
    const content = readFileSync(path, "utf8");
    if (count(content, patch.find) === (patch.count ?? 1)) {
      writeFileSync(path, content.split(patch.find).join(patch.replace));
    }
  }

  const recheck = [];
  for (const patch of PATCHES) {
    if (!applied.has(patch.id)) continue;
    const content = readFileSync(join(SCRATCH, patch.file), "utf8");
    if (!content.includes(patch.replace)) recheck.push(patch.id);
  }

  rmSync(SCRATCH, { recursive: true, force: true });

  if (failures.length === 0 && recheck.length === 0) {
    console.log(green(`✓ all ${PATCHES.length} patches match the current 9router source`));
    return;
  }

  for (const { patch, reason } of failures) {
    console.error(red(`✗ ${patch.id}`));
    console.error(`  ${patch.file}: ${reason}`);
    console.error(dim(`  ${patch.find.split("\n").slice(0, 2).join("\n  ")}`));
  }
  for (const id of recheck) console.error(yellow(`! ${id}: replacement did not land as expected`));
  console.error(`\n${failures.length + recheck.length} problem(s). Update patches/registry.mjs.`);
  process.exit(1);
}

main();

#!/usr/bin/env bun
// Materialize the build tree: .work/9router = pristine submodule + overlay + patches.
//
// The submodule is NEVER written to. Everything happens in .work/9router.
//
// Files are copied with fs.copyFileSync, which uses APFS clonefile on macOS
// (instant, copy-on-write, no extra disk) and a normal copy elsewhere. Hardlinks
// are deliberately NOT used: a build step writing to a hardlinked file would
// mutate the submodule's inode.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { PATCHES } from "../patches/registry.mjs";

const ROOT = join(import.meta.dir, "..");
const SUBMODULE = join(ROOT, "9router");
const WORK = join(ROOT, ".work", "9router");
const OVERLAY = join(ROOT, "overlay");

const SKIP = new Set([
  ".git", "node_modules", ".next", ".next-cli-build", "graphify-out",
  ".ruff_cache", "._.ruff_cache", "._graphify-out", "._.git",
]);
const PRESERVE_IN_WORK = new Set(["node_modules", ".next", ".next-cli-build"]);

// Root-level env files are owned by this repo (see .env.example), not by the
// submodule, so sync never copies 9router's own .env.example over ours and
// always re-materializes ours into the build tree.
const ROOT_ENV_FILES = [".env", ".env.example"];

function log(msg) {
  console.log(`\x1b[36m[sync]\x1b[0m ${msg}`);
}
function fail(msg) {
  console.error(`\x1b[31m[sync] ${msg}\x1b[0m`);
  process.exit(1);
}

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith("._") || entry.name === ".DS_Store") continue;
    // Env files come from the repo root only (materializeEnvFiles below).
    if (dir === base && ROOT_ENV_FILES.includes(entry.name)) continue;
    const abs = join(dir, entry.name);
    const rel = relative(base, abs);
    if (entry.isDirectory()) walk(abs, base, out);
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function writeCopy(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest)) rmSync(dest, { force: true });
  copyFileSync(src, dest);
}

function assertSubmodule() {
  if (!existsSync(join(SUBMODULE, "package.json"))) {
    fail(`9router submodule not found at ${SUBMODULE}. Run: git submodule update --init --recursive`);
  }
}

function materializeTree() {
  log("copying submodule → .work/9router (copy-on-write)");
  mkdirSync(WORK, { recursive: true });

  // Keep installed deps + previous build output so a re-sync does not force a
  // reinstall or a cold build.
  for (const entry of readdirSync(WORK, { withFileTypes: true })) {
    if (PRESERVE_IN_WORK.has(entry.name)) continue;
    rmSync(join(WORK, entry.name), { recursive: true, force: true });
  }

  const files = walk(SUBMODULE);
  for (const rel of files) {
    const src = join(SUBMODULE, rel);
    if (!statSync(src).isFile()) continue;
    writeCopy(src, join(WORK, rel));
  }
  return files.length;
}

function copyOverlay() {
  if (!existsSync(OVERLAY)) return 0;
  const files = walk(OVERLAY, OVERLAY);
  for (const rel of files) {
    writeCopy(join(OVERLAY, rel), join(WORK, rel));
  }
  return files.length;
}

// Materialize this repo's env files into the build tree.
//
// .env.example is always written (it documents the contract inside .work).
// .env is written only when it exists here: without one the build tree keeps
// whatever it already had, so a .work-local .env is not silently deleted.
function materializeEnvFiles() {
  let copied = 0;

  const exampleSrc = join(ROOT, ".env.example");
  if (existsSync(exampleSrc)) {
    writeCopy(exampleSrc, join(WORK, ".env.example"));
    copied++;
  }

  const envSrc = join(ROOT, ".env");
  if (existsSync(envSrc)) {
    writeCopy(envSrc, join(WORK, ".env"));
    copied++;
    log("applied .env (repo root) → .work/9router/.env");
  } else if (existsSync(join(WORK, ".env"))) {
    log("no .env at repo root — keeping existing .work/9router/.env");
  } else {
    log("no .env found — using defaults (cp .env.example .env to customise)");
  }

  return copied;
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

export function applyPatches({ quiet = false } = {}) {
  const results = { applied: 0, skipped: 0, errors: [] };

  for (const patch of PATCHES) {
    const path = join(WORK, patch.file);
    if (!existsSync(path)) {
      results.errors.push({ id: patch.id, file: patch.file, reason: "file not found" });
      continue;
    }
    const before = readFileSync(path, "utf8");
    const expected = patch.count ?? 1;
    const found = countOccurrences(before, patch.find);

    // Idempotency: a patch already present is a skip, not an error.
    if (found === 0 && countOccurrences(before, patch.replace) >= 1) {
      results.skipped++;
      if (!quiet) log(`  ↷ ${patch.id} (already applied)`);
      continue;
    }

    if (found !== expected) {
      results.errors.push({
        id: patch.id,
        file: patch.file,
        reason: `expected ${expected} occurrence(s), found ${found}`,
        snippet: patch.find.split("\n").slice(0, 3).join("\n"),
      });
      continue;
    }

    // Unlink first: guarantees the write never lands on a shared inode.
    rmSync(path, { force: true });
    writeFileSync(path, before.split(patch.find).join(patch.replace));
    results.applied++;
    if (!quiet) log(`  ✓ ${patch.id}`);
  }

  return results;
}

function ensureDependencies() {
  if (existsSync(join(WORK, "node_modules"))) return;
  log("installing dependencies in .work/9router (first run only)…");
  const proc = Bun.spawnSync(["bun", "install"], { cwd: WORK, stdout: "inherit", stderr: "inherit" });
  if (proc.exitCode !== 0) fail("bun install failed in .work/9router");
}

function main() {
  assertSubmodule();
  const fileCount = materializeTree();
  log(`copied ${fileCount} files`);

  const overlayCount = copyOverlay();
  log(`overlaid ${overlayCount} file(s)`);

  materializeEnvFiles();

  const results = applyPatches();
  if (results.errors.length) {
    console.error("\n\x1b[31m[sync] patch failures:\x1b[0m");
    for (const err of results.errors) {
      console.error(`  ✗ ${err.id} (${err.file}): ${err.reason}`);
      if (err.snippet) console.error(`      ${err.snippet.replace(/\n/g, "\n      ")}`);
    }
    fail("Build aborted: 9router changed upstream. Update patches/registry.mjs.");
  }

  log(`applied ${results.applied} patch(es), skipped ${results.skipped}`);
  ensureDependencies();
  log(`ready → ${WORK}`);
}

if (import.meta.main) main();

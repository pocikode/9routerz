#!/usr/bin/env bun
// Runnable check for the clone account-transfer path. Exercises the real DB
// layer (no mocks) against a throwaway DATA_DIR:
//
//   bun run sync
//   bun scripts/check-clone-transfer.mjs
//
// It imports the materialized build tree (.work/9router) so `@/` resolves, and
// writes only to a temp DATA_DIR — never to ~/.9router or the repo's data/.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const WORK = join(import.meta.dir, "..", ".work", "9router");
// Always override: Bun auto-loads the repo's .env, which points DATA_DIR at the
// real data directory. This check must never touch it.
process.env.DATA_DIR = join(mkdtempSync(join(tmpdir(), "9routerz-check-")), "data");

const load = (rel) => import(pathToFileURL(join(WORK, rel)).href);

const { createProviderConnection, getProviderConnections } = await load("src/lib/localDb.js");
const { createProviderClone, transferConnectionsToClone, deleteProviderClone } = await load(
  "src/lib/providerClones.js"
);

const clone = await createProviderClone({
  sourceProvider: "codebuddy-intl",
  name: "CodeBuddy Free",
  prefix: "cbfree",
});
assert.ok(clone.id.startsWith("provider-clone-"), "clone id");

const mk = (name, apiKey) =>
  createProviderConnection({
    provider: "codebuddy-intl",
    authType: "apikey",
    name,
    apiKey,
  });

const a = await mk("acct-one", "sk-a");
const b = await mk("acct-two", "sk-b");

// Move one account in.
const first = await transferConnectionsToClone(clone.id, [a.id]);
assert.equal(first.moved, 1, "one account moved");

const moved = (await getProviderConnections({ provider: clone.id }))[0];
assert.equal(moved.id, a.id, "same row, re-keyed — not a copy");
assert.equal(moved.apiKey, "sk-a", "credentials untouched");
assert.equal(moved.providerSpecificData.prefix, "cbfree", "clone prefix seeded");
assert.equal(moved.providerSpecificData.sourceProvider, "codebuddy-intl", "source recorded");
assert.equal(moved.priority, 1, "destination pool starts at priority 1");

const source = await getProviderConnections({ provider: "codebuddy-intl" });
assert.deepEqual(
  source.map((c) => c.id),
  [b.id],
  "source pool keeps only the remaining account"
);
assert.equal(source[0].priority, 1, "source priorities stay contiguous");

// Batch validation is all-or-nothing.
const partial = await transferConnectionsToClone(clone.id, [b.id, "no-such-id"]);
assert.equal(partial.status, 404, "unknown id rejects the whole batch");
assert.equal(
  (await getProviderConnections({ provider: "codebuddy-intl" }))[0]?.id,
  b.id,
  "rejected batch moved nothing"
);

// An account already in the destination pool is refused, not duplicated.
await createProviderConnection({
  provider: clone.id,
  authType: "apikey",
  name: "acct-two",
  apiKey: "sk-b-copy",
});
assert.equal((await transferConnectionsToClone(clone.id, [b.id])).status, 409, "duplicate account refused");

// Re-moving an account that already left the source is a not-found.
assert.equal((await transferConnectionsToClone(clone.id, [a.id])).status, 404, "already-moved account");

// Empty selection / unknown clone.
assert.equal((await transferConnectionsToClone(clone.id, [])).status, 400, "empty selection");
assert.equal(
  (await transferConnectionsToClone("provider-clone-nope", [b.id])).status,
  404,
  "unknown clone"
);

await deleteProviderClone(clone.id);
console.log("✓ clone account transfer: all checks passed");

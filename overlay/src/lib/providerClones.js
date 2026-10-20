// Provider clones — server-side registry backed by the providerNodes table.
//
// Reuses the existing `providerNodes` table (type = "provider-clone"), so no
// schema migration is needed and existing 9router data is untouched. The table
// stores { id, type, name, data } where data is free-form JSON — that is where
// sourceProvider / prefix / baseUrl live.
//
// The runtime needs SYNCHRONOUS provider→source resolution (getTargetFormat,
// getExecutor, REFRESH_HANDLERS are all sync), so the table is loaded into an
// in-memory map once at boot (instrumentation.js) and refreshed by the clone
// API routes on every write. Reads never hit the DB on the hot path.

import { getProviderNodes, getProviderNodeById, createProviderNode, updateProviderNode, deleteProviderNode } from "@/lib/localDb";
import {
  PROVIDER_CLONE_PREFIX,
  PROVIDER_CLONE_TYPE,
  registerProviderClones,
  isProviderCloneId,
  getCloneMeta,
  listRegisteredClones,
  resolveProviderSource,
} from "@/shared/constants/providerClones.js";

export {
  PROVIDER_CLONE_PREFIX,
  PROVIDER_CLONE_TYPE,
  isProviderCloneId,
  getCloneMeta,
  listRegisteredClones,
  resolveProviderSource,
};

function toCloneEntry(node) {
  if (!node?.id) return null;
  // rowToNode() flattens the JSON `data` column onto the row, so clone fields
  // arrive at the top level (a nested `data` key only exists in raw SQL rows).
  const data = node.data && typeof node.data === "object" ? node.data : node;
  return {
    id: node.id,
    type: node.type,
    name: node.name || data.name || "",
    sourceProvider: data.sourceProvider || "",
    prefix: data.prefix || "",
    baseUrl: data.baseUrl || "",
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

/** Load every clone node into the in-memory registry. Returns the count. */
export async function primeCloneRegistry() {
  try {
    const nodes = await getProviderNodes({ type: PROVIDER_CLONE_TYPE });
    const entries = nodes.map(toCloneEntry).filter((n) => n?.sourceProvider);
    registerProviderClones(entries);
    primed = true;
    return entries.length;
  } catch {
    // DB not ready yet (first boot / migration in flight) — leave the registry
    // empty; the next prime or clone API write fills it in.
    return 0;
  }
}

// The runtime resolution helpers are synchronous, so the registry has to be
// loaded before they are used. instrumentation.js primes it at boot, but that
// can run before the DB adapter is ready; every async entry point therefore
// awaits this once. A failed attempt leaves `primed` false so it retries.
let primed = false;
let priming = null;

export async function ensureCloneRegistry() {
  if (primed) return true;
  if (!priming) {
    priming = primeCloneRegistry()
      .then((count) => count >= 0 && primed)
      .catch(() => false)
      .finally(() => {
        priming = null;
      });
  }
  return priming;
}

/** All clones as plain objects (API + UI shape). */
export async function listProviderClones() {
  const nodes = await getProviderNodes({ type: PROVIDER_CLONE_TYPE });
  return nodes.map(toCloneEntry).filter(Boolean);
}

export async function getProviderClone(id) {
  if (!isProviderCloneId(id)) return null;
  const node = await getProviderNodeById(id);
  if (!node || node.type !== PROVIDER_CLONE_TYPE) return null;
  return toCloneEntry(node);
}

export async function createProviderClone({ sourceProvider, prefix, name, baseUrl = "" }) {
  const id = `${PROVIDER_CLONE_PREFIX}${crypto.randomUUID()}`;
  // createProviderNode persists a fixed field set (id/type/name/prefix/apiType/
  // baseUrl), so the clone-specific `sourceProvider` is written by a follow-up
  // update — updateProviderNode stores arbitrary keys in the JSON `data` column.
  await createProviderNode({
    id,
    type: PROVIDER_CLONE_TYPE,
    name,
    prefix,
    baseUrl,
  });
  const node = await updateProviderNode(id, { sourceProvider, prefix, baseUrl });
  await primeCloneRegistry();
  return toCloneEntry(node);
}

export async function updateProviderClone(id, updates) {
  // Merge explicitly so a partial PUT (e.g. only the name) never drops
  // sourceProvider — updateProviderNode merges, but we also want the returned
  // entry to be complete.
  const existing = await getProviderClone(id);
  if (!existing) return null;
  const node = await updateProviderNode(id, {
    sourceProvider: updates.sourceProvider ?? existing.sourceProvider,
    prefix: updates.prefix ?? existing.prefix,
    baseUrl: updates.baseUrl ?? existing.baseUrl,
    ...(updates.name !== undefined ? { name: updates.name } : {}),
  });
  await primeCloneRegistry();
  return node ? toCloneEntry(node) : null;
}

export async function deleteProviderClone(id) {
  const removed = await deleteProviderNode(id);
  await primeCloneRegistry();
  return removed ? toCloneEntry(removed) : null;
}

/**
 * Prefixes already taken by a clone — used for uniqueness validation alongside
 * the registry's own ids/aliases.
 */
export async function getTakenClonePrefixes(excludeId = null) {
  const clones = await listProviderClones();
  return new Set(
    clones
      .filter((c) => c.id !== excludeId)
      .map((c) => (c.prefix || "").trim().toLowerCase())
      .filter(Boolean)
  );
}

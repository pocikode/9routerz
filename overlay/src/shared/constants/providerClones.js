// Provider clones — client-safe registry.
//
// A "clone" is a full provider identity (own prefix, own account pool) that
// behaves exactly like an existing registry provider. The only thing that
// differs at runtime is the provider id used for credentials; everything else
// (transport, headers, executor quirks, OAuth flow, token refresh, models,
// thinking levels, quota) is resolved back to the source provider.
//
// This module is imported by BOTH the browser bundle and server code, so it
// must stay free of node:fs / DB imports. The server primes it from the
// providerNodes table (see src/lib/providerClones.js) and the dashboard primes
// it from GET /api/provider-clones.

export const PROVIDER_CLONE_PREFIX = "provider-clone-";
export const PROVIDER_CLONE_TYPE = "provider-clone";

/** id -> { id, sourceProvider, prefix, name, baseUrl } */
const cloneMeta = new Map();

export function isProviderCloneId(id) {
  return typeof id === "string" && id.startsWith(PROVIDER_CLONE_PREFIX);
}

/** Replace the registry contents (full sync — removes clones that disappeared). */
export function registerProviderClones(entries) {
  const next = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.id || !isProviderCloneId(entry.id) || !entry.sourceProvider) continue;
    next.set(entry.id, {
      id: entry.id,
      sourceProvider: entry.sourceProvider,
      prefix: entry.prefix || "",
      name: entry.name || "",
      baseUrl: entry.baseUrl || "",
    });
  }
  cloneMeta.clear();
  for (const [id, meta] of next) cloneMeta.set(id, meta);
  return cloneMeta.size;
}

export function getCloneMeta(id) {
  return cloneMeta.get(id) || null;
}

export function listRegisteredClones() {
  return [...cloneMeta.values()];
}

/**
 * Resolve a provider id to the id whose behavior should be used.
 * Non-clones (and clones whose registry entry is missing) return unchanged.
 */
export function resolveProviderSource(id) {
  if (!isProviderCloneId(id)) return id;
  return cloneMeta.get(id)?.sourceProvider || id;
}

/** Clone prefix (the `prefix/model` namespace), or null when id is not a clone. */
export function getClonePrefix(id) {
  return cloneMeta.get(id)?.prefix || null;
}

/** Display name for a clone, or null when id is not a clone. */
export function getCloneName(id) {
  return cloneMeta.get(id)?.name || null;
}

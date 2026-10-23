# AGENTS.md

Thin wrapper adding clonable providers on top of pristine `9router/` submodule. Build tree `.work/9router` is disposable and gitignored.

## Never edit these

- `9router/` submodule — stays byte-identical (`git -C 9router status` must be clean). All changes go in `overlay/` (new files) or `patches/registry.mjs` (edits to upstream files).
- `.work/9router/.env` — overwritten from root `.env` on every sync. Edit root `.env` only.

## Commands (bun, from repo root)

```bash
bun run sync    # materialize .work/9router = submodule + overlay + patches (+ bun install first run)
bun run doctor  # dry-run patches against fresh submodule copy, report drift (read-only)
bun run dev     # sync + next dev → .work/9router/.next-dev (hot reload)
bun run build   # sync + production build → .work/9router/.next/standalone/
bun run start   # run built server, default :20127; --port/-p or PORT= overrides
bun run clean   # rm -rf .work
```

Notes: `dev` uses `.next-dev` and `build` uses `.next`, so they don't clobber each other. `start` requires a prior `build` (it execs `.next/standalone/custom-server.js` with cwd `.work/9router`). `sync` preserves `.work` `node_modules`/`.next` so re-sync is incremental; copies use `copyFileSync`, never hardlinks. Bun is the tested runtime; empty `DATA_DIR` means `~/.9router` (shares data with a stock 9router install).

## How clones work

- Clone = `providerNodes` row `{ id: "provider-clone-<uuid>", type: "provider-clone", data: { sourceProvider, prefix, baseUrl } }`. No migration, no new table.
- Credentials/cooldowns/round-robin key by **clone id**; transport/executor/OAuth/refresh/quota/caps/thinking resolve to **source id** via `resolveProviderSource(id)`.
- Client-safe resolver `overlay/src/shared/constants/providerClones.js` must stay free of `node:fs`/DB imports (bundled into browser + server). Server registry `overlay/src/lib/providerClones.js` holds an in-memory `Map`: primed at boot (`instrumentation.js` patch), every async entry point must `await ensureCloneRegistry()` before any sync lookup, every clone write re-primes.
- Overlay files: `src/lib/providerClones.js`, `src/shared/constants/providerClones.js`, `src/app/api/provider-clones/**`, `CloneProviderModal.js`, `EditProviderCloneModal.js`, `MoveToCloneModal.js`.

## Patch rules (`patches/registry.mjs`, currently 107 entries over 23 files)

- Each entry is exact-string `find` + expected `count`; `sync` aborts naming file+snippet on mismatch instead of half-patching. Keep replacements minimal/additive, routing identity lookups through `resolveProviderSource`, never restructuring upstream.
- After `git -C 9router fetch && git -C 9router checkout <tag>`: `bun run doctor`, fix drifted entries in `registry.mjs`, then `bun run build`.

## Upstream context

- Pinned submodule commit `f39d8f07481ae8518e93175f0ecaaafa61573c6c` (9router v0.5.109, 2026-10-23). Patch set targets this revision.
- Read `9router/CLAUDE.md` before touching gateway/registry/DB code, and `9router/open-sse/AGENTS.md` before touching anything under `open-sse/` or `src/sse/`. Upstream is plain JS ESM with `@/ → src/*`; its vitest suite lives in `9router/tests/` (independent package, baseline has known fails — see its CLAUDE.md, use `npx vitest run <file>` from `9router/tests/`).
- Verify a clone end-to-end with the curl flow in `README.md` ("Testing a clone"); prefix rule `^[a-z0-9][a-z0-9._-]{0,31}$`, unique across built-in ids/aliases, compatible-node prefixes, and other clones.

## Knowledge graph (graphify)

- Root graph `graphify-out/` covers the wrapper only — `overlay/`, `scripts/`, `patches/`, `package.json`, `AGENTS.md`, `README.md`: **133 nodes · 193 edges · 14 communities**.
- `9router/` is deliberately **excluded** from it (see `.graphifyignore`): the submodule is a separate upstream project that already has its own graph at `9router/graphify-out/` — **7,888 nodes · 20,154 edges · 426 communities** from 1,461 files. Folding it in would duplicate ~1,461 files and flatten those 426 communities into this one.
- Rebuild each side separately: run graphify inside `9router/` for the submodule graph, or `graphify --update` from the repo root for the wrapper graph after editing files here. Never merge the two.

# 9routerz

A thin, upgrade-safe wrapper around the [`9router`](./9router) submodule that adds
**clonable providers**.

A clone is a full provider identity — its own model prefix and its own account
pool — that behaves *exactly* like an existing provider: same endpoint, headers,
executor quirks, OAuth flow, token refresh, model catalog, thinking levels and
quota endpoint.

```
codebuddy-intl  (prefix cbai)   ← original, accounts A
provider-clone-…  (prefix cbai2) ← clone, accounts B
provider-clone-…  (prefix cbai3) ← another clone, accounts C
```

All three talk to `https://www.codebuddy.ai/v2/chat/completions` with the same
CLI headers; only the credential pool and the `prefix/` namespace differ.

## The submodule is never modified

`9router/` stays byte-identical (verify with `git -C 9router status`). Everything
lives outside and is materialized into a build tree at build time:

```
9routerz/
├── 9router/              pristine submodule (do not edit)
├── overlay/              new files, copied into the build tree
│   ├── src/lib/providerClones.js              server registry (DB-backed)
│   ├── src/shared/constants/providerClones.js client-safe resolver
│   ├── src/app/api/provider-clones/…          REST API
│   └── src/app/(dashboard)/…/CloneProviderModal.js
├── patches/registry.mjs  100 exact-match codemods applied to upstream files
├── scripts/sync.mjs      submodule → .work/9router + overlay + patches
├── scripts/doctor.mjs    dry-run every patch, report upstream drift
└── .work/9router         build tree (gitignored, disposable)
```

## Build and run

```bash
bun run build      # sync + production build → .work/9router/.next/standalone/
bun run start      # run the built server on :20127
```

`bun run build` produces a **self-contained** server at
`.work/9router/.next/standalone/`. It needs no `bun install` and no source tree:

```
.work/9router/.next/standalone/
├── custom-server.js   ← entry point (IP sanitising wrapper + Next server)
├── server.js          ← Next standalone server
├── node_modules/      ← traced production deps
├── public/            ← copied by postbuild
├── .next/static/      ← copied by postbuild
└── src/               ← only files loaded by absolute path at runtime
```

### Run it in place

```bash
bun run start                  # :20127 (from .env)
bun run start -- --port 8080   # override the port
PORT=8080 bun run start        # same, via env
```

### Deploy the artifact elsewhere

The standalone directory is portable — copy it anywhere and run:

```bash
cp -R .work/9router/.next/standalone /srv/9router
cp .env /srv/9router/.env
cd /srv/9router
bun custom-server.js           # or: PORT=8080 bun custom-server.js
```

Node works too (`node custom-server.js`) as long as the runtime can load the
traced native modules (`better-sqlite3` / `bun:sqlite`); Bun is the tested path.

Set `DATA_DIR` in the deployed `.env` to an absolute path — an empty value means
`~/.9router`, and a relative one resolves against the process cwd.

### `dev` and `build` no longer collide

`bun run dev` writes to `.next-dev`, so it can run alongside a production build
without wiping `.next/standalone`. Previously `dev` reused `.next` and destroyed
the build output.

| Command | Output dir | Use |
|---|---|---|
| `bun run dev` | `.work/9router/.next-dev` | local development, hot reload |
| `bun run build` | `.work/9router/.next` | production artifact |
| `bun run start` | — | runs `.next/standalone` |

## Environment

`.env.example` mirrors 9router's contract, with values adapted for running on the
host instead of the upstream Docker image. `.env` is gitignored; `.env.example`
is committed.

`scripts/sync.mjs` copies `.env` and `.env.example` from the repo root into
`.work/9router/` on every sync, because that is the working directory the
standalone server and `next dev` read `.env` from. **Edit the root `.env`, not
the one in `.work/`** — the copy is overwritten.

Defaults worth knowing:

| Variable | Default here | Notes |
|---|---|---|
| `DATA_DIR` | *(empty → `~/.9router`)* | Empty reuses a stock 9router install's data, so existing providers/connections carry over. |
| `PORT` | `20127` | `dev` passes its own `--port`; `start` reads this. |
| `JWT_SECRET` | generated per install | If unset, 9router writes `~/.9router/jwt-secret` on first boot. `.env` ships a random value. |
| `INITIAL_PASSWORD` | `change-me` | Only used until a password is stored in the DB. |
| `MACHINE_ID_SALT` | `endpoint-proxy-salt` | Embedded in generated `sk-{machineId}-…` API keys. |
| `API_KEY_SECRET` | `endpoint-proxy-api-key-secret` | HMAC secret for generated API keys; changing it invalidates existing `sk-…` keys. |
| `NINEROUTER_PROXY_CLIENT_MAX_BODY_SIZE` | `128mb` | Read at build time by `next.config.mjs`. |

Verified behaviours: `JWT_SECRET` from `.env` is used for dashboard sessions (a
token signed with it returns 200; one signed with a different secret returns
401), `PORT` is honoured by `start`, and an empty `DATA_DIR` falls back to
`~/.9router`.

## How it works

### Identity vs. accounts

Two different ids are used deliberately:

| Purpose | Id used |
|---|---|
| Credential lookup, cooldowns, round-robin, proxy pools, `providerStrategies`, `providerThinking` | **clone id** |
| Transport, executor, target format, models, capabilities, thinking levels, OAuth flow, refresh handler, quota handler | **source id** |

`resolveProviderSource(id)` is the single switch. Because 9router already keys
every *account* concern by provider string, isolation comes for free.

The resolver is synchronous (it is called from `getTargetFormat`, `getExecutor`,
`REFRESH_HANDLERS`, …), so the clone table is held in an in-memory `Map`:

- `instrumentation.js` primes it at boot;
- every async entry point (`getModelInfo`, the OAuth route, provider test/model
  routes) awaits `ensureCloneRegistry()`, which retries if the DB was not ready
  yet;
- clone create/update/delete re-prime it immediately.

### Storage — no migration

Clones reuse the existing `providerNodes` table:

```js
{ id: "provider-clone-<uuid>", type: "provider-clone", name: "CodeBuddy 2",
  data: { sourceProvider: "codebuddy-intl", prefix: "cbai2", baseUrl: "" } }
```

`data` is the table's existing free-form JSON column, so **existing 9router
databases work unchanged** — no schema change, no migration step. Compatible
nodes (`openai-compatible-*`, `anthropic-compatible-*`, `custom-embedding-*`)
continue to live in the same table untouched.

### Patch surface

100 codemods across 18 upstream files. Each is an exact string replacement with
an expected occurrence count; `sync.mjs` aborts loudly on a mismatch instead of
producing a half-patched build, and `doctor.mjs` reports drift before you build.

| Area | Files |
|---|---|
| Transport / format | `open-sse/services/provider.js` |
| Executor selection | `open-sse/executors/index.js` |
| Request pipeline | `open-sse/handlers/chatCore.js` |
| Token refresh | `open-sse/services/tokenRefresh.js` |
| Usage / quota | `open-sse/services/usage.js` |
| Capabilities / thinking | `open-sse/providers/{capabilities,thinkingLevels}.js` |
| Prefix routing | `src/sse/services/model.js` |
| Credential selection | `src/sse/services/auth.js` |
| OAuth flows | `src/lib/oauth/providers/index.js`, `src/app/api/oauth/[provider]/[action]/route.js`, `src/shared/components/OAuthModal.js` |
| Provider API | `src/app/api/providers/{route.js,validate, [id]/models, [id]/test}` |
| Model catalog | `src/app/api/v1/models/route.js` |
| Dashboard | `providers/page.js`, `providers/[id]/page.js`, `ModelSelectModal.js` |
| Boot | `src/instrumentation.js` |

## Clone semantics

- **Starts empty.** A clone has its own account pool; add OAuth logins or API
  keys for it. The source's accounts are never duplicated (shared refresh tokens
  would rotate against each other).
- **Any registry provider is cloneable**, except entries with no transport
  (media-only) and `local-device`. Providers whose login uses a bespoke dashboard
  modal (Kiro, Cursor, Zed, Trae, Windsurf, GitLab, Xiaomi) are flagged
  `oauthSupported: false` in the source catalog — API-key cloning still works,
  OAuth must be done on the original.
- **Prefix rules:** `^[a-z0-9][a-z0-9._-]{0,31}$`, unique across built-in
  ids/aliases, compatible-node prefixes, and other clones.
- **Renaming a prefix** cascades into the clone's existing connections, so model
  routing updates atomically.
- **Deleting a clone** removes its node and its connections only.

## Testing a clone

```bash
# list cloneable sources
curl -s -H "x-9r-cli-token: $TOKEN" localhost:20127/api/provider-clones | jq '.sources | length'

# create
curl -s -X POST -H "x-9r-cli-token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"sourceProvider":"codebuddy-intl","name":"CodeBuddy 2","prefix":"cbai2"}' \
  localhost:20127/api/provider-clones

# add an account to the clone (OAuth device flow, or an API key)
# then call it like any other provider:
curl -s -X POST localhost:20127/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"cbai2/glm-5.2","messages":[{"role":"user","content":"hi"}]}'
```

The request log shows the clone id and account; the upstream URL is the source
provider's endpoint.

## Upgrading 9router

The patches are pinned against **9router v0.5.104** — submodule commit
`87a74e1bda3677193c6f71a7e2100c90311f0689` (`git -C 9router describe --tags` →
`v0.5.104`). That commit is what `patches/registry.mjs` was verified against.

```bash
git -C 9router fetch && git -C 9router checkout <new-tag>
bun run doctor          # see which patches drifted
bun run build           # fails fast if a patch anchor moved
```

If `doctor` reports drift, update the matching entry in
`patches/registry.mjs` — the error names the file and shows the stale snippet.

## Limitations

- Executor internals log the source provider id; the `▶` request line shows the
  clone.
- A clone's `enabledModels` is not auto-seeded; `/v1/models` serves the source
  catalog under the clone prefix, and per-connection model selection works as
  usual.
- Rebuilding after an upstream bump recompiles `.next` (cold build).

// Patch registry — the complete list of edits applied to the 9router tree at
// build time.
//
// Each entry is an exact-string replacement with an expected occurrence count.
// `sync.mjs` applies them to a fresh copy of the submodule; `doctor.mjs`
// dry-runs them and reports drift. Nothing is ever written into `9router/`.
//
// RULES
//  - `find` must be unique in the target file unless `count` says otherwise; a
//    mismatch aborts the build naming the file and snippet.
//  - Keep replacements minimal and additive: route provider-identity lookups
//    through resolveProviderSource(), never restructure upstream code.

const CLONES_IMPORT =
  'import { resolveProviderSource } from "@/shared/constants/providerClones.js";';

export const PATCHES = [
  // ═══════════════════════════════════════════════════════════════════════════
  // Transport & target format
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "provider.js/imports",
    file: "open-sse/services/provider.js",
    find: `import { OPENAI_COMPAT_BASE, ANTHROPIC_COMPAT_BASE } from "../providers/shared.js";`,
    replace: `import { OPENAI_COMPAT_BASE, ANTHROPIC_COMPAT_BASE } from "../providers/shared.js";
${CLONES_IMPORT}`,
  },
  {
    id: "provider.js/getProviderConfig",
    file: "open-sse/services/provider.js",
    find: `function getProviderConfig(provider, credentials = null) {
  if (isOpenAICompatible(provider)) {`,
    replace: `function getProviderConfig(provider, credentials = null) {
  // Provider clones reuse the source provider's transport and wire format.
  provider = resolveProviderSource(provider);
  if (isOpenAICompatible(provider)) {`,
  },
  {
    id: "provider.js/resolveTransport",
    file: "open-sse/services/provider.js",
    find: `export function resolveTransport(provider, sourceFormat) {
  const config = PROVIDERS[provider];`,
    replace: `export function resolveTransport(provider, sourceFormat) {
  const config = PROVIDERS[resolveProviderSource(provider)];`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Executor
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "executors/index.js/imports",
    file: "open-sse/executors/index.js",
    find: `import { DefaultExecutor } from "./default.js";`,
    replace: `import { DefaultExecutor } from "./default.js";
${CLONES_IMPORT}`,
  },
  {
    id: "executors/index.js/getExecutor",
    file: "open-sse/executors/index.js",
    find: `export function getExecutor(provider) {
  if (executors[provider]) return executors[provider];
  if (!defaultCache.has(provider)) defaultCache.set(provider, new DefaultExecutor(provider));
  return defaultCache.get(provider);
}

export function hasSpecializedExecutor(provider) {
  return !!executors[provider];
}`,
    replace: `export function getExecutor(provider) {
  // Provider clones behave exactly like their source: same executor instance,
  // same transport config, same auth descriptors and quirks. Only the
  // credentials differ, and those are looked up by the caller using the clone id.
  const source = resolveProviderSource(provider);
  if (executors[source]) return executors[source];
  if (!defaultCache.has(source)) defaultCache.set(source, new DefaultExecutor(source));
  return defaultCache.get(source);
}

export function hasSpecializedExecutor(provider) {
  return !!executors[resolveProviderSource(provider)];
}`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // chatCore — alias/caps/forceStream resolve to source, request keeps clone id
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "chatCore.js/imports",
    file: "open-sse/handlers/chatCore.js",
    find: `import { getExecutor } from "../executors/index.js";`,
    replace: `import { getExecutor } from "../executors/index.js";
${CLONES_IMPORT}`,
  },
  {
    id: "chatCore.js/source-provider",
    file: "open-sse/handlers/chatCore.js",
    find: `  const alias = PROVIDER_ID_TO_ALIAS[provider] || provider;
  const modelTargetFormat = getModelTargetFormat(alias, model);`,
    replace: `  // Clones inherit the source provider's model catalog (target format, upstream
  // ids, strip list, thinking levels) while keeping their own credential pool.
  const sourceProvider = resolveProviderSource(provider);
  const alias = PROVIDER_ID_TO_ALIAS[sourceProvider] || sourceProvider;
  const modelTargetFormat = getModelTargetFormat(alias, model);`,
  },
  {
    id: "chatCore.js/forceStream",
    file: "open-sse/handlers/chatCore.js",
    find: `  const providerRequiresStreaming = PROVIDERS[provider]?.forceStream === true;`,
    replace: `  const providerRequiresStreaming = PROVIDERS[sourceProvider]?.forceStream === true;`,
  },
  {
    id: "chatCore.js/capabilities",
    file: "open-sse/handlers/chatCore.js",
    find: `    const caps = getCapabilitiesForModel(provider, model);`,
    replace: `    const caps = getCapabilitiesForModel(sourceProvider, model);`,
  },
  {
    id: "chatCore.js/claude-tool-type",
    file: "open-sse/handlers/chatCore.js",
    find: `  if (shouldDefaultClaudeToolType(provider, finalFormat, translatedBody.tools, PROVIDERS)) {`,
    replace: `  if (shouldDefaultClaudeToolType(sourceProvider, finalFormat, translatedBody.tools, PROVIDERS)) {`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Token refresh
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "tokenRefresh.js/imports",
    file: "open-sse/services/tokenRefresh.js",
    find: `import { PROVIDERS } from "../config/providers.js";`,
    replace: `import { PROVIDERS } from "../config/providers.js";
${CLONES_IMPORT}`,
  },
  {
    id: "tokenRefresh.js/refreshLead",
    file: "open-sse/services/tokenRefresh.js",
    find: `export function getRefreshLeadMs(provider) {
  if (REFRESH_LEAD_MS[provider]) return REFRESH_LEAD_MS[provider];`,
    replace: `export function getRefreshLeadMs(provider) {
  // Clones share the source provider's refresh lead.
  provider = resolveProviderSource(provider);
  if (REFRESH_LEAD_MS[provider]) return REFRESH_LEAD_MS[provider];`,
  },
  {
    id: "tokenRefresh.js/getAccessToken",
    file: "open-sse/services/tokenRefresh.js",
    find: `  const handler = REFRESH_HANDLERS[provider];
  if (!handler) {
    log?.warn?.("TOKEN_REFRESH", \`Unsupported provider for token refresh: \${provider}\`);
    return null;
  }
  return handler(credentials, log);`,
    replace: `  const handler = REFRESH_HANDLERS[resolveProviderSource(provider)];
  if (!handler) {
    log?.warn?.("TOKEN_REFRESH", \`Unsupported provider for token refresh: \${provider}\`);
    return null;
  }
  return handler(credentials, log);`,
  },
  {
    id: "tokenRefresh.js/refreshTokenByProvider",
    file: "open-sse/services/tokenRefresh.js",
    find: `export async function refreshTokenByProvider(provider, credentials, log) {
  if (!credentials.refreshToken) return null;
  const handler = REFRESH_HANDLERS[provider];
  return handler ? handler(credentials, log) : refreshAccessToken(provider, credentials.refreshToken, credentials, log);
}`,
    replace: `export async function refreshTokenByProvider(provider, credentials, log) {
  if (!credentials.refreshToken) return null;
  // Clones reuse the source's refresh handler / OAuth client config.
  const source = resolveProviderSource(provider);
  const handler = REFRESH_HANDLERS[source];
  return handler ? handler(credentials, log) : refreshAccessToken(source, credentials.refreshToken, credentials, log);
}`,
  },
  {
    id: "tokenRefresh.js/formatProviderCredentials",
    file: "open-sse/services/tokenRefresh.js",
    find: `export function formatProviderCredentials(provider, credentials, log) {
  const config = PROVIDERS[provider];`,
    replace: `export function formatProviderCredentials(provider, credentials, log) {
  provider = resolveProviderSource(provider);
  const config = PROVIDERS[provider];`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Usage / quota
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "usage.js/imports",
    file: "open-sse/services/usage.js",
    find: `import { getGitHubUsage } from "./usage/github.js";`,
    replace: `${CLONES_IMPORT}
import { getGitHubUsage } from "./usage/github.js";`,
  },
  {
    id: "usage.js/handler",
    file: "open-sse/services/usage.js",
    find: `  const handler = USAGE_HANDLERS[provider];`,
    replace: `  const handler = USAGE_HANDLERS[resolveProviderSource(provider)];`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Thinking levels & capabilities
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "thinkingLevels.js/imports",
    file: "open-sse/providers/thinkingLevels.js",
    find: `import { getProviderModels } from "../config/providerModels.js";`,
    replace: `import { getProviderModels } from "../config/providerModels.js";
${CLONES_IMPORT}`,
  },
  {
    id: "thinkingLevels.js/resolve",
    file: "open-sse/providers/thinkingLevels.js",
    find: `export function getThinkingLevels(provider, model) {
  if (provider === "kiro" && resolveKiroEffortPath(model) === null) return null;`,
    replace: `export function getThinkingLevels(provider, model) {
  // Clones inherit the source provider's per-model thinking levels.
  provider = resolveProviderSource(provider);
  if (provider === "kiro" && resolveKiroEffortPath(model) === null) return null;`,
  },
  {
    id: "capabilities.js/imports",
    file: "open-sse/providers/capabilities.js",
    find: `import { matchPattern } from "./pricing.js";`,
    replace: `import { matchPattern } from "./pricing.js";
${CLONES_IMPORT}`,
  },
  {
    id: "capabilities.js/resolve",
    file: "open-sse/providers/capabilities.js",
    find: `export function getCapabilitiesForModel(provider, model) {
  if (!model) return { ...DEFAULT_CAPABILITIES };`,
    replace: `export function getCapabilitiesForModel(provider, model) {
  if (!model) return { ...DEFAULT_CAPABILITIES };
  // Clones read the source provider's capability table.
  provider = resolveProviderSource(provider);`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Model routing by prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sse/services/model.js/ensure-registry",
    file: "src/sse/services/model.js",
    find: `import REGISTRY from "open-sse/providers/registry/index.js";`,
    replace: `import REGISTRY from "open-sse/providers/registry/index.js";
import { ensureCloneRegistry } from "@/lib/providerClones.js";`,
  },
  {
    id: "sse/services/model.js/await-registry",
    file: "src/sse/services/model.js",
    find: `    if (!RESERVED_PROVIDER_PREFIXES.has(parsed.providerAlias)) {
      const openaiNodes = await getProviderNodes({ type: "openai-compatible" });`,
    replace: `    if (!RESERVED_PROVIDER_PREFIXES.has(parsed.providerAlias)) {
      // Clones must be resolvable before any provider-id lookup happens.
      await ensureCloneRegistry();
      const openaiNodes = await getProviderNodes({ type: "openai-compatible" });`,
  },
  {
    id: "sse/services/model.js/clone-prefix",
    file: "src/sse/services/model.js",
    find: `      const embeddingNodes = await getProviderNodes({ type: "custom-embedding" });
      const matchedEmbedding = embeddingNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedEmbedding) {
        return { provider: matchedEmbedding.id, model: parsed.model };
      }`,
    replace: `      const embeddingNodes = await getProviderNodes({ type: "custom-embedding" });
      const matchedEmbedding = embeddingNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedEmbedding) {
        return { provider: matchedEmbedding.id, model: parsed.model };
      }

      // Provider clones: full provider identity with its own prefix and accounts.
      const cloneNodes = await getProviderNodes({ type: "provider-clone" });
      const matchedClone = cloneNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedClone) {
        return { provider: matchedClone.id, model: parsed.model };
      }`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Credentials: query by clone id, feature branches by source id
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sse/services/auth.js/imports",
    file: "src/sse/services/auth.js",
    find: `import { resolveProviderId, FREE_PROVIDERS } from "@/shared/constants/providers.js";`,
    replace: `import { resolveProviderId, FREE_PROVIDERS } from "@/shared/constants/providers.js";
${CLONES_IMPORT}`,
  },
  {
    id: "sse/services/auth.js/source-id",
    file: "src/sse/services/auth.js",
    find: `    // Resolve alias to provider ID (e.g., "kc" -> "kilocode")
    const providerId = resolveProviderId(provider);`,
    replace: `    // Resolve alias to provider ID (e.g., "kc" -> "kilocode")
    const providerId = resolveProviderId(provider);
    // Connections are queried by the requested id so a clone keeps its own pool;
    // provider-specific behavior is keyed by the source provider.
    const sourceProviderId = resolveProviderSource(providerId);`,
  },
  {
    id: "sse/services/auth.js/free-providers",
    file: "src/sse/services/auth.js",
    find: `    if (FREE_PROVIDERS[providerId]?.noAuth) {`,
    replace: `    if (FREE_PROVIDERS[sourceProviderId]?.noAuth) {`,
  },
  {
    id: "sse/services/auth.js/antigravity",
    file: "src/sse/services/auth.js",
    find: `    const isAntigravity = providerId === "antigravity";`,
    replace: `    const isAntigravity = sourceProviderId === "antigravity";`,
  },
  {
    id: "sse/services/auth.js/codex-enabled-models",
    file: "src/sse/services/auth.js",
    find: `      if (providerId === "codex" && Array.isArray(enabled) && enabled.length && requestedModel && !enabled.includes(requestedModel)) return false;`,
    replace: `      if (sourceProviderId === "codex" && Array.isArray(enabled) && enabled.length && requestedModel && !enabled.includes(requestedModel)) return false;`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OAuth flows
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "oauth/providers/index.js/imports",
    file: "src/lib/oauth/providers/index.js",
    find: `import { extractCodexAccountInfo, fetchKiroProfileArn } from "../providerHelpers.js";`,
    replace: `import { extractCodexAccountInfo, fetchKiroProfileArn } from "../providerHelpers.js";
${CLONES_IMPORT}`,
  },
  {
    id: "oauth/providers/index.js/getProvider",
    file: "src/lib/oauth/providers/index.js",
    find: `export function getProvider(name) {
  // Legacy kimi-coding → kimi (dual-auth merge)
  const key = name === "kimi-coding" ? "kimi" : name;`,
    replace: `export function getProvider(name) {
  // Provider clones run the source provider's OAuth flow; the caller still
  // stores the resulting connection under the clone id.
  name = resolveProviderSource(name);
  // Legacy kimi-coding → kimi (dual-auth merge)
  const key = name === "kimi-coding" ? "kimi" : name;`,
  },
  {
    id: "oauth/route/imports",
    file: "src/app/api/oauth/[provider]/[action]/route.js",
    find: `import { detectIdeInstalled } from "@/lib/oauth/utils/ideDetect";`,
    replace: `import { detectIdeInstalled } from "@/lib/oauth/utils/ideDetect";
import { ensureCloneRegistry, resolveProviderSource } from "@/lib/providerClones.js";`,
  },
  {
    id: "oauth/route/get-source",
    file: "src/app/api/oauth/[provider]/[action]/route.js",
    find: `    const { provider, action } = await params;
    const { searchParams } = new URL(request.url);`,
    replace: `    const { provider, action } = await params;
    // Clones must be registered before the id→source lookup below.
    await ensureCloneRegistry();
    // Clones authorize/device-code/poll through the source provider's flow.
    const oauthProvider = resolveProviderSource(provider);
    const { searchParams } = new URL(request.url);`,
  },
  {
    id: "oauth/route/post-source",
    file: "src/app/api/oauth/[provider]/[action]/route.js",
    find: `export async function POST(request, { params }) {
  try {
    const { provider, action } = await params;
    let body;`,
    replace: `export async function POST(request, { params }) {
  try {
    const { provider, action } = await params;
    // Clones must be registered before the id→source lookup below.
    await ensureCloneRegistry();
    // Clones exchange/poll through the source provider's flow, then the
    // connection is stored under the clone id (the \`provider\` variable below).
    const oauthProvider = resolveProviderSource(provider);
    let body;`,
  },
  {
    id: "oauth/route/device-code-flow",
    file: "src/app/api/oauth/[provider]/[action]/route.js",
    find: `      const providerData = getProvider(provider);
      if (providerData.flowType !== "device_code") {`,
    replace: `      const providerData = getProvider(oauthProvider);
      if (providerData.flowType !== "device_code") {`,
  },
  {
    id: "oauth/route/device-code-generate",
    file: "src/app/api/oauth/[provider]/[action]/route.js",
    find: `      const authData = await generateAuthData(provider, null);`,
    replace: `      const authData = await generateAuthData(oauthProvider, null);`,
  },
  {
    id: "oauth/route/no-pkce-device",
    file: "src/app/api/oauth/[provider]/[action]/route.js",
    find: `      if (noPkceDeviceProviders.includes(provider)) {
        deviceData = await requestDeviceCode(provider, undefined, deviceOptions);
      } else {
        // Qwen and other PKCE providers
        deviceData = await requestDeviceCode(provider, authData.codeChallenge, deviceOptions);
      }`,
    replace: `      if (noPkceDeviceProviders.includes(oauthProvider)) {
        deviceData = await requestDeviceCode(oauthProvider, undefined, deviceOptions);
      } else {
        // Qwen and other PKCE providers
        deviceData = await requestDeviceCode(oauthProvider, authData.codeChallenge, deviceOptions);
      }`,
  },
  {
    id: "oauth/route/no-pkce-poll",
    file: "src/app/api/oauth/[provider]/[action]/route.js",
    find: `      const noPkceProviders = ["github", "kimi", "kimi-coding", "kilocode", "codebuddy-cn", "codebuddy-intl", "glm", "nous"];
      let result;
      if (noPkceProviders.includes(provider)) {
        // kimi needs extraData._kimiDeviceId for stable X-Msh-Device-Id (CLIProxyAPI parity)
        result = await pollForToken(provider, deviceCode, null, extraData);
      } else if (provider === "kiro") {
        // Kiro needs extraData (clientId, clientSecret) from device code response
        result = await pollForToken(provider, deviceCode, null, extraData);
      } else if (provider === "qoder" || provider === "qoder-cn") {
        // Qoder needs both the PKCE verifier (codeVerifier) and the machineId
        // captured at device-code time (extraData._qoderMachineId) so
        // mapTokens can persist it for COSY signing.
        if (!codeVerifier) {
          return NextResponse.json({ error: "Missing code verifier" }, { status: 400 });
        }
        result = await pollForToken(provider, deviceCode, codeVerifier, extraData);
      } else {
        // Qwen and other PKCE providers
        if (!codeVerifier) {
          return NextResponse.json({ error: "Missing code verifier" }, { status: 400 });
        }
        result = await pollForToken(provider, deviceCode, codeVerifier);
      }`,
    replace: `      const noPkceProviders = ["github", "kimi", "kimi-coding", "kilocode", "codebuddy-cn", "codebuddy-intl", "glm", "nous"];
      let result;
      if (noPkceProviders.includes(oauthProvider)) {
        // kimi needs extraData._kimiDeviceId for stable X-Msh-Device-Id (CLIProxyAPI parity)
        result = await pollForToken(oauthProvider, deviceCode, null, extraData);
      } else if (oauthProvider === "kiro") {
        // Kiro needs extraData (clientId, clientSecret) from device code response
        result = await pollForToken(oauthProvider, deviceCode, null, extraData);
      } else if (oauthProvider === "qoder" || oauthProvider === "qoder-cn") {
        // Qoder needs both the PKCE verifier (codeVerifier) and the machineId
        // captured at device-code time (extraData._qoderMachineId) so
        // mapTokens can persist it for COSY signing.
        if (!codeVerifier) {
          return NextResponse.json({ error: "Missing code verifier" }, { status: 400 });
        }
        result = await pollForToken(oauthProvider, deviceCode, codeVerifier, extraData);
      } else {
        // Qwen and other PKCE providers
        if (!codeVerifier) {
          return NextResponse.json({ error: "Missing code verifier" }, { status: 400 });
        }
        result = await pollForToken(oauthProvider, deviceCode, codeVerifier);
      }`,
  },
  {
    id: "oauth/route/exchange-flow",
    file: "src/app/api/oauth/[provider]/[action]/route.js",
    find: `      const tokenData = await exchangeTokens(provider, code, redirectUri, codeVerifier, state, {
        ...(meta || {}),
        ...(systemId ? { systemId } : {}),
      });`,
    replace: `      const tokenData = await exchangeTokens(oauthProvider, code, redirectUri, codeVerifier, state, {
        ...(meta || {}),
        ...(systemId ? { systemId } : {}),
      });`,
  },
  {
    id: "oauth/route/no-pkce-exchange",
    file: "src/app/api/oauth/[provider]/[action]/route.js",
    find: `      const noPkceExchangeProviders = ["cline", "clinepass", "kimchi"];
      if (!code || !redirectUri || (!codeVerifier && !noPkceExchangeProviders.includes(provider))) {`,
    replace: `      const noPkceExchangeProviders = ["cline", "clinepass", "kimchi"];
      if (!code || !redirectUri || (!codeVerifier && !noPkceExchangeProviders.includes(oauthProvider))) {`,
  },
  {
    id: "oauth/route/trae-windsurf-exchange",
    file: "src/app/api/oauth/[provider]/[action]/route.js",
    find: `      if (provider === "trae" || provider === "windsurf") {
        const token = typeof code === "string" ? code.trim() : "";
        if (!token) {
          return NextResponse.json({ error: "Missing token or callback URL" }, { status: 400 });
        }
        try {
          const tokenData = await exchangeTokens(provider, token, null, null, state);`,
    replace: `      if (oauthProvider === "trae" || oauthProvider === "windsurf") {
        const token = typeof code === "string" ? code.trim() : "";
        if (!token) {
          return NextResponse.json({ error: "Missing token or callback URL" }, { status: 400 });
        }
        try {
          const tokenData = await exchangeTokens(oauthProvider, token, null, null, state);`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Provider API: accept clones, seed their routing metadata
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "api/providers/route.js/imports",
    file: "src/app/api/providers/route.js",
    find: `import { normalizeProviderId, normalizeProviderSpecificData } from "@/lib/providerNormalization";`,
    replace: `import { normalizeProviderId, normalizeProviderSpecificData } from "@/lib/providerNormalization";
import { isProviderCloneId, getProviderClone } from "@/lib/providerClones";`,
  },
  {
    id: "api/providers/route.js/validate",
    file: "src/app/api/providers/route.js",
    find: `      isOpenAICompatibleProvider(provider) ||
      isAnthropicCompatibleProvider(provider) ||
      isCustomEmbeddingProvider(provider);`,
    replace: `      isOpenAICompatibleProvider(provider) ||
      isAnthropicCompatibleProvider(provider) ||
      isCustomEmbeddingProvider(provider) ||
      isProviderCloneId(provider);`,
  },
  {
    id: "api/providers/route.js/seed-clone",
    file: "src/app/api/providers/route.js",
    find: `    } else if (isCustomEmbeddingProvider(provider)) {
      const node = await getProviderNodeById(provider);
      if (!node) {
        return NextResponse.json({ error: "Custom Embedding node not found" }, { status: 404 });
      }
      providerSpecificData = {
        prefix: node.prefix,
        baseUrl: node.baseUrl,
        nodeName: node.name,
      };
    }`,
    replace: `    } else if (isCustomEmbeddingProvider(provider)) {
      const node = await getProviderNodeById(provider);
      if (!node) {
        return NextResponse.json({ error: "Custom Embedding node not found" }, { status: 404 });
      }
      providerSpecificData = {
        prefix: node.prefix,
        baseUrl: node.baseUrl,
        nodeName: node.name,
      };
    } else if (isProviderCloneId(provider)) {
      const clone = await getProviderClone(provider);
      if (!clone) {
        return NextResponse.json({ error: "Provider clone not found" }, { status: 404 });
      }
      providerSpecificData = {
        ...(providerSpecificData || {}),
        prefix: clone.prefix,
        sourceProvider: clone.sourceProvider,
        baseUrl: clone.baseUrl || "",
        nodeName: clone.name,
      };
    }`,
  },
  {
    id: "api/providers/route.js/connection-name",
    file: "src/app/api/providers/route.js",
    find: `    const connectionName = name || displayName || AI_PROVIDERS[provider]?.name;`,
    replace: `    // Clones carry their own display name; fall back to the source provider's.
    const cloneInfo = isProviderCloneId(provider) ? await getProviderClone(provider) : null;
    const connectionName = name || displayName || cloneInfo?.name || AI_PROVIDERS[provider]?.name;`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Validation
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "api/providers/validate/route.js/imports",
    file: "src/app/api/providers/validate/route.js",
    find: `import { normalizeProviderId } from "@/lib/providerNormalization";`,
    replace: `import { normalizeProviderId } from "@/lib/providerNormalization";
${CLONES_IMPORT}`,
  },
  {
    id: "api/providers/validate/route.js/resolve",
    file: "src/app/api/providers/validate/route.js",
    find: `    const provider = normalizeProviderId(body.provider);
    const { apiKey, providerSpecificData } = body;`,
    replace: `    // Clones validate exactly like their source provider.
    const provider = resolveProviderSource(normalizeProviderId(body.provider));
    const { apiKey, providerSpecificData } = body;`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Model listing per connection
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "api/providers/[id]/models/route.js/imports",
    file: "src/app/api/providers/[id]/models/route.js",
    find: `import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";`,
    replace: `import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { ensureCloneRegistry } from "@/lib/providerClones.js";
${CLONES_IMPORT}`,
  },
  {
    id: "api/providers/[id]/models/route.js/prime",
    file: "src/app/api/providers/[id]/models/route.js",
    find: `export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const connection = await getProviderConnectionById(id);`,
    replace: `export async function GET(request, { params }) {
  try {
    // Clones must be registered before the id→source lookup below.
    await ensureCloneRegistry();
    const { id } = await params;
    const connection = await getProviderConnectionById(id);`,
  },
  {
    id: "api/providers/[id]/models/route.js/config",
    file: "src/app/api/providers/[id]/models/route.js",
    find: '    const config = PROVIDER_MODELS_CONFIG[connection.provider];\n'
      + '    if (!config) {\n'
      + '      return NextResponse.json(\n'
      + '        { error: `Provider ${connection.provider} does not support models listing` },\n'
      + '        { status: 400 }\n'
      + '      );\n'
      + '    }',
    replace: '    const config = PROVIDER_MODELS_CONFIG[resolveProviderSource(connection.provider)];\n'
      + '    if (!config) {\n'
      + '      // Clones of providers without a live catalog fall back to the static\n'
      + '      // registry list, which is the catalog the dashboard renders anyway.\n'
      + '      const staticModels = getModelsByProviderId(resolveProviderSource(connection.provider));\n'
      + '      if (staticModels.length > 0) {\n'
      + '        return NextResponse.json({\n'
      + '          provider: connection.provider,\n'
      + '          connectionId: connection.id,\n'
      + '          models: staticModels.map((m) => ({ id: m.id, name: m.name || m.id })),\n'
      + '        });\n'
      + '      }\n'
      + '      return NextResponse.json(\n'
      + '        { error: `Provider ${connection.provider} does not support models listing` },\n'
      + '        { status: 400 }\n'
      + '      );\n'
      + '    }',
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // Per-provider overrides — clones inherit the source's custom headers
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "api/providers/[id]/overrides/route.js/imports",
    file: "src/app/api/providers/[id]/overrides/route.js",
    find: `import { resolveProviderAlias } from "open-sse/services/model.js";`,
    replace: `import { resolveProviderAlias } from "open-sse/services/model.js";
import { getProviderClone } from "@/lib/providerClones";`,
  },
  {
    id: "api/providers/[id]/overrides/route.js/get",
    file: "src/app/api/providers/[id]/overrides/route.js",
    find: `    const { id } = await params;
    // URL may use an alias (gcli, cc…) — key everything by canonical registry id
    const canonical = resolveProviderAlias(id);
    const override = (await readOverrides())[canonical] || {};
    // Built-in headers come straight from the registry transport — single source of
    // truth, so the UI pre-fills exactly what this provider sends upstream.
    return NextResponse.json({
      headers: override.headers || {},
      builtinHeaders: PROVIDERS[canonical]?.headers || {},
    });`,
    replace: `    const { id } = await params;
    // URL may use an alias (gcli, cc…) — key everything by canonical registry id
    const canonical = resolveProviderAlias(id);
    const overrides = await readOverrides();
    // A clone owns no registry transport, so its "built-in" set is the source
    // provider's registry headers with the source's saved override layered on top:
    // it sends exactly what the source sends until it saves an override of its own.
    // Clones used to get an empty builtinHeaders here, which made the Custom Headers
    // card render nothing at all. Diff-on-save then stores only the rows the clone
    // actually changes, so unedited rows keep tracking the source.
    const clone = await getProviderClone(canonical);
    const sourceProvider = clone?.sourceProvider || canonical;
    const builtinHeaders = clone
      ? { ...(PROVIDERS[sourceProvider]?.headers || {}), ...(overrides[sourceProvider]?.headers || {}) }
      : PROVIDERS[canonical]?.headers || {};
    // Built-in headers come straight from the registry transport — single source of
    // truth, so the UI pre-fills exactly what this provider sends upstream.
    return NextResponse.json({
      headers: overrides[canonical]?.headers || {},
      builtinHeaders,
    });`,
  },
  {
    id: "sse/handlers/chat.js/imports",
    file: "src/sse/handlers/chat.js",
    find: `import { getKeyAccessContext, enforceKeyAccess, filterAdapterModels } from "../services/keyAccess.js";`,
    replace: `import { getKeyAccessContext, enforceKeyAccess, filterAdapterModels } from "../services/keyAccess.js";
${CLONES_IMPORT}`,
  },
  {
    id: "sse/handlers/chat.js/overrides-inherit",
    file: "src/sse/handlers/chat.js",
    find: `      // Per-provider user overrides (custom headers / connect timeout) from settings
      providerOverrides: (chatSettings.providerOverrides || {})[provider] || null,`,
    replace: `      // Per-provider user overrides (custom headers / connect timeout) from settings.
      // A clone inherits the source provider's overrides and layers its own on top —
      // the same merge the Custom Headers card shows for a clone (source first, clone
      // wins per header). Non-clones read exactly their own entry, as before.
      providerOverrides: (() => {
        const all = chatSettings.providerOverrides || {};
        const own = all[provider] || null;
        const sourceId = resolveProviderSource(provider);
        if (sourceId === provider) return own;
        const inherited = all[sourceId] || null;
        if (!inherited && !own) return null;
        return {
          ...(inherited || {}),
          ...(own || {}),
          headers: { ...(inherited?.headers || {}), ...(own?.headers || {}) },
        };
      })(),`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // /v1/models — clone serves the source catalog under its own prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "api/v1/models/route.js/imports",
    file: "src/app/api/v1/models/route.js",
    find: `import { getProviderConnections, getCombos, getCustomModels, getModelAliases } from "@/lib/localDb";`,
    replace: `import { getProviderConnections, getCombos, getCustomModels, getModelAliases } from "@/lib/localDb";
import { ensureCloneRegistry } from "@/lib/providerClones.js";
${CLONES_IMPORT}`,
  },
  {
    id: "api/v1/models/route.js/ensure-registry",
    file: "src/app/api/v1/models/route.js",
    find: `  const skipDynamicFetch = options.skipDynamicFetch === true;
  let connections = [];`,
    replace: `  const skipDynamicFetch = options.skipDynamicFetch === true;
  // Clones must be resolvable before resolveProviderSource() below decides which
  // catalog to publish — an account moved into a clone must show up under the
  // clone prefix on the very next request, not after the boot-time prime.
  await ensureCloneRegistry();
  let connections = [];`,
  },
  {
    id: "api/v1/models/route.js/static-alias",
    file: "src/app/api/v1/models/route.js",
    find: `      const staticAlias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
      const outputAlias = (`,
    replace: `      // Clones publish the source provider's catalog under their own prefix.
      const sourceProviderId = resolveProviderSource(providerId);
      const staticAlias = PROVIDER_ID_TO_ALIAS[sourceProviderId] || sourceProviderId;
      const outputAlias = (`,
  },
  {
    id: "api/v1/models/route.js/live-resolver",
    file: "src/app/api/v1/models/route.js",
    find: `      const liveResolver = LIVE_MODEL_RESOLVERS[providerId];`,
    replace: `      const liveResolver = LIVE_MODEL_RESOLVERS[sourceProviderId];`,
  },
  {
    id: "api/v1/models/route.js/provider-kinds",
    file: "src/app/api/v1/models/route.js",
    find: `function providerMatchesKinds(providerId, kindFilter) {
  const provider = AI_PROVIDERS[providerId];`,
    replace: `function providerMatchesKinds(providerId, kindFilter) {
  const provider = AI_PROVIDERS[resolveProviderSource(providerId)];`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Connection test
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "testUtils.js/imports",
    file: "src/app/api/providers/[id]/test/testUtils.js",
    find: `import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider, AI_PROVIDERS } from "@/shared/constants/providers";`,
    replace: `import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider, AI_PROVIDERS } from "@/shared/constants/providers";
import { ensureCloneRegistry } from "@/lib/providerClones.js";
${CLONES_IMPORT}`,
  },
  {
    id: "testUtils.js/prime",
    file: "src/app/api/providers/[id]/test/testUtils.js",
    find: `export async function testSingleConnection(id) {
  const connection = await getProviderConnectionById(id);`,
    replace: `export async function testSingleConnection(id) {
  // Clones must be registered before the id→source lookup in the probes below.
  await ensureCloneRegistry();
  const connection = await getProviderConnectionById(id);`,
  },
  {
    id: "testUtils.js/switch",
    file: "src/app/api/providers/[id]/test/testUtils.js",
    find: `  try {
    switch (connection.provider) {`,
    replace: `  try {
    // Clones test with the source provider's probe.
    switch (resolveProviderSource(connection.provider)) {`,
  },
  {
    id: "testUtils.js/oauth-config",
    file: "src/app/api/providers/[id]/test/testUtils.js",
    find: `  const config = OAUTH_TEST_CONFIG[connection.provider];`,
    replace: `  // Clones test with the source provider's OAuth probe.
  const config = OAUTH_TEST_CONFIG[resolveProviderSource(connection.provider)];`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Boot: prime the clone registry so sync resolution works everywhere
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "instrumentation.js/prime-clones",
    file: "src/instrumentation.js",
    find: `    const { startModelCatalogSync } = await import("@/lib/modelCatalog/sync.js");
    startModelCatalogSync();`,
    replace: `    const { startModelCatalogSync } = await import("@/lib/modelCatalog/sync.js");
    startModelCatalogSync();

    // Provider clones: load the id→source map once at boot. Every runtime
    // lookup (transport, executor, refresh, quota, caps) is synchronous and
    // reads this in-memory registry.
    const { primeCloneRegistry } = await import("@/lib/providerClones.js");
    await primeCloneRegistry();`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Providers dashboard — Cloned Providers section
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "providers/page.js/imports",
    file: "src/app/(dashboard)/dashboard/providers/page.js",
    find: `import AddCompatibleModal from "./components/AddCompatibleModal";`,
    replace: `import AddCompatibleModal from "./components/AddCompatibleModal";
import CloneProviderModal from "./components/CloneProviderModal";`,
  },
  {
    id: "providers/page.js/state",
    file: "src/app/(dashboard)/dashboard/providers/page.js",
    find: `  const [showAddAnthropicCompatibleModal, setShowAddAnthropicCompatibleModal] =
    useState(false);`,
    replace: `  const [showAddAnthropicCompatibleModal, setShowAddAnthropicCompatibleModal] =
    useState(false);
  const [showCloneProviderModal, setShowCloneProviderModal] = useState(false);
  const [providerClones, setProviderClones] = useState([]);
  const [cloneSources, setCloneSources] = useState([]);`,
  },
  {
    id: "providers/page.js/fetch",
    file: "src/app/(dashboard)/dashboard/providers/page.js",
    find: `        const [connectionsRes, nodesRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/provider-nodes"),
        ]);
        const connectionsData = await connectionsRes.json();
        const nodesData = await nodesRes.json();
        if (connectionsRes.ok)
          setConnections(connectionsData.connections || []);
        if (nodesRes.ok) setProviderNodes(nodesData.nodes || []);`,
    replace: `        const [connectionsRes, nodesRes, clonesRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/provider-nodes"),
          fetch("/api/provider-clones"),
        ]);
        const connectionsData = await connectionsRes.json();
        const nodesData = await nodesRes.json();
        const clonesData = clonesRes.ok ? await clonesRes.json() : {};
        if (connectionsRes.ok)
          setConnections(connectionsData.connections || []);
        if (nodesRes.ok) setProviderNodes(nodesData.nodes || []);
        setProviderClones(clonesData.clones || []);
        setCloneSources(clonesData.sources || []);`,
  },
  {
    id: "providers/page.js/clone-cards",
    file: "src/app/(dashboard)/dashboard/providers/page.js",
    find: `  const anthropicCompatibleProviders = providerNodes`,
    replace: `  // Provider clones: full provider identity with its own prefix + account pool.
  // Card name/color/icon come from the source provider, overridden by the clone.
  const sourceById = Object.fromEntries(cloneSources.map((s) => [s.id, s]));
  const clonedProviders = providerClones
    .map((clone) => {
      const source = sourceById[clone.sourceProvider] || {};
      return {
        id: clone.id,
        name: clone.name || source.name || "Cloned Provider",
        color: source.color || "#8B5CF6",
        textIcon: source.alias ? source.alias.slice(0, 2).toUpperCase() : "CL",
        prefix: clone.prefix,
        sourceProvider: clone.sourceProvider,
        sourceName: source.name || clone.sourceProvider,
        sourceAlias: source.alias || clone.sourceProvider,
        hasOAuth: !!source.hasOAuth,
      };
    })
    .filter(
      (p) => matchSearch(p.name) && matchStatus(getProviderStats(p.id, "apikey")),
    );

  const anthropicCompatibleProviders = providerNodes`,
  },
  {
    id: "providers/page.js/section",
    file: "src/app/(dashboard)/dashboard/providers/page.js",
    find: `      {/* OAuth Providers */}
      {oauthEntries.length > 0 && (`,
    replace: `      {/* Cloned Providers — same behavior as their source, own prefix + accounts */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 leading-tight">
            Cloned Providers
          </h2>
          <Button
            size="sm"
            variant="secondary"
            icon="content_copy"
            onClick={() => setShowCloneProviderModal(true)}
            className="w-full sm:w-auto"
          >
            Clone Provider
          </Button>
        </div>
        {clonedProviders.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-2 border border-dashed border-border rounded-xl text-text-muted text-sm">
            <span className="material-symbols-outlined text-[18px]">content_copy</span>
            <span>No cloned providers — clone a provider to run it with a second prefix and account pool</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {clonedProviders.map((info) => (
              <ApiKeyProviderCard
                key={info.id}
                providerId={info.id}
                provider={info}
                stats={getProviderStats(info.id, ["apikey", "oauth"])}
                authType="clone"
                onToggle={(active) =>
                  handleToggleProvider(info.id, ["apikey", "oauth"], active)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* OAuth Providers */}
      {oauthEntries.length > 0 && (`,
  },
  {
    id: "providers/page.js/clone-modal",
    file: "src/app/(dashboard)/dashboard/providers/page.js",
    find: `      <AddCompatibleModal
        variant="anthropic"
        isOpen={showAddAnthropicCompatibleModal}
        onClose={() => setShowAddAnthropicCompatibleModal(false)}
        onCreated={(node) => {
          setProviderNodes((prev) => [...prev, node]);
          setShowAddAnthropicCompatibleModal(false);
        }}
      />`,
    replace: `      <AddCompatibleModal
        variant="anthropic"
        isOpen={showAddAnthropicCompatibleModal}
        onClose={() => setShowAddAnthropicCompatibleModal(false)}
        onCreated={(node) => {
          setProviderNodes((prev) => [...prev, node]);
          setShowAddAnthropicCompatibleModal(false);
        }}
      />
      <CloneProviderModal
        isOpen={showCloneProviderModal}
        onClose={() => setShowCloneProviderModal(false)}
        existingPrefixes={[
          ...providerClones.map((c) => c.prefix),
          ...providerNodes.map((n) => n.prefix),
        ]}
        onCreated={(clone) => {
          setProviderClones((prev) => [...prev, clone]);
          setShowCloneProviderModal(false);
        }}
      />`,
  },
  {
    id: "providers/page.js/card-badges",
    file: "src/app/(dashboard)/dashboard/providers/page.js",
    find: `                    {isAnthropicCompatible && (
                      <Badge variant="default" size="sm">
                        Messages
                      </Badge>
                    )}`,
    replace: `                    {isAnthropicCompatible && (
                      <Badge variant="default" size="sm">
                        Messages
                      </Badge>
                    )}
                    {provider.sourceProvider && (
                      <Badge variant="default" size="sm">
                        {provider.prefix} · from {provider.sourceAlias}
                      </Badge>
                    )}`,
  },
  {
    id: "providers/page.js/card-proptypes",
    file: "src/app/(dashboard)/dashboard/providers/page.js",
    find: `    textIcon: PropTypes.string,
    apiType: PropTypes.string,
  }).isRequired,`,
    replace: `    textIcon: PropTypes.string,
    apiType: PropTypes.string,
    prefix: PropTypes.string,
    sourceProvider: PropTypes.string,
    sourceName: PropTypes.string,
    sourceAlias: PropTypes.string,
  }).isRequired,`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Provider detail page — clone-aware header, auth modes, models, edit/delete
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "providers/[id]/page.js/imports",
    file: "src/app/(dashboard)/dashboard/providers/[id]/page.js",
    find: `import EditCompatibleNodeModal from "./EditCompatibleNodeModal";`,
    replace: `import EditCompatibleNodeModal from "./EditCompatibleNodeModal";
import EditProviderCloneModal from "./EditProviderCloneModal";
import MoveToCloneModal from "./MoveToCloneModal";
import { isProviderCloneId } from "@/shared/constants/providerClones.js";`,
  },
  {
    id: "providers/[id]/page.js/state",
    file: "src/app/(dashboard)/dashboard/providers/[id]/page.js",
    find: `  const [showEditNodeModal, setShowEditNodeModal] = useState(false);`,
    replace: `  const [showEditNodeModal, setShowEditNodeModal] = useState(false);
  const [showEditCloneModal, setShowEditCloneModal] = useState(false);
  const [providerClone, setProviderClone] = useState(null);
  const [cloneSourceInfo, setCloneSourceInfo] = useState(null);
  const [showMoveToCloneModal, setShowMoveToCloneModal] = useState(false);
  const [clonesOfSource, setClonesOfSource] = useState([]);`,
  },
  {
    id: "providers/[id]/page.js/provider-info",
    file: "src/app/(dashboard)/dashboard/providers/[id]/page.js",
    find: `  const providerInfo = providerNode
    ? {
        id: providerNode.id,
        name: providerNode.name || (providerNode.type === "anthropic-compatible" ? "Anthropic Compatible" : "OpenAI Compatible"),
        color: providerNode.type === "anthropic-compatible" ? "#D97757" : "#10A37F",
        textIcon: providerNode.type === "anthropic-compatible" ? "AC" : "OC",
        apiType: providerNode.apiType,
        baseUrl: providerNode.baseUrl,
        type: providerNode.type,
      }
    : (OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId] || FREE_PROVIDERS[providerId] || FREE_TIER_PROVIDERS[providerId] || WEB_COOKIE_PROVIDERS[providerId]);
  const authModes = providerInfo?.authModes || [];
  const isOAuth = !!OAUTH_PROVIDERS[providerId] || !!FREE_PROVIDERS[providerId] || authModes.includes("oauth");
  const supportsApiKeyAuth = !!APIKEY_PROVIDERS[providerId] || authModes.includes("apikey");
  const isFreeNoAuth = !!FREE_PROVIDERS[providerId]?.noAuth;
  const staticModels = getModelsByProviderId(providerId);
  const models = (providerId === "cursor" || providerId === "zed") && liveModels.length > 0
    ? liveModels
    : staticModels;
  const providerAlias = getProviderAlias(providerId);`,
    replace: `  const isProviderClone = isProviderCloneId(providerId);
  // A clone borrows the source provider's display + auth capabilities; only its
  // name/prefix/account pool differ.
  const sourceProviderId = providerClone?.sourceProvider || providerId;
  const sourceProviderInfo = OAUTH_PROVIDERS[sourceProviderId] || APIKEY_PROVIDERS[sourceProviderId] || FREE_PROVIDERS[sourceProviderId] || FREE_TIER_PROVIDERS[sourceProviderId] || WEB_COOKIE_PROVIDERS[sourceProviderId];
  const providerInfo = providerNode
    ? {
        id: providerNode.id,
        name: providerNode.name || (providerNode.type === "anthropic-compatible" ? "Anthropic Compatible" : "OpenAI Compatible"),
        color: providerNode.type === "anthropic-compatible" ? "#D97757" : "#10A37F",
        textIcon: providerNode.type === "anthropic-compatible" ? "AC" : "OC",
        apiType: providerNode.apiType,
        baseUrl: providerNode.baseUrl,
        type: providerNode.type,
      }
    : isProviderClone
      ? {
          ...(sourceProviderInfo || {}),
          id: providerId,
          name: providerClone?.name || sourceProviderInfo?.name || "Cloned Provider",
          baseUrl: providerClone?.baseUrl || sourceProviderInfo?.baseUrl,
          type: "provider-clone",
          sourceProvider: sourceProviderId,
          sourceName: sourceProviderInfo?.name || sourceProviderId,
          sourceAlias: sourceProviderInfo?.alias || sourceProviderId,
          prefix: providerClone?.prefix,
        }
      : (OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId] || FREE_PROVIDERS[providerId] || FREE_TIER_PROVIDERS[providerId] || WEB_COOKIE_PROVIDERS[providerId]);
  const authModes = providerInfo?.authModes || [];
  const isOAuth = !!OAUTH_PROVIDERS[providerId] || !!FREE_PROVIDERS[providerId] || authModes.includes("oauth");
  const supportsApiKeyAuth = !!APIKEY_PROVIDERS[providerId] || authModes.includes("apikey");
  const isFreeNoAuth = !!FREE_PROVIDERS[providerId]?.noAuth;
  // Clones serve the source provider's model catalog.
  const staticModels = getModelsByProviderId(sourceProviderId);
  const models = (sourceProviderId === "cursor" || sourceProviderId === "zed") && liveModels.length > 0
    ? liveModels
    : staticModels;
  const providerAlias = getProviderAlias(sourceProviderId);`,
  },
  {
    id: "providers/[id]/page.js/storage-alias",
    file: "src/app/(dashboard)/dashboard/providers/[id]/page.js",
    find: `  const providerStorageAlias = isCompatible ? providerId : providerAlias;`,
    replace: `  // Clones key their aliases/disabled models by provider id (their prefix is
  // user-editable, the id is stable) — same convention as compatible nodes.
  const providerStorageAlias = (isCompatible || isProviderClone) ? providerId : providerAlias;`,
  },
  {
    id: "providers/[id]/page.js/display-alias",
    file: "src/app/(dashboard)/dashboard/providers/[id]/page.js",
    find: `  const providerDisplayAlias = isCompatible
    ? (providerNode?.prefix || providerId)
    : providerAlias;`,
    replace: `  const providerDisplayAlias = isProviderClone
    ? (providerClone?.prefix || providerId)
    : isCompatible
      ? (providerNode?.prefix || providerId)
      : providerAlias;`,
  },
  {
    id: "providers/[id]/page.js/fetch-clone",
    file: "src/app/(dashboard)/dashboard/providers/[id]/page.js",
    find: `        setProviderNode(node);
      }
    } catch (error) {
      console.log("Error fetching connections:", error);`,
    replace: `        setProviderNode(node);
      }

      // Clones live in their own registry; resolve the source for display + models.
      // On a source provider the same list tells us which clones could receive
      // an account (the "Move to clone" action).
      try {
        const cloneRes = await fetch("/api/provider-clones", { cache: "no-store" });
        const cloneData = cloneRes.ok ? await cloneRes.json() : {};
        const allClones = cloneData.clones || [];
        const clone = isProviderClone
          ? allClones.find((entry) => entry.id === providerId) || null
          : null;
        setProviderClone(clone);
        const source = clone
          ? (cloneData.sources || []).find((entry) => entry.id === clone.sourceProvider)
          : null;
        setCloneSourceInfo(source || null);
        setClonesOfSource(
          clone
            ? []
            : allClones.filter((entry) => entry.sourceProvider === providerId)
        );
      } catch (error) {
        console.log("Error fetching provider clones:", error);
      }
    } catch (error) {
      console.log("Error fetching connections:", error);`,
  },
  {
    id: "providers/[id]/page.js/fetch-deps",
    file: "src/app/(dashboard)/dashboard/providers/[id]/page.js",
    find: `  }, [providerId, isCompatible]);`,
    replace: `  }, [providerId, isCompatible, isProviderClone]);`,
  },
  {
    id: "providers/[id]/page.js/move-to-clone-button",
    file: "src/app/(dashboard)/dashboard/providers/[id]/page.js",
    find: `                      Delete Selected ({selectedConnectionIds.length})
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="sync"`,
    replace: `                      Delete Selected ({selectedConnectionIds.length})
                    </Button>
                  )}
                  {selectedConnectionIds.length > 0 && !isProviderClone && clonesOfSource.length > 0 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon="drive_file_move"
                      onClick={() => setShowMoveToCloneModal(true)}
                    >
                      Move to Clone ({selectedConnectionIds.length})
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="sync"`,
  },
  {
    id: "providers/[id]/page.js/move-to-clone-modal",
    file: "src/app/(dashboard)/dashboard/providers/[id]/page.js",
    find: `      <EditConnectionModal
        isOpen={showEditModal}`,
    replace: `      <MoveToCloneModal
        isOpen={showMoveToCloneModal}
        providerId={providerId}
        connections={selectedConnections}
        onMoved={async ({ moved }) => {
          setSelectedConnectionIds([]);
          await fetchConnections();
          if (moved > 0) alert(\`Moved \${moved} account\${moved === 1 ? "" : "s"} to the cloned provider.\`);
        }}
        onClose={() => setShowMoveToCloneModal(false)}
      />
      <EditConnectionModal
        isOpen={showEditModal}`,
  },
  {
    id: "providers/[id]/page.js/clone-card",
    file: "src/app/(dashboard)/dashboard/providers/[id]/page.js",
    find: `      {isCompatible && providerNode && (
        <Card>`,
    replace: `      {isProviderClone && providerClone && (
        <Card>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Cloned Provider</h2>
              <p className="break-all text-sm text-text-muted">
                Behaves exactly like <span className="font-medium">{providerClone.sourceProvider}</span>
                {providerClone.prefix ? <> · model prefix <code className="font-mono">{providerClone.prefix}/</code></> : null}
                {providerClone.baseUrl ? <> · {providerClone.baseUrl.replace(/\\/$/, "")}</> : null}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
              <Button
                size="sm"
                icon="edit"
                variant="secondary"
                onClick={() => setShowEditCloneModal(true)}
                className="w-full sm:w-auto"
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon="delete"
                onClick={async () => {
                  setConfirmState({
                    title: "Delete Cloned Provider",
                    message: \`Delete this clone and all of its \${connections.length} connection(s)? The source provider and its accounts are not affected.\`,
                    onConfirm: async () => {
                      setConfirmState(null);
                      try {
                        const res = await fetch(\`/api/provider-clones/\${providerId}\`, { method: "DELETE" });
                        if (res.ok) {
                          router.push("/dashboard/providers");
                        }
                      } catch (error) {
                        console.log("Error deleting provider clone:", error);
                      }
                    }
                  });
                }}
                className="w-full sm:w-auto"
              >
                Delete
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isCompatible && providerNode && (
        <Card>`,
  },
  {
    id: "providers/[id]/page.js/clone-edit-modal",
    file: "src/app/(dashboard)/dashboard/providers/[id]/page.js",
    find: `      {isCompatible && (
        <EditCompatibleNodeModal`,
    replace: `      {isProviderClone && (
        <EditProviderCloneModal
          isOpen={showEditCloneModal}
          clone={providerClone}
          sourceInfo={cloneSourceInfo}
          existingPrefixes={providerClone ? [providerClone.prefix].filter(Boolean) : []}
          onSave={async (payload) => {
            const res = await fetch(\`/api/provider-clones/\${providerId}\`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save");
            setProviderClone(data.clone);
            setShowEditCloneModal(false);
            await fetchConnections();
          }}
          onClose={() => setShowEditCloneModal(false)}
        />
      )}
      {isCompatible && (
        <EditCompatibleNodeModal`,
  },
  {
    id: "providers/[id]/page.js/header-icon",
    file: "src/app/(dashboard)/dashboard/providers/[id]/page.js",
    find: `    if (isAnthropicCompatible) {
      return "/providers/anthropic-m.png";
    }
    return getProviderIconSrc(providerInfo.id);
  };`,
    replace: `    if (isAnthropicCompatible) {
      return "/providers/anthropic-m.png";
    }
    // Clones render the source provider's icon.
    return getProviderIconSrc(sourceProviderId);
  };`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OAuth modal — clones use the source provider's flow, store under clone id
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "OAuthModal.js/imports",
    file: "src/shared/components/OAuthModal.js",
    find: `import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";`,
    replace: `import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { resolveProviderSource } from "@/shared/constants/providerClones.js";`,
  },
  {
    id: "OAuthModal.js/source-provider",
    file: "src/shared/components/OAuthModal.js",
    find: `  const [step, setStep] = useState("waiting"); // waiting | input | success | error`,
    replace: `  // A clone runs the source provider's login flow. Every API call below uses
  // oauthProvider (source); the server stores the connection under \`provider\`
  // (the clone id), which is what keeps the account pools separate.
  const oauthProvider = resolveProviderSource(provider);
  const [step, setStep] = useState("waiting"); // waiting | input | success | error`,
  },
  {
    id: "OAuthModal.js/proxy-flow",
    file: "src/shared/components/OAuthModal.js",
    find: `      if (PROXY_OAUTH_PROVIDERS.has(provider) && authMode === "browser") {
        await startProxyFlow(provider);
        return;
      }`,
    replace: `      if (PROXY_OAUTH_PROVIDERS.has(oauthProvider) && authMode === "browser") {
        await startProxyFlow(provider);
        return;
      }`,
  },
  {
    id: "OAuthModal.js/device-code-list",
    file: "src/shared/components/OAuthModal.js",
    find: `      if (deviceCodeProviders.includes(provider)) {
        setIsDeviceCode(true);`,
    replace: `      if (deviceCodeProviders.includes(oauthProvider)) {
        setIsDeviceCode(true);`,
  },
  {
    id: "OAuthModal.js/device-code-url",
    file: "src/shared/components/OAuthModal.js",
    find: `        const deviceCodeUrl = new URL(\`/api/oauth/\${provider}/device-code\`, window.location.origin);`,
    replace: `        const deviceCodeUrl = new URL(\`/api/oauth/\${oauthProvider}/device-code\`, window.location.origin);`,
  },
  {
    id: "OAuthModal.js/authorize-url",
    file: "src/shared/components/OAuthModal.js",
    find: `      const authorizeUrl = new URL(\`/api/oauth/\${provider}/authorize\`, window.location.origin);`,
    replace: `      const authorizeUrl = new URL(\`/api/oauth/\${oauthProvider}/authorize\`, window.location.origin);`,
  },
  {
    id: "OAuthModal.js/poll-url",
    file: "src/shared/components/OAuthModal.js",
    find: `        const res = await fetch(\`/api/oauth/\${provider}/poll\`, {`,
    replace: `        const res = await fetch(\`/api/oauth/\${oauthProvider}/poll\`, {`,
  },
  {
    id: "OAuthModal.js/exchange-url",
    file: "src/shared/components/OAuthModal.js",
    find: `      const res = await fetch(\`/api/oauth/\${provider}/exchange\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          redirectUri: authData.redirectUri,`,
    replace: `      const res = await fetch(\`/api/oauth/\${oauthProvider}/exchange\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          redirectUri: authData.redirectUri,`,
  },
  {
    id: "OAuthModal.js/exchange-url-paste",
    file: "src/shared/components/OAuthModal.js",
    find: `        const res = await fetch(\`/api/oauth/\${provider}/exchange\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: token }),`,
    replace: `        const res = await fetch(\`/api/oauth/\${oauthProvider}/exchange\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: token }),`,
  },
  {
    id: "OAuthModal.js/exchange-url-callback",
    file: "src/shared/components/OAuthModal.js",
    find: `        const res = await fetch(\`/api/oauth/\${provider}/exchange\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: input,`,
    replace: `        const res = await fetch(\`/api/oauth/\${oauthProvider}/exchange\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: input,`,
  },
  {
    id: "OAuthModal.js/proxy-guard",
    file: "src/shared/components/OAuthModal.js",
    find: `        {(step === "waiting" || step === "input") && !isDeviceCode && !PROXY_OAUTH_PROVIDERS.has(provider) && (`,
    replace: `        {(step === "waiting" || step === "input") && !isDeviceCode && !PROXY_OAUTH_PROVIDERS.has(oauthProvider) && (`,
  },
  {
    id: "OAuthModal.js/proxy-buttons",
    file: "src/shared/components/OAuthModal.js",
    find: `        {PROXY_OAUTH_PROVIDERS.has(provider) && (step === "waiting" || step === "input" || step === "error") && (`,
    replace: `        {PROXY_OAUTH_PROVIDERS.has(oauthProvider) && (step === "waiting" || step === "input" || step === "error") && (`,
  },
  {
    id: "OAuthModal.js/paste-token-provider",
    file: "src/shared/components/OAuthModal.js",
    find: `    if (PASTE_TOKEN_PROVIDERS[provider]) {`,
    replace: `    if (PASTE_TOKEN_PROVIDERS[oauthProvider]) {`,
  },
  {
    id: "OAuthModal.js/paste-token-provider-2",
    file: "src/shared/components/OAuthModal.js",
    find: `      if (authMode === "paste-token" && PASTE_TOKEN_PROVIDERS[provider]) {`,
    replace: `      if (authMode === "paste-token" && PASTE_TOKEN_PROVIDERS[oauthProvider]) {`,
  },
  {
    id: "OAuthModal.js/paste-token-provider-3",
    file: "src/shared/components/OAuthModal.js",
    find: `      if (PROXY_OAUTH_PROVIDERS.has(provider) && input) {`,
    replace: `      if (PROXY_OAUTH_PROVIDERS.has(oauthProvider) && input) {`,
  },
  {
    id: "OAuthModal.js/xai-flag",
    file: "src/shared/components/OAuthModal.js",
    find: `  const isXaiProvider = provider === "xai";
  const isKimchiProvider = provider === "kimchi";`,
    replace: `  const isXaiProvider = oauthProvider === "xai";
  const isKimchiProvider = oauthProvider === "kimchi";`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Model selector — clones expose the source catalog under their own prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ModelSelectModal.js/imports",
    file: "src/shared/components/ModelSelectModal.js",
    find: `import { OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS, AI_PROVIDERS, isOpenAICompatibleProvider, isAnthropicCompatibleProvider, getProviderAlias } from "@/shared/constants/providers";`,
    replace: `import { OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS, AI_PROVIDERS, isOpenAICompatibleProvider, isAnthropicCompatibleProvider, getProviderAlias } from "@/shared/constants/providers";
import { resolveProviderSource, isProviderCloneId, getCloneMeta } from "@/shared/constants/providerClones.js";`,
  },
  {
    id: "ModelSelectModal.js/group",
    file: "src/shared/components/ModelSelectModal.js",
    find: `      const alias = getProviderAlias(providerId);
      const providerInfo = allProviders[providerId] || { name: providerId, color: "#666" };
      const isCustomProvider = isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);`,
    replace: `      // Clones read the source provider's catalog and publish it under their prefix.
      const isCloneProvider = isProviderCloneId(providerId);
      const catalogProviderId = resolveProviderSource(providerId);
      const cloneMeta = isCloneProvider ? getCloneMeta(providerId) : null;
      const alias = isCloneProvider
        ? (cloneMeta?.prefix || providerId)
        : getProviderAlias(providerId);
      const providerInfo = allProviders[catalogProviderId] || { name: providerId, color: "#666" };
      const isCustomProvider = isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);`,
  },
  {
    id: "ModelSelectModal.js/hardcoded-models",
    file: "src/shared/components/ModelSelectModal.js",
    find: `          const hardcoded = getModelsByProviderId(providerId)
            .filter((m) => !getModelKind(m) || getModelKind(m) === "llm")`,
    replace: `          const hardcoded = getModelsByProviderId(catalogProviderId)
            .filter((m) => !getModelKind(m) || getModelKind(m) === "llm")`,
  },
  {
    id: "ModelSelectModal.js/typed-models",
    file: "src/shared/components/ModelSelectModal.js",
    find: `            ...getModelsByProviderId(providerId)
            .filter((m) => getModelKind(m) === kindFilter)`,
    replace: `            ...getModelsByProviderId(catalogProviderId)
            .filter((m) => getModelKind(m) === kindFilter)`,
  },
  {
    id: "ModelSelectModal.js/group-name",
    file: "src/shared/components/ModelSelectModal.js",
    find: `          const matchedNode = providerNodes.find(node => node.id === providerId);
          const displayName = matchedNode?.name || providerInfo.name;`,
    replace: `          const matchedNode = providerNodes.find(node => node.id === providerId);
          const displayName = cloneMeta?.name || matchedNode?.name || providerInfo.name;`,
  },
  {
    id: "ModelSelectModal.js/provider-ids",
    file: "src/shared/components/ModelSelectModal.js",
    find: `    const compatibleNodeIds = kindFilter
      ? []
      : customModels
          .map((m) => m.providerAlias)
          .filter((alias) =>
            (isOpenAICompatibleProvider(alias) || isAnthropicCompatibleProvider(alias)) &&
            existingNodeIds.has(alias) &&
            !deactivatedProviderIds.has(alias)
          );`,
    replace: `    const compatibleNodeIds = kindFilter
      ? []
      : customModels
          .map((m) => m.providerAlias)
          .filter((alias) =>
            (isOpenAICompatibleProvider(alias) || isAnthropicCompatibleProvider(alias)) &&
            existingNodeIds.has(alias) &&
            !deactivatedProviderIds.has(alias)
          );
    // Clones with custom models stay selectable without an active connection,
    // mirroring the compatible-node behavior above.
    const cloneNodeIds = kindFilter
      ? []
      : customModels
          .map((m) => m.providerAlias)
          .filter((alias) => isProviderCloneId(alias) && !deactivatedProviderIds.has(alias));`,
  },
  {
    id: "ModelSelectModal.js/provider-ids-union",
    file: "src/shared/components/ModelSelectModal.js",
    find: `    const providerIdsToShow = new Set([
      ...activeConnectionIds,  // Only connected providers
      ...noAuthIds,            // No-auth providers (kind-filtered)
      ...compatibleNodeIds,    // Compatible nodes with user-added models
    ].filter((id) => !deactivatedProviderIds.has(id)));`,
    replace: `    const providerIdsToShow = new Set([
      ...activeConnectionIds,  // Only connected providers
      ...noAuthIds,            // No-auth providers (kind-filtered)
      ...compatibleNodeIds,    // Compatible nodes with user-added models
      ...cloneNodeIds,         // Clones with user-added models
    ].filter((id) => !deactivatedProviderIds.has(id)));`,
  },
];

export default PATCHES;

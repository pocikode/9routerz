import { NextResponse } from "next/server";
import REGISTRY from "open-sse/providers/registry/index.js";
import { getProviderNodes } from "@/models";
import { createProviderClone, listProviderClones, getTakenClonePrefixes } from "@/lib/providerClones";
import { AI_PROVIDERS } from "@/shared/constants/providers";

export const dynamic = "force-dynamic";

// Prefix rules: lowercase start, then letters/digits/._- — must be usable as the
// left side of `prefix/model`, so no slashes, no spaces, no leading punctuation.
const PREFIX_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/;

// Registry ids/aliases are reserved: a clone prefix must never shadow a
// built-in provider (otherwise `cbai/...` could route to the wrong pool).
function reservedPrefixes() {
  const reserved = new Set();
  for (const entry of REGISTRY) {
    reserved.add(entry.id.toLowerCase());
    if (entry.alias) reserved.add(entry.alias.toLowerCase());
    for (const alias of entry.aliases || []) reserved.add(alias.toLowerCase());
  }
  return reserved;
}

// Providers that cannot be cloned meaningfully: they have no transport (media-only
// entries) or need a bespoke login UI this overlay does not re-implement.
const UNCLONEABLE = new Set([
  "local-device",
]);

// Sources whose OAuth flow lives in a dedicated dashboard modal (not the generic
// OAuthModal). API-key cloning still works for them; OAuth is flagged unsupported.
const CUSTOM_OAUTH_UI = new Set([
  "xiaomi-mimo",
  "trae",
  "windsurf",
  "zed",
  "cursor",
  "kiro",
  "gitlab",
]);

function buildSourceCatalog() {
  const sources = [];
  for (const entry of REGISTRY) {
    if (!entry.transport || UNCLONEABLE.has(entry.id)) continue;
    const info = AI_PROVIDERS[entry.id];
    if (!info) continue;
    const authModes = Array.isArray(entry.authModes)
      ? entry.authModes
      : [entry.category === "oauth" ? "oauth" : "apikey"];
    sources.push({
      id: entry.id,
      alias: entry.alias || entry.id,
      name: info.name || entry.id,
      color: info.color || "#666",
      icon: info.icon || null,
      category: entry.category,
      authModes,
      hasOAuth: !!entry.hasOAuth || authModes.includes("oauth"),
      oauthSupported: authModes.includes("oauth") && !CUSTOM_OAUTH_UI.has(entry.id),
      noAuth: !!entry.noAuth,
      modelCount: Array.isArray(entry.models) ? entry.models.length : 0,
      baseUrl: entry.transport.baseUrl || "",
    });
  }
  return sources.sort((a, b) => a.name.localeCompare(b.name));
}

// GET /api/provider-clones - list clones + cloneable sources
export async function GET() {
  try {
    const clones = await listProviderClones();
    return NextResponse.json({ clones, sources: buildSourceCatalog() });
  } catch (error) {
    console.log("Error listing provider clones:", error);
    return NextResponse.json({ error: "Failed to list provider clones" }, { status: 500 });
  }
}

// POST /api/provider-clones - create a clone
export async function POST(request) {
  try {
    const body = await request.json();
    const sourceProvider = String(body.sourceProvider || "").trim();
    const name = String(body.name || "").trim();
    const prefix = String(body.prefix || "").trim().toLowerCase();
    const baseUrl = String(body.baseUrl || "").trim();

    if (!sourceProvider) {
      return NextResponse.json({ error: "Source provider is required" }, { status: 400 });
    }
    if (!AI_PROVIDERS[sourceProvider]) {
      return NextResponse.json({ error: `Unknown source provider: ${sourceProvider}` }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!prefix) {
      return NextResponse.json({ error: "Prefix is required" }, { status: 400 });
    }
    if (!PREFIX_RE.test(prefix)) {
      return NextResponse.json({
        error: "Prefix must be 1-32 chars, start with a letter or digit, and use only a-z 0-9 . _ -",
      }, { status: 400 });
    }

    const reserved = reservedPrefixes();
    if (reserved.has(prefix)) {
      return NextResponse.json({
        error: `Prefix "${prefix}" is reserved by a built-in provider. Pick another.`,
      }, { status: 409 });
    }

    // Node prefixes (compatible + embedding + clones) share the same namespace.
    const nodes = await getProviderNodes();
    const takenNodePrefix = nodes.find((n) => (n.prefix || "").toLowerCase() === prefix);
    if (takenNodePrefix) {
      return NextResponse.json({
        error: `Prefix "${prefix}" is already used by "${takenNodePrefix.name || takenNodePrefix.id}".`,
      }, { status: 409 });
    }

    const takenClones = await getTakenClonePrefixes();
    if (takenClones.has(prefix)) {
      return NextResponse.json({ error: `Prefix "${prefix}" is already used by another clone.` }, { status: 409 });
    }

    const clone = await createProviderClone({ sourceProvider, prefix, name, baseUrl });
    return NextResponse.json({ clone }, { status: 201 });
  } catch (error) {
    console.log("Error creating provider clone:", error);
    return NextResponse.json({ error: "Failed to create provider clone" }, { status: 500 });
  }
}

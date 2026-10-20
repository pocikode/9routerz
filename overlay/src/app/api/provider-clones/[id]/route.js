import { NextResponse } from "next/server";
import REGISTRY from "open-sse/providers/registry/index.js";
import { getProviderNodes, getProviderConnections, updateProviderConnection, deleteProviderConnectionsByProvider } from "@/models";
import { getProviderClone, updateProviderClone, deleteProviderClone, getTakenClonePrefixes } from "@/lib/providerClones";

export const dynamic = "force-dynamic";

const PREFIX_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/;

function reservedPrefixes() {
  const reserved = new Set();
  for (const entry of REGISTRY) {
    reserved.add(entry.id.toLowerCase());
    if (entry.alias) reserved.add(entry.alias.toLowerCase());
    for (const alias of entry.aliases || []) reserved.add(alias.toLowerCase());
  }
  return reserved;
}

// PUT /api/provider-clones/[id] - update name / prefix / baseUrl
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const clone = await getProviderClone(id);
    if (!clone) {
      return NextResponse.json({ error: "Provider clone not found" }, { status: 404 });
    }

    const body = await request.json();
    const name = body.name === undefined ? clone.name : String(body.name || "").trim();
    const prefix = body.prefix === undefined ? clone.prefix : String(body.prefix || "").trim().toLowerCase();
    const baseUrl = body.baseUrl === undefined ? clone.baseUrl : String(body.baseUrl || "").trim();

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

    if (prefix !== clone.prefix) {
      if (reservedPrefixes().has(prefix)) {
        return NextResponse.json({
          error: `Prefix "${prefix}" is reserved by a built-in provider. Pick another.`,
        }, { status: 409 });
      }
      const nodes = await getProviderNodes();
      const takenNodePrefix = nodes.find(
        (n) => n.id !== id && (n.prefix || "").toLowerCase() === prefix
      );
      if (takenNodePrefix) {
        return NextResponse.json({
          error: `Prefix "${prefix}" is already used by "${takenNodePrefix.name || takenNodePrefix.id}".`,
        }, { status: 409 });
      }
      const takenClones = await getTakenClonePrefixes(id);
      if (takenClones.has(prefix)) {
        return NextResponse.json({ error: `Prefix "${prefix}" is already used by another clone.` }, { status: 409 });
      }
    }

    const updated = await updateProviderClone(id, { name, prefix, baseUrl });

    // Keep the connections' routing metadata in sync (prefix is what the model
    // string is matched against, baseUrl overrides the source transport).
    const connections = await getProviderConnections({ provider: id });
    await Promise.all(
      connections.map((connection) =>
        updateProviderConnection(connection.id, {
          providerSpecificData: {
            ...(connection.providerSpecificData || {}),
            prefix,
            sourceProvider: clone.sourceProvider,
            baseUrl,
            nodeName: name,
          },
        })
      )
    );

    return NextResponse.json({ clone: updated });
  } catch (error) {
    console.log("Error updating provider clone:", error);
    return NextResponse.json({ error: "Failed to update provider clone" }, { status: 500 });
  }
}

// DELETE /api/provider-clones/[id] - delete clone and its connections
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const clone = await getProviderClone(id);
    if (!clone) {
      return NextResponse.json({ error: "Provider clone not found" }, { status: 404 });
    }

    await deleteProviderConnectionsByProvider(id);
    await deleteProviderClone(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting provider clone:", error);
    return NextResponse.json({ error: "Failed to delete provider clone" }, { status: 500 });
  }
}

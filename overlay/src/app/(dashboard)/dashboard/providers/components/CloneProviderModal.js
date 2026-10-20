"use client";

import { useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import { Badge, Button, Input, Modal, Select } from "@/shared/components";

const PREFIX_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/;

// Suggest a free prefix: base alias, then alias2, alias3, …
function suggestPrefix(alias, taken) {
  const base = String(alias || "clone").toLowerCase().replace(/[^a-z0-9._-]/g, "");
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${Date.now().toString(36).slice(-4)}`;
}

export default function CloneProviderModal({ isOpen, onClose, onCreated, existingPrefixes = [] }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ sourceProvider: "", name: "", prefix: "", baseUrl: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const taken = useMemo(
    () => new Set(existingPrefixes.map((p) => String(p || "").toLowerCase()).filter(Boolean)),
    [existingPrefixes]
  );

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch("/api/provider-clones", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setSources(data.sources || []);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load provider list");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setFormData({ sourceProvider: "", name: "", prefix: "", baseUrl: "" });
    setError("");
  }, [isOpen]);

  const selected = sources.find((s) => s.id === formData.sourceProvider) || null;

  const handleSelectSource = (sourceId) => {
    const source = sources.find((s) => s.id === sourceId) || null;
    setFormData((prev) => ({
      ...prev,
      sourceProvider: sourceId,
      name: source ? `${source.name} 2` : "",
      prefix: source ? suggestPrefix(source.alias, taken) : "",
      baseUrl: "",
    }));
    setError("");
  };

  const prefixError = (() => {
    const prefix = formData.prefix.trim().toLowerCase();
    if (!prefix) return null;
    if (!PREFIX_RE.test(prefix)) return "1-32 chars, start with a letter or digit, use only a-z 0-9 . _ -";
    if (taken.has(prefix)) return "Already in use";
    return null;
  })();

  const canSubmit =
    !!formData.sourceProvider &&
    !!formData.name.trim() &&
    !!formData.prefix.trim() &&
    !prefixError &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/provider-clones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceProvider: formData.sourceProvider,
          name: formData.name.trim(),
          prefix: formData.prefix.trim().toLowerCase(),
          baseUrl: formData.baseUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create clone");
        return;
      }
      onCreated?.(data.clone);
      onClose?.();
    } catch (err) {
      setError(err.message || "Failed to create clone");
    } finally {
      setSubmitting(false);
    }
  };

  const sourceOptions = sources.map((source) => ({
    value: source.id,
    label: `${source.name} · ${source.alias}${source.hasOAuth ? " · OAuth" : ""}`,
  }));

  return (
    <Modal isOpen={isOpen} title="Clone Provider" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">
          A clone behaves exactly like the provider you pick — same endpoint, headers, login flow and
          models — but has its own model prefix and its own separate account pool.
        </p>

        <Select
          label="Source Provider"
          options={sourceOptions}
          value={formData.sourceProvider}
          onChange={(e) => handleSelectSource(e.target.value)}
          placeholder={loading ? "Loading providers…" : "Select a provider to clone"}
          disabled={loading}
        />

        {selected && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-text-muted dark:border-white/10 dark:bg-white/[0.03]">
            <Badge variant="default" size="sm">{selected.alias}</Badge>
            {selected.hasOAuth && (
              <Badge variant={selected.oauthSupported ? "success" : "warning"} size="sm">
                {selected.oauthSupported ? "OAuth supported" : "OAuth via source only"}
              </Badge>
            )}
            {selected.authModes?.includes("apikey") && <Badge variant="default" size="sm">API Key</Badge>}
            {selected.modelCount > 0 && <span>{selected.modelCount} models</span>}
            {selected.baseUrl && <span className="truncate">{selected.baseUrl}</span>}
          </div>
        )}

        <Input
          label="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="CodeBuddy 2"
          hint="Required. Shown on the dashboard card."
        />

        <Input
          label="Prefix"
          value={formData.prefix}
          onChange={(e) => setFormData({ ...formData, prefix: e.target.value.toLowerCase() })}
          placeholder="cbai2"
          error={prefixError || undefined}
          hint={
            prefixError ||
            "Required. Model IDs for this clone are addressed as prefix/model."
          }
        />

        <Input
          label="Base URL override (optional)"
          value={formData.baseUrl}
          onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
          placeholder={selected?.baseUrl || "Leave empty to use the source provider's endpoint"}
          hint="Only needed when this clone should talk to a different gateway."
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button icon="content_copy" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Creating…" : "Create Clone"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

CloneProviderModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func,
  existingPrefixes: PropTypes.arrayOf(PropTypes.string),
};

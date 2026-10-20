"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Badge, Button, Input, Modal } from "@/shared/components";

const PREFIX_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/;

export default function EditProviderCloneModal({ isOpen, clone, sourceInfo, onSave, onClose, existingPrefixes = [] }) {
  const [formData, setFormData] = useState({ name: "", prefix: "", baseUrl: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (clone) {
      setFormData({
        name: clone.name || "",
        prefix: clone.prefix || "",
        baseUrl: clone.baseUrl || "",
      });
      setError("");
    }
  }, [clone]);

  const prefix = formData.prefix.trim().toLowerCase();
  const taken = new Set(
    existingPrefixes
      .map((p) => String(p || "").toLowerCase())
      .filter((p) => p && p !== (clone?.prefix || "").toLowerCase())
  );
  const prefixError = (() => {
    if (!prefix) return null;
    if (!PREFIX_RE.test(prefix)) return "1-32 chars, start with a letter or digit, use only a-z 0-9 . _ -";
    if (taken.has(prefix)) return "Already in use";
    return null;
  })();

  const canSave = !!formData.name.trim() && !!prefix && !prefixError && !saving;

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      await onSave({
        name: formData.name.trim(),
        prefix,
        baseUrl: formData.baseUrl.trim(),
      });
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!clone) return null;

  return (
    <Modal isOpen={isOpen} title="Edit Cloned Provider" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {sourceInfo && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-text-muted dark:border-white/10 dark:bg-white/[0.03]">
            <span>Cloned from</span>
            <Badge variant="default" size="sm">{sourceInfo.name}</Badge>
            <Badge variant="default" size="sm">{sourceInfo.alias}</Badge>
          </div>
        )}

        <Input
          label="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          hint="Required. Shown on the dashboard card."
        />

        <Input
          label="Prefix"
          value={formData.prefix}
          onChange={(e) => setFormData({ ...formData, prefix: e.target.value.toLowerCase() })}
          error={prefixError || undefined}
          hint={prefixError || "Model IDs for this clone are addressed as prefix/model."}
        />

        <Input
          label="Base URL override (optional)"
          value={formData.baseUrl}
          onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
          placeholder={sourceInfo?.baseUrl || "Use the source provider's endpoint"}
          hint="Only needed when this clone should talk to a different gateway."
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={handleSubmit} fullWidth disabled={!canSave}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button onClick={onClose} variant="ghost" fullWidth>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

EditProviderCloneModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  clone: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    prefix: PropTypes.string,
    baseUrl: PropTypes.string,
    sourceProvider: PropTypes.string,
  }),
  sourceInfo: PropTypes.shape({
    name: PropTypes.string,
    alias: PropTypes.string,
    baseUrl: PropTypes.string,
  }),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  existingPrefixes: PropTypes.arrayOf(PropTypes.string),
};

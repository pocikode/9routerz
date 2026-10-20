"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Button, Modal, Select } from "@/shared/components";

// Move selected accounts from a provider into one of its clones. Credentials are
// untouched — only the owning provider id (and the clone's routing metadata)
// changes, so the clone serves them under its own prefix and account pool.
export default function MoveToCloneModal({ isOpen, providerId, connections = [], onMoved, onClose }) {
  const [clones, setClones] = useState([]);
  const [cloneId, setCloneId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Only clones of THIS provider can receive its accounts.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setCloneId("");
    fetch("/api/provider-clones", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const matching = (data.clones || []).filter((c) => c.sourceProvider === providerId);
        setClones(matching);
        if (matching.length === 1) setCloneId(matching[0].id);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load clones");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, providerId]);

  const selectedClone = clones.find((c) => c.id === cloneId) || null;
  const canSubmit = !!cloneId && connections.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/provider-clones/${cloneId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionIds: connections.map((c) => c.id) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to move accounts");
        return;
      }
      onMoved?.(data);
      onClose?.();
    } catch (err) {
      setError(err.message || "Failed to move accounts");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} title="Move to Cloned Provider" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">
          Move {connections.length} selected account{connections.length === 1 ? "" : "s"} into a clone of this
          provider. Credentials stay the same; the clone serves them under its own model prefix.
        </p>

        {clones.length > 0 ? (
          <Select
            label="Destination clone"
            options={clones.map((c) => ({ value: c.id, label: `${c.name} · ${c.prefix}` }))}
            value={cloneId}
            onChange={(e) => setCloneId(e.target.value)}
            placeholder="Select a cloned provider"
            disabled={loading}
          />
        ) : (
          !loading && (
            <p className="rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-sm text-text-muted dark:border-white/10 dark:bg-white/[0.03]">
              No clones of this provider yet. Create one from the Providers page first.
            </p>
          )
        )}

        {selectedClone && (
          <p className="text-xs text-text-muted">
            Model IDs for this clone are addressed as{" "}
            <code className="font-mono">{selectedClone.prefix}/model</code>.
          </p>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={handleSubmit} fullWidth disabled={!canSubmit}>
            {submitting
              ? "Moving…"
              : `Move ${connections.length} account${connections.length === 1 ? "" : "s"}`}
          </Button>
          <Button onClick={onClose} variant="ghost" fullWidth disabled={submitting}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

MoveToCloneModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  providerId: PropTypes.string.isRequired,
  connections: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string.isRequired })),
  onMoved: PropTypes.func,
  onClose: PropTypes.func.isRequired,
};
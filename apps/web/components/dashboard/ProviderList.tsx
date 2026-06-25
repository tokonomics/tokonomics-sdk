"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConnectProviderModal } from "./ConnectProviderModal";

type Provider = {
  id: string;
  provider: "OPENAI" | "ANTHROPIC" | "GOOGLE";
  displayName: string;
  keyLastFour: string;
  status: string;
  lastSyncedAt: string | null;
  lastSpendUsd: string | null;
};

type Props = { providers: Provider[]; onRefresh: () => void };

const PROVIDER_LABELS: Record<string, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  GOOGLE: "Google",
};

const STATUS_COLORS: Record<string, string> = {
  CONNECTED: "text-green-600 bg-green-50",
  ERROR: "text-red-600 bg-red-50",
  DISCONNECTED: "text-muted-foreground bg-muted",
};

export function ProviderList({ providers, onRefresh }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Remove this provider connection?")) return;
    setDeleting(id);
    try {
      await fetch(`/api/providers/${id}`, { method: "DELETE" });
      onRefresh();
    } finally {
      setDeleting(null);
    }
  }

  async function handleSync(id: string) {
    await fetch(`/api/providers/${id}/sync`, { method: "POST" });
    setTimeout(onRefresh, 2000);
  }

  if (providers.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">Connected Providers</h3>
          <Button size="sm" onClick={() => setShowModal(true)}>
            Connect provider
          </Button>
        </div>
        <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No provider connected yet. Add your OpenAI, Anthropic, or Gemini API key to see spend data.
          </p>
        </div>
        {showModal && (
          <ConnectProviderModal
            onSuccess={() => { setShowModal(false); onRefresh(); }}
            onClose={() => setShowModal(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Connected Providers</h3>
        <Button size="sm" onClick={() => setShowModal(true)}>
          Add provider
        </Button>
      </div>
      <div className="space-y-3">
        {providers.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-sm font-medium">{p.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {PROVIDER_LABELS[p.provider]} · ****{p.keyLastFour}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] ?? ""}`}
              >
                {p.status.toLowerCase()}
              </span>
              {p.lastSpendUsd && (
                <span className="text-xs text-muted-foreground">
                  ${parseFloat(p.lastSpendUsd).toFixed(2)}
                </span>
              )}
              <button
                onClick={() => void handleSync(p.id)}
                className="text-xs text-brand-500 hover:text-brand-600"
              >
                Sync
              </button>
              <button
                onClick={() => void handleDelete(p.id)}
                disabled={deleting === p.id}
                className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      {showModal && (
        <ConnectProviderModal
          onSuccess={() => { setShowModal(false); onRefresh(); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

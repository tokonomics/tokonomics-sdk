"use client";

import { useState, useEffect, useCallback } from "react";
import { ProviderList } from "@/components/dashboard/ProviderList";

type Provider = {
  id: string;
  provider: "OPENAI" | "ANTHROPIC" | "GOOGLE";
  displayName: string;
  keyLastFour: string;
  status: string;
  lastSyncedAt: string | null;
  lastSpendUsd: string | null;
};

export default function ProvidersSettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/providers");
      const json = (await res.json()) as { data: Provider[] };
      setProviders(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Provider Connections</h1>
        <p className="mt-1 text-muted-foreground">
          Connect your LLM provider API keys to track spend.
        </p>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-xl border bg-muted" />
      ) : (
        <ProviderList providers={providers} onRefresh={() => void fetchProviders()} />
      )}

      <div className="mt-6 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Security note</p>
        <p className="mt-1">
          API keys are validated against each provider before being stored. They are encrypted using
          AES-256-GCM and only the last 4 characters are kept for display. Decrypted keys are never
          returned to the browser.
        </p>
      </div>
    </div>
  );
}

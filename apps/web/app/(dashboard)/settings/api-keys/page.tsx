"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

type ApiKey = { id: string; name: string; keyPrefix: string; lastUsedAt: string | null; createdAt: string };
type NewKey = ApiKey & { key: string };

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyName, setKeyName] = useState("Production");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<NewKey | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings/api-keys");
    const json = (await res.json()) as { data: ApiKey[] };
    setKeys(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchKeys(); }, [fetchKeys]);

  async function handleCreate() {
    setCreating(true);
    const res = await fetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: keyName }),
    });
    const json = (await res.json()) as { data?: NewKey };
    setCreating(false);
    if (res.ok && json.data) { setNewKey(json.data); void fetchKeys(); }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this API key?")) return;
    await fetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
    void fetchKeys();
  }

  function copyKey() {
    if (!newKey) return;
    void navigator.clipboard.writeText(newKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Public API Keys</h1>
        <p className="mt-1 text-muted-foreground">
          Use these keys to access the Tokonomics REST API from your own systems.
        </p>
      </div>

      {newKey && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="mb-1 font-semibold text-green-800">Key created — copy it now. It won&apos;t be shown again.</p>
          <div className="flex items-center gap-3 rounded-lg border border-green-300 bg-white p-3">
            <code className="flex-1 overflow-x-auto text-sm font-mono text-green-900">{newKey.key}</code>
            <Button size="sm" onClick={copyKey}>{copied ? "Copied!" : "Copy"}</Button>
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setNewKey(null)}>I&apos;ve saved it</Button>
        </div>
      )}

      <div className="rounded-xl border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold">Create API key</h3>
        <div className="flex gap-3">
          <input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Key name" className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm" />
          <Button onClick={() => void handleCreate()} disabled={creating || !keyName.trim()}>
            {creating ? "Creating…" : "Create key"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold">Active keys</h3>
        {loading ? (
          <div className="h-12 animate-pulse rounded bg-muted" />
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{k.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{k.keyPrefix}…</p>
                </div>
                <div className="flex items-center gap-3">
                  {k.lastUsedAt && <span className="text-xs text-muted-foreground">Last used {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
                  <button onClick={() => void handleRevoke(k.id)} className="text-xs text-red-500 hover:text-red-700">Revoke</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-muted/30 p-4 text-sm">
        <p className="mb-2 font-semibold">Usage</p>
        <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{`# Get spend summary
curl https://app.tokonomics.dev/api/v1/spend/summary \\
  -H "X-API-Key: tok_api_..."

# Get customers
curl https://app.tokonomics.dev/api/v1/customers \\
  -H "X-API-Key: tok_api_..."

# Get margin score
curl https://app.tokonomics.dev/api/v1/margin-score \\
  -H "X-API-Key: tok_api_..."`}</pre>
        <p className="mt-2 text-xs text-muted-foreground">Rate limit: 1,000 requests/hour per key.</p>
      </div>
    </div>
  );
}

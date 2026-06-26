"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

type SdkKey = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};

type NewKey = SdkKey & { key: string };

export default function SdkKeysPage() {
  const [keys, setKeys] = useState<SdkKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("Production");
  const [newKey, setNewKey] = useState<NewKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/sdk-keys");
    const json = (await res.json()) as { data: SdkKey[] };
    setKeys(json.data);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchKeys(); }, [fetchKeys]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/sdk-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      const json = (await res.json()) as { data?: NewKey; error?: { message: string } };
      if (!res.ok) { setError(json.error?.message ?? "Failed to create key"); return; }
      setNewKey(json.data!);
      void fetchKeys();
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this key? Any apps using it will stop working immediately.")) return;
    setRevoking(id);
    await fetch(`/api/sdk-keys/${id}`, { method: "DELETE" });
    setRevoking(null);
    void fetchKeys();
  }

  function copyKey() {
    if (!newKey) return;
    void navigator.clipboard.writeText(newKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const sdkKey = newKey?.key ?? keys[0]?.keyPrefix ?? "tok_live_...";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">SDK Keys</h1>
        <p className="mt-1 text-muted-foreground">
          Use these keys to authenticate the Tokonomics SDK in your app.
        </p>
      </div>

      {/* New key banner — shown once */}
      {newKey && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="mb-1 font-semibold text-green-800">
            Key created — copy it now. It won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-3 rounded-lg border border-green-300 bg-white p-3">
            <code className="flex-1 overflow-x-auto text-sm font-mono text-green-900">
              {newKey.key}
            </code>
            <Button size="sm" onClick={copyKey}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setNewKey(null)}>
            I&apos;ve saved it
          </Button>
        </div>
      )}

      {/* Create new key */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold">Create new key</h3>
        <div className="flex gap-3">
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. Production, Staging)"
            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <Button onClick={() => void handleCreate()} disabled={creating || !newKeyName.trim()}>
            {creating ? "Creating…" : "Create key"}
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>

      {/* Existing keys */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold">Active keys</h3>
        {loading ? (
          <div className="h-12 animate-pulse rounded-lg bg-muted" />
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No keys yet.</p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{k.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{k.keyPrefix}…</p>
                </div>
                <div className="flex items-center gap-3">
                  {k.lastUsedAt && (
                    <span className="text-xs text-muted-foreground">
                      Last used {new Date(k.lastUsedAt).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    onClick={() => void handleRevoke(k.id)}
                    disabled={revoking === k.id}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Integration snippets + Prompt Assist (2.7) */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold">Integration</h3>
        <div className="space-y-4">
          {/* Prompt Assist */}
          <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
            <p className="mb-1 text-sm font-medium text-brand-800">
              🪄 No-code setup — paste this into Cursor / Claude Code / Lovable
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-white p-3 text-xs text-brand-900 border border-brand-200">
{`Add Tokonomics tracking to every LLM call in this project.
- Use the logged-in user ID as customer_id
- Infer the feature name from the route or function name
- SDK key: ${sdkKey}

Install: npm install tokonomics
Docs: https://docs.tokonomics.dev`}
            </pre>
          </div>

          {/* Node.js snippet */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">Node.js / TypeScript</p>
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
{`import { Tokonomics } from "tokonomics";

const toko = new Tokonomics({ apiKey: "${sdkKey}" });

// Wrap any LLM call
const result = await toko.track(
  { customerId: user.id, feature: "chat" },
  () => openai.chat.completions.create({ ... })
);`}
            </pre>
          </div>

          {/* Python snippet */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">Python</p>
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
{`from tokonomics import Tokonomics

toko = Tokonomics(api_key="${sdkKey}")

@toko.track(customer_id=user.id, feature="chat")
def call_llm():
    return anthropic.messages.create(...)`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

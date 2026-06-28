"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

type SlackConn = { id: string; channelName: string | null; isActive: boolean } | null;

export default function SlackSettingsPage() {
  const [conn, setConn] = useState<SlackConn>(null);
  const [loading, setLoading] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [channelName, setChannelName] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/slack")
      .then((r) => r.json())
      .then((j: { data: SlackConn }) => { setConn(j.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!webhookUrl.startsWith("https://hooks.slack.com/")) {
      setMsg({ type: "err", text: "URL must start with https://hooks.slack.com/" });
      return;
    }
    setSaving(true); setMsg(null);
    const res = await fetch("/api/settings/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl, channelName: channelName || undefined }),
    });
    const json = (await res.json()) as { data?: { connected: boolean }; error?: { message: string } };
    setSaving(false);
    if (!res.ok) { setMsg({ type: "err", text: json.error?.message ?? "Failed" }); return; }
    setMsg({ type: "ok", text: "Slack connected! Test message sent to your channel." });
    setConn({ id: "new", channelName: channelName || null, isActive: true });
    setWebhookUrl(""); setChannelName("");
  }

  async function handleTest() {
    setTesting(true); setMsg(null);
    const res = await fetch("/api/settings/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    });
    setTesting(false);
    const json = (await res.json()) as { data?: { sent: boolean }; error?: { message: string } };
    if (res.ok && json.data?.sent) setMsg({ type: "ok", text: "Test message sent!" });
    else setMsg({ type: "err", text: json.error?.message ?? "Test failed" });
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Slack?")) return;
    await fetch("/api/settings/slack", { method: "DELETE" });
    setConn(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Slack Integration</h1>
        <p className="mt-1 text-muted-foreground">
          Receive spend spike and margin alerts directly in Slack.
        </p>
      </div>

      {loading ? (
        <div className="h-32 animate-pulse rounded-xl border bg-muted" />
      ) : conn ? (
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-green-500" />
            <p className="font-semibold">Slack connected</p>
            {conn.channelName && <span className="text-sm text-muted-foreground">#{conn.channelName}</span>}
          </div>
          <div className="mt-4 flex gap-3">
            <Button variant="outline" size="sm" onClick={() => void handleTest()} disabled={testing}>
              {testing ? "Sending…" : "Send test message"}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void handleDisconnect()}>
              Disconnect
            </Button>
          </div>
          {msg && <p className={`mt-3 text-sm ${msg.type === "ok" ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>}
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-6">
          <h3 className="mb-4 text-sm font-semibold">Connect Slack</h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Slack Incoming Webhook URL
              </label>
              <input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Create one at Slack → Apps → Incoming Webhooks.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Channel name (optional)
              </label>
              <input
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="alerts"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          {msg && <p className={`mt-3 text-sm ${msg.type === "ok" ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>}
          <Button className="mt-4" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Connecting…" : "Connect Slack"}
          </Button>
        </div>
      )}

      <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Alert types delivered to Slack</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Spend spike — daily spend exceeds 2× 7-day average</li>
          <li>Budget breached — circuit breaker triggered</li>
          <li>Margin floor — customer margin drops below configured floor</li>
          <li>Weekly digest summary (Monday 7am UTC)</li>
        </ul>
      </div>
    </div>
  );
}

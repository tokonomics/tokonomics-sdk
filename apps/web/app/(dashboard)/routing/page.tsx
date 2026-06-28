"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

type RoutingTest = {
  id: string; name: string; controlModel: string; treatmentModel: string;
  feature: string | null; status: string; startedAt: string | null; endedAt: string | null;
  results: Record<string, unknown> | null; recommendation: string | null;
};

export default function RoutingPage() {
  const [tests, setTests] = useState<RoutingTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", controlModel: "gpt-4o", treatmentModel: "gpt-4o-mini", feature: "" });

  const fetchTests = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/routing");
    const json = (await res.json()) as { data: RoutingTest[] };
    setTests(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchTests(); }, [fetchTests]);

  async function handleCreate() {
    if (!form.name || !form.controlModel || !form.treatmentModel) return;
    setCreating(true);
    await fetch("/api/routing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, controlModel: form.controlModel, treatmentModel: form.treatmentModel, feature: form.feature || undefined }),
    });
    setCreating(false);
    setForm({ name: "", controlModel: "gpt-4o", treatmentModel: "gpt-4o-mini", feature: "" });
    void fetchTests();
  }

  async function handleAction(id: string, action: "start" | "stop") {
    await fetch(`/api/routing/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    void fetchTests();
  }

  const STATUS_BADGE: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    RUNNING: "bg-blue-50 text-blue-600",
    COMPLETED: "bg-green-50 text-green-600",
    CANCELED: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Model Routing Tests</h1>
        <p className="mt-1 text-muted-foreground">
          Compare two models on cost and latency to find the best routing decision.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold">Create test</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Test name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="GPT-4o vs Mini" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Control model</label>
            <input value={form.controlModel} onChange={(e) => setForm((f) => ({ ...f, controlModel: e.target.value }))} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Treatment model</label>
            <input value={form.treatmentModel} onChange={(e) => setForm((f) => ({ ...f, treatmentModel: e.target.value }))} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Feature filter (optional)</label>
            <input value={form.feature} onChange={(e) => setForm((f) => ({ ...f, feature: e.target.value }))} placeholder="chat" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
          </div>
        </div>
        <Button className="mt-4" onClick={() => void handleCreate()} disabled={creating}>
          {creating ? "Creating…" : "Create test"}
        </Button>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="h-20 animate-pulse rounded-xl border bg-muted" />
        ) : tests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No routing tests yet.</p>
        ) : tests.map((t) => (
          <div key={t.id} className="rounded-xl border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{t.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status] ?? ""}`}>
                    {t.status.toLowerCase()}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t.controlModel} vs {t.treatmentModel}
                  {t.feature && <span> · feature: {t.feature}</span>}
                </p>
              </div>
              <div className="flex gap-2">
                {t.status === "DRAFT" && (
                  <Button size="sm" onClick={() => void handleAction(t.id, "start")}>Start</Button>
                )}
                {t.status === "RUNNING" && (
                  <Button size="sm" variant="outline" onClick={() => void handleAction(t.id, "stop")}>Stop & analyze</Button>
                )}
              </div>
            </div>
            {t.results && (
              <div className="mt-3 rounded-lg bg-muted/30 p-3 text-sm">
                <div className="grid grid-cols-3 gap-4 text-center">
                  {(() => { const r = t.results as Record<string,string>; return (<>
                    <div><p className="text-xs text-muted-foreground">Control cost</p><p className="font-semibold">${r["controlCostUsd"] ?? "0"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Treatment cost</p><p className="font-semibold">${r["treatmentCostUsd"] ?? "0"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Savings</p><p className={`font-semibold ${parseFloat(r["savingsUsd"] ?? "0") > 0 ? "text-green-600" : "text-red-500"}`}>${r["savingsUsd"] ?? "0"}</p></div>
                  </>); })()}
                </div>
                {t.recommendation && (
                  <p className="mt-2 text-sm italic text-muted-foreground">{t.recommendation}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

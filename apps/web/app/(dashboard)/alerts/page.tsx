"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

type BudgetRule = {
  id: string;
  customerId: string | null;
  feature: string | null;
  ruleType: "DAILY" | "MONTHLY";
  limitUsd: string;
  alertAtPct: number;
  circuitBreak: boolean;
  customer: { externalId: string; displayName: string | null } | null;
};

export default function AlertsPage() {
  const [rules, setRules] = useState<BudgetRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    ruleType: "MONTHLY" as "DAILY" | "MONTHLY",
    limitUsd: "",
    alertAtPct: 80,
    circuitBreak: false,
    feature: "",
    customerId: "",
  });

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/budget-rules");
    const json = (await res.json()) as { data: BudgetRule[] };
    setRules(json.data);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchRules(); }, [fetchRules]);

  async function handleCreate() {
    if (!form.limitUsd || parseFloat(form.limitUsd) <= 0) {
      setError("Enter a valid limit amount");
      return;
    }
    setCreating(true);
    setError(null);
    const res = await fetch("/api/budget-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ruleType: form.ruleType,
        limitUsd: parseFloat(form.limitUsd),
        alertAtPct: form.alertAtPct,
        circuitBreak: form.circuitBreak,
        ...(form.feature ? { feature: form.feature } : {}),
        ...(form.customerId ? { customerId: form.customerId } : {}),
      }),
    });
    const json = (await res.json()) as { error?: { message: string } };
    setCreating(false);
    if (!res.ok) { setError(json.error?.message ?? "Failed"); return; }
    setForm({ ruleType: "MONTHLY", limitUsd: "", alertAtPct: 80, circuitBreak: false, feature: "", customerId: "" });
    void fetchRules();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this budget rule?")) return;
    await fetch(`/api/budget-rules/${id}`, { method: "DELETE" });
    void fetchRules();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Budget Rules & Alerts</h1>
        <p className="mt-1 text-muted-foreground">
          Set spending limits and get alerted when customers approach them.
        </p>
      </div>

      {/* Create rule */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold">Create budget rule</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Period</label>
            <select
              value={form.ruleType}
              onChange={(e) => setForm((f) => ({ ...f, ruleType: e.target.value as "DAILY" | "MONTHLY" }))}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="DAILY">Daily</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Limit (USD)</label>
            <input
              type="number"
              value={form.limitUsd}
              onChange={(e) => setForm((f) => ({ ...f, limitUsd: e.target.value }))}
              placeholder="10.00"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Alert at % of limit</label>
            <input
              type="number"
              min={1} max={100}
              value={form.alertAtPct}
              onChange={(e) => setForm((f) => ({ ...f, alertAtPct: parseInt(e.target.value, 10) }))}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Feature (optional)</label>
            <input
              value={form.feature}
              onChange={(e) => setForm((f) => ({ ...f, feature: e.target.value }))}
              placeholder="chat, summarize…"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.circuitBreak}
                onChange={(e) => setForm((f) => ({ ...f, circuitBreak: e.target.checked }))}
              />
              Circuit breaker (block at limit)
            </label>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        <Button className="mt-4" onClick={() => void handleCreate()} disabled={creating}>
          {creating ? "Creating…" : "Create rule"}
        </Button>
      </div>

      {/* Rules list */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold">Active rules</h3>
        {loading ? (
          <div className="h-12 animate-pulse rounded-lg bg-muted" />
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No budget rules yet.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {r.ruleType === "DAILY" ? "Daily" : "Monthly"} limit: ${parseFloat(r.limitUsd).toFixed(2)}
                    {r.feature && <span className="ml-2 text-muted-foreground">· {r.feature}</span>}
                    {r.customer && <span className="ml-2 text-muted-foreground">· {r.customer.externalId}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Alert at {r.alertAtPct}%{r.circuitBreak ? " · Circuit breaker ON" : ""}
                  </p>
                </div>
                <button
                  onClick={() => void handleDelete(r.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

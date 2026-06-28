"use client";

import { useState, useEffect, useCallback } from "react";
import { MarginCopilot } from "@/components/dashboard/MarginCopilot";

type CustomerMargin = {
  id: string; externalId: string; displayName: string | null;
  mrrCents: number; llmCostUsd: string; grossMarginPct: string; status: string;
};

type MarginData = {
  orgMarginPct: string; totalMrrUsd: string; totalCostUsd: string;
  marginScore: number | null;
  scoreHistory: { date: string; score: number }[];
  statusCounts: { healthy: number; watch: number; unprofitable: number; losing: number };
  customers: CustomerMargin[];
};

const STATUS_COLORS: Record<string, string> = {
  HEALTHY: "text-green-600 bg-green-50",
  WATCH: "text-yellow-600 bg-yellow-50",
  UNPROFITABLE: "text-orange-600 bg-orange-50",
  LOSING_MONEY: "text-red-600 bg-red-50",
};

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 70 ? "text-green-600" : score >= 40 ? "text-yellow-600" : "text-red-600";
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-6">
      <p className="mb-2 text-sm font-medium text-muted-foreground">AI Margin Score</p>
      <p className={`text-6xl font-bold ${color}`}>{score}</p>
      <p className="mt-1 text-xs text-muted-foreground">out of 100</p>
      <div className="mt-3 flex gap-2 text-xs">
        <span className="text-red-500">Red &lt;40</span>
        <span className="text-yellow-500">Yellow 40–70</span>
        <span className="text-green-500">Green &gt;70</span>
      </div>
    </div>
  );
}

export default function MarginPage() {
  const [data, setData] = useState<MarginData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingMrr, setEditingMrr] = useState<string | null>(null);
  const [mrrInput, setMrrInput] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/margin");
    const json = (await res.json()) as { data: MarginData };
    setData(json.data);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  async function saveMrr(customerId: string) {
    const mrr = parseFloat(mrrInput);
    if (isNaN(mrr) || mrr < 0) return;
    await fetch(`/api/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manualMrr: mrr }),
    });
    setEditingMrr(null);
    void fetchData();
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading margin data…</div>;

  const hasData = data && data.customers.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gross Margin</h1>
        <p className="mt-1 text-muted-foreground">
          Revenue vs. AI spend per customer. Set each customer&apos;s monthly revenue (MRR) below.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Org Gross Margin</p>
          <p className="mt-1 text-3xl font-bold">{data?.orgMarginPct ?? 0}%</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Total MRR</p>
          <p className="mt-1 text-3xl font-bold">${data?.totalMrrUsd ?? "0"}</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">LLM COGS (month)</p>
          <p className="mt-1 text-3xl font-bold">${parseFloat(data?.totalCostUsd ?? "0").toFixed(2)}</p>
        </div>
        {data?.marginScore != null ? (
          <ScoreGauge score={data.marginScore} />
        ) : (
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">AI Margin Score</p>
            <p className="mt-1 text-xl text-muted-foreground">No data yet</p>
          </div>
        )}
      </div>

      {/* Status distribution */}
      {hasData && (
        <div className="flex gap-4">
          {Object.entries(data!.statusCounts).map(([status, count]) => (
            <div key={status} className="rounded-lg border bg-card px-4 py-2 text-sm">
              <span className="font-semibold capitalize">{status.replace("_", " ")}: </span>
              <span>{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Customer margin table */}
      <div className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <h3 className="font-semibold">Customer Margins</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Click the MRR column to set a customer&apos;s monthly revenue.
          </p>
        </div>
        {!hasData ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <p className="font-semibold">No margin data yet</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Set a customer&apos;s MRR by clicking the pencil icon in the MRR column below.
              You need at least one customer with MRR set to see margin calculations.
            </p>
            {/* Show all customers to allow MRR setting */}
            <AllCustomersMrrSetter onSaved={fetchData} />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">MRR / mo</th>
                <th className="px-4 py-3 text-right">LLM Cost</th>
                <th className="px-4 py-3 text-right">Margin %</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data!.customers.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{c.externalId}</td>
                  <td className="px-4 py-3 text-right">
                    {editingMrr === c.id ? (
                      <span className="flex items-center justify-end gap-1">
                        <input
                          autoFocus
                          value={mrrInput}
                          onChange={(e) => setMrrInput(e.target.value)}
                          className="w-24 rounded border px-2 py-0.5 text-right text-xs"
                          placeholder="99.00"
                          onKeyDown={(e) => e.key === "Enter" && void saveMrr(c.id)}
                        />
                        <button onClick={() => void saveMrr(c.id)} className="text-green-600 text-xs">✓</button>
                        <button onClick={() => setEditingMrr(null)} className="text-red-500 text-xs">✕</button>
                      </span>
                    ) : (
                      <button
                        onClick={() => { setEditingMrr(c.id); setMrrInput((c.mrrCents / 100).toFixed(2)); }}
                        className="font-medium hover:underline"
                      >
                        ${(c.mrrCents / 100).toFixed(2)} ✏️
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">${parseFloat(c.llmCostUsd).toFixed(4)}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {parseFloat(c.grossMarginPct) < 0 ? "−" : ""}
                    {Math.abs(parseFloat(c.grossMarginPct)).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status] ?? ""}`}>
                      {c.status.replace("_", " ").toLowerCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 4.4 Margin Copilot */}
      <MarginCopilot />
    </div>
  );
}

function AllCustomersMrrSetter({ onSaved }: { onSaved: () => void }) {
  const [customers, setCustomers] = useState<{ id: string; externalId: string }[]>([]);
  const [mrrs, setMrrs] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/customers").then((r) => r.json()).then((j: { data: { customers: { id: string; externalId: string }[] } }) => {
      setCustomers(j.data.customers ?? []);
    }).catch(() => {});
  }, []);

  async function saveAll() {
    for (const [id, mrr] of Object.entries(mrrs)) {
      const val = parseFloat(mrr);
      if (!isNaN(val) && val >= 0) {
        await fetch(`/api/customers/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manualMrr: val }),
        });
      }
    }
    onSaved();
  }

  if (customers.length === 0) return null;

  return (
    <div className="mt-6 w-full max-w-sm text-left">
      <p className="mb-3 text-sm font-medium">Set MRR for your customers:</p>
      <div className="space-y-2">
        {customers.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <span className="flex-1 font-mono text-xs">{c.externalId}</span>
            <span className="text-xs">$</span>
            <input
              value={mrrs[c.id] ?? ""}
              onChange={(e) => setMrrs((m) => ({ ...m, [c.id]: e.target.value }))}
              placeholder="99.00"
              className="w-24 rounded border px-2 py-1 text-right text-xs"
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => void saveAll()}
        className="mt-3 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
      >
        Save MRR values
      </button>
    </div>
  );
}

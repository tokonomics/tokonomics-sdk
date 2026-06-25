"use client";

import { useState, useEffect, useCallback } from "react";
import { TotalSpendCard } from "@/components/dashboard/TotalSpendCard";
import { SpendChart } from "@/components/charts/SpendChart";
import { ModelMixChart } from "@/components/charts/ModelMixChart";
import { ProviderList } from "@/components/dashboard/ProviderList";

type SpendData = {
  totalSpendUsd: string;
  projectedMonthlyUsd: string;
  trend: string;
  dailySeries: { date: string; costUsd: string }[];
  modelMix: { model: string; costUsd: string; pct: number; calls: number }[];
  providerMix: { provider: string; costUsd: string; pct: number }[];
};

type Provider = {
  id: string;
  provider: "OPENAI" | "ANTHROPIC" | "GOOGLE";
  displayName: string;
  keyLastFour: string;
  status: string;
  lastSyncedAt: string | null;
  lastSpendUsd: string | null;
};

type Period = "7d" | "30d" | "90d";

export default function OverviewPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [spend, setSpend] = useState<SpendData | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [spendRes, providersRes] = await Promise.all([
        fetch(`/api/overview/spend?period=${period}`),
        fetch("/api/providers"),
      ]);
      if (!spendRes.ok || !providersRes.ok) throw new Error("Failed to load data");
      const spendJson = (await spendRes.json()) as { data: SpendData };
      const providersJson = (await providersRes.json()) as { data: Provider[] };
      setSpend(spendJson.data);
      setProviders(providersJson.data);
    } catch {
      setError("Failed to load spend data. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Spend Overview</h1>
          <p className="mt-1 text-muted-foreground">
            Your AI infrastructure costs across all providers.
          </p>
        </div>
        <div className="flex rounded-lg border p-0.5">
          {(["7d", "30d", "90d"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === p
                  ? "bg-brand-500 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => void fetchData()} className="font-medium underline">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border bg-muted" />
          ))}
        </div>
      ) : spend && providers.length > 0 ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <TotalSpendCard
              totalSpendUsd={spend.totalSpendUsd}
              projectedMonthlyUsd={spend.projectedMonthlyUsd}
              trend={spend.trend}
              period={period}
            />
            <div className="rounded-xl border bg-card p-6">
              <p className="text-sm font-medium text-muted-foreground">Active Providers</p>
              <p className="mt-2 text-4xl font-bold">
                {providers.filter((p) => p.status === "CONNECTED").length}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {providers.map((p) => p.provider).join(", ")}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-6">
              <p className="text-sm font-medium text-muted-foreground">Top Model</p>
              <p className="mt-2 text-xl font-bold">{spend.modelMix[0]?.model ?? "—"}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {spend.modelMix[0] ? `${spend.modelMix[0].pct}% of spend` : "No data yet"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SpendChart data={spend.dailySeries} />
            <ModelMixChart data={spend.modelMix} />
          </div>

          <ProviderList providers={providers} onRefresh={() => void fetchData()} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 p-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
              <svg
                className="h-8 w-8 text-brand-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold">No provider connected yet</h3>
            <p className="mb-2 max-w-sm text-sm text-muted-foreground">
              Connect your OpenAI, Anthropic, or Gemini API key to start tracking AI spend.
            </p>
          </div>
          <ProviderList providers={[]} onRefresh={() => void fetchData()} />
        </div>
      )}
    </div>
  );
}

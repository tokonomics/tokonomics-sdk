"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type SimResult = {
  mode: string; totalCurrentMrr: string; totalSimulatedMrr: string;
  mrrLiftPct: string; currentMarginPct: string; simulatedMarginPct: string;
  customerImpact: { externalId: string; displayName: string | null; tokens: number; currentMrr: string; simulatedMrr: string; currentCost: string; currentMarginPct: string; simulatedMarginPct: string; mrrDelta: string }[];
};

export default function SimulatorPage() {
  const [mode, setMode] = useState<"FLAT" | "USAGE_BASED" | "TIERED">("USAGE_BASED");
  const [name, setName] = useState("Simulation 1");
  const [basePrice, setBasePrice] = useState("49");
  const [pricePerMillion, setPricePerMillion] = useState("5");
  const [fairUseLimit, setFairUseLimit] = useState("1000000");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSim() {
    setRunning(true); setError(null);
    const res = await fetch("/api/simulator/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, mode,
        basePriceUsd: parseFloat(basePrice) || 0,
        pricePerMillionTokens: parseFloat(pricePerMillion) || 0,
        fairUseLimitTokens: parseInt(fairUseLimit) || 0,
      }),
    });
    const json = (await res.json()) as { data?: SimResult; error?: { message: string } };
    setRunning(false);
    if (!res.ok) { setError(json.error?.message ?? "Failed"); return; }
    setResult(json.data!);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pricing Simulator</h1>
        <p className="mt-1 text-muted-foreground">
          Model different pricing structures against your real usage data to see margin impact.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Simulation name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Pricing mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
              <option value="FLAT">Flat rate</option>
              <option value="USAGE_BASED">Usage-based</option>
              <option value="TIERED">Tiered</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Base price / month ($)</label>
            <input type="number" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
          </div>
          {mode !== "FLAT" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Price per 1M tokens ($)</label>
              <input type="number" value={pricePerMillion} onChange={(e) => setPricePerMillion(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            </div>
          )}
          {mode === "USAGE_BASED" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Fair-use limit (tokens)</label>
              <input type="number" value={fairUseLimit} onChange={(e) => setFairUseLimit(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            </div>
          )}
        </div>
        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
        <Button onClick={() => void runSim()} disabled={running}>{running ? "Running…" : "Run simulation"}</Button>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">MRR lift</p>
              <p className={`text-3xl font-bold ${parseFloat(result.mrrLiftPct) >= 0 ? "text-green-600" : "text-red-500"}`}>
                {parseFloat(result.mrrLiftPct) >= 0 ? "+" : ""}{result.mrrLiftPct}%
              </p>
              <p className="text-xs text-muted-foreground">${result.totalCurrentMrr} → ${result.totalSimulatedMrr}</p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">Margin change</p>
              <p className="text-3xl font-bold">
                {result.currentMarginPct}% → {result.simulatedMarginPct}%
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">Customers analyzed</p>
              <p className="text-3xl font-bold">{result.customerImpact.length}</p>
            </div>
          </div>

          <div className="rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Tokens</th>
                  <th className="px-4 py-3 text-right">Current MRR</th>
                  <th className="px-4 py-3 text-right">Simulated MRR</th>
                  <th className="px-4 py-3 text-right">MRR Δ</th>
                  <th className="px-4 py-3 text-right">Current margin</th>
                  <th className="px-4 py-3 text-right">New margin</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.customerImpact.map((c, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{c.externalId}</td>
                    <td className="px-4 py-2 text-right text-xs">{c.tokens.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">${c.currentMrr}</td>
                    <td className="px-4 py-2 text-right font-semibold">${c.simulatedMrr}</td>
                    <td className={`px-4 py-2 text-right text-xs ${parseFloat(c.mrrDelta) >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {parseFloat(c.mrrDelta) >= 0 ? "+" : ""}${c.mrrDelta}
                    </td>
                    <td className="px-4 py-2 text-right text-xs">{c.currentMarginPct}%</td>
                    <td className={`px-4 py-2 text-right text-xs font-semibold ${parseFloat(c.simulatedMarginPct) >= 60 ? "text-green-600" : "text-red-500"}`}>
                      {c.simulatedMarginPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

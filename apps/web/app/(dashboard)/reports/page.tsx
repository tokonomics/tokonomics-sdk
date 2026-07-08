"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

type ReportData = {
  org: string; generatedAt: string; period: string;
  marginScore: number | null; totalMrrUsd: string; totalCostUsd: string;
  orgMarginPct: string; totalSpendUsd: string;
  customers: { externalId: string; displayName: string | null; mrr: number; cost: number; grossMarginPct: string; status: string }[];
};

const STATUS_COLORS: Record<string, string> = {
  HEALTHY: "#16a34a", WATCH: "#d97706", UNPROFITABLE: "#ea580c", LOSING_MONEY: "#dc2626",
};

const PERIOD_LABELS: Record<string, string> = {
  "30d": "Last 30 days", "90d": "Last 90 days", "qtd": "Quarter to date", "ytd": "Year to date",
};

export default function ReportsPage() {
  const [period, setPeriod] = useState("30d");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/reports/pdf?period=${period}`);
    const json = (await res.json()) as { data: ReportData };
    setReport(json.data);
    setLoading(false);
  }, [period]);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Investor Report</h1>
          <p className="mt-1 text-muted-foreground">Generate a PDF-ready AI cost &amp; margin report.</p>
        </div>
        <div className="flex gap-3">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="qtd">Quarter to date</option>
            <option value="ytd">Year to date</option>
          </select>
          <Button variant="outline" onClick={() => void fetchReport()} disabled={loading}>
            {loading ? "Loading…" : "Generate preview"}
          </Button>
          {report && <Button onClick={handlePrint}>Export PDF</Button>}
        </div>
      </div>

      {!report ? (
        <div className="flex h-96 flex-col items-center justify-center rounded-xl border border-dashed text-center">
          <p className="text-lg font-semibold">No report yet</p>
          <p className="mt-2 text-sm text-muted-foreground">Select a period and click &quot;Generate preview&quot; to see your investor report.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-8 shadow-sm print:shadow-none print:border-0">
          {/* Report header */}
          <div className="mb-8 flex items-start justify-between border-b pb-6">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">{report.org}</h2>
              <p className="mt-1 text-lg text-gray-500">AI Gross Margin Report</p>
              <p className="text-sm text-gray-400">{PERIOD_LABELS[report.period]} · Generated {new Date(report.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
            </div>
            <div className="text-right">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-full border-4 border-brand-500">
                <span className="text-2xl font-bold text-brand-600">{report.marginScore ?? "—"}</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">AI Margin Score</p>
            </div>
          </div>

          {/* KPI summary */}
          <div className="mb-8 grid grid-cols-4 gap-4">
            {[
              { label: "Total MRR", value: `$${parseFloat(report.totalMrrUsd).toFixed(0)}` },
              { label: "LLM COGS", value: `$${parseFloat(report.totalCostUsd).toFixed(2)}` },
              { label: "Gross Margin", value: `${report.orgMarginPct}%` },
              { label: `Spend (${PERIOD_LABELS[report.period]})`, value: `$${parseFloat(report.totalSpendUsd).toFixed(2)}` },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-lg bg-gray-50 p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
                <p className="mt-1 text-xs text-gray-500">{kpi.label}</p>
              </div>
            ))}
          </div>

          {/* Customer margin table */}
          {report.customers.length > 0 && (
            <div>
              <h3 className="mb-3 font-semibold text-gray-700">Customer Health</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-400">
                    <th className="pb-2">Customer</th>
                    <th className="pb-2 text-right">MRR</th>
                    <th className="pb-2 text-right">LLM Cost</th>
                    <th className="pb-2 text-right">Margin</th>
                    <th className="pb-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.customers.map((c) => (
                    <tr key={c.externalId}>
                      <td className="py-2 font-mono text-xs text-gray-600">{c.externalId}</td>
                      <td className="py-2 text-right">${c.mrr.toFixed(0)}</td>
                      <td className="py-2 text-right">${c.cost.toFixed(4)}</td>
                      <td className="py-2 text-right font-semibold">{c.grossMarginPct}%</td>
                      <td className="py-2 text-right">
                        <span style={{ color: STATUS_COLORS[c.status] }} className="text-xs font-medium capitalize">
                          {c.status.replace("_", " ").toLowerCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-8 border-t pt-4 text-xs text-gray-300 text-center">
            Generated by Tokonomics · app.tokonomics.dev
          </div>
        </div>
      )}
    </div>
  );
}

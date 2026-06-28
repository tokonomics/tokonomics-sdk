"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Recommendation = { title: string; body: string };

type CopilotResult = {
  recommendations: Recommendation[];
  context: { marginScore: number | null; unprofitableCount: number; watchCount: number; totalCustomers: number };
  tokensUsed: number;
};

export function MarginCopilot() {
  const [result, setResult] = useState<CopilotResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCopilot() {
    setLoading(true); setError(null);
    const res = await fetch("/api/copilot", { method: "POST" });
    const json = (await res.json()) as { data?: CopilotResult; error?: { message: string } };
    setLoading(false);
    if (!res.ok) { setError(json.error?.message ?? "Failed"); return; }
    setResult(json.data!);
  }

  return (
    <div className="rounded-xl border bg-gradient-to-br from-brand-50 to-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-brand-900">🤖 Margin Copilot</h3>
          <p className="text-sm text-brand-700">
            AI-powered recommendations using your actual usage data.
          </p>
        </div>
        <Button
          onClick={() => void runCopilot()}
          disabled={loading}
          className="bg-brand-600 hover:bg-brand-700"
        >
          {loading ? "Analyzing…" : result ? "Refresh" : "Get recommendations"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-brand-100" />
          ))}
        </div>
      )}

      {result && !loading && (
        <div className="space-y-3">
          {result.recommendations.map((rec, i) => (
            <div key={i} className="rounded-lg border border-brand-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-gray-900">{rec.title}</p>
                  <p className="mt-1 text-sm text-gray-600">{rec.body}</p>
                </div>
              </div>
            </div>
          ))}
          <p className="text-right text-xs text-gray-400">
            {result.tokensUsed.toLocaleString()} tokens used · Powered by Claude
          </p>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="rounded-lg border border-dashed border-brand-200 p-6 text-center text-sm text-brand-600">
          Click "Get recommendations" to analyze your margin data and receive 3 specific, actionable improvements.
          Uses your connected Anthropic API key.
        </div>
      )}
    </div>
  );
}

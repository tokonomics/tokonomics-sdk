"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

type RoutingTest = {
  id: string; name: string; controlModel: string; treatmentModel: string;
  feature: string | null; status: string; startedAt: string | null; endedAt: string | null;
  results: Record<string, unknown> | null; recommendation: string | null;
};

type Provider = { provider: "OPENAI" | "ANTHROPIC" | "GOOGLE"; status: string };

// Models available per provider — matches model_pricing seed data
const PROVIDER_MODELS: Record<string, { id: string; label: string }[]> = {
  OPENAI: [
    { id: "gpt-4o",        label: "GPT-4o" },
    { id: "gpt-4o-mini",   label: "GPT-4o mini" },
    { id: "gpt-4-turbo",   label: "GPT-4 Turbo" },
    { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  ],
  ANTHROPIC: [
    { id: "claude-sonnet-4-6",          label: "Claude Sonnet 4.6" },
    { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { id: "claude-haiku-4-5-20251001",  label: "Claude Haiku 4.5" },
    { id: "claude-3-opus-20240229",     label: "Claude 3 Opus" },
  ],
  GOOGLE: [
    { id: "gemini-1.5-pro",   label: "Gemini 1.5 Pro" },
    { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
};

const PROVIDER_LABELS: Record<string, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  GOOGLE: "Google",
};

export default function RoutingPage() {
  const [tests, setTests] = useState<RoutingTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [form, setForm] = useState({ name: "", controlModel: "", treatmentModel: "", feature: "" });

  // All available models from connected providers, grouped for display
  const allModels: { id: string; label: string; provider: string }[] = connectedProviders.flatMap(
    (p) => (PROVIDER_MODELS[p] ?? []).map((m) => ({ ...m, provider: p }))
  );

  // Treatment excludes whatever is selected as control
  const treatmentModels = allModels.filter((m) => m.id !== form.controlModel);

  const fetchTests = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/routing");
    const json = (await res.json()) as { data: RoutingTest[] };
    setTests(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchTests();
    // Load connected providers to build model dropdowns
    fetch("/api/providers")
      .then((r) => r.json())
      .then((j: { data: Provider[] }) => {
        const active = (j.data ?? [])
          .filter((p) => p.status === "CONNECTED")
          .map((p) => p.provider);
        setConnectedProviders(active);
        // Set sensible defaults from first available models
        if (active.length > 0) {
          const firstModels = PROVIDER_MODELS[active[0]!] ?? [];
          setForm((f) => ({
            ...f,
            controlModel: firstModels[0]?.id ?? "",
            treatmentModel: firstModels[1]?.id ?? firstModels[0]?.id ?? "",
          }));
        }
      })
      .catch(() => {});
  }, [fetchTests]);

  // When control model changes, reset treatment if it's the same
  function handleControlChange(modelId: string) {
    setForm((f) => ({
      ...f,
      controlModel: modelId,
      treatmentModel: f.treatmentModel === modelId
        ? (treatmentModels.find((m) => m.id !== modelId)?.id ?? "")
        : f.treatmentModel,
    }));
  }

  async function handleCreate() {
    if (!form.name || !form.controlModel || !form.treatmentModel) return;
    setCreating(true);
    await fetch("/api/routing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        controlModel: form.controlModel,
        treatmentModel: form.treatmentModel,
        feature: form.feature || undefined,
      }),
    });
    setCreating(false);
    setForm((f) => ({ ...f, name: "", feature: "" }));
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

  const noProviders = connectedProviders.length === 0;

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

        {noProviders ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No provider connected. Go to{" "}
            <a href="/settings/providers" className="text-brand-500 underline">
              Settings → Providers
            </a>{" "}
            and connect an OpenAI, Anthropic, or Google API key first.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Test name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="GPT-4o vs Haiku"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Control model (current)
              </label>
              <select
                value={form.controlModel}
                onChange={(e) => handleControlChange(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                {connectedProviders.map((provider) => (
                  <optgroup key={provider} label={PROVIDER_LABELS[provider] ?? provider}>
                    {(PROVIDER_MODELS[provider] ?? []).map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Treatment model (challenger)
              </label>
              <select
                value={form.treatmentModel}
                onChange={(e) => setForm((f) => ({ ...f, treatmentModel: e.target.value }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                {connectedProviders.map((provider) => {
                  const models = (PROVIDER_MODELS[provider] ?? []).filter(
                    (m) => m.id !== form.controlModel
                  );
                  if (models.length === 0) return null;
                  return (
                    <optgroup key={provider} label={PROVIDER_LABELS[provider] ?? provider}>
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Control model is excluded from this list.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Feature filter (optional)
              </label>
              <input
                value={form.feature}
                onChange={(e) => setForm((f) => ({ ...f, feature: e.target.value }))}
                placeholder="chat, summarize…"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
              <p className="mt-0.5 text-xs text-muted-foreground">
                Leave blank to compare across all features.
              </p>
            </div>
          </div>
        )}

        {!noProviders && (
          <Button
            className="mt-4"
            onClick={() => void handleCreate()}
            disabled={creating || !form.name || !form.controlModel || !form.treatmentModel}
          >
            {creating ? "Creating…" : "Create test"}
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="h-20 animate-pulse rounded-xl border bg-muted" />
        ) : tests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No routing tests yet.</p>
        ) : (
          tests.map((t) => (
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
                    <span className="font-medium text-foreground">{t.controlModel}</span>
                    {" vs "}
                    <span className="font-medium text-foreground">{t.treatmentModel}</span>
                    {t.feature && <span className="ml-2 text-xs">· feature: {t.feature}</span>}
                  </p>
                </div>
                <div className="flex gap-2">
                  {t.status === "DRAFT" && (
                    <Button size="sm" onClick={() => void handleAction(t.id, "start")}>
                      Start
                    </Button>
                  )}
                  {t.status === "RUNNING" && (
                    <Button size="sm" variant="outline" onClick={() => void handleAction(t.id, "stop")}>
                      Stop & analyze
                    </Button>
                  )}
                </div>
              </div>

              {t.results && (
                <div className="mt-3 rounded-lg bg-muted/30 p-3 text-sm">
                  {(() => {
                    const r = t.results as Record<string, string>;
                    return (
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-xs text-muted-foreground">Control ({t.controlModel})</p>
                          <p className="font-semibold">${r["controlCostUsd"] ?? "0"}</p>
                          <p className="text-xs text-muted-foreground">{r["controlCalls"] ?? 0} calls · {r["controlLatencyMs"] ?? 0}ms avg</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Treatment ({t.treatmentModel})</p>
                          <p className="font-semibold">${r["treatmentCostUsd"] ?? "0"}</p>
                          <p className="text-xs text-muted-foreground">{r["treatmentCalls"] ?? 0} calls · {r["treatmentLatencyMs"] ?? 0}ms avg</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Savings</p>
                          <p className={`font-semibold ${parseFloat(r["savingsUsd"] ?? "0") > 0 ? "text-green-600" : "text-red-500"}`}>
                            ${r["savingsUsd"] ?? "0"}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                  {t.recommendation && (
                    <p className="mt-3 border-t pt-3 text-sm italic text-muted-foreground">
                      💡 {t.recommendation}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";

const schema = z.object({
  provider: z.enum(["OPENAI", "ANTHROPIC", "GOOGLE"]),
  displayName: z.string().min(1, "Name is required").max(100),
  apiKey: z.string().min(10, "API key is too short"),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  onSuccess: () => void;
  onClose: () => void;
};

const PROVIDER_OPTIONS = [
  { value: "OPENAI", label: "OpenAI", placeholder: "sk-proj-..." },
  { value: "ANTHROPIC", label: "Anthropic", placeholder: "sk-ant-..." },
  { value: "GOOGLE", label: "Google AI", placeholder: "AIza..." },
] as const;

export function ConnectProviderModal({ onSuccess, onClose }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { provider: "OPENAI", displayName: "Production" },
  });

  const selectedProvider = watch("provider");
  const placeholder = PROVIDER_OPTIONS.find((p) => p.value === selectedProvider)?.placeholder ?? "";

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      let json: { error?: { message: string } } = {};
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        json = (await res.json()) as { error?: { message: string } };
      }

      if (!res.ok) {
        setServerError(json.error?.message ?? `Server error (${res.status}) — check Vercel logs`);
        return;
      }
      onSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setServerError(`Request failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Connect a provider</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Provider</label>
            <select
              {...register("provider")}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              {PROVIDER_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Display name</label>
            <input
              {...register("displayName")}
              placeholder="Production"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
            {errors.displayName && (
              <p className="mt-1 text-xs text-red-500">{errors.displayName.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">API key</label>
            <input
              {...register("apiKey")}
              type="password"
              placeholder={placeholder}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono"
            />
            {errors.apiKey && (
              <p className="mt-1 text-xs text-red-500">{errors.apiKey.message}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Key is validated against the provider then encrypted before storage. Never stored in plaintext.
            </p>
          </div>

          {serverError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {serverError}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? "Validating…" : "Connect"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

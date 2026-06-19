import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Overview",
};

export default function OverviewPage(): React.JSX.Element {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Spend Overview</h1>
        <p className="mt-1 text-muted-foreground">
          Your AI infrastructure costs across all providers.
        </p>
      </div>

      {/* Empty state — replaced with real data in Phase 1 */}
      <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 p-12 text-center">
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
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
          Connect a provider API key to see your AI spend dashboard with model mix and cost
          breakdowns.
        </p>
        <a
          href="/settings/providers"
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
        >
          Connect a provider
        </a>
      </div>
    </div>
  );
}

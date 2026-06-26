"use client";

import { useState, useEffect, useCallback } from "react";

type Customer = {
  id: string;
  externalId: string;
  displayName: string | null;
  email: string | null;
  totalCostUsd: string;
  requestCount: number;
};

type Sort = "cost_desc" | "cost_asc";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("cost_desc");
  const [page, setPage] = useState(1);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sort, page: String(page) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/customers?${params}`);
    const json = (await res.json()) as { data: { customers: Customer[]; total: number } };
    setCustomers(json.data.customers);
    setTotal(json.data.total);
    setLoading(false);
  }, [sort, page, search]);

  useEffect(() => { void fetchCustomers(); }, [fetchCustomers]);

  function exportCsv() {
    const header = "customer_id,display_name,email,monthly_cost_usd,requests\n";
    const rows = customers
      .map((c) => `${c.externalId},${c.displayName ?? ""},${c.email ?? ""},${c.totalCostUsd},${c.requestCount}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tokonomics-customers.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const pageSize = 50;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="mt-1 text-muted-foreground">
            Per-customer AI cost attribution for this month.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Export CSV
        </button>
      </div>

      <div className="mb-4 flex gap-3">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by customer ID, name, or email…"
          className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-lg border bg-background px-3 py-2 text-sm"
        >
          <option value="cost_desc">Highest cost</option>
          <option value="cost_asc">Lowest cost</option>
        </select>
      </div>

      <div className="rounded-xl border bg-card">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <p className="text-lg font-semibold">No customers tracked yet</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Add the SDK to your app and pass a <code className="font-mono text-xs">customer_id</code> on every LLM call to start attribution.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3">Customer ID</th>
                <th className="px-4 py-3">Name / Email</th>
                <th className="px-4 py-3 text-right">Monthly Cost</th>
                <th className="px-4 py-3 text-right">Requests</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{c.externalId}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.displayName ?? c.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    ${parseFloat(c.totalCostUsd).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {c.requestCount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} customers total</span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border px-3 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-2 py-1">
              {page} / {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

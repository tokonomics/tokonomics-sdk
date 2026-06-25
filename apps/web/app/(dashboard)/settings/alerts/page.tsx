"use client";

export default function AlertsSettingsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Alert Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Configure spend spike alerts for your organization.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h3 className="mb-1 text-sm font-semibold">Spend Spike Alerts</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          An alert fires when today&apos;s spend exceeds 2× the 7-day rolling average.
          Alerts are sent once per day maximum.
        </p>
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Spike threshold: <span className="font-semibold text-foreground">2× 7-day average</span>
          <br />
          Delivery: Dashboard alert feed · Email coming in Phase 1.5
        </div>
      </div>
    </div>
  );
}

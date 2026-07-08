import { PostHog } from "posthog-node";

let _posthog: PostHog | null = null;

function getPostHog(): PostHog | null {
  const key = process.env["POSTHOG_API_KEY"];
  if (!key) return null;
  if (!_posthog) {
    _posthog = new PostHog(key, {
      host: process.env["POSTHOG_HOST"] ?? "https://app.posthog.com",
      flushAt: 1,    // send immediately in serverless
      flushInterval: 0,
    });
  }
  return _posthog;
}

type AnalyticsEvent =
  | { event: "provider_connected"; properties: { provider: string } }
  | { event: "sdk_key_created"; properties: Record<string, never> }
  | { event: "first_customer_tracked"; properties: Record<string, never> }
  | { event: "api_key_created"; properties: Record<string, never> }
  | { event: "slack_connected"; properties: Record<string, never> }
  | { event: "copilot_run"; properties: { marginScore: number | null } };

export function track(userId: string, ev: AnalyticsEvent): void {
  const ph = getPostHog();
  if (!ph) return;
  ph.capture({ distinctId: userId, event: ev.event, properties: ev.properties });
  // Don't await — fire and forget
}

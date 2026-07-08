import * as Sentry from "@sentry/nextjs";

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (process.env["NODE_ENV"] !== "production") return;
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context);
    Sentry.captureException(error);
  });
}

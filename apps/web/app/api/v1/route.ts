import { NextResponse } from "next/server";

// GET /api/v1 — API documentation index
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    version: "1.0",
    baseUrl: "https://app.tokonomics.dev/api/v1",
    authentication: "X-API-Key: tok_api_...",
    rateLimit: "1000 requests/hour per org",
    endpoints: [
      { method: "GET", path: "/v1/spend/summary", description: "Org spend summary (last 30d)" },
      { method: "GET", path: "/v1/customers", description: "Customer cost list" },
      { method: "GET", path: "/v1/margin-score", description: "Current AI Margin Score" },
      { method: "GET", path: "/v1/alerts", description: "Recent unread alerts" },
    ],
  });
}

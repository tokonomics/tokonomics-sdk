import { NextResponse } from "next/server";
import { ZodError } from "zod";

type ApiMeta = { requestId: string; timestamp: string };

function meta(): ApiMeta {
  return {
    requestId: `req_${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
  };
}

export function ok<T>(data: T, status: 200 | 201 | 202 = 200): NextResponse {
  return NextResponse.json({ data, meta: meta() }, { status });
}

export function err(
  code: string,
  message: string,
  status: 400 | 401 | 402 | 403 | 404 | 409 | 429 | 500 = 400,
  details?: unknown
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) }, meta: meta() },
    { status }
  );
}

export function fromZodError(e: ZodError): NextResponse {
  return err(
    "VALIDATION_ERROR",
    "Request validation failed",
    400,
    e.errors.map((issue) => ({ field: issue.path.join("."), message: issue.message }))
  );
}

export function planRequired(requiredPlan: string): NextResponse {
  return err("PLAN_REQUIRED", `This feature requires the ${requiredPlan} plan`, 402);
}

export function unauthorized(): NextResponse {
  return err("UNAUTHORIZED", "Authentication required", 401);
}

export function notFound(resource: string): NextResponse {
  return err("NOT_FOUND", `${resource} not found`, 404);
}

import { prisma } from "@tokonomics/db";
import { ok, unauthorized, notFound, err } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    const test = await prisma.modelRoutingTest.findFirst({
      where: { id: params.id, orgId: ctx.orgId },
    });
    if (!test) return notFound("Routing test");

    const body = (await req.json()) as { action?: string };
    const action = body.action;

    if (action === "start" && test.status === "DRAFT") {
      const updated = await prisma.modelRoutingTest.update({
        where: { id: params.id },
        data: { status: "RUNNING", startedAt: new Date() },
      });
      return ok(updated);
    }

    if (action === "stop" && test.status === "RUNNING") {
      // Compute results from usage events tagged with this feature
      const monthStart = new Date();
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

      const events = await prisma.usageEvent.findMany({
        where: {
          orgId: ctx.orgId,
          model: { in: [test.controlModel, test.treatmentModel] },
          ...(test.feature ? { feature: test.feature } : {}),
          createdAt: { gte: test.startedAt ?? monthStart },
        },
        select: { model: true, costUsd: true, latencyMs: true },
      });

      const control = events.filter((e) => e.model === test.controlModel);
      const treatment = events.filter((e) => e.model === test.treatmentModel);

      const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

      const controlCost = control.reduce((s, e) => s + parseFloat(e.costUsd.toString()), 0);
      const treatmentCost = treatment.reduce((s, e) => s + parseFloat(e.costUsd.toString()), 0);
      const controlLatency = avg(control.map((e) => e.latencyMs ?? 0));
      const treatmentLatency = avg(treatment.map((e) => e.latencyMs ?? 0));
      const savings = controlCost - treatmentCost;

      const results = {
        controlCalls: control.length,
        treatmentCalls: treatment.length,
        controlCostUsd: controlCost.toFixed(4),
        treatmentCostUsd: treatmentCost.toFixed(4),
        savingsUsd: savings.toFixed(4),
        controlLatencyMs: Math.round(controlLatency),
        treatmentLatencyMs: Math.round(treatmentLatency),
      };

      const recommendation = savings > 0
        ? `${test.treatmentModel} costs ${((savings / Math.max(controlCost, 0.001)) * 100).toFixed(1)}% less than ${test.controlModel} for ${test.feature ?? "this feature"}. Consider routing to ${test.treatmentModel} to reduce AI costs.`
        : `${test.controlModel} appears more cost-effective than ${test.treatmentModel} based on current data. Continue using ${test.controlModel}.`;

      const updated = await prisma.modelRoutingTest.update({
        where: { id: params.id },
        data: { status: "COMPLETED", endedAt: new Date(), results, recommendation },
      });
      return ok(updated);
    }

    return err("VALIDATION_ERROR", `Cannot perform action '${action}' on test with status '${test.status}'`);
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    const test = await prisma.modelRoutingTest.findFirst({
      where: { id: params.id, orgId: ctx.orgId },
    });
    if (!test) return notFound("Routing test");

    await prisma.modelRoutingTest.update({
      where: { id: params.id },
      data: { status: "CANCELED" },
    });
    return ok({ canceled: true });
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}

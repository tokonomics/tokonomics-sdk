import { prisma } from "@tokonomics/db";
import { ok, unauthorized } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { getRedis, CacheKeys, CacheTTL } from "@/lib/redis";

export async function GET(req: Request): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    const url = new URL(req.url);
    const sort = url.searchParams.get("sort") ?? "cost_desc";
    const search = url.searchParams.get("search") ?? "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = 50;

    const cacheKey = CacheKeys.customers(ctx.orgId);
    if (!search && page === 1) {
      const cached = await getRedis().get(cacheKey);
      if (cached) return ok(cached);
    }

    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const aggregates = await prisma.dailyCustomerAggregate.groupBy({
      by: ["customerId"],
      where: {
        orgId: ctx.orgId,
        date: { gte: monthStart },
      },
      _sum: { totalCostUsd: true, requestCount: true },
      orderBy:
        sort === "cost_asc"
          ? { _sum: { totalCostUsd: "asc" } }
          : { _sum: { totalCostUsd: "desc" } },
    });

    const customerIds = aggregates.map((a) => a.customerId);

    const customers = await prisma.customer.findMany({
      where: {
        orgId: ctx.orgId,
        id: { in: customerIds },
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { externalId: { contains: search, mode: "insensitive" } },
                { displayName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        externalId: true,
        displayName: true,
        email: true,
      },
    });

    const customerMap = new Map(customers.map((c) => [c.id, c]));

    const rows = aggregates
      .filter((a) => customerMap.has(a.customerId))
      .map((a) => {
        const customer = customerMap.get(a.customerId)!;
        const totalCost = a._sum.totalCostUsd?.toNumber() ?? 0;
        return {
          id: customer.id,
          externalId: customer.externalId,
          displayName: customer.displayName,
          email: customer.email,
          totalCostUsd: totalCost.toFixed(2),
          requestCount: a._sum.requestCount ?? 0,
        };
      });

    const paged = rows.slice((page - 1) * pageSize, page * pageSize);
    const result = { customers: paged, total: rows.length, page, pageSize };

    if (!search && page === 1) {
      await getRedis().set(cacheKey, result, { ex: CacheTTL.customers });
    }

    return ok(result);
  } catch (e: unknown) {
    return ok({ customers: [], total: 0, page: 1, pageSize: 50 });
  }
}

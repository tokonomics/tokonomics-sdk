import type { FastifyInstance } from "fastify";

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/ingest/v1/health", async (_request, reply) => {
    await reply.status(200).send({
      status: "ok",
      service: "ingest",
      timestamp: new Date().toISOString(),
      version: process.env["npm_package_version"] ?? "0.0.1",
    });
  });
}

import type { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { messageLog } from "../db/schema.js";
import { desc } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";

export async function messageRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get<{ Querystring: { page?: string; limit?: string; status?: string; senderId?: string } }>(
    "/",
    async (request) => {
      const { page = "1", limit = "50", status, senderId } = request.query;
      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.min(100, Math.max(1, Number(limit)));
      const offset = (pageNum - 1) * limitNum;

      let query = db.select().from(messageLog);
      // Basic filtering via JS since drizzle dynamic where is complex
      let all = query.orderBy(desc(messageLog.createdAt)).all();

      if (status === "error" || status === "failed") {
        all = all.filter((m) => m.status === "error" || m.status === "failed");
      } else if (status) {
        all = all.filter((m) => m.status === status);
      }
      if (senderId) all = all.filter((m) => m.senderId === senderId);

      const total = all.length;
      const data = all.slice(offset, offset + limitNum);

      return { data, total, page: pageNum, limit: limitNum };
    }
  );
}

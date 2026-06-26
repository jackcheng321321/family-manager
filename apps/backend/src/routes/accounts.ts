import type { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { accounts } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { authGuard } from "../middleware/auth.js";

export async function accountRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/", async () => {
    return db.select().from(accounts).all();
  });

  app.post<{ Body: { name: string; type: string; icon?: string } }>(
    "/",
    async (request) => {
      const { name, type, icon } = request.body;
      const id = nanoid();
      db.insert(accounts)
        .values({ id, name, type, icon: icon ?? null, createdAt: new Date().toISOString() })
        .run();
      return db.select().from(accounts).where(eq(accounts.id, id)).get();
    }
  );

  app.put<{ Params: { id: string }; Body: { name?: string; type?: string; icon?: string; isActive?: boolean; sortOrder?: number } }>(
    "/:id",
    async (request, reply) => {
      const { id } = request.params;
      const existing = db.select().from(accounts).where(eq(accounts.id, id)).get();
      if (!existing) return reply.status(404).send({ error: "Not found" });

      const updates: Record<string, unknown> = {};
      const body = request.body;
      if (body.name !== undefined) updates.name = body.name;
      if (body.type !== undefined) updates.type = body.type;
      if (body.icon !== undefined) updates.icon = body.icon;
      if (body.isActive !== undefined) updates.isActive = body.isActive;
      if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

      if (Object.keys(updates).length > 0) {
        db.update(accounts).set(updates).where(eq(accounts.id, id)).run();
      }
      return db.select().from(accounts).where(eq(accounts.id, id)).get();
    }
  );

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = db.select().from(accounts).where(eq(accounts.id, id)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });
    db.delete(accounts).where(eq(accounts.id, id)).run();
    return { success: true };
  });
}

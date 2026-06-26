import type { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { categories } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { authGuard } from "../middleware/auth.js";

export async function categoryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get<{ Querystring: { type?: string } }>("/", async (request) => {
    const { type } = request.query;
    const all = db.select().from(categories).all();
    if (type) return all.filter((c) => c.type === type);
    return all;
  });

  app.post<{ Body: { name: string; type: string; icon?: string; color?: string; sortOrder?: number } }>(
    "/",
    async (request) => {
      const { name, type, icon, color, sortOrder } = request.body;
      const id = nanoid();
      db.insert(categories)
        .values({ id, name, type, icon: icon ?? null, color: color ?? null, sortOrder: sortOrder ?? 0, createdAt: new Date().toISOString() })
        .run();
      return db.select().from(categories).where(eq(categories.id, id)).get();
    }
  );

  app.put<{ Params: { id: string }; Body: { name?: string; icon?: string; color?: string; sortOrder?: number; isActive?: boolean } }>(
    "/:id",
    async (request, reply) => {
      const { id } = request.params;
      const existing = db.select().from(categories).where(eq(categories.id, id)).get();
      if (!existing) return reply.status(404).send({ error: "Not found" });

      const updates: Record<string, unknown> = {};
      const body = request.body;
      if (body.name !== undefined) updates.name = body.name;
      if (body.icon !== undefined) updates.icon = body.icon;
      if (body.color !== undefined) updates.color = body.color;
      if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
      if (body.isActive !== undefined) updates.isActive = body.isActive;

      if (Object.keys(updates).length > 0) {
        db.update(categories).set(updates).where(eq(categories.id, id)).run();
      }
      return db.select().from(categories).where(eq(categories.id, id)).get();
    }
  );

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = db.select().from(categories).where(eq(categories.id, id)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });
    db.delete(categories).where(eq(categories.id, id)).run();
    return { success: true };
  });

  app.put<{ Body: { items: { id: string; sortOrder: number }[] } }>(
    "/reorder",
    async (request) => {
      for (const item of request.body.items) {
        db.update(categories).set({ sortOrder: item.sortOrder }).where(eq(categories.id, item.id)).run();
      }
      return { success: true };
    }
  );
}

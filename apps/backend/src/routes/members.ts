import type { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { members } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { authGuard } from "../middleware/auth.js";

export async function memberRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/", async () => {
    return db.select().from(members).all();
  });

  // 手动新增成员（用于没有微信的家庭成员，如小孩）。
  // wechatUserId 留空，不影响微信自动注册逻辑。
  app.post<{ Body: { name?: string; role?: string } }>("/", async (request, reply) => {
    const name = request.body.name?.trim();
    if (!name) return reply.status(400).send({ error: "name 必填" });
    const id = nanoid();
    const ts = new Date().toISOString();
    db.insert(members)
      .values({
        id,
        wechatUserId: null,
        name,
        role: request.body.role === "admin" ? "admin" : "member",
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return db.select().from(members).where(eq(members.id, id)).get();
  });

  app.put<{ Params: { id: string }; Body: { name?: string; role?: string } }>(
    "/:id",
    async (request, reply) => {
      const { id } = request.params;
      const existing = db.select().from(members).where(eq(members.id, id)).get();
      if (!existing) return reply.status(404).send({ error: "Not found" });

      const updates: Record<string, unknown> = {};
      const body = request.body;
      if (body.name !== undefined) updates.name = body.name;
      if (body.role !== undefined) updates.role = body.role;
      updates.updatedAt = new Date().toISOString();

      db.update(members).set(updates).where(eq(members.id, id)).run();
      return db.select().from(members).where(eq(members.id, id)).get();
    }
  );
}

import type { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { assets, assetValuations } from "../db/schema.js";
import { eq, and, sql, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { authGuard } from "../middleware/auth.js";

interface AssetBody {
  type: string;
  name: string;
  amount: number;
  currency?: string;
  allocationBucket?: string;
  accountInfo?: string;
  costBasis?: number;
  sortOrder?: number;
  memberId?: string;
  note?: string;
}

export async function assetRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get<{ Querystring: { type?: string; bucket?: string; memberId?: string; isActive?: string } }>(
    "/",
    async (request) => {
      const { type, bucket, memberId, isActive } = request.query;
      const conditions = [];
      if (type) conditions.push(eq(assets.type, type));
      if (bucket) conditions.push(eq(assets.allocationBucket, bucket));
      if (memberId) conditions.push(eq(assets.memberId, memberId));
      if (isActive !== undefined) conditions.push(eq(assets.isActive, isActive === "true"));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select().from(assets).where(where).orderBy(assets.sortOrder, desc(assets.amount)).all();
    }
  );

  // 保留旧形状（type/totalAmount/count），供 AI 月度分析使用，避免破坏现有功能
  app.get("/summary", async () => {
    return db
      .select({
        type: assets.type,
        totalAmount: sql<number>`sum(amount)`,
        count: sql<number>`count(*)`,
      })
      .from(assets)
      .where(eq(assets.isActive, true))
      .groupBy(assets.type)
      .all();
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const asset = db.select().from(assets).where(eq(assets.id, request.params.id)).get();
    if (!asset) return reply.status(404).send({ error: "Not found" });
    return asset;
  });

  app.post<{ Body: AssetBody }>("/", async (request) => {
    const body = request.body;
    const id = nanoid();
    const now = new Date().toISOString();
    db.insert(assets)
      .values({
        id,
        type: body.type,
        name: body.name,
        amount: body.amount,
        currency: body.currency ?? "CNY",
        allocationBucket: body.allocationBucket ?? "stable",
        accountInfo: body.accountInfo ?? null,
        costBasis: body.costBasis ?? null,
        sortOrder: body.sortOrder ?? 0,
        memberId: body.memberId ?? null,
        note: body.note ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return db.select().from(assets).where(eq(assets.id, id)).get();
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = db.select().from(assets).where(eq(assets.id, id)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const allowed = [
      "type",
      "name",
      "amount",
      "currency",
      "allocationBucket",
      "accountInfo",
      "costBasis",
      "sortOrder",
      "memberId",
      "note",
      "isActive",
    ];
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const key of allowed) {
      if (request.body[key] !== undefined) updates[key] = request.body[key];
    }

    db.update(assets).set(updates).where(eq(assets.id, id)).run();
    return db.select().from(assets).where(eq(assets.id, id)).get();
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = db.select().from(assets).where(eq(assets.id, id)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });
    db.delete(assetValuations).where(eq(assetValuations.assetId, id)).run();
    db.delete(assets).where(eq(assets.id, id)).run();
    return { success: true };
  });

  // ---- 资产估值快照 ----

  app.get<{ Params: { id: string } }>("/:id/valuations", async (request) => {
    return db
      .select()
      .from(assetValuations)
      .where(eq(assetValuations.assetId, request.params.id))
      .orderBy(desc(assetValuations.date))
      .all();
  });

  // 新增一条估值快照，同时把资产的当前市值同步为该值
  app.post<{ Params: { id: string }; Body: { date: string; value: number; note?: string } }>(
    "/:id/valuations",
    async (request, reply) => {
      const { id } = request.params;
      const asset = db.select().from(assets).where(eq(assets.id, id)).get();
      if (!asset) return reply.status(404).send({ error: "Not found" });

      const vid = nanoid();
      db.insert(assetValuations)
        .values({
          id: vid,
          assetId: id,
          date: request.body.date,
          value: request.body.value,
          note: request.body.note ?? null,
          createdAt: new Date().toISOString(),
        })
        .run();

      // 当前市值同步为最新一条快照的值
      const latest = db
        .select()
        .from(assetValuations)
        .where(eq(assetValuations.assetId, id))
        .orderBy(desc(assetValuations.date))
        .get();
      if (latest && latest.id === vid) {
        db.update(assets).set({ amount: request.body.value, updatedAt: new Date().toISOString() }).where(eq(assets.id, id)).run();
      }

      return db.select().from(assetValuations).where(eq(assetValuations.id, vid)).get();
    }
  );

  app.delete<{ Params: { vid: string } }>("/valuations/:vid", async (request, reply) => {
    const { vid } = request.params;
    const existing = db.select().from(assetValuations).where(eq(assetValuations.id, vid)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });
    db.delete(assetValuations).where(eq(assetValuations.id, vid)).run();
    return { success: true };
  });
}

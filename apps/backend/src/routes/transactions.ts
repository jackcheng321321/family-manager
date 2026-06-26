import type { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { transactions, categories, accounts, members } from "../db/schema.js";
import { eq, and, gte, lte, like, desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { authGuard } from "../middleware/auth.js";

export async function transactionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get<{
    Querystring: {
      type?: string;
      page?: string;
      limit?: string;
      startDate?: string;
      endDate?: string;
      memberId?: string;
      categoryId?: string;
      minAmount?: string;
      maxAmount?: string;
      keyword?: string;
    };
  }>("/", async (request) => {
    const {
      type,
      page = "1",
      limit = "20",
      startDate,
      endDate,
      memberId,
      categoryId,
      minAmount,
      maxAmount,
      keyword,
    } = request.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    if (type) conditions.push(eq(transactions.type, type));
    if (startDate) conditions.push(gte(transactions.transactionDate, startDate));
    if (endDate) conditions.push(lte(transactions.transactionDate, endDate));
    if (memberId) conditions.push(eq(transactions.memberId, memberId));
    if (categoryId) conditions.push(eq(transactions.categoryId, categoryId));
    if (minAmount) conditions.push(gte(transactions.amount, Number(minAmount)));
    if (maxAmount) conditions.push(lte(transactions.amount, Number(maxAmount)));
    if (keyword) conditions.push(like(transactions.description, `%${keyword}%`));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = db
      .select()
      .from(transactions)
      .where(where)
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
      .limit(limitNum)
      .offset(offset)
      .all();

    const countResult = db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(where)
      .get();

    // Enrich with relations
    const enriched = data.map((t) => {
      const category = db.select().from(categories).where(eq(categories.id, t.categoryId)).get();
      const account = t.accountId ? db.select().from(accounts).where(eq(accounts.id, t.accountId)).get() : null;
      const member = db.select().from(members).where(eq(members.id, t.memberId)).get();
      return { ...t, category, account, member };
    });

    return {
      data: enriched,
      total: countResult?.count || 0,
      page: pageNum,
      limit: limitNum,
    };
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const t = db.select().from(transactions).where(eq(transactions.id, request.params.id)).get();
    if (!t) return reply.status(404).send({ error: "Not found" });
    const category = db.select().from(categories).where(eq(categories.id, t.categoryId)).get();
    const account = t.accountId ? db.select().from(accounts).where(eq(accounts.id, t.accountId)).get() : null;
    const member = db.select().from(members).where(eq(members.id, t.memberId)).get();
    return { ...t, category, account, member };
  });

  app.post<{
    Body: {
      type: string;
      amount: number;
      description: string;
      categoryId: string;
      accountId?: string;
      memberId: string;
      transactionDate: string;
      note?: string;
    };
  }>("/", async (request) => {
    const body = request.body;
    const id = nanoid();
    const now = new Date().toISOString();
    db.insert(transactions)
      .values({
        id,
        type: body.type,
        amount: body.amount,
        description: body.description,
        categoryId: body.categoryId,
        accountId: body.accountId ?? null,
        memberId: body.memberId,
        transactionDate: body.transactionDate,
        note: body.note ?? null,
        source: "admin",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return db.select().from(transactions).where(eq(transactions.id, id)).get();
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/:id",
    async (request, reply) => {
      const { id } = request.params;
      const existing = db.select().from(transactions).where(eq(transactions.id, id)).get();
      if (!existing) return reply.status(404).send({ error: "Not found" });

      const allowed = ["type", "amount", "description", "categoryId", "accountId", "memberId", "transactionDate", "note"];
      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      for (const key of allowed) {
        if (request.body[key] !== undefined) updates[key] = request.body[key];
      }

      db.update(transactions).set(updates).where(eq(transactions.id, id)).run();
      return db.select().from(transactions).where(eq(transactions.id, id)).get();
    }
  );

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = db.select().from(transactions).where(eq(transactions.id, id)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });
    db.delete(transactions).where(eq(transactions.id, id)).run();
    return { success: true };
  });
}

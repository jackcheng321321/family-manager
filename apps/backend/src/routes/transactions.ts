import type { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { transactions, categories, accounts, members, installmentPlans } from "../db/schema.js";
import { eq, and, gte, lte, like, desc, sql, or, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { authGuard } from "../middleware/auth.js";
import { getBusinessToday } from "../utils/date.js";

const INSTALLMENT_LOCKED = "这是分期计划生成的记录，请在分期计划中修改或删除";

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
      includeFutureInstallments?: string;
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
      includeFutureInstallments,
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
    // 默认隐藏还没到扣款日的分期记录，避免几年后的期数堆在列表顶部
    if (includeFutureInstallments !== "true") {
      conditions.push(
        or(isNull(transactions.installmentPlanId), lte(transactions.transactionDate, getBusinessToday()))!
      );
    }

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
      const installmentPlan = t.installmentPlanId
        ? db
            .select({ id: installmentPlans.id, periods: installmentPlans.periods, payoffDate: installmentPlans.payoffDate })
            .from(installmentPlans)
            .where(eq(installmentPlans.id, t.installmentPlanId))
            .get()
        : null;
      return { ...t, category, account, member, installmentPlan };
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
      if (existing.installmentPlanId) return reply.status(400).send({ error: INSTALLMENT_LOCKED });

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
    if (existing.installmentPlanId) return reply.status(400).send({ error: INSTALLMENT_LOCKED });
    db.delete(transactions).where(eq(transactions.id, id)).run();
    return { success: true };
  });
}

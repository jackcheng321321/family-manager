import type { FastifyInstance } from "fastify";
import type { InstallmentPlanWithProgress } from "@caiwu/shared";
import { buildInstallmentSchedule, formatInstallmentLabel } from "@caiwu/shared";
import { db } from "../db/connection.js";
import { installmentPlans, transactions } from "../db/schema.js";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { authGuard } from "../middleware/auth.js";
import { getBusinessToday } from "../utils/date.js";

type PlanRow = typeof installmentPlans.$inferSelect;

interface PlanBody {
  description: string;
  totalAmount: number;
  periods: number;
  feePerPeriod?: number;
  firstDate: string;
  categoryId: string;
  memberId: string;
  note?: string | null;
}

const MAX_PERIODS = 120;

function validatePlan(body: PlanBody): string | null {
  if (!body.description?.trim()) return "描述不能为空";
  if (!(Number(body.totalAmount) > 0)) return "总金额必须大于 0";
  const periods = Number(body.periods);
  if (!Number.isInteger(periods) || periods < 2 || periods > MAX_PERIODS) return `期数需为 2-${MAX_PERIODS} 的整数`;
  if (Number(body.feePerPeriod || 0) < 0) return "手续费不能为负数";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.firstDate || "")) return "首期日期格式应为 YYYY-MM-DD";
  if (!body.categoryId || !body.memberId) return "分类和成员不能为空";
  return null;
}

// 计划是唯一数据源：任何修改都删掉旧的每期记录、按计划重新生成，保证两边不会不一致。
function regenerateTransactions(plan: PlanRow) {
  const now = new Date().toISOString();
  const schedule = buildInstallmentSchedule(plan);
  db.delete(transactions).where(eq(transactions.installmentPlanId, plan.id)).run();
  for (const item of schedule) {
    db.insert(transactions)
      .values({
        id: nanoid(),
        type: "expense",
        amount: item.amount,
        description: `${plan.description}（分期 ${formatInstallmentLabel(item, plan.periods)}）`,
        categoryId: plan.categoryId,
        memberId: plan.memberId,
        transactionDate: item.date,
        note: plan.note,
        source: "admin",
        installmentPlanId: plan.id,
        installmentIndex: item.index,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}

function withProgress(plan: PlanRow, today: string): InstallmentPlanWithProgress {
  const schedule = buildInstallmentSchedule(plan);
  let paidPeriods = 0;
  let paidCents = 0;
  let totalCents = 0;
  for (const item of schedule) {
    const cents = Math.round(item.amount * 100);
    totalCents += cents;
    if (item.date <= today) {
      paidPeriods += item.mergedPeriods;
      paidCents += cents;
    }
  }
  return {
    ...plan,
    paidPeriods,
    paidAmount: paidCents / 100,
    remainingAmount: (totalCents - paidCents) / 100,
  };
}

export async function installmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/", async () => {
    const today = getBusinessToday();
    return db
      .select()
      .from(installmentPlans)
      .orderBy(desc(installmentPlans.firstDate))
      .all()
      .map((plan) => withProgress(plan, today));
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const plan = db.select().from(installmentPlans).where(eq(installmentPlans.id, request.params.id)).get();
    if (!plan) return reply.status(404).send({ error: "Not found" });
    return withProgress(plan, getBusinessToday());
  });

  app.post<{ Body: PlanBody }>("/", async (request, reply) => {
    const body = request.body;
    const error = validatePlan(body);
    if (error) return reply.status(400).send({ error });

    const id = nanoid();
    const now = new Date().toISOString();
    db.transaction(() => {
      db.insert(installmentPlans)
        .values({
          id,
          description: body.description.trim(),
          totalAmount: Number(body.totalAmount),
          periods: Number(body.periods),
          feePerPeriod: Number(body.feePerPeriod || 0),
          firstDate: body.firstDate,
          categoryId: body.categoryId,
          memberId: body.memberId,
          note: body.note || null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      regenerateTransactions(db.select().from(installmentPlans).where(eq(installmentPlans.id, id)).get()!);
    });
    return withProgress(db.select().from(installmentPlans).where(eq(installmentPlans.id, id)).get()!, getBusinessToday());
  });

  app.put<{ Params: { id: string }; Body: PlanBody }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = db.select().from(installmentPlans).where(eq(installmentPlans.id, id)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });
    const body = request.body;
    const error = validatePlan(body);
    if (error) return reply.status(400).send({ error });

    db.transaction(() => {
      db.update(installmentPlans)
        .set({
          description: body.description.trim(),
          totalAmount: Number(body.totalAmount),
          periods: Number(body.periods),
          feePerPeriod: Number(body.feePerPeriod || 0),
          firstDate: body.firstDate,
          categoryId: body.categoryId,
          memberId: body.memberId,
          note: body.note || null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(installmentPlans.id, id))
        .run();
      regenerateTransactions(db.select().from(installmentPlans).where(eq(installmentPlans.id, id)).get()!);
    });
    return withProgress(db.select().from(installmentPlans).where(eq(installmentPlans.id, id)).get()!, getBusinessToday());
  });

  // 提前还清：payoffDate 之后的期数合并为当天一笔；传 null 撤销提前还清
  app.post<{ Params: { id: string }; Body: { payoffDate: string | null } }>("/:id/payoff", async (request, reply) => {
    const { id } = request.params;
    const existing = db.select().from(installmentPlans).where(eq(installmentPlans.id, id)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });
    const payoffDate = request.body?.payoffDate ?? null;
    if (payoffDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(payoffDate)) {
      return reply.status(400).send({ error: "还清日期格式应为 YYYY-MM-DD" });
    }

    db.transaction(() => {
      db.update(installmentPlans)
        .set({ payoffDate, updatedAt: new Date().toISOString() })
        .where(eq(installmentPlans.id, id))
        .run();
      regenerateTransactions(db.select().from(installmentPlans).where(eq(installmentPlans.id, id)).get()!);
    });
    return withProgress(db.select().from(installmentPlans).where(eq(installmentPlans.id, id)).get()!, getBusinessToday());
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = db.select().from(installmentPlans).where(eq(installmentPlans.id, id)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });
    db.transaction(() => {
      db.delete(transactions).where(eq(transactions.installmentPlanId, id)).run();
      db.delete(installmentPlans).where(eq(installmentPlans.id, id)).run();
    });
    return { success: true };
  });
}

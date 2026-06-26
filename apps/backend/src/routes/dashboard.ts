import type { CategoryStat, DashboardMaxExpense, MemberCategoryStat, MemberStat } from "@caiwu/shared";
import type { FastifyInstance } from "fastify";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { categories, members, transactions } from "../db/schema.js";
import { authGuard } from "../middleware/auth.js";
import { getBusinessToday, getPeriodDateRange } from "../utils/date.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function getDateRange(period: string, date?: string) {
  return getPeriodDateRange(period, date);
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function getInclusiveDayCount(start: string, end: string): number {
  return Math.max(1, Math.floor((parseDate(end).getTime() - parseDate(start).getTime()) / DAY_MS) + 1);
}

function getAverageExpenseDayCount(start: string, end: string): number {
  const today = getBusinessToday();
  if (today >= start && today <= end) return getInclusiveDayCount(start, today);
  return getInclusiveDayCount(start, end);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round(value * 10000) / 100;
}

function getCategoryLookup() {
  const rows = db.select().from(categories).all();
  return new Map(rows.map((row) => [row.id, row]));
}

function getMemberLookup() {
  const rows = db.select().from(members).all();
  return new Map(rows.map((row) => [row.id, row]));
}

function getMaxExpense(start: string, end: string): DashboardMaxExpense | null {
  const row = db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.transactionDate, start),
        lte(transactions.transactionDate, end)
      )
    )
    .orderBy(desc(transactions.amount), desc(transactions.transactionDate))
    .get();

  if (!row) return null;

  const category = db.select().from(categories).where(eq(categories.id, row.categoryId)).get();
  const member = db.select().from(members).where(eq(members.id, row.memberId)).get();

  return {
    amount: roundMoney(row.amount),
    description: row.description,
    transactionDate: row.transactionDate,
    categoryName: category?.name || "未知",
    memberName: member?.name || "未知",
  };
}

function getExpenseCategoryStats(start: string, end: string, type = "expense"): CategoryStat[] {
  const rows = db
    .select({
      categoryId: transactions.categoryId,
      amount: sql<number>`coalesce(sum(amount), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, type),
        gte(transactions.transactionDate, start),
        lte(transactions.transactionDate, end)
      )
    )
    .groupBy(transactions.categoryId)
    .all();

  const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const categoryLookup = getCategoryLookup();

  return rows
    .map((row) => {
      const category = categoryLookup.get(row.categoryId);
      const amount = Number(row.amount || 0);
      return {
        categoryId: row.categoryId,
        categoryName: category?.name || "未知",
        color: category?.color || "#999",
        amount: roundMoney(amount),
        percentage: totalAmount > 0 ? roundPercent(amount / totalAmount) : 0,
        count: Number(row.count || 0),
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

function getDashboardMemberStats(start: string, end: string): MemberStat[] {
  const typeRows = db
    .select({
      memberId: transactions.memberId,
      type: transactions.type,
      total: sql<number>`coalesce(sum(amount), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(and(gte(transactions.transactionDate, start), lte(transactions.transactionDate, end)))
    .groupBy(transactions.memberId, transactions.type)
    .all();

  const categoryRows = db
    .select({
      memberId: transactions.memberId,
      categoryId: transactions.categoryId,
      amount: sql<number>`coalesce(sum(amount), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.transactionDate, start),
        lte(transactions.transactionDate, end)
      )
    )
    .groupBy(transactions.memberId, transactions.categoryId)
    .all();

  const memberLookup = getMemberLookup();
  const categoryLookup = getCategoryLookup();
  const totalExpense = typeRows
    .filter((row) => row.type === "expense")
    .reduce((sum, row) => sum + Number(row.total || 0), 0);
  const memberMap = new Map<string, MemberStat>();

  for (const row of typeRows) {
    if (!memberMap.has(row.memberId)) {
      const member = memberLookup.get(row.memberId);
      memberMap.set(row.memberId, {
        memberId: row.memberId,
        memberName: member?.name || "未知",
        expense: 0,
        income: 0,
        expenseCount: 0,
        percentage: 0,
        topCategories: [],
      });
    }

    const entry = memberMap.get(row.memberId)!;
    if (row.type === "expense") {
      entry.expense = roundMoney(Number(row.total || 0));
      entry.expenseCount = Number(row.count || 0);
    } else {
      entry.income = roundMoney(Number(row.total || 0));
    }
  }

  for (const row of categoryRows) {
    if (!memberMap.has(row.memberId)) {
      const member = memberLookup.get(row.memberId);
      memberMap.set(row.memberId, {
        memberId: row.memberId,
        memberName: member?.name || "未知",
        expense: 0,
        income: 0,
        expenseCount: 0,
        percentage: 0,
        topCategories: [],
      });
    }

    const entry = memberMap.get(row.memberId)!;
    const category = categoryLookup.get(row.categoryId);
    const amount = Number(row.amount || 0);
    const stat: MemberCategoryStat = {
      categoryId: row.categoryId,
      categoryName: category?.name || "未知",
      color: category?.color || "#999",
      amount: roundMoney(amount),
      percentage: entry.expense > 0 ? roundPercent(amount / entry.expense) : 0,
      count: Number(row.count || 0),
    };
    entry.topCategories.push(stat);
  }

  return Array.from(memberMap.values())
    .map((member) => ({
      ...member,
      percentage: totalExpense > 0 ? roundPercent(member.expense / totalExpense) : 0,
      topCategories: member.topCategories.sort((a, b) => b.amount - a.amount).slice(0, 3),
    }))
    .sort((a, b) => b.expense - a.expense);
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get<{ Querystring: { period?: string; date?: string } }>(
    "/overview",
    {
      schema: {
        tags: ["dashboard"],
        summary: "支出看板总览",
        querystring: {
          type: "object",
          properties: {
            period: { type: "string", enum: ["day", "month", "quarter", "year"] },
            date: { type: "string", description: "YYYY-MM-DD，默认当前业务日期" },
          },
        },
      },
    },
    async (request) => {
      const period = request.query.period || "month";
      const { start, end } = getDateRange(period, request.query.date);

      const result = db
        .select({
          type: transactions.type,
          total: sql<number>`coalesce(sum(amount), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(transactions)
        .where(and(gte(transactions.transactionDate, start), lte(transactions.transactionDate, end)))
        .groupBy(transactions.type)
        .all();

      const expense = result.find((row) => row.type === "expense");
      const income = result.find((row) => row.type === "income");
      const totalExpense = Number(expense?.total || 0);
      const totalIncome = Number(income?.total || 0);

      return {
        totalExpense: roundMoney(totalExpense),
        totalIncome: roundMoney(totalIncome),
        netSavings: roundMoney(totalIncome - totalExpense),
        transactionCount: Number(expense?.count || 0) + Number(income?.count || 0),
        expenseTransactionCount: Number(expense?.count || 0),
        averageDailyExpense: roundMoney(totalExpense / getAverageExpenseDayCount(start, end)),
        maxExpense: getMaxExpense(start, end),
        period: `${start} ~ ${end}`,
      };
    }
  );

  app.get<{ Querystring: { period?: string; date?: string } }>(
    "/trend",
    {
      schema: {
        tags: ["dashboard"],
        summary: "按日期聚合的支出趋势",
        querystring: {
          type: "object",
          properties: {
            period: { type: "string", enum: ["day", "month", "quarter", "year"] },
            date: { type: "string" },
          },
        },
      },
    },
    async (request) => {
      const period = request.query.period || "month";
      const { start, end } = getDateRange(period, request.query.date);

      const data = db
        .select({
          date: transactions.transactionDate,
          type: transactions.type,
          total: sql<number>`coalesce(sum(amount), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(transactions)
        .where(and(gte(transactions.transactionDate, start), lte(transactions.transactionDate, end)))
        .groupBy(transactions.transactionDate, transactions.type)
        .all();

      const dateMap = new Map<string, { date: string; expense: number; income: number; expenseCount: number }>();
      for (const row of data) {
        if (!dateMap.has(row.date)) {
          dateMap.set(row.date, { date: row.date, expense: 0, income: 0, expenseCount: 0 });
        }
        const entry = dateMap.get(row.date)!;
        if (row.type === "expense") {
          entry.expense = roundMoney(Number(row.total || 0));
          entry.expenseCount = Number(row.count || 0);
        } else {
          entry.income = roundMoney(Number(row.total || 0));
        }
      }

      return { data: Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date)) };
    }
  );

  app.get<{ Querystring: { type?: string; period?: string; date?: string } }>(
    "/category-stats",
    {
      schema: {
        tags: ["dashboard"],
        summary: "分类统计",
        querystring: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["expense", "income"] },
            period: { type: "string", enum: ["day", "month", "quarter", "year"] },
            date: { type: "string" },
          },
        },
      },
    },
    async (request) => {
      const type = request.query.type || "expense";
      const period = request.query.period || "month";
      const { start, end } = getDateRange(period, request.query.date);

      return { data: getExpenseCategoryStats(start, end, type) };
    }
  );

  app.get<{ Querystring: { period?: string; date?: string } }>(
    "/member-stats",
    {
      schema: {
        tags: ["dashboard"],
        summary: "成员支出统计",
        querystring: {
          type: "object",
          properties: {
            period: { type: "string", enum: ["day", "month", "quarter", "year"] },
            date: { type: "string" },
          },
        },
      },
    },
    async (request) => {
      const period = request.query.period || "month";
      const { start, end } = getDateRange(period, request.query.date);

      return { data: getDashboardMemberStats(start, end) };
    }
  );
}

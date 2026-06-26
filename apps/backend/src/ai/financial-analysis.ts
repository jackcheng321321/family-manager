import type {
  AssetSummary,
  CategoryStat,
  FinancialAnalysisRecurringCandidate,
  FinancialAnalysisResponse,
  FinancialAnalysisSnapshot,
  FinancialAnalysisTopTransaction,
  MemberStat,
} from "@caiwu/shared";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { assets, categories, members, transactions } from "../db/schema.js";
import { getMonthDateRange, getPreviousMonth } from "../utils/date.js";
import { chat } from "./deepseek.js";
import { getFinancialAnalysisPrompt } from "./prompts.js";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round(value * 10000) / 100;
}

function assertMonth(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error("月份格式必须是 YYYY-MM");

  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("月份必须在 01 到 12 之间");

  return trimmed;
}

function getCategoryLookup() {
  const rows = db.select().from(categories).all();
  return new Map(rows.map((row) => [row.id, row]));
}

function getMemberLookup() {
  const rows = db.select().from(members).all();
  return new Map(rows.map((row) => [row.id, row]));
}

function getExpenseTotal(start: string, end: string): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(amount), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.transactionDate, start),
        lte(transactions.transactionDate, end)
      )
    )
    .get();

  return Number(row?.total || 0);
}

function getCategoryStats(start: string, end: string): CategoryStat[] {
  const rows = db
    .select({
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
    .groupBy(transactions.categoryId)
    .all();

  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
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
        percentage: total > 0 ? roundPercent(amount / total) : 0,
        count: Number(row.count || 0),
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

function getMemberStats(start: string, end: string): MemberStat[] {
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
    entry.topCategories.push({
      categoryId: row.categoryId,
      categoryName: category?.name || "未知",
      color: category?.color || "#999",
      amount: roundMoney(amount),
      percentage: entry.expense > 0 ? roundPercent(amount / entry.expense) : 0,
      count: Number(row.count || 0),
    });
  }

  return Array.from(memberMap.values())
    .map((member) => ({
      ...member,
      percentage: totalExpense > 0 ? roundPercent(member.expense / totalExpense) : 0,
      topCategories: member.topCategories.sort((a, b) => b.amount - a.amount).slice(0, 3),
    }))
    .sort((a, b) => b.expense - a.expense);
}

function getAssetSummary(): AssetSummary[] {
  return db
    .select({
      type: assets.type,
      totalAmount: sql<number>`coalesce(sum(amount), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(assets)
    .where(eq(assets.isActive, true))
    .groupBy(assets.type)
    .all()
    .map((row) => ({
      type: row.type as AssetSummary["type"],
      totalAmount: roundMoney(Number(row.totalAmount || 0)),
      count: Number(row.count || 0),
    }));
}

function getTopTransactions(start: string, end: string): FinancialAnalysisTopTransaction[] {
  const categoryLookup = getCategoryLookup();
  const memberLookup = getMemberLookup();

  return db
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
    .limit(10)
    .all()
    .map((row) => ({
      id: row.id,
      amount: roundMoney(row.amount),
      description: row.description,
      transactionDate: row.transactionDate,
      categoryName: categoryLookup.get(row.categoryId)?.name || "未知",
      memberName: memberLookup.get(row.memberId)?.name || "未知",
    }));
}

function getRecurringCandidates(start: string, end: string): FinancialAnalysisRecurringCandidate[] {
  const categoryLookup = getCategoryLookup();
  const memberLookup = getMemberLookup();
  const rows = db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.transactionDate, start),
        lte(transactions.transactionDate, end)
      )
    )
    .all();

  const groups = new Map<
    string,
    { description: string; categoryId: string; amount: number; count: number; memberIds: Set<string> }
  >();

  for (const row of rows) {
    const normalizedDescription = row.description.trim().toLowerCase();
    if (!normalizedDescription) continue;

    const key = `${normalizedDescription}::${row.categoryId}`;
    const group = groups.get(key) || {
      description: row.description.trim(),
      categoryId: row.categoryId,
      amount: 0,
      count: 0,
      memberIds: new Set<string>(),
    };
    group.amount += row.amount;
    group.count += 1;
    group.memberIds.add(row.memberId);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .filter((group) => group.count >= 2)
    .map((group) => ({
      description: group.description,
      categoryName: categoryLookup.get(group.categoryId)?.name || "未知",
      amount: roundMoney(group.amount),
      count: group.count,
      memberNames: Array.from(group.memberIds).map((id) => memberLookup.get(id)?.name || "未知"),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
}

function buildAnalysisMessage(snapshot: FinancialAnalysisSnapshot): string {
  const categoryLines = snapshot.categoryStats
    .slice(0, 10)
    .map((item) => `- ${item.categoryName}: ${item.amount.toFixed(2)} 元，占 ${item.percentage}%，${item.count} 笔`)
    .join("\n");

  const memberLines = snapshot.memberStats
    .map((member) => {
      const topCategories = member.topCategories
        .map((item) => `${item.categoryName} ${item.amount.toFixed(2)} 元`)
        .join("、");
      return `- ${member.memberName}: 支出 ${member.expense.toFixed(2)} 元，占 ${member.percentage}%，${member.expenseCount} 笔；Top 分类：${topCategories || "暂无"}`;
    })
    .join("\n");

  const topTransactionLines = snapshot.topTransactions
    .map(
      (item) =>
        `- ${item.transactionDate} ${item.memberName} ${item.categoryName} ${item.description}: ${item.amount.toFixed(2)} 元`
    )
    .join("\n");

  const recurringLines = snapshot.recurringCandidates
    .map(
      (item) =>
        `- ${item.description} / ${item.categoryName}: ${item.count} 笔，共 ${item.amount.toFixed(2)} 元，涉及 ${item.memberNames.join("、")}`
    )
    .join("\n");

  const assetLines = snapshot.assetSummary
    .map((item) => `- ${item.type}: ${item.totalAmount.toFixed(2)} 元，${item.count} 项`)
    .join("\n");

  return `${snapshot.month} 家庭财务分析数据
周期：${snapshot.period}

支出概况：
- 本月总支出：${snapshot.totalExpense.toFixed(2)} 元
- 支出笔数：${snapshot.expenseTransactionCount} 笔
- 上月支出：${snapshot.previousMonthExpense.toFixed(2)} 元
- 环比变化：${snapshot.expenseChangeAmount >= 0 ? "+" : ""}${snapshot.expenseChangeAmount.toFixed(2)} 元${
    snapshot.expenseChangePercentage === null ? "" : `，${snapshot.expenseChangePercentage >= 0 ? "+" : ""}${snapshot.expenseChangePercentage}%`
  }

支出分类：
${categoryLines || "- 暂无支出分类数据"}

成员支出：
${memberLines || "- 暂无成员支出数据"}

本月大额支出：
${topTransactionLines || "- 暂无大额支出数据"}

疑似高频/重复消费：
${recurringLines || "- 暂无明显重复消费"}

当前已录入资产/固定项：
${assetLines || "- 暂无资产数据"}`;
}

export async function generateFinancialAnalysis(month: string): Promise<FinancialAnalysisResponse> {
  const normalizedMonth = assertMonth(month);
  const { start, end } = getMonthDateRange(`${normalizedMonth}-01`);
  const previous = getPreviousMonth(`${normalizedMonth}-01`);
  const previousMonth = `${previous.year}-${String(previous.month).padStart(2, "0")}`;
  const { start: previousStart, end: previousEnd } = getMonthDateRange(`${previousMonth}-01`);

  const totalExpense = roundMoney(getExpenseTotal(start, end));
  const previousMonthExpense = roundMoney(getExpenseTotal(previousStart, previousEnd));
  const categoryStats = getCategoryStats(start, end);
  const memberStats = getMemberStats(start, end);
  const topTransactions = getTopTransactions(start, end);
  const recurringCandidates = getRecurringCandidates(start, end);
  const assetSummary = getAssetSummary();
  const expenseTransactionCount = categoryStats.reduce((sum, item) => sum + item.count, 0);
  const expenseChangeAmount = roundMoney(totalExpense - previousMonthExpense);

  const snapshot: FinancialAnalysisSnapshot = {
    month: normalizedMonth,
    period: `${start} ~ ${end}`,
    totalExpense,
    previousMonthExpense,
    expenseChangeAmount,
    expenseChangePercentage:
      previousMonthExpense > 0 ? roundPercent(expenseChangeAmount / previousMonthExpense) : null,
    expenseTransactionCount,
    categoryStats,
    memberStats,
    topTransactions,
    recurringCandidates,
    assetSummary,
  };

  const analysis = (await chat(getFinancialAnalysisPrompt(), buildAnalysisMessage(snapshot))).trim();
  if (!analysis) throw new Error("AI 未返回有效分析内容");

  return {
    month: normalizedMonth,
    generatedAt: new Date().toISOString(),
    analysis,
    snapshot,
  };
}

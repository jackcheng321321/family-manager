import { chat } from "./deepseek.js";
import { getMonthlySummaryPrompt } from "./prompts.js";
import { db } from "../db/connection.js";
import { transactions, categories, members } from "../db/schema.js";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { getMonthDateRange } from "../utils/date.js";

export async function generateMonthlySummary(
  year: number,
  month: number
): Promise<string> {
  const { start: startDate, end: endDate } = getMonthDateRange(
    `${year}-${String(month).padStart(2, "0")}-01`
  );

  // Get aggregated data
  const typeStats = db
    .select({
      type: transactions.type,
      total: sql<number>`sum(amount)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(and(gte(transactions.transactionDate, startDate), lte(transactions.transactionDate, endDate)))
    .groupBy(transactions.type)
    .all();

  const categoryStats = db
    .select({
      categoryId: transactions.categoryId,
      type: transactions.type,
      total: sql<number>`sum(amount)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.transactionDate, startDate),
        lte(transactions.transactionDate, endDate)
      )
    )
    .groupBy(transactions.categoryId)
    .all();

  const memberStats = db
    .select({
      memberId: transactions.memberId,
      type: transactions.type,
      total: sql<number>`sum(amount)`,
    })
    .from(transactions)
    .where(and(gte(transactions.transactionDate, startDate), lte(transactions.transactionDate, endDate)))
    .groupBy(transactions.memberId, transactions.type)
    .all();

  const expense = typeStats.find((s) => s.type === "expense");
  const income = typeStats.find((s) => s.type === "income");

  // Build category breakdown
  const categoryBreakdown = categoryStats
    .map((s) => {
      const cat = db.select().from(categories).where(eq(categories.id, s.categoryId)).get();
      return `  ${cat?.name || "未知"}: ${s.total.toFixed(2)} 元`;
    })
    .join("\n");

  // Build member breakdown
  const memberMap = new Map<string, { name: string; expense: number; income: number }>();
  for (const s of memberStats) {
    if (!memberMap.has(s.memberId)) {
      const member = db.select().from(members).where(eq(members.id, s.memberId)).get();
      memberMap.set(s.memberId, { name: member?.name || "未知", expense: 0, income: 0 });
    }
    const entry = memberMap.get(s.memberId)!;
    if (s.type === "expense") entry.expense = s.total;
    else entry.income = s.total;
  }
  const memberBreakdown = Array.from(memberMap.values())
    .map((m) => `  ${m.name}: 支出 ${m.expense.toFixed(2)} 元, 收入 ${m.income.toFixed(2)} 元`)
    .join("\n");

  const dataMessage = `${year}年${month}月财务数据：

总收入：${(income?.total || 0).toFixed(2)} 元
总支出：${(expense?.total || 0).toFixed(2)} 元
净储蓄：${((income?.total || 0) - (expense?.total || 0)).toFixed(2)} 元

支出分类明细：
${categoryBreakdown || "  暂无数据"}

家庭成员明细：
${memberBreakdown || "  暂无数据"}`;

  const prompt = getMonthlySummaryPrompt();
  return chat(prompt, dataMessage);
}

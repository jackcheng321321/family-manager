import { db } from "../db/connection.js";
import { settings, categories } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { APP_TIME_ZONE, getBusinessToday } from "../utils/date.js";

/**
 * Shared context appended to both text and image parsing prompts:
 * the available category lists and the date rules (business timezone).
 */
function getCategoryAndDateContext(): string {
  const allCategories = db.select().from(categories).where(eq(categories.isActive, true)).all();
  const expenseCategories = allCategories.filter((c) => c.type === "expense").map((c) => c.name);
  const incomeCategories = allCategories.filter((c) => c.type === "income").map((c) => c.name);

  const today = getBusinessToday();

  return `可用的支出分类：${expenseCategories.join("、")}
可用的收入分类：${incomeCategories.join("、")}

日期规则（必须遵守）：
1. 当前业务日期是 ${today}，时区是 ${APP_TIME_ZONE}。
2. 没有明确日期时，transactionDate 返回 ${today}。
3. 用户说“补录”“记到”“算到”或给出具体日期时，transactionDate 必须使用指定的日期。
4. 支持 YYYY-MM-DD、YYYY/MM/DD、M月D日、昨天、前天、上周X、本周X 等表达；未写年份的日期按当前年份推断。
5. transactionDate 只能返回 YYYY-MM-DD 格式，不要返回自然语言日期。`;
}

export function getParsePrompt(): string {
  const setting = db.select().from(settings).where(eq(settings.key, "ai.parse_prompt")).get();
  const basePrompt =
    setting?.value ||
    `你是一个家庭财务助手。用户会发送消费或收入相关的消息，你需要解析出结构化数据。
规则：
1. 识别交易类型（支出/收入）
2. 提取金额（数字）
3. 提取描述（简短描述这笔交易）
4. 推断分类（从已有分类列表中选择最匹配的）
5. 推断交易日期（默认今天，如果消息中提到"昨天"、"上周"等则相应调整）
6. 如果信息不完整，返回你能确定的部分，对不确定的字段标记为null`;

  return `${basePrompt}

${getCategoryAndDateContext()}`;
}

export function getImageParsePrompt(): string {
  const setting = db.select().from(settings).where(eq(settings.key, "vision.prompt")).get();
  const basePrompt =
    setting?.value ||
    `你是一个家庭财务助手。用户会发送一张图片，可能是消费小票、支付成功截图、付款码账单、转账记录或商品价签。请识别图片内容并提取出一笔收支交易：
规则：
1. 判断交易类型（付款/消费为 expense 支出；收款/退款/工资到账为 income 收入）。
2. 提取金额（实付金额的数字，单位元）。
3. 用简短中文描述这笔交易（如“星巴克咖啡”“京东购物”“滴滴打车”）。
4. 从下面的分类列表中选择最匹配的分类。
5. 识别交易日期（图片上有日期/时间就用图片上的，否则用当前业务日期）。
6. 如果图片里确实没有任何金额或消费信息，就不要调用工具，用一句话说明没识别到记账信息。
请通过调用 record_transaction 工具返回结构化结果。`;

  return `${basePrompt}

${getCategoryAndDateContext()}`;
}

export function getMonthlySummaryPrompt(): string {
  const setting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "ai.monthly_summary_prompt"))
    .get();

  return (
    setting?.value ||
    `你是一个家庭财务分析师。请根据以下数据生成月度财务分析报告：
1. 本月财务概况总结（2-3句话）
2. 支出分析（哪些分类占比高，是否合理）
3. 与上月对比的变化趋势
4. 2-3条具体的节省建议
5. 一句鼓励的话
请用友好、简洁的语气，适合在微信中阅读。`
  );
}

export function getFinancialAnalysisPrompt(): string {
  const setting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "ai.financial_analysis_prompt"))
    .get();

  return (
    setting?.value ||
    `你是一个务实的家庭财务分析师。请根据用户某个月的记账和资产数据，输出适合家庭内部阅读的中文分析。
分析重点：
1. 先用 2-3 句话说明本月支出画像，不要重复罗列所有数据。
2. 重点发现潜在支出陷阱：高频小额、异常大额、某成员或某分类过度集中、可延后或可替代消费。
3. 对两人共同记账的场景，分别指出每个人最需要注意的一类支出。
4. 如果资产数据不足，要明确说明结论边界，不要假装知道现金流全貌。
5. 给出 3-5 条可执行建议，每条建议要具体到行为，例如预算上限、复盘频率、分类调整或消费前检查。
语气要求：直接、清醒、友好，不要鸡汤，不要输出 JSON。`
  );
}

export const RECORD_TRANSACTION_TOOL = {
  type: "function" as const,
  function: {
    name: "record_transaction",
    description: "记录一笔收支交易",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["expense", "income"],
          description: "交易类型：expense（支出）或 income（收入）",
        },
        amount: {
          type: "number",
          description: "金额（正数）",
        },
        description: {
          type: "string",
          description: "交易描述（简短）",
        },
        category: {
          type: "string",
          description: "分类名称",
        },
        transactionDate: {
          type: "string",
          description: "交易日期，格式 YYYY-MM-DD",
        },
      },
      required: ["type", "amount", "description", "category"],
    },
  },
};

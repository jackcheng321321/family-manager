import { db } from "./connection.js";
import { categories, settings, members } from "./schema.js";
import { ALL_DEFAULT_CATEGORIES, DEFAULT_TARGET_ALLOCATION, DEFAULT_EMERGENCY_FUND_MONTHS } from "@caiwu/shared";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";

export async function seed() {
  // Seed categories if empty
  const existingCategories = db.select().from(categories).all();
  if (existingCategories.length === 0) {
    const now = new Date().toISOString();
    for (let i = 0; i < ALL_DEFAULT_CATEGORIES.length; i++) {
      const cat = ALL_DEFAULT_CATEGORIES[i];
      db.insert(categories)
        .values({
          id: nanoid(),
          name: cat.name,
          type: cat.type,
          icon: cat.icon,
          color: cat.color,
          sortOrder: i,
          isActive: true,
          createdAt: now,
        })
        .run();
    }
    console.log(`Seeded ${ALL_DEFAULT_CATEGORIES.length} categories`);
  }

  // Seed default settings if empty
  const existingSettings = db.select().from(settings).all();
  if (existingSettings.length === 0) {
    const defaultSettings: Record<string, string> = {
      "ai.parse_prompt": `你是一个家庭财务助手。用户会发送消费或收入相关的消息，你需要解析出结构化数据。
规则：
1. 识别交易类型（支出/收入）
2. 提取金额（数字）
3. 提取描述（简短描述这笔交易）
4. 推断分类（从已有分类列表中选择最匹配的）
5. 推断交易日期（默认今天，如果消息中提到"昨天"、"上周"等则相应调整）
6. 如果信息不完整，返回你能确定的部分，对不确定的字段标记为null`,
      "ai.monthly_summary_prompt": `你是一个家庭财务分析师。请根据以下数据生成月度财务分析报告：
1. 本月财务概况总结（2-3句话）
2. 支出分析（哪些分类占比高，是否合理）
3. 与上月对比的变化趋势
4. 2-3条具体的节省建议
5. 一句鼓励的话
请用友好、简洁的语气，适合在微信中阅读。`,
      "ai.financial_analysis_prompt": `你是一个务实的家庭财务分析师。请根据用户某个月的记账和资产数据，输出适合家庭内部阅读的中文分析。
分析重点：
1. 先用 2-3 句话说明本月支出画像，不要重复罗列所有数据。
2. 重点发现潜在支出陷阱：高频小额、异常大额、某成员或某分类过度集中、可延后或可替代消费。
3. 对两人共同记账的场景，分别指出每个人最需要注意的一类支出。
4. 如果资产数据不足，要明确说明结论边界，不要假装知道现金流全貌。
5. 给出 3-5 条可执行建议，每条建议要具体到行为，例如预算上限、复盘频率、分类调整或消费前检查。
语气要求：直接、清醒、友好，不要鸡汤，不要输出 JSON。`,
      "ai.model": "deepseek-chat",
      "ai.temperature": "0.3",
      "monthly_summary.enabled": "false",
      "monthly_summary.day": "1",
      "monthly_summary.hour": "9",
      "asset.target_allocation": JSON.stringify(DEFAULT_TARGET_ALLOCATION),
      "asset.emergency_fund_months": String(DEFAULT_EMERGENCY_FUND_MONTHS),
    };

    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(defaultSettings)) {
      db.insert(settings)
        .values({ key, value, updatedAt: now })
        .run();
    }
    console.log(`Seeded ${Object.keys(defaultSettings).length} settings`);
  }

  // Seed default admin member if empty
  const existingMembers = db.select().from(members).all();
  if (existingMembers.length === 0) {
    db.insert(members)
      .values({
        id: nanoid(),
        name: "管理员",
        role: "admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();
    console.log("Seeded default admin member");
  }
}

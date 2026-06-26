import { chatWithTools } from "./deepseek.js";
import { getParsePrompt, RECORD_TRANSACTION_TOOL } from "./prompts.js";
import { db } from "../db/connection.js";
import { categories, transactions, members } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { ParsedTransaction } from "@caiwu/shared";
import { getBusinessToday, normalizeDateString } from "../utils/date.js";

export interface ParseResult {
  success: boolean;
  transaction?: ParsedTransaction;
  replyMessage: string;
}

export type RawParsedTransaction = ParsedTransaction & {
  transaction_date?: string;
};

export async function parseAndSaveMessage(
  rawMessage: string,
  senderId: string,
  source = "wechat"
): Promise<ParseResult> {
  const systemPrompt = getParsePrompt();

  try {
    const response = await chatWithTools(systemPrompt, rawMessage, [
      RECORD_TRANSACTION_TOOL,
    ]);

    const choice = response.choices[0];
    if (!choice?.message) {
      return { success: false, replyMessage: "AI解析失败，请稍后再试" };
    }

    // Check if AI returned a tool call
    const toolCalls = choice.message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      // Not a financial message
      const textReply = choice.message.content || "我是记账助手，请发送消费或收入信息给我~";
      return { success: false, replyMessage: textReply };
    }

    const toolCall = toolCalls[0];
    if (toolCall.function.name !== "record_transaction") {
      return { success: false, replyMessage: "解析错误，请重新发送" };
    }

    const parsed = JSON.parse(toolCall.function.arguments) as RawParsedTransaction;
    return finalizeAndSave(parsed, senderId, rawMessage, source);
  } catch (error) {
    console.error("AI parse error:", error);
    return {
      success: false,
      replyMessage: "AI解析出错，请稍后再试或使用格式：金额 描述（如：35 午饭）",
    };
  }
}

/**
 * Persist a parsed transaction: normalize date, match category, find/create
 * member, insert the row, and build a reply. Shared by text/voice (DeepSeek)
 * and image (qwen3-vl-flash) input paths.
 */
export function finalizeAndSave(
  parsed: RawParsedTransaction,
  senderId: string,
  rawInput: string,
  source: string
): ParseResult {
  try {
    if (!parsed.transactionDate && parsed.transaction_date) {
      parsed.transactionDate = parsed.transaction_date;
    }
    const parsedDate = normalizeDateString(parsed.transactionDate);
    if (parsed.transactionDate && !parsedDate) {
      return {
        success: false,
        replyMessage: `日期「${parsed.transactionDate}」无法识别，请使用 YYYY-MM-DD 或“5月20日”这类格式重试`,
      };
    }
    const txDate = parsedDate || getBusinessToday();
    parsed.transactionDate = txDate;

    // Find or default the category
    const allCategories = db.select().from(categories).where(eq(categories.isActive, true)).all();
    const matchedCategory = allCategories.find(
      (c) => c.name === parsed.category && c.type === parsed.type
    ) || allCategories.find(
      (c) => c.name.includes(parsed.category) || parsed.category.includes(c.name)
    );

    if (!matchedCategory) {
      // Use the "other" category
      const otherCat = allCategories.find(
        (c) => c.name.includes("其他") && c.type === parsed.type
      );
      if (!otherCat) {
        return { success: false, replyMessage: `未找到匹配的分类「${parsed.category}」，请检查分类设置` };
      }
      parsed.category = otherCat.name;
    }

    const categoryRecord = matchedCategory || allCategories.find(
      (c) => c.name.includes("其他") && c.type === parsed.type
    )!;

    // Find or create member
    let member = db.select().from(members).where(eq(members.wechatUserId, senderId)).get();
    if (!member) {
      const memberId = nanoid();
      db.insert(members)
        .values({
          id: memberId,
          wechatUserId: senderId,
          name: `微信用户_${senderId.slice(-4)}`,
          role: "member",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();
      member = db.select().from(members).where(eq(members.id, memberId)).get()!;
    }

    // Save transaction
    const txId = nanoid();
    db.insert(transactions)
      .values({
        id: txId,
        type: parsed.type,
        amount: parsed.amount,
        description: parsed.description,
        categoryId: categoryRecord.id,
        memberId: member.id,
        transactionDate: txDate,
        source,
        aiRawInput: rawInput,
        aiConfidence: 1.0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();

    const typeLabel = parsed.type === "expense" ? "支出" : "收入";
    const dateStr = txDate.slice(5).replace("-", "月") + "日";
    const replyMessage = `已记录：${categoryRecord.name} ${typeLabel} ${parsed.amount.toFixed(2)} 元 - ${parsed.description} (${dateStr})`;

    return {
      success: true,
      transaction: parsed,
      replyMessage,
    };
  } catch (error) {
    console.error("finalizeAndSave error:", error);
    return {
      success: false,
      replyMessage: "保存记录时出错，请稍后再试",
    };
  }
}

// 健康模块的 AI 解析：
// 1) 体检报告文本 → DeepSeek 工具调用，结构化出姓名/日期/机构/总体结论/异常汇总/明细项
// 2) 就诊检查图片/处方 → 阿里百炼 qwen3-vl 工具调用，OCR 辅助填表（检查/诊断/用药）
// 复用现有 DeepSeek（deepseek.ts）与百炼视觉（dashscope.ts 同款配置）能力，不新增模型账号。

import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/connection.js";
import { settings } from "../db/schema.js";
import { chatWithTools } from "./deepseek.js";
import { getBusinessToday } from "../utils/date.js";
import type { ParsedCheckup, ParsedVisitImage } from "@caiwu/shared";

function getSetting(key: string): string | undefined {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value || undefined;
}

// ---- 体检报告文本解析（DeepSeek） ----

const RECORD_CHECKUP_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "record_checkup",
    description: "记录一份体检报告的结构化信息",
    parameters: {
      type: "object",
      properties: {
        patientName: { type: "string", description: "体检人姓名" },
        checkupDate: { type: "string", description: "体检日期，格式 YYYY-MM-DD" },
        institution: { type: "string", description: "体检机构名称" },
        overallSummary: {
          type: "string",
          description: "总体结论/总检建议的简明中文总结",
        },
        abnormalSummary: {
          type: "string",
          description: "所有异常/偏高/偏低/阳性项目的汇总说明",
        },
        items: {
          type: "array",
          description: "全部体检明细项",
          items: {
            type: "object",
            properties: {
              groupName: { type: "string", description: "分组，如「血常规」「肝功能」" },
              itemName: { type: "string", description: "项目名，如「白细胞计数」" },
              result: { type: "string", description: "结果值（含数字或定性结果）" },
              unit: { type: "string", description: "单位" },
              referenceRange: { type: "string", description: "参考范围" },
              flag: {
                type: "string",
                enum: ["normal", "high", "low", "abnormal", "unknown"],
                description:
                  "异常标记：normal 正常；high 偏高；low 偏低；abnormal 其他异常/阳性；unknown 未知",
              },
            },
            required: ["itemName"],
          },
        },
      },
      required: ["items"],
    },
  },
};

function getCheckupPrompt(): string {
  const custom = getSetting("health.checkup_prompt");
  const base =
    custom ||
    `你是一个专业的健康档案助手。下面是一份体检报告的文本（由 PDF 提取，可能有排版错乱）。
请尽你所能解析出结构化信息，并通过调用 record_checkup 工具返回：
1. 体检人姓名、体检日期（YYYY-MM-DD）、体检机构。
2. overallSummary：用 2-4 句中文概括总体健康状况和总检建议。
3. abnormalSummary：列出所有异常/偏高/偏低/阳性的项目及其数值，便于快速查看。
4. items：尽量完整地提取每一个检查项目（分组、项目名、结果、单位、参考范围、异常标记 flag）。
   - 结果在参考范围外或标注↑↓/阳性时，flag 用 high/low/abnormal；正常用 normal；无法判断用 unknown。
规则：
- 只输出报告中真实存在的内容，不要编造数值。
- 日期必须是 YYYY-MM-DD；无法确定时可省略。`;

  return `${base}\n\n当前业务日期：${getBusinessToday()}`;
}

/** 用 DeepSeek 解析体检报告文本，返回结构化结果；失败返回 null。 */
export async function parseCheckupText(text: string): Promise<ParsedCheckup | null> {
  // 控制超长文本，DeepSeek 上下文足够，但避免极端长度。
  const clipped = text.length > 24000 ? text.slice(0, 24000) : text;
  const response = await chatWithTools(getCheckupPrompt(), clipped, [RECORD_CHECKUP_TOOL]);
  const message = response.choices[0]?.message;
  const toolCall = message?.tool_calls?.find((t) => t.function.name === "record_checkup");
  if (toolCall) {
    try {
      return JSON.parse(toolCall.function.arguments) as ParsedCheckup;
    } catch {
      return null;
    }
  }
  // 兜底：内容里夹带 JSON
  const content = message?.content?.trim();
  if (content) {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as ParsedCheckup;
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ---- 就诊检查图片 OCR 辅助（百炼 qwen3-vl） ----

function getVisionClient(): OpenAI {
  return new OpenAI({
    apiKey: getSetting("vision.api_key") || config.dashscope.apiKey,
    baseURL: getSetting("vision.base_url") || config.dashscope.baseUrl,
  });
}

function getVisionModel(): string {
  return getSetting("vision.model") || config.dashscope.vlModel;
}

const RECORD_VISIT_INFO_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "record_visit_info",
    description: "从就诊相关图片（检查单/化验单/处方）中提取结构化信息",
    parameters: {
      type: "object",
      properties: {
        examinations: { type: "string", description: "做了哪些检查及关键发现" },
        diagnosis: { type: "string", description: "诊断结果（如有）" },
        treatment: { type: "string", description: "医嘱/处理建议（如有）" },
        medications: {
          type: "array",
          description: "处方药品清单",
          items: {
            type: "object",
            properties: {
              drugName: { type: "string", description: "药品名称" },
              spec: { type: "string", description: "规格" },
              dosage: { type: "string", description: "用法用量" },
              quantity: { type: "string", description: "数量" },
            },
            required: ["drugName"],
          },
        },
        rawText: { type: "string", description: "图片中识别到的主要原始文字" },
      },
    },
  },
};

const VISIT_IMAGE_PROMPT = `你是一个健康档案助手。用户上传了一张就诊相关图片，可能是检查报告单、化验单或处方笺。
请识别图片内容，并通过调用 record_visit_info 工具返回结构化信息：
1. examinations：做了哪些检查，以及报告里的关键结果/结论。
2. diagnosis：诊断结果（若图片中有）。
3. treatment：医嘱或处理建议（若有）。
4. medications：处方药品清单（药名、规格、用法用量、数量）。
5. rawText：识别到的主要文字。
只提取图片中真实存在的内容，不要编造。如果某类信息没有就留空。`;

/** 用 qwen3-vl 对单张就诊图片做 OCR 辅助识别；失败返回 null。 */
export async function parseVisitImage(dataUrl: string): Promise<ParsedVisitImage | null> {
  const client = getVisionClient();
  const response = await client.chat.completions.create({
    model: getVisionModel(),
    temperature: 0.1,
    messages: [
      { role: "system", content: VISIT_IMAGE_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "请识别这张就诊图片中的信息。" },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    tools: [RECORD_VISIT_INFO_TOOL],
    tool_choice: "auto",
  });

  const message = response.choices[0]?.message;
  const toolCall = message?.tool_calls?.find(
    (t) => t.function.name === "record_visit_info"
  );
  if (toolCall) {
    try {
      return JSON.parse(toolCall.function.arguments) as ParsedVisitImage;
    } catch {
      return null;
    }
  }
  return null;
}

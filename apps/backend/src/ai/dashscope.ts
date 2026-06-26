import OpenAI from "openai";
import { config } from "../config.js";
import { db } from "../db/connection.js";
import { settings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getImageParsePrompt, RECORD_TRANSACTION_TOOL } from "./prompts.js";
import type { RawParsedTransaction } from "./parser.js";

// Aliyun Bailian (DashScope) OpenAI-compatible client for image understanding.
// Settings table (vision.*) overrides env-based config, mirroring deepseek.ts.

function getSetting(key: string): string | undefined {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value || undefined;
}

function getVisionClient(): OpenAI {
  return new OpenAI({
    apiKey: getSetting("vision.api_key") || config.dashscope.apiKey,
    baseURL: getSetting("vision.base_url") || config.dashscope.baseUrl,
  });
}

function getVisionModel(): string {
  return getSetting("vision.model") || config.dashscope.vlModel;
}

/**
 * Send an image (base64 data URL) to qwen3-vl-flash and let it extract a
 * transaction in one step via the shared record_transaction tool. Returns the
 * parsed transaction, or null if the image contains no bookkeeping info.
 */
export async function parseImageTransaction(
  dataUrl: string
): Promise<RawParsedTransaction | null> {
  const client = getVisionClient();
  const response = await client.chat.completions.create({
    model: getVisionModel(),
    temperature: 0.1,
    messages: [
      { role: "system", content: getImageParsePrompt() },
      {
        role: "user",
        content: [
          { type: "text", text: "请识别这张图片中的消费或收入信息并记账。" },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    tools: [RECORD_TRANSACTION_TOOL],
    tool_choice: "auto",
  });

  const message = response.choices[0]?.message;
  if (!message) return null;

  const toolCall = message.tool_calls?.find(
    (t) => t.function.name === "record_transaction"
  );
  if (toolCall) {
    return JSON.parse(toolCall.function.arguments) as RawParsedTransaction;
  }

  // Fallback: some models return JSON in content instead of a tool call.
  const content = message.content?.trim();
  if (content) {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as RawParsedTransaction;
      } catch {
        // not valid JSON — treat as "no transaction"
      }
    }
  }

  return null;
}

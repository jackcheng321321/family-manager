import OpenAI from "openai";
import { config } from "../config.js";
import { db } from "../db/connection.js";
import { settings } from "../db/schema.js";
import { eq } from "drizzle-orm";

function getClient(): OpenAI {
  // Try to get API key from settings first, fallback to env
  const apiKeySetting = db.select().from(settings).where(eq(settings.key, "ai.api_key")).get();
  const baseUrlSetting = db.select().from(settings).where(eq(settings.key, "ai.base_url")).get();

  return new OpenAI({
    apiKey: apiKeySetting?.value || config.deepseek.apiKey,
    baseURL: baseUrlSetting?.value || config.deepseek.baseUrl,
  });
}

function getModel(): string {
  const modelSetting = db.select().from(settings).where(eq(settings.key, "ai.model")).get();
  return modelSetting?.value || config.deepseek.model;
}

function getTemperature(): number {
  const tempSetting = db.select().from(settings).where(eq(settings.key, "ai.temperature")).get();
  return tempSetting?.value ? Number(tempSetting.value) : 0.3;
}

export async function chatWithTools(
  systemPrompt: string,
  userMessage: string,
  tools: OpenAI.ChatCompletionTool[]
): Promise<OpenAI.ChatCompletion> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: getModel(),
    temperature: getTemperature(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    tools,
    tool_choice: "auto",
  });
  return response;
}

export async function chat(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: getModel(),
    temperature: getTemperature(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });
  return response.choices[0]?.message?.content || "";
}

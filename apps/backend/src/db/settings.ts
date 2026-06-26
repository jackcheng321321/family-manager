import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "./connection.js";
import { settings } from "./schema.js";

export function getSettingValue(key: string): string | undefined {
  const record = db.select().from(settings).where(eq(settings.key, key)).get();
  const value = record?.value?.trim();
  return value ? value : undefined;
}

export function upsertSetting(key: string, value: string) {
  const now = new Date().toISOString();
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();

  if (existing) {
    db.update(settings).set({ value, updatedAt: now }).where(eq(settings.key, key)).run();
    return;
  }

  db.insert(settings).values({ key, value, updatedAt: now }).run();
}

export function getHubUrl(): string {
  return getSettingValue("hub.url") || config.hubUrl;
}

export function getBaseUrl(): string {
  return getSettingValue("hub.base_url") || config.baseUrl;
}

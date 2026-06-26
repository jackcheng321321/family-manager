import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { db } from "../db/connection.js";
import { upsertSetting } from "../db/settings.js";
import { settings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";

export async function settingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/", async () => {
    const all = db.select().from(settings).all();
    const result: Record<string, string> = {
      "hub.url": config.hubUrl,
      "hub.base_url": config.baseUrl,
    };
    for (const s of all) {
      result[s.key] = s.value;
    }
    return result;
  });

  app.get<{ Params: { key: string } }>("/:key", async (request, reply) => {
    const setting = db.select().from(settings).where(eq(settings.key, request.params.key)).get();
    if (!setting) return reply.status(404).send({ error: "Not found" });
    return setting;
  });

  app.put<{ Body: Record<string, string> }>("/", async (request) => {
    for (const [key, value] of Object.entries(request.body)) {
      upsertSetting(key, value);
    }
    return { success: true };
  });
}

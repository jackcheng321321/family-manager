import type { FastifyInstance } from "fastify";
import { getBaseUrl } from "../db/settings.js";

export async function hubManifestRoutes(app: FastifyInstance) {
  app.get("/manifest.json", async () => {
    const baseUrl = getBaseUrl();

    return {
      slug: "caiwu-manager",
      name: "家庭记账助手",
      description: "通过微信对话记录家庭收支，AI自动解析分类",
      version: "1.0.0",
      setup_url: `${baseUrl}/oauth/setup`,
      webhook_url: `${baseUrl}/hub/webhook`,
      redirect_url: `${baseUrl}/oauth/redirect`,
      oauth_setup_url: `${baseUrl}/oauth/setup`,
      oauth_redirect_url: `${baseUrl}/oauth/redirect`,
      events: ["message"],
      scopes: ["message:read", "message:write"],
      tools: [],
      permissions: ["message:read", "message:write"],
    };
  });
}

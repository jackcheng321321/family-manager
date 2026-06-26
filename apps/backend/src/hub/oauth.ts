import type { FastifyInstance, FastifyReply } from "fastify";
import { createHash, randomBytes } from "crypto";
import { db } from "../db/connection.js";
import { getBaseUrl, getHubUrl } from "../db/settings.js";
import { installations } from "../db/schema.js";

interface OAuthSetupQuery {
  hub?: string;
  app_id?: string;
  bot_id?: string;
  state?: string;
  return_url?: string;
}

interface OAuthRedirectQuery {
  code?: string;
  installation_id?: string;
  state?: string;
}

interface InstallationPayload {
  installation_id?: string;
  app_token?: string;
  webhook_secret?: string;
  bot_id?: string;
}

interface PendingOAuthState {
  hubUrl: string;
  appId: string;
  botId: string;
  codeVerifier: string;
  returnUrl?: string;
  createdAt: number;
}

const oauthStates = new Map<string, PendingOAuthState>();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export async function hubOAuthRoutes(app: FastifyInstance) {
  app.get<{ Querystring: OAuthSetupQuery }>("/setup", async (request, reply) => {
    const { hub, app_id: appId, bot_id: botId, state, return_url: returnUrl } = request.query;

    if (hub && appId && botId && state) {
      cleanupExpiredStates();

      const hubUrl = normalizeBaseUrl(hub);
      const { codeVerifier, codeChallenge } = createPkcePair();
      oauthStates.set(state, {
        hubUrl,
        appId,
        botId,
        codeVerifier,
        returnUrl,
        createdAt: Date.now(),
      });

      const authorizeUrl = new URL(`/api/apps/${encodeURIComponent(appId)}/oauth/authorize`, hubUrl);
      authorizeUrl.searchParams.set("bot_id", botId);
      authorizeUrl.searchParams.set("state", state);
      authorizeUrl.searchParams.set("code_challenge", codeChallenge);

      request.log.info({ appId, botId, hubUrl }, "Starting OpeniLink OAuth setup");
      return reply.redirect(authorizeUrl.toString());
    }

    const legacyState = randomBytes(16).toString("hex");
    const legacyUrl = new URL("/oauth/authorize", normalizeBaseUrl(getHubUrl()));
    legacyUrl.searchParams.set("app_url", getBaseUrl());
    legacyUrl.searchParams.set("state", legacyState);
    request.log.warn("Using legacy OpeniLink OAuth setup flow; upgrade Hub app settings if this fails");
    return reply.redirect(legacyUrl.toString());
  });

  app.get<{ Querystring: OAuthRedirectQuery }>("/redirect", async (request, reply) => {
    const { code, installation_id: legacyInstallationId, state } = request.query;

    if (!code) {
      return reply.status(400).send({ error: "Missing code" });
    }

    if (legacyInstallationId) {
      return handleLegacyRedirect(code, legacyInstallationId, reply);
    }

    if (!state) {
      return reply.status(400).send({ error: "Missing state" });
    }

    const pending = oauthStates.get(state);
    if (!pending) {
      request.log.warn({ state }, "OpeniLink OAuth state not found or expired");
      return reply.status(400).send({ error: "OAuth state expired, please install again" });
    }

    try {
      const response = await fetch(`${pending.hubUrl}/api/apps/${encodeURIComponent(pending.appId)}/oauth/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          code_verifier: pending.codeVerifier,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        request.log.error({ status: response.status, body }, "OpeniLink OAuth token exchange failed");
        return reply.status(500).send({ error: "Token exchange failed", detail: body });
      }

      const data = (await response.json()) as Required<InstallationPayload>;
      saveInstallation(data);
      oauthStates.delete(state);

      request.log.info(
        { installationId: data.installation_id, botId: data.bot_id },
        "OpeniLink App installed"
      );

      if (pending.returnUrl) {
        return reply.redirect(pending.returnUrl);
      }

      return reply.send({ success: true, message: "App installed successfully" });
    } catch (error) {
      request.log.error({ error }, "OpeniLink OAuth flow failed");
      return reply.status(500).send({ error: "OAuth flow failed" });
    }
  });

  app.post<{ Body: InstallationPayload }>("/redirect", async (request, reply) => {
    const data = request.body;
    if (!isCompleteInstallation(data)) {
      return reply.status(400).send({ error: "Missing installation credentials" });
    }

    saveInstallation(data);
    request.log.info(
      { installationId: data.installation_id, botId: data.bot_id },
      "OpeniLink App credentials received"
    );

    return { webhook_url: `${getBaseUrl()}/hub/webhook` };
  });
}

function createPkcePair() {
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

function cleanupExpiredStates() {
  const expiresBefore = Date.now() - OAUTH_STATE_TTL_MS;
  for (const [state, value] of oauthStates.entries()) {
    if (value.createdAt < expiresBefore) {
      oauthStates.delete(state);
    }
  }
}

function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.replace(/\/+$/, "");
}

function isCompleteInstallation(data: InstallationPayload): data is Required<InstallationPayload> {
  return Boolean(data.installation_id && data.app_token && data.webhook_secret && data.bot_id);
}

function saveInstallation(data: Required<InstallationPayload>) {
  db.insert(installations)
    .values({
      id: data.installation_id,
      appToken: data.app_token,
      webhookSecret: data.webhook_secret,
      botId: data.bot_id,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: installations.id,
      set: {
        appToken: data.app_token,
        webhookSecret: data.webhook_secret,
        botId: data.bot_id,
      },
    })
    .run();
}

async function handleLegacyRedirect(code: string, installationId: string, reply: FastifyReply) {
  try {
    const response = await fetch(`${getHubUrl()}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        installation_id: installationId,
      }),
    });

    if (!response.ok) {
      return reply.status(500).send({ error: "Token exchange failed" });
    }

    const data = (await response.json()) as {
      app_token: string;
      webhook_secret: string;
      bot_id: string;
    };

    saveInstallation({
      installation_id: installationId,
      app_token: data.app_token,
      webhook_secret: data.webhook_secret,
      bot_id: data.bot_id,
    });

    return reply.send({ success: true, message: "App installed successfully" });
  } catch (error) {
    console.error("Legacy OpeniLink OAuth error:", error);
    return reply.status(500).send({ error: "OAuth flow failed" });
  }
}

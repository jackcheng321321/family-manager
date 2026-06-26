import type { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "../db/connection.js";
import { installations, messageLog } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { verifyWebhookSignature } from "./signature.js";
import { parseAndSaveMessage, finalizeAndSave } from "../ai/parser.js";
import { parseImageTransaction } from "../ai/dashscope.js";
import { downloadMediaAsDataUrl } from "./media.js";
import { sendBotMessage } from "./bot-api.js";
import { getMonthDateRange } from "../utils/date.js";

interface LegacyHubEvent {
  type?: string;
  installation_id?: string;
  trace_id?: string;
  data?: {
    sender?: { id?: string; name?: string };
    message?: { type?: string; text?: string; voice_url?: string };
    challenge?: string;
  };
}

interface OpenILinkMessageItem {
  type?: string;
  text?: string;
  media?: { url?: string; media_type?: string };
}

interface OpenILinkAppEvent {
  type?: string;
  id?: string;
  timestamp?: number;
  data?: {
    sender?: { id?: string; role?: string };
    content?: string;
    msg_type?: string;
    items?: OpenILinkMessageItem[];
    message_id?: number;
    command?: string;
    text?: string;
  };
}

interface OpenILinkEnvelope {
  v?: number;
  type?: string;
  trace_id?: string;
  installation_id?: string;
  challenge?: string;
  bot?: { id?: string };
  event?: OpenILinkAppEvent;
}

interface RawBodyRequest extends FastifyRequest {
  rawBody?: string;
}

interface NormalizedWebhookEvent {
  kind: "url_verification" | "message" | "ignored";
  challenge?: string;
  installationId?: string;
  traceId?: string;
  senderId?: string | null;
  messageType?: string;
  rawContent?: string | null;
  textContent?: string;
  mediaUrl?: string;
}

export async function hubWebhookRoutes(app: FastifyInstance) {
  app.post("/webhook", async (request, reply) => {
    const event = request.body as LegacyHubEvent | OpenILinkEnvelope;
    const normalized = normalizeWebhookEvent(event);

    if (normalized.kind === "url_verification") {
      return { challenge: normalized.challenge };
    }

    if (normalized.kind === "ignored") {
      request.log.info({ eventType: event.type }, "Ignoring unsupported OpeniLink webhook event");
      return { status: "ignored" };
    }

    const installationId = normalized.installationId;
    if (!installationId) {
      return reply.status(400).send({ error: "Missing installation_id" });
    }

    const installation = db
      .select()
      .from(installations)
      .where(eq(installations.id, installationId))
      .get();

    if (!installation) {
      request.log.warn({ installationId }, "Unknown installation_id in webhook");
      return reply.status(401).send({ error: "Unknown installation_id" });
    }

    const signature = getHeaderValue(request.headers["x-signature"]);
    if (!signature) {
      request.log.warn({ installationId }, "Missing webhook signature");
      return reply.status(401).send({ error: "Missing signature" });
    }

    const rawBody = (request as RawBodyRequest).rawBody || JSON.stringify(request.body);
    const timestamp = getHeaderValue(request.headers["x-timestamp"]);
    if (!verifyWebhookSignature(rawBody, signature, installation.webhookSecret, timestamp)) {
      request.log.warn({ installationId, traceId: normalized.traceId }, "Invalid webhook signature");
      return reply.status(401).send({ error: "Invalid signature" });
    }

    const logId = nanoid();
    db.insert(messageLog)
      .values({
        id: logId,
        installationId,
        traceId: normalized.traceId || null,
        senderId: normalized.senderId || null,
        messageType: normalized.messageType || "unknown",
        rawContent: normalized.rawContent || null,
        status: "received",
        createdAt: new Date().toISOString(),
      })
      .run();

    reply.send({ status: "ok" });

    processMessage(normalized, logId, installationId).catch((err) => {
      console.error("Error processing message:", err);
    });
  });
}

function normalizeWebhookEvent(event: LegacyHubEvent | OpenILinkEnvelope): NormalizedWebhookEvent {
  if (event.type === "url_verification") {
    return {
      kind: "url_verification",
      challenge: (event as OpenILinkEnvelope).challenge || (event as LegacyHubEvent).data?.challenge,
    };
  }

  if (event.type === "event" && (event as OpenILinkEnvelope).event) {
    return normalizeOpenILinkEvent(event as OpenILinkEnvelope);
  }

  if (event.type === "message") {
    return normalizeLegacyMessage(event as LegacyHubEvent);
  }

  return { kind: "ignored" };
}

function normalizeOpenILinkEvent(envelope: OpenILinkEnvelope): NormalizedWebhookEvent {
  const event = envelope.event;
  if (!event?.type) {
    return { kind: "ignored" };
  }

  if (event.type === "command") {
    const command = event.data?.command ? `/${event.data.command}` : "";
    const text = [command, event.data?.text].filter(Boolean).join(" ").trim();
    return {
      kind: "message",
      installationId: envelope.installation_id,
      traceId: envelope.trace_id,
      senderId: event.data?.sender?.id || null,
      messageType: "text",
      rawContent: text,
      textContent: text,
    };
  }

  if (!event.type.startsWith("message.")) {
    return { kind: "ignored" };
  }

  const messageType = event.data?.msg_type || event.type.slice("message.".length) || "unknown";
  const content = event.data?.content || "";
  const firstItem = event.data?.items?.[0];
  const mediaUrl = firstItem?.media?.url;

  // Voice messages are already transcribed by the Hub: the transcript is in
  // items[0].text (and mirrored in content), so we route voice through the same
  // text-parsing path as plain text.
  const textContent =
    messageType === "text"
      ? content
      : messageType === "voice"
        ? firstItem?.text || content
        : "";

  return {
    kind: "message",
    installationId: envelope.installation_id,
    traceId: envelope.trace_id,
    senderId: event.data?.sender?.id || null,
    messageType,
    rawContent: content || null,
    textContent,
    mediaUrl,
  };
}

function normalizeLegacyMessage(event: LegacyHubEvent): NormalizedWebhookEvent {
  const message = event.data?.message;
  const messageType = message?.type || "unknown";

  return {
    kind: "message",
    installationId: event.installation_id,
    traceId: event.trace_id,
    senderId: event.data?.sender?.id || null,
    messageType,
    rawContent: message?.text || message?.voice_url || null,
    textContent: messageType === "text" ? message?.text || "" : "",
  };
}

function getHeaderValue(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

async function processMessage(event: NormalizedWebhookEvent, logId: string, installationId: string) {
  const senderId = event.senderId;
  if (!senderId) return;

  if (event.messageType === "image") {
    await processImageMessage(event, logId, installationId, senderId);
    return;
  }

  // Text and voice share the same path: voice arrives already transcribed by the
  // Hub, so textContent holds the transcript.
  if (event.messageType !== "text" && event.messageType !== "voice") {
    db.update(messageLog)
      .set({ status: "parsed", parsedResult: JSON.stringify({ note: "unsupported message type" }) })
      .where(eq(messageLog.id, logId))
      .run();
    return;
  }

  const textContent = event.textContent || "";
  if (!textContent.trim()) {
    if (event.messageType === "voice") {
      await sendBotMessage(installationId, senderId, "没听清这条语音，麻烦用文字再发一次~", event.traceId);
      db.update(messageLog)
        .set({ status: "parsed", parsedResult: JSON.stringify({ note: "empty voice transcript" }) })
        .where(eq(messageLog.id, logId))
        .run();
    }
    return;
  }

  if (textContent.startsWith("/")) {
    await handleCommand(textContent, senderId, installationId, event.traceId);
    db.update(messageLog)
      .set({ status: "saved", parsedResult: JSON.stringify({ command: textContent }) })
      .where(eq(messageLog.id, logId))
      .run();
    return;
  }

  try {
    const source = event.messageType === "voice" ? "wechat-voice" : "wechat";
    const result = await parseAndSaveMessage(textContent, senderId, source);

    db.update(messageLog)
      .set({
        status: result.success ? "saved" : "parsed",
        parsedResult: JSON.stringify(result.transaction || { note: "not a transaction" }),
      })
      .where(eq(messageLog.id, logId))
      .run();

    await sendBotMessage(installationId, senderId, result.replyMessage, event.traceId);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    db.update(messageLog)
      .set({ status: "error", errorMessage: errMsg })
      .where(eq(messageLog.id, logId))
      .run();
    await sendBotMessage(installationId, senderId, "处理消息时出错，请稍后再试", event.traceId);
  }
}

async function processImageMessage(
  event: NormalizedWebhookEvent,
  logId: string,
  installationId: string,
  senderId: string
) {
  const mediaUrl = event.mediaUrl;
  if (!mediaUrl) {
    db.update(messageLog)
      .set({ status: "parsed", parsedResult: JSON.stringify({ note: "image without media url" }) })
      .where(eq(messageLog.id, logId))
      .run();
    return;
  }

  try {
    // The Hub media URL carries a one-time token, so download it immediately and
    // pass the bytes inline to qwen3-vl-flash (DashScope can't reach the NAS URL).
    // The media endpoint requires the installation's app_token as a Bearer.
    const installation = db
      .select()
      .from(installations)
      .where(eq(installations.id, installationId))
      .get();
    const dataUrl = await downloadMediaAsDataUrl(mediaUrl, installation?.appToken);
    const parsed = await parseImageTransaction(dataUrl);

    if (!parsed) {
      db.update(messageLog)
        .set({ status: "parsed", parsedResult: JSON.stringify({ note: "no transaction in image" }) })
        .where(eq(messageLog.id, logId))
        .run();
      await sendBotMessage(
        installationId,
        senderId,
        "没在图片里识别到消费信息，可以直接发文字，或发更清晰的小票/账单截图~",
        event.traceId
      );
      return;
    }

    const result = finalizeAndSave(parsed, senderId, "[image]", "wechat-image");

    db.update(messageLog)
      .set({
        status: result.success ? "saved" : "parsed",
        parsedResult: JSON.stringify(result.transaction || { note: "not a transaction" }),
      })
      .where(eq(messageLog.id, logId))
      .run();

    await sendBotMessage(installationId, senderId, result.replyMessage, event.traceId);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error processing image message:", error);
    db.update(messageLog)
      .set({ status: "error", errorMessage: errMsg })
      .where(eq(messageLog.id, logId))
      .run();
    await sendBotMessage(installationId, senderId, "识别图片时出错，请稍后再试或改用文字记账", event.traceId);
  }
}

async function handleCommand(command: string, senderId: string, installationId: string, traceId?: string) {
  const cmd = command.trim().toLowerCase();

  if (cmd === "/help") {
    await sendBotMessage(
      installationId,
      senderId,
      `记账助手使用指南：
直接发送消费信息即可记录，例如：
  "午饭花了35块"
  "打车20元"
  "发工资了15000"
  "补录 5月20日 午饭23元"
  "昨天买菜68元"

命令：
  /help - 查看帮助
  /recent - 查看最近5笔记录
  /balance - 查看本月收支`,
      traceId
    );
  } else if (cmd === "/recent") {
    const { transactions: txTable, categories: catTable } = await import("../db/schema.js");
    const { members: memTable } = await import("../db/schema.js");
    const { desc } = await import("drizzle-orm");

    const member = db.select().from(memTable).where(eq(memTable.wechatUserId, senderId)).get();
    if (!member) {
      await sendBotMessage(installationId, senderId, "暂无记录", traceId);
      return;
    }

    const recent = db
      .select()
      .from(txTable)
      .where(eq(txTable.memberId, member.id))
      .orderBy(desc(txTable.createdAt))
      .limit(5)
      .all();

    if (recent.length === 0) {
      await sendBotMessage(installationId, senderId, "暂无记录", traceId);
      return;
    }

    const lines = recent.map((t) => {
      const cat = db.select().from(catTable).where(eq(catTable.id, t.categoryId)).get();
      const typeLabel = t.type === "expense" ? "支出" : "收入";
      return `${t.transactionDate} ${cat?.name || ""} ${typeLabel} ${t.amount.toFixed(2)}元 - ${t.description}`;
    });

    await sendBotMessage(installationId, senderId, `最近5笔记录：\n${lines.join("\n")}`, traceId);
  } else if (cmd === "/balance") {
    const { start: startDate, end: endDate } = getMonthDateRange();

    const { transactions: txTable, members: memTable } = await import("../db/schema.js");
    const { and, gte, lte, sql } = await import("drizzle-orm");

    const member = db.select().from(memTable).where(eq(memTable.wechatUserId, senderId)).get();
    if (!member) {
      await sendBotMessage(installationId, senderId, "暂无记录", traceId);
      return;
    }

    const stats = db
      .select({
        type: txTable.type,
        total: sql<number>`sum(amount)`,
      })
      .from(txTable)
      .where(
        and(
          eq(txTable.memberId, member.id),
          gte(txTable.transactionDate, startDate),
          lte(txTable.transactionDate, endDate)
        )
      )
      .groupBy(txTable.type)
      .all();

    const expense = stats.find((s) => s.type === "expense")?.total || 0;
    const income = stats.find((s) => s.type === "income")?.total || 0;

    await sendBotMessage(
      installationId,
      senderId,
      `本月收支：\n收入：${income.toFixed(2)} 元\n支出：${expense.toFixed(2)} 元\n结余：${(income - expense).toFixed(2)} 元`,
      traceId
    );
  } else {
    await sendBotMessage(installationId, senderId, `未知命令，输入 /help 查看帮助`, traceId);
  }
}

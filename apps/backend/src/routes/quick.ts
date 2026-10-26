import type { FastifyInstance, FastifyReply } from "fastify";
import { db } from "../db/connection.js";
import { members, messageLog } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { parseAndSaveMessage, finalizeAndSave, type ParseResult } from "../ai/parser.js";
import { parseImageTransaction } from "../ai/dashscope.js";
import { verifyMemberToken } from "../utils/member-token.js";

// iOS 快捷指令等外部入口：用成员密钥（不是网页登录的 JWT）认证，只能记账、不能查账。
// 回复是纯文本，快捷指令拿到后直接“显示通知”即可，不用再解析 JSON。

// base64 后要小于 DashScope 内联上限 10MB
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const MAX_TEXT_LENGTH = 500;
const RATE_LIMIT_PER_MINUTE = 20;

// 进程内的简单限流，按密钥计数。重启清零无所谓。
const recentCalls = new Map<string, number[]>();

function isRateLimited(tokenId: string): boolean {
  const now = Date.now();
  const calls = (recentCalls.get(tokenId) || []).filter((t) => now - t < 60_000);
  if (calls.length >= RATE_LIMIT_PER_MINUTE) {
    recentCalls.set(tokenId, calls);
    return true;
  }
  calls.push(now);
  recentCalls.set(tokenId, calls);
  return false;
}

function detectImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") return "image/heic";
  return null;
}

/** Accepts raw image bytes, JSON `{ text }` / `{ image: base64 }`, or plain text. */
function readInput(body: unknown): { text?: string; image?: Buffer } {
  if (Buffer.isBuffer(body)) return { image: body };
  if (typeof body === "string") return { text: body };
  if (body && typeof body === "object") {
    const { text, image } = body as { text?: unknown; image?: unknown };
    if (typeof image === "string" && image.length > 0) {
      const base64 = image.replace(/^data:[^;]+;base64,/, "");
      return { image: Buffer.from(base64, "base64") };
    }
    if (typeof text === "string") return { text };
  }
  return {};
}

function sendText(reply: FastifyReply, status: number, message: string) {
  return reply.status(status).type("text/plain; charset=utf-8").send(message);
}

export async function quickEntryRoutes(app: FastifyInstance) {
  // 快捷指令“请求体：文件”会把图片原样发上来
  app.addContentTypeParser(
    /^(image\/.*|application\/octet-stream)$/,
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body)
  );

  app.post("/record", { bodyLimit: 12 * 1024 * 1024 }, async (request, reply) => {
    const auth = request.headers.authorization || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    const tokenRecord = token ? verifyMemberToken(token) : null;
    if (!tokenRecord) {
      return sendText(reply, 401, "密钥无效或已作废，请在网页「成员管理」重新生成");
    }
    if (isRateLimited(tokenRecord.id)) {
      return sendText(reply, 429, "记得太快了，请一分钟后再试");
    }

    const member = db.select().from(members).where(eq(members.id, tokenRecord.memberId)).get();
    if (!member) {
      return sendText(reply, 401, "密钥对应的成员不存在，请重新生成密钥");
    }

    const { text, image } = readInput(request.body);
    const trimmed = text?.trim() || "";
    if (!image && !trimmed) {
      return sendText(reply, 400, "没有收到内容，请说一句或输入一笔账，比如“午饭 35”");
    }
    if (trimmed.length > MAX_TEXT_LENGTH) {
      return sendText(reply, 400, `内容太长了，请控制在 ${MAX_TEXT_LENGTH} 字以内`);
    }

    const logId = nanoid();
    db.insert(messageLog)
      .values({
        id: logId,
        installationId: "shortcut",
        traceId: null,
        senderId: member.name,
        messageType: image ? "image" : "text",
        rawContent: image ? `[图片 ${Math.round(image.length / 1024)}KB]` : trimmed,
        status: "received",
        createdAt: new Date().toISOString(),
      })
      .run();

    let result: ParseResult;
    try {
      result = image
        ? await recordImage(image, member.id)
        : await parseAndSaveMessage(trimmed, { memberId: member.id }, "shortcut");
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      request.log.error({ err: error }, "Shortcut record failed");
      db.update(messageLog)
        .set({ status: "error", errorMessage: errMsg })
        .where(eq(messageLog.id, logId))
        .run();
      return sendText(reply, 200, "处理时出错，请稍后再试");
    }

    db.update(messageLog)
      .set({
        status: result.success ? "saved" : "parsed",
        parsedResult: JSON.stringify(result.transaction || { note: "not a transaction" }),
      })
      .where(eq(messageLog.id, logId))
      .run();

    const message = result.success ? `${result.replyMessage} · ${member.name}` : result.replyMessage;
    return sendText(reply, 200, message);
  });
}

async function recordImage(image: Buffer, memberId: string): Promise<ParseResult> {
  if (image.length > MAX_IMAGE_BYTES) {
    return { success: false, replyMessage: "图片太大了，请在快捷指令里先把图片缩小再发" };
  }
  const mime = detectImageMime(image);
  if (!mime) {
    return { success: false, replyMessage: "无法识别这个文件，请发送截图或照片" };
  }
  if (mime === "image/heic") {
    return { success: false, replyMessage: "暂不支持 HEIC 格式，请在快捷指令里先把图片转换为 JPEG" };
  }

  const parsed = await parseImageTransaction(`data:${mime};base64,${image.toString("base64")}`);
  if (!parsed) {
    return {
      success: false,
      replyMessage: "没在图片里识别到消费信息，可以直接说一句，或换一张更清晰的小票/账单截图",
    };
  }
  return finalizeAndSave(parsed, { memberId }, "[image]", "shortcut-image");
}

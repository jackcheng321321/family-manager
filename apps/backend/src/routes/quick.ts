import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/connection.js";
import { members, messageLog } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  parseAndSaveMessage,
  finalizeAndSave,
  type ParseResult,
  type RawParsedTransaction,
} from "../ai/parser.js";
import { parseImageTransaction } from "../ai/dashscope.js";
import { verifyMemberToken } from "../utils/member-token.js";
import { normalizeDateString } from "../utils/date.js";

// iOS 快捷指令等外部入口：用成员密钥（不是网页登录的 JWT）认证，只能记账、不能查账。
// /record 直接记账，回复纯文本，快捷指令拿到后直接“显示通知”即可。
// /preview + /confirm 是“先识别、再确认”：截图先识别出草稿，用户在手机上点确认才入账。

// base64 后要小于 DashScope 内联上限 10MB
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const MAX_TEXT_LENGTH = 500;
const RATE_LIMIT_PER_MINUTE = 20;
const DRAFT_TTL_MS = 15 * 60 * 1000;
const IMAGE_BODY_LIMIT = 12 * 1024 * 1024;

// 进程内的简单限流，按密钥计数。重启清零无所谓。
const recentCalls = new Map<string, number[]>();

// 识别出来、等待确认的草稿。只放内存，重启或超时后让用户重新截图即可。
interface Draft {
  memberId: string;
  parsed: RawParsedTransaction;
  logId: string;
  expiresAt: number;
}
const drafts = new Map<string, Draft>();

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

function pruneDrafts() {
  const now = Date.now();
  for (const [id, draft] of drafts) {
    if (draft.expiresAt < now) drafts.delete(id);
  }
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

/** Returns a data URL for the vision model, or a user-facing reason the image can't be used. */
function toImageDataUrl(image: Buffer): { dataUrl: string } | { error: string } {
  if (image.length > MAX_IMAGE_BYTES) {
    return { error: "图片太大了，请在快捷指令里先把图片缩小再发" };
  }
  const mime = detectImageMime(image);
  if (!mime) {
    return { error: "无法识别这个文件，请发送截图或照片" };
  }
  if (mime === "image/heic") {
    return { error: "暂不支持 HEIC 格式，请在快捷指令里先把图片转换为 JPEG" };
  }
  return { dataUrl: `data:${mime};base64,${image.toString("base64")}` };
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

type Member = typeof members.$inferSelect;
type AuthResult = { member: Member } | { status: number; message: string };

/** Token check + rate limit shared by every quick-entry endpoint. */
function authenticate(request: FastifyRequest): AuthResult {
  const auth = request.headers.authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const tokenRecord = token ? verifyMemberToken(token) : null;
  if (!tokenRecord) {
    return { status: 401, message: "密钥无效或已作废，请在网页「成员管理」重新生成" };
  }
  if (isRateLimited(tokenRecord.id)) {
    return { status: 429, message: "记得太快了，请一分钟后再试" };
  }
  const member = db.select().from(members).where(eq(members.id, tokenRecord.memberId)).get();
  if (!member) {
    return { status: 401, message: "密钥对应的成员不存在，请重新生成密钥" };
  }
  return { member };
}

function insertLog(member: Member, messageType: "text" | "image", rawContent: string): string {
  const logId = nanoid();
  db.insert(messageLog)
    .values({
      id: logId,
      installationId: "shortcut",
      traceId: null,
      senderId: member.name,
      messageType,
      rawContent,
      status: "received",
      createdAt: new Date().toISOString(),
    })
    .run();
  return logId;
}

function updateLog(logId: string, values: Partial<typeof messageLog.$inferInsert>) {
  db.update(messageLog).set(values).where(eq(messageLog.id, logId)).run();
}

function imageLogLabel(image: Buffer) {
  return `[图片 ${Math.round(image.length / 1024)}KB]`;
}

/** “支出 35.00 元 · 餐饮 · 午饭（10月25日）” — shown in the confirm prompt on the phone. */
function describeDraft(parsed: RawParsedTransaction): { summary: string; text: string } {
  const typeLabel = parsed.type === "income" ? "收入" : "支出";
  const date = normalizeDateString(parsed.transactionDate || parsed.transaction_date);
  const dateLabel = date ? `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日` : "";
  const parts = [`${typeLabel} ${parsed.amount.toFixed(2)} 元`, parsed.category, parsed.description].filter(Boolean);
  return {
    summary: parts.join(" · ") + (dateLabel ? `（${dateLabel}）` : ""),
    // 「改一下再记」时的默认内容，会走文字记账重新解析
    text: [dateLabel, parsed.description, String(parsed.amount)].filter(Boolean).join(" "),
  };
}

export async function quickEntryRoutes(app: FastifyInstance) {
  // 快捷指令“请求体：文件”会把图片原样发上来
  app.addContentTypeParser(
    /^(image\/.*|application\/octet-stream)$/,
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body)
  );

  app.post("/record", { bodyLimit: IMAGE_BODY_LIMIT }, async (request, reply) => {
    const authResult = authenticate(request);
    if (!("member" in authResult)) {
      return sendText(reply, authResult.status, authResult.message);
    }
    const { member } = authResult;

    const { text, image } = readInput(request.body);
    const trimmed = text?.trim() || "";
    if (!image && !trimmed) {
      return sendText(reply, 400, "没有收到内容，请说一句或输入一笔账，比如“午饭 35”");
    }
    if (trimmed.length > MAX_TEXT_LENGTH) {
      return sendText(reply, 400, `内容太长了，请控制在 ${MAX_TEXT_LENGTH} 字以内`);
    }

    const logId = insertLog(member, image ? "image" : "text", image ? imageLogLabel(image) : trimmed);

    let result: ParseResult;
    try {
      result = image
        ? await recordImage(image, member.id)
        : await parseAndSaveMessage(trimmed, { memberId: member.id }, "shortcut");
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      request.log.error({ err: error }, "Shortcut record failed");
      updateLog(logId, { status: "error", errorMessage: errMsg });
      return sendText(reply, 200, "处理时出错，请稍后再试");
    }

    updateLog(logId, {
      status: result.success ? "saved" : "parsed",
      parsedResult: JSON.stringify(result.transaction || { note: "not a transaction" }),
    });

    const message = result.success ? `${result.replyMessage} · ${member.name}` : result.replyMessage;
    return sendText(reply, 200, message);
  });

  // 截图先识别，不入账。返回 JSON，快捷指令按 status 分支：
  //   found → 弹窗确认（带 draftId、summary、text）
  //   none  → 不是账单，快捷指令安静结束
  //   error → 显示 message
  app.post("/preview", { bodyLimit: IMAGE_BODY_LIMIT }, async (request, reply) => {
    const authResult = authenticate(request);
    if (!("member" in authResult)) {
      return reply.status(authResult.status).send({ status: "error", message: authResult.message });
    }
    const { member } = authResult;

    const { image } = readInput(request.body);
    if (!image || image.length === 0) {
      return reply.status(400).send({ status: "error", message: "没有收到图片，请检查快捷指令的请求体是否选了「文件」" });
    }
    const checked = toImageDataUrl(image);
    if ("error" in checked) {
      return { status: "error", message: checked.error };
    }

    const logId = insertLog(member, "image", imageLogLabel(image));
    let parsed: RawParsedTransaction | null;
    try {
      parsed = await parseImageTransaction(checked.dataUrl);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      request.log.error({ err: error }, "Shortcut preview failed");
      updateLog(logId, { status: "error", errorMessage: errMsg });
      return { status: "error", message: "识别时出错，请稍后再试" };
    }

    if (!parsed || typeof parsed.amount !== "number" || !(parsed.amount > 0)) {
      updateLog(logId, { status: "parsed", parsedResult: JSON.stringify({ note: "not a transaction" }) });
      return { status: "none", message: "这张图里没有识别到账单" };
    }

    pruneDrafts();
    const draftId = nanoid();
    drafts.set(draftId, { memberId: member.id, parsed, logId, expiresAt: Date.now() + DRAFT_TTL_MS });
    updateLog(logId, { status: "parsed", parsedResult: JSON.stringify(parsed) });

    return { status: "found", draftId, member: member.name, ...describeDraft(parsed) };
  });

  // 用户在手机上点了“记这笔”，把 /preview 的草稿入账
  app.post("/confirm", async (request, reply) => {
    const authResult = authenticate(request);
    if (!("member" in authResult)) {
      return sendText(reply, authResult.status, authResult.message);
    }
    const { member } = authResult;

    const draftId = (request.body as { draftId?: unknown } | undefined)?.draftId;
    pruneDrafts();
    const draft = typeof draftId === "string" ? drafts.get(draftId) : undefined;
    if (!draft || draft.memberId !== member.id) {
      return sendText(reply, 404, "这笔已经记过了，或者确认超时（15 分钟），请重新截图");
    }
    drafts.delete(draftId as string);

    const result = finalizeAndSave(draft.parsed, { memberId: member.id }, "[image]", "shortcut-image");
    updateLog(draft.logId, {
      status: result.success ? "saved" : "parsed",
      parsedResult: JSON.stringify(result.transaction || draft.parsed),
    });

    const message = result.success ? `${result.replyMessage} · ${member.name}` : result.replyMessage;
    return sendText(reply, 200, message);
  });
}

async function recordImage(image: Buffer, memberId: string): Promise<ParseResult> {
  const checked = toImageDataUrl(image);
  if ("error" in checked) {
    return { success: false, replyMessage: checked.error };
  }

  const parsed = await parseImageTransaction(checked.dataUrl);
  if (!parsed) {
    return {
      success: false,
      replyMessage: "没在图片里识别到消费信息，可以直接说一句，或换一张更清晰的小票/账单截图",
    };
  }
  return finalizeAndSave(parsed, { memberId }, "[image]", "shortcut-image");
}

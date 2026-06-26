import type { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "../db/connection.js";
import { healthCheckups, healthCheckupItems, members } from "../db/schema.js";
import { eq, desc, and, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import { authGuard } from "../middleware/auth.js";
import { readFileSync } from "fs";
import {
  saveBuffer,
  resolveStoredPath,
  deleteStoredFile,
  guessMimeType,
} from "../health/storage.js";
import { extractPdfText } from "../health/pdf.js";
import { parseCheckupText } from "../ai/health-parser.js";
import type { ParsedCheckup } from "@caiwu/shared";

const now = () => new Date().toISOString();

/** 收集 multipart 请求里的字段和第一个文件。 */
async function collectMultipart(request: FastifyRequest): Promise<{
  fields: Record<string, string>;
  file?: { buffer: Buffer; filename: string; mimetype: string };
}> {
  const fields: Record<string, string> = {};
  let file: { buffer: Buffer; filename: string; mimetype: string } | undefined;
  const parts = request.parts();
  for await (const part of parts) {
    if (part.type === "file") {
      if (!file) {
        const buffer = await part.toBuffer();
        file = { buffer, filename: part.filename || "upload", mimetype: part.mimetype };
      } else {
        await part.toBuffer(); // 丢弃多余文件，但必须消费掉流
      }
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }
  return { fields, file };
}

/** 把 AI 解析结果写入明细表，并回填体检主表的总结字段。 */
function applyParsedCheckup(checkupId: string, parsed: ParsedCheckup) {
  // 先清掉旧明细（重解析场景）
  db.delete(healthCheckupItems).where(eq(healthCheckupItems.checkupId, checkupId)).run();
  const items = parsed.items || [];
  items.forEach((it, idx) => {
    db.insert(healthCheckupItems)
      .values({
        id: nanoid(),
        checkupId,
        groupName: it.groupName ?? null,
        itemName: it.itemName,
        result: it.result ?? null,
        unit: it.unit ?? null,
        referenceRange: it.referenceRange ?? null,
        flag: it.flag ?? "unknown",
        sortOrder: idx,
        createdAt: now(),
      })
      .run();
  });
}

export async function healthCheckupRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // 列表：可按成员、年份筛选
  app.get<{ Querystring: { memberId?: string; year?: string } }>("/", async (request) => {
    const { memberId, year } = request.query;
    const conditions = [];
    if (memberId) conditions.push(eq(healthCheckups.memberId, memberId));
    if (year) conditions.push(like(healthCheckups.checkupDate, `${year}%`));
    const where = conditions.length ? and(...conditions) : undefined;
    const rows = db
      .select({
        checkup: healthCheckups,
        memberName: members.name,
      })
      .from(healthCheckups)
      .leftJoin(members, eq(healthCheckups.memberId, members.id))
      .where(where)
      .orderBy(desc(healthCheckups.checkupDate))
      .all();
    return rows.map((r) => ({ ...r.checkup, memberName: r.memberName }));
  });

  // 详情：含明细项
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const checkup = db.select().from(healthCheckups).where(eq(healthCheckups.id, request.params.id)).get();
    if (!checkup) return reply.status(404).send({ error: "Not found" });
    const items = db
      .select()
      .from(healthCheckupItems)
      .where(eq(healthCheckupItems.checkupId, checkup.id))
      .orderBy(healthCheckupItems.sortOrder)
      .all();
    return { ...checkup, items };
  });

  // 上传体检报告（PDF）并尝试自动解析
  app.post("/", async (request, reply) => {
    const { fields, file } = await collectMultipart(request);
    const memberId = fields.memberId;
    if (!memberId) return reply.status(400).send({ error: "memberId 必填" });
    const member = db.select().from(members).where(eq(members.id, memberId)).get();
    if (!member) return reply.status(400).send({ error: "成员不存在" });

    const id = nanoid();
    let filePath: string | null = null;
    if (file) {
      filePath = saveBuffer(`checkups/${id}`, file.buffer, file.filename);
    }

    // 先用上传时填写的值兜底
    let checkupDate = fields.checkupDate || "";
    let institution = fields.institution || null;
    let overallSummary: string | null = null;
    let abnormalSummary: string | null = null;
    let parsedName: string | null = null;
    let rawText: string | null = null;
    let status = "pending";
    let parseMessage: string | null = null;
    let aiModel: string | null = null;
    let parsed: ParsedCheckup | null = null;

    if (file && file.filename.toLowerCase().endsWith(".pdf")) {
      try {
        const extract = await extractPdfText(file.buffer);
        rawText = extract.text.slice(0, 20000);
        if (extract.hasText) {
          status = "parsing";
          parsed = await parseCheckupText(extract.text);
          if (parsed) {
            aiModel = "deepseek";
            parsedName = parsed.patientName ?? null;
            if (!checkupDate && parsed.checkupDate) checkupDate = parsed.checkupDate;
            if (!institution && parsed.institution) institution = parsed.institution;
            overallSummary = parsed.overallSummary ?? null;
            abnormalSummary = parsed.abnormalSummary ?? null;
            status = "done";
          } else {
            status = "needs_manual";
            parseMessage = "AI 未能解析出结构化结果，请手动补充";
          }
        } else {
          status = "needs_manual";
          parseMessage = "未能从 PDF 提取到文字（可能是扫描件），请手动补充明细";
        }
      } catch (err) {
        console.error("checkup parse error:", err);
        status = "needs_manual";
        parseMessage = "解析体检报告出错，请手动补充；文件已保存";
      }
    } else if (file) {
      status = "needs_manual";
      parseMessage = "非 PDF 文件已存档，请手动补充明细";
    } else {
      status = "needs_manual";
    }

    if (!checkupDate) checkupDate = now().slice(0, 10);

    db.insert(healthCheckups)
      .values({
        id,
        memberId,
        checkupDate,
        institution,
        parsedName,
        filePath,
        originalFileName: file?.filename ?? null,
        overallSummary,
        abnormalSummary,
        rawText,
        status,
        aiModel,
        parseMessage,
        note: fields.note || null,
        createdAt: now(),
        updatedAt: now(),
      })
      .run();

    if (parsed) applyParsedCheckup(id, parsed);

    const items = db
      .select()
      .from(healthCheckupItems)
      .where(eq(healthCheckupItems.checkupId, id))
      .orderBy(healthCheckupItems.sortOrder)
      .all();
    const created = db.select().from(healthCheckups).where(eq(healthCheckups.id, id)).get();
    return { ...created, items };
  });

  // 重新解析（基于已存 rawText 或重新读取文件）
  app.post<{ Params: { id: string } }>("/:id/reparse", async (request, reply) => {
    const checkup = db.select().from(healthCheckups).where(eq(healthCheckups.id, request.params.id)).get();
    if (!checkup) return reply.status(404).send({ error: "Not found" });

    let text = checkup.rawText || "";
    if (!text && checkup.filePath) {
      const abs = resolveStoredPath(checkup.filePath);
      if (abs && abs.toLowerCase().endsWith(".pdf")) {
        try {
          const extract = await extractPdfText(readFileSync(abs));
          text = extract.text;
        } catch {
          // ignore
        }
      }
    }
    if (!text) return reply.status(400).send({ error: "没有可用于解析的文本" });

    const parsed = await parseCheckupText(text);
    if (!parsed) {
      db.update(healthCheckups)
        .set({ status: "needs_manual", parseMessage: "AI 未能解析，请手动补充", updatedAt: now() })
        .where(eq(healthCheckups.id, checkup.id))
        .run();
      return reply.status(422).send({ error: "AI 未能解析出结构化结果" });
    }
    applyParsedCheckup(checkup.id, parsed);
    db.update(healthCheckups)
      .set({
        parsedName: parsed.patientName ?? checkup.parsedName,
        institution: parsed.institution ?? checkup.institution,
        checkupDate: parsed.checkupDate || checkup.checkupDate,
        overallSummary: parsed.overallSummary ?? null,
        abnormalSummary: parsed.abnormalSummary ?? null,
        status: "done",
        aiModel: "deepseek",
        parseMessage: null,
        updatedAt: now(),
      })
      .where(eq(healthCheckups.id, checkup.id))
      .run();

    const items = db
      .select()
      .from(healthCheckupItems)
      .where(eq(healthCheckupItems.checkupId, checkup.id))
      .orderBy(healthCheckupItems.sortOrder)
      .all();
    const updated = db.select().from(healthCheckups).where(eq(healthCheckups.id, checkup.id)).get();
    return { ...updated, items };
  });

  // 更新主表字段
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = db.select().from(healthCheckups).where(eq(healthCheckups.id, id)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });
    const allowed = [
      "memberId",
      "checkupDate",
      "institution",
      "parsedName",
      "overallSummary",
      "abnormalSummary",
      "status",
      "note",
    ];
    const updates: Record<string, unknown> = { updatedAt: now() };
    for (const key of allowed) {
      if (request.body[key] !== undefined) updates[key] = request.body[key];
    }
    db.update(healthCheckups).set(updates).where(eq(healthCheckups.id, id)).run();
    return db.select().from(healthCheckups).where(eq(healthCheckups.id, id)).get();
  });

  // 删除
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = db.select().from(healthCheckups).where(eq(healthCheckups.id, id)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });
    deleteStoredFile(existing.filePath);
    db.delete(healthCheckupItems).where(eq(healthCheckupItems.checkupId, id)).run();
    db.delete(healthCheckups).where(eq(healthCheckups.id, id)).run();
    return { success: true };
  });

  // 下载/预览原始 PDF（前端带 token fetch 后转 blob 展示）
  app.get<{ Params: { id: string } }>("/:id/file", async (request, reply) => {
    const checkup = db.select().from(healthCheckups).where(eq(healthCheckups.id, request.params.id)).get();
    if (!checkup || !checkup.filePath) return reply.status(404).send({ error: "No file" });
    const abs = resolveStoredPath(checkup.filePath);
    if (!abs) return reply.status(404).send({ error: "File missing" });
    reply.header("Content-Type", guessMimeType(checkup.originalFileName || abs));
    reply.header(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(checkup.originalFileName || "report.pdf")}"`
    );
    return reply.send(readFileSync(abs));
  });

  // ---- 明细项的增 / 改 / 删（用于手动修正） ----

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/:id/items", async (request, reply) => {
    const checkup = db.select().from(healthCheckups).where(eq(healthCheckups.id, request.params.id)).get();
    if (!checkup) return reply.status(404).send({ error: "Not found" });
    const b = request.body;
    if (!b.itemName) return reply.status(400).send({ error: "itemName 必填" });
    const maxOrder = db
      .select()
      .from(healthCheckupItems)
      .where(eq(healthCheckupItems.checkupId, checkup.id))
      .all().length;
    const itemId = nanoid();
    db.insert(healthCheckupItems)
      .values({
        id: itemId,
        checkupId: checkup.id,
        groupName: (b.groupName as string) ?? null,
        itemName: b.itemName as string,
        result: (b.result as string) ?? null,
        unit: (b.unit as string) ?? null,
        referenceRange: (b.referenceRange as string) ?? null,
        flag: (b.flag as string) ?? "unknown",
        note: (b.note as string) ?? null,
        sortOrder: maxOrder,
        createdAt: now(),
      })
      .run();
    return db.select().from(healthCheckupItems).where(eq(healthCheckupItems.id, itemId)).get();
  });

  app.put<{ Params: { itemId: string }; Body: Record<string, unknown> }>("/items/:itemId", async (request, reply) => {
    const { itemId } = request.params;
    const existing = db.select().from(healthCheckupItems).where(eq(healthCheckupItems.id, itemId)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });
    const allowed = ["groupName", "itemName", "result", "unit", "referenceRange", "flag", "note", "sortOrder"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (request.body[key] !== undefined) updates[key] = request.body[key];
    }
    db.update(healthCheckupItems).set(updates).where(eq(healthCheckupItems.id, itemId)).run();
    return db.select().from(healthCheckupItems).where(eq(healthCheckupItems.id, itemId)).get();
  });

  app.delete<{ Params: { itemId: string } }>("/items/:itemId", async (request, reply) => {
    const { itemId } = request.params;
    const existing = db.select().from(healthCheckupItems).where(eq(healthCheckupItems.id, itemId)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });
    db.delete(healthCheckupItems).where(eq(healthCheckupItems.id, itemId)).run();
    return { success: true };
  });
}

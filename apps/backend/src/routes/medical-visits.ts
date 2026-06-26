import type { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "../db/connection.js";
import {
  medicalVisits,
  medicalVisitAttachments,
  medicalVisitMedications,
  members,
} from "../db/schema.js";
import { eq, desc, and, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import { authGuard } from "../middleware/auth.js";
import { readFileSync } from "fs";
import {
  saveBuffer,
  resolveStoredPath,
  deleteStoredFile,
  guessMimeType,
  isImageName,
} from "../health/storage.js";
import { parseVisitImage } from "../ai/health-parser.js";

const now = () => new Date().toISOString();

interface MedicationInput {
  drugName: string;
  spec?: string;
  dosage?: string;
  quantity?: string;
  note?: string;
}

/** 用传入的用药数组整体替换某次就诊的用药记录。 */
function replaceMedications(visitId: string, meds: MedicationInput[] | undefined) {
  if (!Array.isArray(meds)) return;
  db.delete(medicalVisitMedications).where(eq(medicalVisitMedications.visitId, visitId)).run();
  meds
    .filter((m) => m && m.drugName)
    .forEach((m, idx) => {
      db.insert(medicalVisitMedications)
        .values({
          id: nanoid(),
          visitId,
          drugName: m.drugName,
          spec: m.spec ?? null,
          dosage: m.dosage ?? null,
          quantity: m.quantity ?? null,
          note: m.note ?? null,
          sortOrder: idx,
          createdAt: now(),
        })
        .run();
    });
}

function loadFull(visitId: string) {
  const visit = db.select().from(medicalVisits).where(eq(medicalVisits.id, visitId)).get();
  if (!visit) return null;
  const attachments = db
    .select()
    .from(medicalVisitAttachments)
    .where(eq(medicalVisitAttachments.visitId, visitId))
    .all();
  const medications = db
    .select()
    .from(medicalVisitMedications)
    .where(eq(medicalVisitMedications.visitId, visitId))
    .orderBy(medicalVisitMedications.sortOrder)
    .all();
  return { ...visit, attachments, medications };
}

async function collectOneFile(request: FastifyRequest): Promise<{
  fields: Record<string, string>;
  file?: { buffer: Buffer; filename: string; mimetype: string };
}> {
  const fields: Record<string, string> = {};
  let file: { buffer: Buffer; filename: string; mimetype: string } | undefined;
  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (!file) {
        const buffer = await part.toBuffer();
        file = { buffer, filename: part.filename || "upload", mimetype: part.mimetype };
      } else {
        await part.toBuffer();
      }
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }
  return { fields, file };
}

export async function medicalVisitRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // 列表
  app.get<{ Querystring: { memberId?: string; hospital?: string; year?: string } }>(
    "/",
    async (request) => {
      const { memberId, hospital, year } = request.query;
      const conditions = [];
      if (memberId) conditions.push(eq(medicalVisits.memberId, memberId));
      if (hospital) conditions.push(like(medicalVisits.hospital, `%${hospital}%`));
      if (year) conditions.push(like(medicalVisits.visitDate, `${year}%`));
      const where = conditions.length ? and(...conditions) : undefined;
      const rows = db
        .select({ visit: medicalVisits, memberName: members.name })
        .from(medicalVisits)
        .leftJoin(members, eq(medicalVisits.memberId, members.id))
        .where(where)
        .orderBy(desc(medicalVisits.visitDate))
        .all();
      // 附带用药/附件数量，列表展示用
      return rows.map((r) => {
        const attachmentCount = db
          .select()
          .from(medicalVisitAttachments)
          .where(eq(medicalVisitAttachments.visitId, r.visit.id))
          .all().length;
        const medicationCount = db
          .select()
          .from(medicalVisitMedications)
          .where(eq(medicalVisitMedications.visitId, r.visit.id))
          .all().length;
        return { ...r.visit, memberName: r.memberName, attachmentCount, medicationCount };
      });
    }
  );

  // 详情
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const full = loadFull(request.params.id);
    if (!full) return reply.status(404).send({ error: "Not found" });
    return full;
  });

  // 新建就诊记录（JSON）
  app.post<{ Body: Record<string, unknown> & { medications?: MedicationInput[] } }>(
    "/",
    async (request, reply) => {
      const b = request.body;
      if (!b.memberId) return reply.status(400).send({ error: "memberId 必填" });
      const member = db.select().from(members).where(eq(members.id, b.memberId as string)).get();
      if (!member) return reply.status(400).send({ error: "成员不存在" });

      const id = nanoid();
      db.insert(medicalVisits)
        .values({
          id,
          memberId: b.memberId as string,
          visitDate: (b.visitDate as string) || now().slice(0, 10),
          hospital: (b.hospital as string) ?? null,
          department: (b.department as string) ?? null,
          chiefComplaint: (b.chiefComplaint as string) ?? null,
          examinations: (b.examinations as string) ?? null,
          diagnosis: (b.diagnosis as string) ?? null,
          treatment: (b.treatment as string) ?? null,
          followUp: (b.followUp as string) ?? null,
          cost: b.cost != null ? Number(b.cost) : null,
          note: (b.note as string) ?? null,
          createdAt: now(),
          updatedAt: now(),
        })
        .run();
      replaceMedications(id, b.medications);
      return loadFull(id);
    }
  );

  // 更新就诊记录
  app.put<{ Params: { id: string }; Body: Record<string, unknown> & { medications?: MedicationInput[] } }>(
    "/:id",
    async (request, reply) => {
      const { id } = request.params;
      const existing = db.select().from(medicalVisits).where(eq(medicalVisits.id, id)).get();
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const allowed = [
        "memberId",
        "visitDate",
        "hospital",
        "department",
        "chiefComplaint",
        "examinations",
        "diagnosis",
        "treatment",
        "followUp",
        "cost",
        "note",
      ];
      const updates: Record<string, unknown> = { updatedAt: now() };
      for (const key of allowed) {
        if (request.body[key] !== undefined) {
          updates[key] = key === "cost" ? Number(request.body[key]) : request.body[key];
        }
      }
      db.update(medicalVisits).set(updates).where(eq(medicalVisits.id, id)).run();
      if (request.body.medications !== undefined) replaceMedications(id, request.body.medications);
      return loadFull(id);
    }
  );

  // 删除就诊记录（连带附件文件、用药）
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = db.select().from(medicalVisits).where(eq(medicalVisits.id, id)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });
    const atts = db
      .select()
      .from(medicalVisitAttachments)
      .where(eq(medicalVisitAttachments.visitId, id))
      .all();
    for (const a of atts) deleteStoredFile(a.filePath);
    db.delete(medicalVisitAttachments).where(eq(medicalVisitAttachments.visitId, id)).run();
    db.delete(medicalVisitMedications).where(eq(medicalVisitMedications.visitId, id)).run();
    db.delete(medicalVisits).where(eq(medicalVisits.id, id)).run();
    return { success: true };
  });

  // 上传附件（检查图/化验单/处方/票据），可选自动 OCR
  app.post<{ Params: { id: string } }>("/:id/attachments", async (request, reply) => {
    const visit = db.select().from(medicalVisits).where(eq(medicalVisits.id, request.params.id)).get();
    if (!visit) return reply.status(404).send({ error: "Not found" });
    const { fields, file } = await collectOneFile(request);
    if (!file) return reply.status(400).send({ error: "未收到文件" });

    const filePath = saveBuffer(`visits/${visit.id}`, file.buffer, file.filename);
    const type = fields.type || "other";
    const caption = fields.caption || null;

    // 可选 OCR：仅对图片执行
    let ocrText: string | null = null;
    let suggestion = null;
    if (fields.ocr === "true" && isImageName(file.filename)) {
      try {
        const mime = guessMimeType(file.filename);
        const dataUrl = `data:${mime};base64,${file.buffer.toString("base64")}`;
        const parsed = await parseVisitImage(dataUrl);
        if (parsed) {
          ocrText = parsed.rawText ?? null;
          suggestion = parsed;
        }
      } catch (err) {
        console.error("visit image OCR error:", err);
      }
    }

    const attId = nanoid();
    db.insert(medicalVisitAttachments)
      .values({
        id: attId,
        visitId: visit.id,
        type,
        filePath,
        originalFileName: file.filename,
        ocrText,
        caption,
        createdAt: now(),
      })
      .run();

    const attachment = db
      .select()
      .from(medicalVisitAttachments)
      .where(eq(medicalVisitAttachments.id, attId))
      .get();
    // suggestion 供前端预填表单（检查/诊断/用药），不自动写库
    return { attachment, suggestion };
  });

  // 读取附件文件（前端带 token fetch 转 blob 展示）
  app.get<{ Params: { attId: string } }>("/attachments/:attId/file", async (request, reply) => {
    const att = db
      .select()
      .from(medicalVisitAttachments)
      .where(eq(medicalVisitAttachments.id, request.params.attId))
      .get();
    if (!att) return reply.status(404).send({ error: "Not found" });
    const abs = resolveStoredPath(att.filePath);
    if (!abs) return reply.status(404).send({ error: "File missing" });
    reply.header("Content-Type", guessMimeType(att.originalFileName || abs));
    reply.header(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(att.originalFileName || "attachment")}"`
    );
    return reply.send(readFileSync(abs));
  });

  // 删除附件
  app.delete<{ Params: { attId: string } }>("/attachments/:attId", async (request, reply) => {
    const att = db
      .select()
      .from(medicalVisitAttachments)
      .where(eq(medicalVisitAttachments.id, request.params.attId))
      .get();
    if (!att) return reply.status(404).send({ error: "Not found" });
    deleteStoredFile(att.filePath);
    db.delete(medicalVisitAttachments).where(eq(medicalVisitAttachments.id, att.id)).run();
    return { success: true };
  });
}

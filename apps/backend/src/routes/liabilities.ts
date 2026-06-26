import type { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { liabilities } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { authGuard } from "../middleware/auth.js";

interface LiabilityBody {
  type: string;
  name: string;
  balance: number;
  originalAmount?: number;
  interestRate?: number;
  monthlyPayment?: number;
  memberId?: string;
  linkedAssetId?: string;
  note?: string;
}

export async function liabilityRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get<{ Querystring: { type?: string; memberId?: string; isActive?: string } }>("/", async (request) => {
    const { type, memberId, isActive } = request.query;
    const conditions = [];
    if (type) conditions.push(eq(liabilities.type, type));
    if (memberId) conditions.push(eq(liabilities.memberId, memberId));
    if (isActive !== undefined) conditions.push(eq(liabilities.isActive, isActive === "true"));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(liabilities).where(where).all();
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const row = db.select().from(liabilities).where(eq(liabilities.id, request.params.id)).get();
    if (!row) return reply.status(404).send({ error: "Not found" });
    return row;
  });

  app.post<{ Body: LiabilityBody }>("/", async (request) => {
    const body = request.body;
    const id = nanoid();
    const now = new Date().toISOString();
    db.insert(liabilities)
      .values({
        id,
        type: body.type,
        name: body.name,
        balance: body.balance,
        originalAmount: body.originalAmount ?? null,
        interestRate: body.interestRate ?? null,
        monthlyPayment: body.monthlyPayment ?? null,
        memberId: body.memberId ?? null,
        linkedAssetId: body.linkedAssetId ?? null,
        note: body.note ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return db.select().from(liabilities).where(eq(liabilities.id, id)).get();
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = db.select().from(liabilities).where(eq(liabilities.id, id)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const allowed = [
      "type",
      "name",
      "balance",
      "originalAmount",
      "interestRate",
      "monthlyPayment",
      "memberId",
      "linkedAssetId",
      "note",
      "isActive",
    ];
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const key of allowed) {
      if (request.body[key] !== undefined) updates[key] = request.body[key];
    }

    db.update(liabilities).set(updates).where(eq(liabilities.id, id)).run();
    return db.select().from(liabilities).where(eq(liabilities.id, id)).get();
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = db.select().from(liabilities).where(eq(liabilities.id, id)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });
    db.delete(liabilities).where(eq(liabilities.id, id)).run();
    return { success: true };
  });
}

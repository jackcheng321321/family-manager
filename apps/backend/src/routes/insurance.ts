import type { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { insurancePolicies } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { authGuard } from "../middleware/auth.js";

interface InsuranceBody {
  name: string;
  category: string;
  insuredMemberId?: string;
  insurer?: string;
  coverageAmount?: number;
  premium?: number;
  premiumFrequency?: string;
  cashValue?: number;
  startDate?: string;
  endDate?: string;
  note?: string;
}

export async function insuranceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get<{ Querystring: { category?: string; insuredMemberId?: string; isActive?: string } }>("/", async (request) => {
    const { category, insuredMemberId, isActive } = request.query;
    const conditions = [];
    if (category) conditions.push(eq(insurancePolicies.category, category));
    if (insuredMemberId) conditions.push(eq(insurancePolicies.insuredMemberId, insuredMemberId));
    if (isActive !== undefined) conditions.push(eq(insurancePolicies.isActive, isActive === "true"));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(insurancePolicies).where(where).all();
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const row = db.select().from(insurancePolicies).where(eq(insurancePolicies.id, request.params.id)).get();
    if (!row) return reply.status(404).send({ error: "Not found" });
    return row;
  });

  app.post<{ Body: InsuranceBody }>("/", async (request) => {
    const body = request.body;
    const id = nanoid();
    const now = new Date().toISOString();
    db.insert(insurancePolicies)
      .values({
        id,
        name: body.name,
        category: body.category,
        insuredMemberId: body.insuredMemberId ?? null,
        insurer: body.insurer ?? null,
        coverageAmount: body.coverageAmount ?? null,
        premium: body.premium ?? null,
        premiumFrequency: body.premiumFrequency ?? null,
        cashValue: body.cashValue ?? null,
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
        note: body.note ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return db.select().from(insurancePolicies).where(eq(insurancePolicies.id, id)).get();
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = db.select().from(insurancePolicies).where(eq(insurancePolicies.id, id)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const allowed = [
      "name",
      "category",
      "insuredMemberId",
      "insurer",
      "coverageAmount",
      "premium",
      "premiumFrequency",
      "cashValue",
      "startDate",
      "endDate",
      "note",
      "isActive",
    ];
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const key of allowed) {
      if (request.body[key] !== undefined) updates[key] = request.body[key];
    }

    db.update(insurancePolicies).set(updates).where(eq(insurancePolicies.id, id)).run();
    return db.select().from(insurancePolicies).where(eq(insurancePolicies.id, id)).get();
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = db.select().from(insurancePolicies).where(eq(insurancePolicies.id, id)).get();
    if (!existing) return reply.status(404).send({ error: "Not found" });
    db.delete(insurancePolicies).where(eq(insurancePolicies.id, id)).run();
    return { success: true };
  });
}

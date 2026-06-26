import type { FastifyInstance } from "fastify";
import { config } from "../config.js";

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { username: string; password: string } }>(
    "/login",
    async (request, reply) => {
      const { username, password } = request.body;
      if (username !== config.adminUsername || password !== config.adminPassword) {
        return reply.status(401).send({ error: "用户名或密码错误" });
      }
      const token = app.jwt.sign({ username, role: "admin" }, { expiresIn: "24h" });
      return { token, username };
    }
  );

  app.get("/me", { preHandler: [async (req, rep) => { try { await req.jwtVerify(); } catch { rep.status(401).send({ error: "Unauthorized" }); } }] }, async (request) => {
    return request.user;
  });
}

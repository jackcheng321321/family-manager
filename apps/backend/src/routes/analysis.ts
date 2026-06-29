import type { FinancialAnalysisRequest } from "@caiwu/shared";
import type { FastifyInstance } from "fastify";
import {
  generateFinancialAnalysis,
  getSavedFinancialAnalysis,
  listFinancialAnalyses,
  saveFinancialAnalysis,
} from "../ai/financial-analysis.js";
import { authGuard } from "../middleware/auth.js";

export async function analysisRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get(
    "/saved",
    {
      schema: {
        tags: ["analysis"],
        summary: "已保存的月度分析历史列表",
      },
    },
    async () => {
      return listFinancialAnalyses();
    }
  );

  app.get<{ Params: { month: string } }>(
    "/saved/:month",
    {
      schema: {
        tags: ["analysis"],
        summary: "读取某个月已保存的分析",
        params: {
          type: "object",
          required: ["month"],
          properties: {
            month: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
          },
        },
      },
    },
    async (request, reply) => {
      const saved = getSavedFinancialAnalysis(request.params.month);
      if (!saved) return reply.status(404).send({ error: "该月份还没有分析记录" });
      return saved;
    }
  );

  app.post<{ Body: FinancialAnalysisRequest }>(
    "/monthly",
    {
      schema: {
        tags: ["analysis"],
        summary: "生成某个月的 AI 财务分析",
        body: {
          type: "object",
          required: ["month"],
          properties: {
            month: {
              type: "string",
              pattern: "^\\d{4}-\\d{2}$",
              description: "月份，格式 YYYY-MM",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const month = request.body?.month;
      if (!month) return reply.status(400).send({ error: "month is required" });

      try {
        request.log.info({ month }, "Generating monthly AI financial analysis");
        const result = await generateFinancialAnalysis(month);
        saveFinancialAnalysis(result);
        request.log.info(
          {
            month: result.month,
            expenseTransactionCount: result.snapshot.expenseTransactionCount,
            totalExpense: result.snapshot.totalExpense,
          },
          "Monthly AI financial analysis generated"
        );
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI 分析生成失败";
        request.log.error({ month, error: message }, "Monthly AI financial analysis failed");
        if (message.includes("月份")) return reply.status(400).send({ error: message });
        return reply.status(500).send({ error: message });
      }
    }
  );
}

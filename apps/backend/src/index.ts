import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "./config.js";
import { seed } from "./db/seed.js";
import { sqlite } from "./db/connection.js";
import { authRoutes } from "./routes/auth.js";
import { analysisRoutes } from "./routes/analysis.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { transactionRoutes } from "./routes/transactions.js";
import { assetRoutes } from "./routes/assets.js";
import { liabilityRoutes } from "./routes/liabilities.js";
import { insuranceRoutes } from "./routes/insurance.js";
import { netWorthRoutes } from "./routes/networth.js";
import { categoryRoutes } from "./routes/categories.js";
import { accountRoutes } from "./routes/accounts.js";
import { memberRoutes } from "./routes/members.js";
import { settingRoutes } from "./routes/settings.js";
import { messageRoutes } from "./routes/messages.js";
import { healthCheckupRoutes } from "./routes/health-checkups.js";
import { medicalVisitRoutes } from "./routes/medical-visits.js";
import { hubWebhookRoutes } from "./hub/webhook.js";
import { hubOAuthRoutes } from "./hub/oauth.js";
import { hubManifestRoutes } from "./hub/manifest.js";
import { setupMonthlySummaryJob } from "./jobs/monthly-summary.js";
import { existsSync } from "fs";
import { resolve } from "path";

const app = Fastify({ logger: true });

type RawBodyRequest = FastifyRequest & { rawBody?: string };

function registerRawJsonParser() {
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const rawBody = typeof body === "string" ? body : body.toString("utf8");
    (request as RawBodyRequest).rawBody = rawBody;
    try {
      done(null, rawBody ? JSON.parse(rawBody) : null);
    } catch (error) {
      done(error as Error, undefined);
    }
  });
}

// Initialize database tables from schema
function initDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      wechat_user_id TEXT UNIQUE,
      name TEXT NOT NULL,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      icon TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id),
      account_id TEXT REFERENCES accounts(id),
      member_id TEXT NOT NULL REFERENCES members(id),
      transaction_date TEXT NOT NULL,
      note TEXT,
      source TEXT NOT NULL DEFAULT 'admin',
      ai_raw_input TEXT,
      ai_confidence REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_transactions_member ON transactions(member_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CNY',
      allocation_bucket TEXT NOT NULL DEFAULT 'stable',
      account_info TEXT,
      cost_basis REAL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      frequency TEXT,
      member_id TEXT REFERENCES members(id),
      start_date TEXT,
      end_date TEXT,
      note TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS asset_valuations (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id),
      date TEXT NOT NULL,
      value REAL NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_asset_valuations_asset ON asset_valuations(asset_id);
    CREATE TABLE IF NOT EXISTS liabilities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      balance REAL NOT NULL,
      original_amount REAL,
      interest_rate REAL,
      monthly_payment REAL,
      member_id TEXT REFERENCES members(id),
      linked_asset_id TEXT,
      note TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS insurance_policies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      insured_member_id TEXT REFERENCES members(id),
      insurer TEXT,
      coverage_amount REAL,
      premium REAL,
      premium_frequency TEXT,
      cash_value REAL,
      start_date TEXT,
      end_date TEXT,
      note TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS installations (
      id TEXT PRIMARY KEY,
      app_token TEXT NOT NULL,
      webhook_secret TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS financial_analyses (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL UNIQUE,
      analysis TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS message_log (
      id TEXT PRIMARY KEY,
      installation_id TEXT NOT NULL,
      trace_id TEXT,
      sender_id TEXT,
      message_type TEXT NOT NULL,
      raw_content TEXT,
      parsed_result TEXT,
      status TEXT NOT NULL DEFAULT 'received',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS health_checkups (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES members(id),
      checkup_date TEXT NOT NULL,
      institution TEXT,
      parsed_name TEXT,
      file_path TEXT,
      original_file_name TEXT,
      overall_summary TEXT,
      abnormal_summary TEXT,
      raw_text TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      ai_model TEXT,
      parse_message TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_health_checkups_member ON health_checkups(member_id);
    CREATE INDEX IF NOT EXISTS idx_health_checkups_date ON health_checkups(checkup_date);
    CREATE TABLE IF NOT EXISTS health_checkup_items (
      id TEXT PRIMARY KEY,
      checkup_id TEXT NOT NULL REFERENCES health_checkups(id),
      group_name TEXT,
      item_name TEXT NOT NULL,
      result TEXT,
      unit TEXT,
      reference_range TEXT,
      flag TEXT NOT NULL DEFAULT 'unknown',
      note TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_health_checkup_items_checkup ON health_checkup_items(checkup_id);
    CREATE TABLE IF NOT EXISTS medical_visits (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES members(id),
      visit_date TEXT NOT NULL,
      hospital TEXT,
      department TEXT,
      chief_complaint TEXT,
      examinations TEXT,
      diagnosis TEXT,
      treatment TEXT,
      follow_up TEXT,
      cost REAL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_medical_visits_member ON medical_visits(member_id);
    CREATE INDEX IF NOT EXISTS idx_medical_visits_date ON medical_visits(visit_date);
    CREATE TABLE IF NOT EXISTS medical_visit_attachments (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL REFERENCES medical_visits(id),
      type TEXT NOT NULL DEFAULT 'other',
      file_path TEXT NOT NULL,
      original_file_name TEXT,
      ocr_text TEXT,
      caption TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_medical_visit_attachments_visit ON medical_visit_attachments(visit_id);
    CREATE TABLE IF NOT EXISTS medical_visit_medications (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL REFERENCES medical_visits(id),
      drug_name TEXT NOT NULL,
      spec TEXT,
      dosage TEXT,
      quantity TEXT,
      note TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_medical_visit_medications_visit ON medical_visit_medications(visit_id);
  `);
  migrateAssetsTable();
}

// 给已存在的 assets 表补齐新列、迁移旧的 type 取值。幂等、非破坏，
// 完全不触碰 transactions / categories / accounts / members 等记账相关表。
function migrateAssetsTable() {
  const columns = sqlite.prepare("PRAGMA table_info(assets)").all() as { name: string }[];
  const existing = new Set(columns.map((c) => c.name));
  const additions: Array<[string, string]> = [
    ["allocation_bucket", "ALTER TABLE assets ADD COLUMN allocation_bucket TEXT NOT NULL DEFAULT 'stable'"],
    ["account_info", "ALTER TABLE assets ADD COLUMN account_info TEXT"],
    ["cost_basis", "ALTER TABLE assets ADD COLUMN cost_basis REAL"],
    ["sort_order", "ALTER TABLE assets ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [name, ddl] of additions) {
    if (!existing.has(name)) sqlite.exec(ddl);
  }

  // 映射旧的资产大类取值（数据为测试数据，可直接修改），并回填配置象限默认值。
  sqlite.exec(`
    UPDATE assets SET type = 'equity' WHERE type = 'investment';
    UPDATE assets SET type = 'pension' WHERE type = 'insurance';
    UPDATE assets SET type = 'other' WHERE type = 'salary';
    UPDATE assets SET allocation_bucket = CASE type
      WHEN 'cash' THEN 'liquid'
      WHEN 'fixed_income' THEN 'stable'
      WHEN 'equity' THEN 'growth'
      WHEN 'real_estate' THEN 'stable'
      WHEN 'physical' THEN 'stable'
      WHEN 'pension' THEN 'protection'
      WHEN 'receivable' THEN 'stable'
      ELSE 'stable'
    END
    WHERE allocation_bucket IS NULL OR allocation_bucket = '';
  `);
}

async function start() {
  // Initialize database
  initDatabase();
  await seed();

  registerRawJsonParser();

  // Plugins
  await app.register(cors, { origin: true, credentials: true });
  await app.register(jwt, { secret: config.jwtSecret });
  // 文件上传（体检 PDF、就诊图片）。单文件上限 25MB。
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "家庭管理系统 API",
        description: "用于本地部署调试的 API 文档",
        version: "1.0.0",
      },
      tags: [
        { name: "analysis", description: "AI 财务分析" },
        { name: "dashboard", description: "首页支出看板" },
      ],
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/api/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
  });

  // API routes
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(analysisRoutes, { prefix: "/api/v1/analysis" });
  await app.register(dashboardRoutes, { prefix: "/api/v1/dashboard" });
  await app.register(transactionRoutes, { prefix: "/api/v1/transactions" });
  await app.register(assetRoutes, { prefix: "/api/v1/assets" });
  await app.register(liabilityRoutes, { prefix: "/api/v1/liabilities" });
  await app.register(insuranceRoutes, { prefix: "/api/v1/insurance" });
  await app.register(netWorthRoutes, { prefix: "/api/v1/networth" });
  await app.register(categoryRoutes, { prefix: "/api/v1/categories" });
  await app.register(accountRoutes, { prefix: "/api/v1/accounts" });
  await app.register(memberRoutes, { prefix: "/api/v1/members" });
  await app.register(settingRoutes, { prefix: "/api/v1/settings" });
  await app.register(messageRoutes, { prefix: "/api/v1/messages" });
  await app.register(healthCheckupRoutes, { prefix: "/api/v1/health/checkups" });
  await app.register(medicalVisitRoutes, { prefix: "/api/v1/health/visits" });

  // Hub integration routes
  await app.register(hubWebhookRoutes, { prefix: "/hub" });
  await app.register(hubOAuthRoutes, { prefix: "/oauth" });
  await app.register(hubManifestRoutes);

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  // Serve frontend static files in production
  const publicDir = resolve("./public");
  if (existsSync(publicDir)) {
    await app.register(fastifyStatic, {
      root: publicDir,
      prefix: "/",
      wildcard: false,
    });
    // SPA fallback
    app.setNotFoundHandler((_request, reply) => {
      reply.sendFile("index.html");
    });
  }

  // Start cron jobs
  setupMonthlySummaryJob();

  await app.listen({ port: config.port, host: config.host });
  console.log(`Server running at http://${config.host}:${config.port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

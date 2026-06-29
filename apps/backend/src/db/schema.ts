import { sqliteTable, text, real, integer, index } from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  wechatUserId: text("wechat_user_id").unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("member"),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
  updatedAt: text("updated_at").notNull().default("(datetime('now'))"),
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  icon: text("icon"),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  icon: text("icon"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    amount: real("amount").notNull(),
    description: text("description").notNull(),
    categoryId: text("category_id").notNull().references(() => categories.id),
    accountId: text("account_id").references(() => accounts.id),
    memberId: text("member_id").notNull().references(() => members.id),
    transactionDate: text("transaction_date").notNull(),
    note: text("note"),
    source: text("source").notNull().default("admin"),
    aiRawInput: text("ai_raw_input"),
    aiConfidence: real("ai_confidence"),
    createdAt: text("created_at").notNull().default("(datetime('now'))"),
    updatedAt: text("updated_at").notNull().default("(datetime('now'))"),
  },
  (table) => [
    index("idx_transactions_date").on(table.transactionDate),
    index("idx_transactions_type").on(table.type),
    index("idx_transactions_member").on(table.memberId),
    index("idx_transactions_category").on(table.categoryId),
  ]
);

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("CNY"),
  allocationBucket: text("allocation_bucket").notNull().default("stable"),
  accountInfo: text("account_info"),
  costBasis: real("cost_basis"),
  sortOrder: integer("sort_order").notNull().default(0),
  frequency: text("frequency"),
  memberId: text("member_id").references(() => members.id),
  startDate: text("start_date"),
  endDate: text("end_date"),
  note: text("note"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
  updatedAt: text("updated_at").notNull().default("(datetime('now'))"),
});

export const assetValuations = sqliteTable(
  "asset_valuations",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id").notNull().references(() => assets.id),
    date: text("date").notNull(),
    value: real("value").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull().default("(datetime('now'))"),
  },
  (table) => [index("idx_asset_valuations_asset").on(table.assetId)]
);

export const liabilities = sqliteTable("liabilities", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  balance: real("balance").notNull(),
  originalAmount: real("original_amount"),
  interestRate: real("interest_rate"),
  monthlyPayment: real("monthly_payment"),
  memberId: text("member_id").references(() => members.id),
  linkedAssetId: text("linked_asset_id"),
  note: text("note"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
  updatedAt: text("updated_at").notNull().default("(datetime('now'))"),
});

export const insurancePolicies = sqliteTable("insurance_policies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  insuredMemberId: text("insured_member_id").references(() => members.id),
  insurer: text("insurer"),
  coverageAmount: real("coverage_amount"),
  premium: real("premium"),
  premiumFrequency: text("premium_frequency"),
  cashValue: real("cash_value"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  note: text("note"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
  updatedAt: text("updated_at").notNull().default("(datetime('now'))"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default("(datetime('now'))"),
});

export const installations = sqliteTable("installations", {
  id: text("id").primaryKey(),
  appToken: text("app_token").notNull(),
  webhookSecret: text("webhook_secret").notNull(),
  botId: text("bot_id").notNull(),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

// ---- 健康管理：体检报告 ----

export const healthCheckups = sqliteTable(
  "health_checkups",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull().references(() => members.id),
    checkupDate: text("checkup_date").notNull(),
    institution: text("institution"),
    parsedName: text("parsed_name"),
    filePath: text("file_path"),
    originalFileName: text("original_file_name"),
    overallSummary: text("overall_summary"),
    abnormalSummary: text("abnormal_summary"),
    rawText: text("raw_text"),
    status: text("status").notNull().default("pending"),
    aiModel: text("ai_model"),
    parseMessage: text("parse_message"),
    note: text("note"),
    createdAt: text("created_at").notNull().default("(datetime('now'))"),
    updatedAt: text("updated_at").notNull().default("(datetime('now'))"),
  },
  (table) => [
    index("idx_health_checkups_member").on(table.memberId),
    index("idx_health_checkups_date").on(table.checkupDate),
  ]
);

export const healthCheckupItems = sqliteTable(
  "health_checkup_items",
  {
    id: text("id").primaryKey(),
    checkupId: text("checkup_id").notNull().references(() => healthCheckups.id),
    groupName: text("group_name"),
    itemName: text("item_name").notNull(),
    result: text("result"),
    unit: text("unit"),
    referenceRange: text("reference_range"),
    flag: text("flag").notNull().default("unknown"),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default("(datetime('now'))"),
  },
  (table) => [index("idx_health_checkup_items_checkup").on(table.checkupId)]
);

// ---- 健康管理：就诊记录 ----

export const medicalVisits = sqliteTable(
  "medical_visits",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull().references(() => members.id),
    visitDate: text("visit_date").notNull(),
    hospital: text("hospital"),
    department: text("department"),
    chiefComplaint: text("chief_complaint"),
    examinations: text("examinations"),
    diagnosis: text("diagnosis"),
    treatment: text("treatment"),
    followUp: text("follow_up"),
    cost: real("cost"),
    note: text("note"),
    createdAt: text("created_at").notNull().default("(datetime('now'))"),
    updatedAt: text("updated_at").notNull().default("(datetime('now'))"),
  },
  (table) => [
    index("idx_medical_visits_member").on(table.memberId),
    index("idx_medical_visits_date").on(table.visitDate),
  ]
);

export const medicalVisitAttachments = sqliteTable(
  "medical_visit_attachments",
  {
    id: text("id").primaryKey(),
    visitId: text("visit_id").notNull().references(() => medicalVisits.id),
    type: text("type").notNull().default("other"),
    filePath: text("file_path").notNull(),
    originalFileName: text("original_file_name"),
    ocrText: text("ocr_text"),
    caption: text("caption"),
    createdAt: text("created_at").notNull().default("(datetime('now'))"),
  },
  (table) => [index("idx_medical_visit_attachments_visit").on(table.visitId)]
);

export const medicalVisitMedications = sqliteTable(
  "medical_visit_medications",
  {
    id: text("id").primaryKey(),
    visitId: text("visit_id").notNull().references(() => medicalVisits.id),
    drugName: text("drug_name").notNull(),
    spec: text("spec"),
    dosage: text("dosage"),
    quantity: text("quantity"),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default("(datetime('now'))"),
  },
  (table) => [index("idx_medical_visit_medications_visit").on(table.visitId)]
);

// ---- AI 月度财务分析（持久化） ----

export const financialAnalyses = sqliteTable("financial_analyses", {
  id: text("id").primaryKey(),
  month: text("month").notNull().unique(),
  analysis: text("analysis").notNull(),
  // FinancialAnalysisSnapshot 的 JSON 序列化
  snapshot: text("snapshot").notNull(),
  generatedAt: text("generated_at").notNull(),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
  updatedAt: text("updated_at").notNull().default("(datetime('now'))"),
});

export const messageLog = sqliteTable("message_log", {
  id: text("id").primaryKey(),
  installationId: text("installation_id").notNull(),
  traceId: text("trace_id"),
  senderId: text("sender_id"),
  messageType: text("message_type").notNull(),
  rawContent: text("raw_content"),
  parsedResult: text("parsed_result"),
  status: text("status").notNull().default("received"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

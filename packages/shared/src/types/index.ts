export type TransactionType = "expense" | "income";
export type CategoryType = "expense" | "income";
// 资产大类（重构后）。legacy 值 salary/investment/insurance 会在迁移时被映射。
export type AssetType =
  | "cash" // 现金及活钱
  | "fixed_income" // 固定收益/稳健
  | "equity" // 权益投资/进攻
  | "real_estate" // 房产
  | "physical" // 实物资产（车、贵金属等）
  | "pension" // 养老金/公积金等保障类
  | "receivable" // 应收款（借出去的钱）
  | "other";
// 标普四象限配置桶
export type AllocationBucket = "liquid" | "stable" | "growth" | "protection";
export type LiabilityType = "mortgage" | "car_loan" | "credit_card" | "consumer_loan" | "other";
export type InsuranceCategory =
  | "social" // 社保
  | "medical" // 商业医疗
  | "life" // 寿险
  | "pension" // 商业养老
  | "property" // 财产险
  | "accident" // 意外险
  | "other";
export type AccountType = "cash" | "bank" | "alipay" | "wechat" | "credit" | "other";
export type MemberRole = "admin" | "member";
export type TransactionSource = "wechat" | "admin";
export type AssetFrequency = "monthly" | "quarterly" | "yearly" | "one-time";

export interface Member {
  id: string;
  wechatUserId: string | null;
  name: string;
  avatarUrl: string | null;
  role: MemberRole;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  categoryId: string;
  accountId: string | null;
  memberId: string;
  transactionDate: string;
  note: string | null;
  source: TransactionSource;
  aiRawInput: string | null;
  aiConfidence: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionWithRelations extends Transaction {
  category?: Category;
  account?: Account;
  member?: Member;
}

export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  /** 当前市值或余额（沿用旧列 amount） */
  amount: number;
  currency: string;
  /** 配置象限：活钱/稳健/进攻/保障 */
  allocationBucket: AllocationBucket;
  /** 具体账户信息，如「程伟光-招行」 */
  accountInfo: string | null;
  /** 投入成本（投资类用于算累计收益，可空） */
  costBasis: number | null;
  /** 归属成员，null = 家庭共有 */
  memberId: string | null;
  sortOrder: number;
  // 以下为旧字段，保留兼容（资产场景一般不用）
  frequency: AssetFrequency | null;
  startDate: string | null;
  endDate: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssetValuation {
  id: string;
  assetId: string;
  date: string;
  value: number;
  note: string | null;
  createdAt: string;
}

export interface Liability {
  id: string;
  type: LiabilityType;
  name: string;
  /** 当前剩余本金 */
  balance: number;
  /** 原始金额（可空） */
  originalAmount: number | null;
  /** 年利率，百分数，如 4.5 表示 4.5% */
  interestRate: number | null;
  /** 月供 */
  monthlyPayment: number | null;
  memberId: string | null;
  /** 关联资产（房贷↔房产），可空 */
  linkedAssetId: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InsurancePolicy {
  id: string;
  name: string;
  category: InsuranceCategory;
  /** 被保人成员 */
  insuredMemberId: string | null;
  insurer: string | null;
  /** 保额 */
  coverageAmount: number | null;
  /** 保费 */
  premium: number | null;
  premiumFrequency: AssetFrequency | null;
  /** 现金价值（计入净资产的「保障」桶，可空） */
  cashValue: number | null;
  startDate: string | null;
  endDate: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Setting {
  key: string;
  value: string;
  updatedAt: string;
}

export interface Installation {
  id: string;
  appToken: string;
  webhookSecret: string;
  botId: string;
  createdAt: string;
}

export interface MessageLog {
  id: string;
  installationId: string;
  traceId: string | null;
  senderId: string | null;
  messageType: string;
  rawContent: string | null;
  parsedResult: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

// API response types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface DashboardOverview {
  totalExpense: number;
  totalIncome: number;
  netSavings: number;
  transactionCount: number;
  expenseTransactionCount: number;
  averageDailyExpense: number;
  maxExpense: DashboardMaxExpense | null;
  period: string;
}

export interface DashboardMaxExpense {
  amount: number;
  description: string;
  transactionDate: string;
  categoryName: string;
  memberName: string;
}

export interface TrendDataPoint {
  date: string;
  expense: number;
  income: number;
  expenseCount: number;
}

export interface CategoryStat {
  categoryId: string;
  categoryName: string;
  color: string | null;
  amount: number;
  percentage: number;
  count: number;
}

export interface MemberStat {
  memberId: string;
  memberName: string;
  expense: number;
  income: number;
  expenseCount: number;
  percentage: number;
  topCategories: MemberCategoryStat[];
}

export interface MemberCategoryStat {
  categoryId: string;
  categoryName: string;
  color: string | null;
  amount: number;
  percentage: number;
  count: number;
}

export interface AssetSummary {
  type: AssetType;
  totalAmount: number;
  count: number;
}

// ---- 净资产 / 资产分析 ----

export interface NetWorthOverview {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  assetCount: number;
  liabilityCount: number;
  insuranceCashValue: number;
}

export interface CompositionItem {
  key: string;
  label: string;
  color: string | null;
  amount: number;
  percentage: number;
  count: number;
}

export interface NetWorthComposition {
  /** 按资产大类拆分 */
  byType: CompositionItem[];
  /** 按配置象限拆分（活钱/稳健/进攻/保障） */
  byBucket: CompositionItem[];
  /** 按成员拆分（净值口径：资产-负债） */
  byMember: CompositionItem[];
}

export interface AllocationStat {
  bucket: AllocationBucket;
  label: string;
  color: string | null;
  amount: number;
  currentRatio: number;
  targetRatio: number;
  /** 偏离目标的金额（正=超配，负=低配） */
  gapAmount: number;
}

export interface InvestmentPerformanceItem {
  id: string;
  name: string;
  type: AssetType;
  accountInfo: string | null;
  costBasis: number;
  currentValue: number;
  gain: number;
  returnRate: number | null;
}

export interface InvestmentPerformance {
  items: InvestmentPerformanceItem[];
  totalCost: number;
  totalValue: number;
  totalGain: number;
  totalReturnRate: number | null;
}

export interface NetWorthTrendPoint {
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

export interface EmergencyFundStat {
  liquidAssets: number;
  averageMonthlyExpense: number;
  targetMonths: number;
  targetAmount: number;
  coverageMonths: number | null;
  status: "sufficient" | "warning" | "insufficient" | "unknown";
}

export interface FinancialAnalysisRequest {
  month: string;
}

export interface FinancialAnalysisTopTransaction {
  id: string;
  amount: number;
  description: string;
  transactionDate: string;
  categoryName: string;
  memberName: string;
}

export interface FinancialAnalysisRecurringCandidate {
  description: string;
  categoryName: string;
  amount: number;
  count: number;
  memberNames: string[];
}

export interface FinancialAnalysisSnapshot {
  month: string;
  period: string;
  totalExpense: number;
  previousMonthExpense: number;
  expenseChangeAmount: number;
  expenseChangePercentage: number | null;
  expenseTransactionCount: number;
  categoryStats: CategoryStat[];
  memberStats: MemberStat[];
  topTransactions: FinancialAnalysisTopTransaction[];
  recurringCandidates: FinancialAnalysisRecurringCandidate[];
  assetSummary: AssetSummary[];
}

export interface FinancialAnalysisResponse {
  month: string;
  generatedAt: string;
  analysis: string;
  snapshot: FinancialAnalysisSnapshot;
}

// 已保存的月度分析摘要（用于历史列表）
export interface FinancialAnalysisSummary {
  month: string;
  generatedAt: string;
  totalExpense: number;
  expenseTransactionCount: number;
  expenseChangeAmount: number;
}

// AI parsing result
export interface ParsedTransaction {
  type: TransactionType;
  amount: number;
  description: string;
  category: string;
  transactionDate?: string;
}

// ---- 健康管理：体检报告 ----

/** 体检报告解析状态 */
export type HealthCheckupStatus =
  | "pending" // 已上传，等待解析
  | "parsing" // 解析中
  | "done" // 解析完成
  | "needs_manual" // 无法自动解析（如扫描件），需手动补充
  | "failed"; // 解析出错

/** 单个体检明细项的异常标记 */
export type HealthItemFlag = "normal" | "high" | "low" | "abnormal" | "unknown";

export interface HealthCheckup {
  id: string;
  memberId: string;
  /** 体检日期 YYYY-MM-DD */
  checkupDate: string;
  /** 体检机构 */
  institution: string | null;
  /** AI 从报告中识别出的姓名（用于和所选成员校验） */
  parsedName: string | null;
  /** 原始 PDF 在服务器上的相对存储路径 */
  filePath: string | null;
  /** 上传时的原始文件名 */
  originalFileName: string | null;
  /** AI 生成的总体结论 */
  overallSummary: string | null;
  /** 异常项汇总（文本） */
  abnormalSummary: string | null;
  /** 提取出的原始文本（截断保存，便于复核/重解析） */
  rawText: string | null;
  status: HealthCheckupStatus;
  /** 解析使用的模型标识 */
  aiModel: string | null;
  /** 解析失败/降级时的提示信息 */
  parseMessage: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HealthCheckupItem {
  id: string;
  checkupId: string;
  /** 分组，如「血常规」「肝功能」 */
  groupName: string | null;
  /** 项目名，如「白细胞计数」 */
  itemName: string;
  /** 结果值（保留原始字符串，可能含非数字） */
  result: string | null;
  unit: string | null;
  referenceRange: string | null;
  flag: HealthItemFlag;
  note: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface HealthCheckupWithItems extends HealthCheckup {
  items: HealthCheckupItem[];
  member?: Member;
}

// ---- 健康管理：就诊记录 ----

/** 就诊附件类型 */
export type MedicalAttachmentType =
  | "exam_result" // 检查结果图
  | "lab_report" // 化验单
  | "prescription" // 处方
  | "receipt" // 票据
  | "other";

export interface MedicalVisit {
  id: string;
  memberId: string;
  /** 就诊日期 YYYY-MM-DD */
  visitDate: string;
  hospital: string | null;
  department: string | null;
  /** 主诉：什么情况去看病 */
  chiefComplaint: string | null;
  /** 做了哪些检查 */
  examinations: string | null;
  /** 诊断结果 */
  diagnosis: string | null;
  /** 医嘱 / 处理 */
  treatment: string | null;
  /** 随访建议 */
  followUp: string | null;
  /** 费用（仅健康模块内记录，不写入记账） */
  cost: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MedicalVisitAttachment {
  id: string;
  visitId: string;
  type: MedicalAttachmentType;
  filePath: string;
  originalFileName: string | null;
  /** 可选：AI OCR 识别出的文字 */
  ocrText: string | null;
  caption: string | null;
  createdAt: string;
}

export interface MedicalVisitMedication {
  id: string;
  visitId: string;
  drugName: string;
  /** 规格 */
  spec: string | null;
  /** 用法用量 */
  dosage: string | null;
  /** 数量 */
  quantity: string | null;
  note: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface MedicalVisitWithRelations extends MedicalVisit {
  attachments: MedicalVisitAttachment[];
  medications: MedicalVisitMedication[];
  member?: Member;
}

/** 体检 PDF 解析结果（AI 工具调用返回） */
export interface ParsedCheckup {
  patientName?: string;
  checkupDate?: string;
  institution?: string;
  overallSummary?: string;
  abnormalSummary?: string;
  items?: Array<{
    groupName?: string;
    itemName: string;
    result?: string;
    unit?: string;
    referenceRange?: string;
    flag?: HealthItemFlag;
  }>;
}

/** 就诊图片 OCR 辅助识别结果（AI 工具调用返回） */
export interface ParsedVisitImage {
  examinations?: string;
  diagnosis?: string;
  treatment?: string;
  medications?: Array<{
    drugName: string;
    spec?: string;
    dosage?: string;
    quantity?: string;
  }>;
  rawText?: string;
}

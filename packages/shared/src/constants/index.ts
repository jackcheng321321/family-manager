import type {
  AllocationBucket,
  AssetType,
  CategoryType,
  InsuranceCategory,
  LiabilityType,
} from "../types/index.js";

export interface DefaultCategory {
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
}

export const DEFAULT_EXPENSE_CATEGORIES: DefaultCategory[] = [
  { name: "餐饮", type: "expense", icon: "🍜", color: "#FF6B6B" },
  { name: "交通", type: "expense", icon: "🚗", color: "#4ECDC4" },
  { name: "购物", type: "expense", icon: "🛒", color: "#45B7D1" },
  { name: "住房", type: "expense", icon: "🏠", color: "#96CEB4" },
  { name: "娱乐", type: "expense", icon: "🎮", color: "#FFEAA7" },
  { name: "医疗", type: "expense", icon: "🏥", color: "#DDA0DD" },
  { name: "教育", type: "expense", icon: "📚", color: "#98D8C8" },
  { name: "通讯", type: "expense", icon: "📱", color: "#F7DC6F" },
  { name: "日用", type: "expense", icon: "🧴", color: "#BB8FCE" },
  { name: "服饰", type: "expense", icon: "👔", color: "#85C1E9" },
  { name: "人情", type: "expense", icon: "🎁", color: "#F1948A" },
  { name: "其他支出", type: "expense", icon: "📦", color: "#AEB6BF" },
];

export const DEFAULT_INCOME_CATEGORIES: DefaultCategory[] = [
  { name: "工资", type: "income", icon: "💰", color: "#2ECC71" },
  { name: "奖金", type: "income", icon: "🎉", color: "#F39C12" },
  { name: "投资收益", type: "income", icon: "📈", color: "#3498DB" },
  { name: "兼职", type: "income", icon: "💼", color: "#E74C3C" },
  { name: "其他收入", type: "income", icon: "💵", color: "#95A5A6" },
];

export const ALL_DEFAULT_CATEGORIES = [
  ...DEFAULT_EXPENSE_CATEGORIES,
  ...DEFAULT_INCOME_CATEGORIES,
];

// ---- 资产 / 负债 / 保险 标签与配色 ----

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  cash: "现金活钱",
  fixed_income: "固定收益",
  equity: "权益投资",
  real_estate: "房产",
  physical: "实物资产",
  pension: "养老/公积金",
  receivable: "应收款",
  other: "其他",
};

export const ALLOCATION_BUCKET_LABELS: Record<AllocationBucket, string> = {
  liquid: "活钱（要花的）",
  stable: "稳健（保值的）",
  growth: "进攻（增值的）",
  protection: "保障（兜底的）",
};

export const ALLOCATION_BUCKET_COLORS: Record<AllocationBucket, string> = {
  liquid: "#F59E0B",
  stable: "#3B82F6",
  growth: "#EF4444",
  protection: "#10B981",
};

// 资产大类 → 默认配置象限（新建资产时的默认值，可手动改）
export const ASSET_TYPE_TO_BUCKET: Record<AssetType, AllocationBucket> = {
  cash: "liquid",
  fixed_income: "stable",
  equity: "growth",
  real_estate: "stable",
  physical: "stable",
  pension: "protection",
  receivable: "stable",
  other: "stable",
};

export const LIABILITY_TYPE_LABELS: Record<LiabilityType, string> = {
  mortgage: "房贷",
  car_loan: "车贷",
  credit_card: "信用卡",
  consumer_loan: "消费贷",
  other: "其他",
};

export const INSURANCE_CATEGORY_LABELS: Record<InsuranceCategory, string> = {
  social: "社保",
  medical: "商业医疗",
  life: "寿险",
  pension: "商业养老",
  property: "财产险",
  accident: "意外险",
  other: "其他",
};

// 默认目标配置比例（百分比，合计 100），存入 settings 后可改
export const DEFAULT_TARGET_ALLOCATION: Record<AllocationBucket, number> = {
  liquid: 10,
  stable: 40,
  growth: 30,
  protection: 20,
};

export const DEFAULT_EMERGENCY_FUND_MONTHS = 6;

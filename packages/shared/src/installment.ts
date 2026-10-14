// 分期消费的纯计算逻辑，前端预览与后端落库共用，保证两边算出的每期金额完全一致。

export interface InstallmentScheduleInput {
  /** 商品总价（不含手续费） */
  totalAmount: number;
  /** 期数 */
  periods: number;
  /** 每期手续费，免息为 0 */
  feePerPeriod: number;
  /** 首期扣款日 YYYY-MM-DD */
  firstDate: string;
  /** 提前还清日 YYYY-MM-DD；此日之后的期数合并为当天一笔 */
  payoffDate?: string | null;
}

export interface InstallmentScheduleItem {
  /** 第几期（从 1 开始）；提前还清的合并记录取被合并的第一期 */
  index: number;
  date: string;
  amount: number;
  /** 提前还清时合并的期数，普通期为 1 */
  mergedPeriods: number;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * 把总价拆成 periods 期，返回每期本金（单位：元，保留两位小数），
 * 所有期数之和严格等于 totalAmount。按银行惯例，除不尽的零头放在末期。
 */
export function splitInstallmentAmounts(totalAmount: number, periods: number): number[] {
  if (!(periods >= 1)) return [];
  const totalCents = toCents(totalAmount);
  const baseCents = Math.floor(totalCents / periods);
  const lastCents = totalCents - baseCents * (periods - 1);
  return Array.from({ length: periods }, (_, i) => (i === periods - 1 ? lastCents : baseCents) / 100);
}

/** 在 YYYY-MM-DD 上加 n 个月；目标月没有该日时取月末（1/31 + 1 月 → 2/28）。 */
export function addMonthsClamped(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function buildInstallmentSchedule(input: InstallmentScheduleInput): InstallmentScheduleItem[] {
  const principals = splitInstallmentAmounts(input.totalAmount, input.periods);
  const feeCents = toCents(input.feePerPeriod || 0);
  const items: InstallmentScheduleItem[] = principals.map((principal, i) => ({
    index: i + 1,
    date: addMonthsClamped(input.firstDate, i),
    amount: (toCents(principal) + feeCents) / 100,
    mergedPeriods: 1,
  }));

  const payoffDate = input.payoffDate;
  if (!payoffDate) return items;

  const paid = items.filter((item) => item.date <= payoffDate);
  const rest = items.filter((item) => item.date > payoffDate);
  if (rest.length === 0) return items;

  // 提前还清：剩余本金一次付清，未发生的期数不再收手续费
  const restPrincipalCents = rest.reduce((sum, item) => sum + toCents(principals[item.index - 1]), 0);
  return [
    ...paid,
    { index: rest[0].index, date: payoffDate, amount: restPrincipalCents / 100, mergedPeriods: rest.length },
  ];
}

export function formatInstallmentLabel(item: Pick<InstallmentScheduleItem, "index" | "mergedPeriods">, periods: number): string {
  if (item.mergedPeriods > 1) return `提前还清 ${item.index}-${periods}/${periods}`;
  return `${item.index}/${periods}`;
}

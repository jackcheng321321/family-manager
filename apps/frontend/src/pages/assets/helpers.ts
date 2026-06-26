export function formatCurrency(value: number): string {
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// 紧凑显示：超过 1 万用「万」，用于图表与大数字
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

export function formatPercent(value: number | null): string {
  if (value == null) return "—";
  return `${value.toFixed(2)}%`;
}

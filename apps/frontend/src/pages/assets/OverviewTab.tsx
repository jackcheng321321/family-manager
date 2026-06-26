import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type {
  AllocationStat,
  CompositionItem,
  EmergencyFundStat,
  InvestmentPerformance,
  NetWorthComposition,
  NetWorthOverview,
  NetWorthTrendPoint,
} from "@caiwu/shared";
import { ALLOCATION_BUCKET_COLORS } from "@caiwu/shared";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatCompact, formatPercent } from "./helpers";

const EMERGENCY_STATUS: Record<EmergencyFundStat["status"], { label: string; cls: string }> = {
  sufficient: { label: "充足", cls: "text-green-600" },
  warning: { label: "偏紧", cls: "text-amber-500" },
  insufficient: { label: "不足", cls: "text-red-500" },
  unknown: { label: "暂无足够数据", cls: "text-muted-foreground" },
};

export function OverviewTab({ refreshKey }: { refreshKey: number }) {
  const [overview, setOverview] = useState<NetWorthOverview | null>(null);
  const [composition, setComposition] = useState<NetWorthComposition | null>(null);
  const [allocation, setAllocation] = useState<AllocationStat[]>([]);
  const [investments, setInvestments] = useState<InvestmentPerformance | null>(null);
  const [trend, setTrend] = useState<NetWorthTrendPoint[]>([]);
  const [emergency, setEmergency] = useState<EmergencyFundStat | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [o, c, a, inv, t, e] = await Promise.all([
          api.get<NetWorthOverview>("/networth/overview"),
          api.get<NetWorthComposition>("/networth/composition"),
          api.get<{ data: AllocationStat[] }>("/networth/allocation"),
          api.get<InvestmentPerformance>("/networth/investments"),
          api.get<{ data: NetWorthTrendPoint[] }>("/networth/trend"),
          api.get<EmergencyFundStat>("/networth/emergency-fund"),
        ]);
        if (cancelled) return;
        setOverview(o);
        setComposition(c);
        setAllocation(a.data);
        setInvestments(inv);
        setTrend(t.data);
        setEmergency(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (loading) return <div className="text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-5">
      {/* 净资产卡片 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">净资产</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(overview?.netWorth || 0)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">资产总额</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{formatCurrency(overview?.totalAssets || 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{overview?.assetCount || 0} 项资产</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">负债总额</p>
          <p className="mt-1 text-2xl font-bold text-red-500">{formatCurrency(overview?.totalLiabilities || 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{overview?.liabilityCount || 0} 项负债</p>
        </div>
      </div>

      {/* 趋势 + 应急备用金 */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 xl:col-span-2">
          <h3 className="mb-4 font-medium">净资产趋势</h3>
          {trend.length > 1 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => formatCompact(v)} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Line type="monotone" dataKey="netWorth" name="净资产" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="totalAssets" name="总资产" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="totalLiabilities" name="负债" stroke="#ef4444" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[260px] flex-col items-center justify-center gap-1 text-center text-muted-foreground">
              <p>趋势需要多次估值记录</p>
              <p className="text-xs">在「资产」标签里点资产的趋势图标，定期记录市值即可形成曲线</p>
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-4 font-medium">应急备用金体检</h3>
          {emergency && (
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">活钱（流动资产）</p>
                <p className="text-xl font-bold">{formatCurrency(emergency.liquidAssets)}</p>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">月均支出</span>
                <span>{formatCurrency(emergency.averageMonthlyExpense)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">目标（{emergency.targetMonths} 个月）</span>
                <span>{formatCurrency(emergency.targetAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">可覆盖</span>
                <span className={EMERGENCY_STATUS[emergency.status].cls}>
                  {emergency.coverageMonths == null ? "—" : `${emergency.coverageMonths} 个月`} · {EMERGENCY_STATUS[emergency.status].label}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 配置 vs 目标 */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-4 font-medium">资产配置（当前 vs 目标）</h3>
        <div className="space-y-4">
          {allocation.map((a) => (
            <div key={a.bucket} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{a.label}</span>
                <span className="text-muted-foreground">
                  {formatCurrency(a.amount)} · 当前 {a.currentRatio}% / 目标 {a.targetRatio}%
                </span>
              </div>
              <div className="relative h-2.5 rounded-full bg-muted">
                <div
                  className="h-2.5 rounded-full"
                  style={{ width: `${Math.min(a.currentRatio, 100)}%`, backgroundColor: a.color || "#999" }}
                />
                {/* 目标线 */}
                <div
                  className="absolute top-[-2px] h-[14px] w-0.5 bg-foreground/60"
                  style={{ left: `${Math.min(a.targetRatio, 100)}%` }}
                  title={`目标 ${a.targetRatio}%`}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {a.gapAmount > 0 ? `超配 ${formatCurrency(a.gapAmount)}` : a.gapAmount < 0 ? `低配 ${formatCurrency(-a.gapAmount)}` : "与目标一致"}
              </p>
            </div>
          ))}
          {allocation.length === 0 && <p className="text-sm text-muted-foreground">暂无资产数据</p>}
        </div>
      </div>

      {/* 构成：象限 + 成员 */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <CompositionCard title="按配置象限" items={composition?.byBucket || []} />
        <CompositionCard title="按成员（净值）" items={composition?.byMember || []} />
      </div>

      {/* 投资收益 */}
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-medium">投资收益</h3>
          {investments && investments.items.length > 0 && (
            <p className="text-sm text-muted-foreground">
              总投入 {formatCurrency(investments.totalCost)} · 现值 {formatCurrency(investments.totalValue)} · 累计{" "}
              <span className={investments.totalGain >= 0 ? "text-green-600" : "text-red-500"}>
                {investments.totalGain >= 0 ? "+" : ""}
                {formatCurrency(investments.totalGain)}（{formatPercent(investments.totalReturnRate)}）
              </span>
            </p>
          )}
        </div>
        {investments && investments.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">名称</th>
                  <th className="py-2 pr-4 text-right">成本</th>
                  <th className="py-2 pr-4 text-right">现值</th>
                  <th className="py-2 pr-4 text-right">累计收益</th>
                  <th className="py-2 text-right">收益率</th>
                </tr>
              </thead>
              <tbody>
                {investments.items.map((i) => (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{i.name}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatCurrency(i.costBasis)}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(i.currentValue)}</td>
                    <td className={`py-2 pr-4 text-right ${i.gain >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {i.gain >= 0 ? "+" : ""}
                      {formatCurrency(i.gain)}
                    </td>
                    <td className={`py-2 text-right ${i.gain >= 0 ? "text-green-600" : "text-red-500"}`}>{formatPercent(i.returnRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">在「资产」里给投资类资产填写「投入成本」，这里就会出现收益分析</p>
        )}
      </div>
    </div>
  );
}

function CompositionCard({ title, items }: { title: string; items: CompositionItem[] }) {
  const palette = Object.values(ALLOCATION_BUCKET_COLORS);
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-4 font-medium">{title}</h3>
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={item.key} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{item.label}</span>
                <span className="flex-none">
                  {formatCurrency(item.amount)} · {item.percentage}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full"
                  style={{ width: `${Math.min(item.percentage, 100)}%`, backgroundColor: item.color || palette[idx % palette.length] }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">暂无数据</p>
      )}
    </div>
  );
}

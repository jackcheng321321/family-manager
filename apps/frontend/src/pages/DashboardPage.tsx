import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { CategoryStat, DashboardOverview, MemberStat, TrendDataPoint } from "@caiwu/shared";
import { ArrowRight, Brain, ReceiptText, TrendingDown, WalletCards } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PERIOD_LABELS: Record<string, string> = {
  day: "今日",
  month: "本月",
  quarter: "本季",
  year: "本年",
};

const PERIODS = ["day", "month", "quarter", "year"];

function formatCurrency(value: number): string {
  return `¥${value.toFixed(2)}`;
}

export function DashboardPage() {
  const [period, setPeriod] = useState("day");
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [trend, setTrend] = useState<TrendDataPoint[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [memberStats, setMemberStats] = useState<MemberStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewResult, trendResult, categoryResult, memberResult] = await Promise.all([
        api.get<DashboardOverview>(`/dashboard/overview?period=${period}`),
        api.get<{ data: TrendDataPoint[] }>(`/dashboard/trend?period=${period}`),
        api.get<{ data: CategoryStat[] }>(`/dashboard/category-stats?type=expense&period=${period}`),
        api.get<{ data: MemberStat[] }>(`/dashboard/member-stats?period=${period}`),
      ]);
      setOverview(overviewResult);
      setTrend(trendResult.data);
      setCategoryStats(categoryResult.data);
      setMemberStats(memberResult.data);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">加载中...</div>;
  }

  const [rangeStart, rangeEnd] = overview?.period?.split(" ~ ") ?? [];
  const periodRange = { start: rangeStart, end: rangeEnd };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">支出看板</h2>
          {overview?.period && <p className="mt-1 text-sm text-muted-foreground">{overview.period}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((item) => (
            <button
              key={item}
              onClick={() => setPeriod(item)}
              className={`rounded-md px-3 py-2 text-sm ${
                period === item ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {PERIOD_LABELS[item]}
            </button>
          ))}
        </div>
      </div>

      <Link
        to="/analysis"
        className="flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">查看本月 AI 分析</p>
            <p className="text-sm text-muted-foreground">支出陷阱、成员分类和消费建议</p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-muted-foreground" />
      </Link>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="总支出"
          value={formatCurrency(overview?.totalExpense || 0)}
          icon={<WalletCards className="h-5 w-5" />}
          tone="danger"
        />
        <StatCard
          label="日均支出"
          value={formatCurrency(overview?.averageDailyExpense || 0)}
          icon={<TrendingDown className="h-5 w-5" />}
        />
        <StatCard
          label="支出笔数"
          value={`${overview?.expenseTransactionCount || 0}`}
          icon={<ReceiptText className="h-5 w-5" />}
        />
        <StatCard
          label="最高单笔"
          value={formatCurrency(overview?.maxExpense?.amount || 0)}
          icon={<ReceiptText className="h-5 w-5" />}
          detail={overview?.maxExpense ? `${overview.maxExpense.memberName} · ${overview.maxExpense.categoryName}` : "暂无"}
          tone="danger"
        />
      </div>

      <MemberStatsSection memberStats={memberStats} range={periodRange} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-4 font-medium">支出趋势</h3>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => `${value.toFixed(2)} 元`} />
                <Bar dataKey="expense" fill="#ef4444" name="支出" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[280px] items-center justify-center text-muted-foreground">暂无数据</div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-4 font-medium">支出分类排行</h3>
          {categoryStats.length > 0 ? (
            <div className="space-y-4">
              {categoryStats.slice(0, 8).map((item) => (
                <div key={item.categoryId} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{item.categoryName}</span>
                    <span className="flex-none">{formatCurrency(item.amount)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${Math.min(item.percentage, 100)}%`, backgroundColor: item.color || "#ef4444" }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{item.percentage}% · {item.count} 笔</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-[280px] items-center justify-center text-muted-foreground">暂无数据</div>
          )}
        </div>
      </div>

    </div>
  );
}

function MemberStatsSection({ memberStats, range }: { memberStats: MemberStat[]; range: { start?: string; end?: string } }) {
  if (memberStats.length === 0) return null;

  const buildHref = (memberId: string) => {
    const params = new URLSearchParams({ memberId });
    if (range.start) params.set("startDate", range.start);
    if (range.end) params.set("endDate", range.end);
    return `/transactions?${params.toString()}`;
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-4 font-medium">成员支出</h3>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {memberStats.map((member) => (
          <Link
            key={member.memberId}
            to={buildHref(member.memberId)}
            className="block rounded-lg border p-4 transition-colors hover:bg-accent"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{member.memberName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {member.percentage}% · {member.expenseCount} 笔
                </p>
              </div>
              <p className="text-2xl font-bold text-red-500">{formatCurrency(member.expense)}</p>
            </div>
            <div className="mt-4 space-y-3">
              {member.topCategories.length > 0 ? (
                member.topCategories.map((category) => (
                  <div key={category.categoryId} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{category.categoryName}</span>
                      <span className="flex-none">{formatCurrency(category.amount)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${Math.min(category.percentage, 100)}%`,
                          backgroundColor: category.color || "#ef4444",
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">暂无分类数据</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: ReactNode;
  detail?: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className={tone === "danger" ? "text-red-500" : "text-muted-foreground"}>{icon}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold ${tone === "danger" ? "text-red-500" : ""}`}>{value}</p>
      {detail && <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

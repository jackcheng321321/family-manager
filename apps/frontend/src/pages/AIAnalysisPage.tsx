import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { Markdown } from "@/components/Markdown";
import { getBusinessToday } from "@/lib/date";
import type { FinancialAnalysisResponse, FinancialAnalysisSummary } from "@caiwu/shared";
import { AlertCircle, Brain, History, Loader2, RefreshCw } from "lucide-react";

function formatCurrency(value: number): string {
  return `¥${value.toFixed(2)}`;
}

function getDefaultMonth(): string {
  return getBusinessToday().slice(0, 7);
}

export function AIAnalysisPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [month, setMonth] = useState(searchParams.get("month") || getDefaultMonth());
  const [result, setResult] = useState<FinancialAnalysisResponse | null>(null);
  const [history, setHistory] = useState<FinancialAnalysisSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [error, setError] = useState("");
  // 单调递增的请求序号：切换月份/生成时只让「最后一次」操作的结果生效，避免旧请求覆盖
  const reqSeq = useRef(0);

  const loadHistory = async () => {
    try {
      const list = await api.get<FinancialAnalysisSummary[]>("/analysis/saved");
      setHistory(list);
    } catch {
      // 历史列表加载失败不阻塞主流程
    }
  };

  const loadSaved = async (targetMonth: string) => {
    const myId = ++reqSeq.current;
    setLoadingSaved(true);
    setError("");
    try {
      const saved = await api.get<FinancialAnalysisResponse>(
        `/analysis/saved/${targetMonth}`
      );
      if (reqSeq.current === myId) setResult(saved);
    } catch {
      // 该月还没有保存的分析记录
      if (reqSeq.current === myId) setResult(null);
    } finally {
      if (reqSeq.current === myId) setLoadingSaved(false);
    }
  };

  // 首次加载历史列表
  useEffect(() => {
    void loadHistory();
  }, []);

  // 月份变化时读取已保存的分析
  useEffect(() => {
    void loadSaved(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const selectMonth = (next: string) => {
    if (!next) return;
    setMonth(next);
    setSearchParams({ month: next });
  };

  const generateAnalysis = async () => {
    const myId = ++reqSeq.current;
    setLoading(true);
    setError("");
    try {
      const response = await api.post<FinancialAnalysisResponse>("/analysis/monthly", { month });
      if (reqSeq.current === myId) {
        setResult(response);
        setSearchParams({ month });
      }
      void loadHistory();
    } catch (err) {
      if (reqSeq.current === myId) setError(err instanceof Error ? err.message : "AI 分析生成失败");
    } finally {
      if (reqSeq.current === myId) setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">AI 分析</h2>
          {result && (
            <p className="mt-1 text-sm text-muted-foreground">
              {result.month} · {new Date(result.generatedAt).toLocaleString("zh-CN")}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="month"
            value={month}
            onChange={(event) => selectMonth(event.target.value)}
            className="h-10 rounded-md border px-3 text-sm"
          />
          <button
            onClick={generateAnalysis}
            disabled={loading || !month}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {loading ? "生成中" : result ? "重新生成" : "生成分析"}
          </button>
        </div>
      </div>

      {history.length > 0 && (
        <div className="rounded-lg border bg-card p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <History className="h-4 w-4" />
            历史分析
          </div>
          <div className="flex flex-wrap gap-2">
            {history.map((item) => {
              const active = item.month === month;
              return (
                <button
                  key={item.month}
                  onClick={() => selectMonth(item.month)}
                  className={`rounded-md border px-3 py-1.5 text-left text-sm transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                >
                  <span className="font-medium">{item.month}</span>
                  <span className={`ml-2 text-xs ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {formatCurrency(item.totalExpense)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
          <span>{error}</span>
        </div>
      )}

      {!result && !loading && !loadingSaved && (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          {month} 还没有分析记录，点击「生成分析」开始
        </div>
      )}

      {loadingSaved && !loading && !result && (
        <div className="flex items-center justify-center gap-2 rounded-lg border bg-card p-8 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          加载中
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="本月支出" value={formatCurrency(result.snapshot.totalExpense)} />
            <SummaryCard label="支出笔数" value={`${result.snapshot.expenseTransactionCount} 笔`} />
            <SummaryCard
              label="上月对比"
              value={`${result.snapshot.expenseChangeAmount >= 0 ? "+" : ""}${formatCurrency(result.snapshot.expenseChangeAmount)}`}
              tone={result.snapshot.expenseChangeAmount > 0 ? "danger" : "default"}
            />
            <SummaryCard label="资产记录" value={`${result.snapshot.assetSummary.length} 类`} />
          </div>

          <div className="rounded-lg border bg-card p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <h3 className="font-medium">分析结果</h3>
            </div>
            <Markdown content={result.analysis} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <DataPanel title="分类支出">
              {result.snapshot.categoryStats.slice(0, 6).map((item) => (
                <div key={item.categoryId} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{item.categoryName}</span>
                    <span className="font-medium">{formatCurrency(item.amount)}</span>
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
            </DataPanel>

            <DataPanel title="成员支出">
              {result.snapshot.memberStats.map((member) => (
                <div key={member.memberId} className="rounded-md border p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{member.memberName}</span>
                    <span>{formatCurrency(member.expense)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {member.percentage}% · {member.expenseCount} 笔
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {member.topCategories.map((category) => (
                      <span key={category.categoryId} className="rounded bg-secondary px-2 py-1 text-xs">
                        {category.categoryName} {formatCurrency(category.amount)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </DataPanel>

            <DataPanel title="大额支出">
              {result.snapshot.topTransactions.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.transactionDate} · {item.memberName} · {item.categoryName}
                    </p>
                  </div>
                  <span className="flex-none font-medium text-red-500">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </DataPanel>

            <DataPanel title="重复消费线索">
              {result.snapshot.recurringCandidates.length > 0 ? (
                result.snapshot.recurringCandidates.slice(0, 6).map((item) => (
                  <div key={`${item.description}-${item.categoryName}`} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.categoryName} · {item.count} 笔 · {item.memberNames.join("、")}
                      </p>
                    </div>
                    <span className="flex-none font-medium">{formatCurrency(item.amount)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">暂无明显重复消费</p>
              )}
            </DataPanel>
          </div>
        </>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-lg border bg-card p-8 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          正在生成分析
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "danger" }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "danger" ? "text-red-500" : ""}`}>{value}</p>
    </div>
  );
}

function DataPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <h3 className="font-medium">{title}</h3>
      {children}
    </div>
  );
}

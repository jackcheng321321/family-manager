import { useState, useEffect } from "react";
import { api } from "@/api/client";
import type { MessageLog, PaginatedResponse } from "@caiwu/shared";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  received: { label: "已接收", cls: "bg-blue-100 text-blue-700" },
  parsed: { label: "已解析", cls: "bg-green-100 text-green-700" },
  saved: { label: "已保存", cls: "bg-green-100 text-green-700" },
  error: { label: "失败", cls: "bg-red-100 text-red-700" },
  failed: { label: "失败", cls: "bg-red-100 text-red-700" },
};

export function MessagesPage() {
  const [data, setData] = useState<MessageLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, [page, statusFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (statusFilter) params.set("status", statusFilter);
      const res = await api.get<PaginatedResponse<MessageLog>>(`/messages?${params}`);
      setData(res.data);
      setTotal(res.total);
    } finally { setLoading(false); }
  };

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">消息日志</h2>
      <div className="flex flex-wrap gap-2">
        {["", "received", "parsed", "saved", "error"].map((s) => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1 text-sm rounded-md ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
            {s ? (STATUS_LABELS[s]?.label || s) : "全部"}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead><tr className="border-b bg-muted/50">
            <th className="text-left py-3 px-4">时间</th>
            <th className="text-left py-3 px-4">发送者</th>
            <th className="text-left py-3 px-4">类型</th>
            <th className="text-left py-3 px-4">内容</th>
            <th className="text-left py-3 px-4">状态</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">加载中...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">暂无消息</td></tr>
            ) : data.map((m) => {
              const status = STATUS_LABELS[m.status] || { label: m.status, cls: "bg-gray-100 text-gray-700" };
              return (
                <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}>
                  <td className="py-2 px-4 text-muted-foreground">{new Date(m.createdAt).toLocaleString("zh-CN")}</td>
                  <td className="py-2 px-4">{m.senderId || "-"}</td>
                  <td className="py-2 px-4">{m.messageType}</td>
                  <td className="py-2 px-4 max-w-xs truncate">{m.rawContent || "-"}</td>
                  <td className="py-2 px-4"><span className={`px-2 py-0.5 rounded text-xs ${status.cls}`}>{status.label}</span></td>
                </tr>
              );
            })}
            {expandedId && data.filter((m) => m.id === expandedId).map((m) => (
              <tr key={`${m.id}-detail`} className="bg-muted/20">
                <td colSpan={5} className="px-4 py-3">
                  <div className="space-y-2 text-sm">
                    {m.rawContent && <div><span className="font-medium">原始内容：</span>{m.rawContent}</div>}
                    {m.parsedResult && <div><span className="font-medium">解析结果：</span><pre className="mt-1 bg-muted p-2 rounded text-xs overflow-auto">{m.parsedResult}</pre></div>}
                    {m.errorMessage && <div className="text-red-500"><span className="font-medium">错误信息：</span>{m.errorMessage}</div>}
                    {m.traceId && <div className="text-muted-foreground"><span className="font-medium">Trace ID：</span>{m.traceId}</div>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {totalPages > 1 && (
          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-muted-foreground">共 {total} 条</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 text-sm border rounded disabled:opacity-50">上一页</button>
              <span className="px-3 py-1 text-sm">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1 text-sm border rounded disabled:opacity-50">下一页</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

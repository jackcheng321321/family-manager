import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import type { TransactionWithRelations, PaginatedResponse, Category, Member } from "@caiwu/shared";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { getBusinessToday } from "@/lib/date";

const SOURCE_LABELS: Record<string, string> = {
  "wechat": "微信文字",
  "wechat-voice": "微信语音",
  "wechat-image": "微信图片",
};

function sourceLabel(source?: string): string {
  return (source && SOURCE_LABELS[source]) || "手动录入";
}

export function TransactionsPage() {
  const [data, setData] = useState<TransactionWithRelations[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    type: searchParams.get("type") || "",
    memberId: searchParams.get("memberId") || "",
    categoryId: searchParams.get("categoryId") || "",
    startDate: searchParams.get("startDate") || "",
    endDate: searchParams.get("endDate") || "",
    keyword: searchParams.get("keyword") || "",
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "expense",
    amount: "",
    description: "",
    categoryId: "",
    memberId: "",
    transactionDate: getBusinessToday(),
    note: "",
  });

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadData();
  }, [page, filters]);

  const loadMeta = async () => {
    const [cats, mems] = await Promise.all([
      api.get<Category[]>("/categories"),
      api.get<Member[]>("/members"),
    ]);
    setCategories(cats);
    setMembers(mems);
    if (mems.length > 0) setForm((f) => ({ ...f, memberId: mems[0].id }));
  };

  const loadData = async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v);
    }
    try {
      const res = await api.get<PaginatedResponse<TransactionWithRelations>>(`/transactions?${params}`);
      setData(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...form, amount: Number(form.amount) };
    if (editingId) {
      await api.put(`/transactions/${editingId}`, body);
    } else {
      await api.post("/transactions", body);
    }
    setShowForm(false);
    setEditingId(null);
    setForm({ type: "expense", amount: "", description: "", categoryId: "", memberId: members[0]?.id || "", transactionDate: getBusinessToday(), note: "" });
    loadData();
  };

  const handleEdit = (t: TransactionWithRelations) => {
    setEditingId(t.id);
    setForm({
      type: t.type,
      amount: String(t.amount),
      description: t.description,
      categoryId: t.categoryId,
      memberId: t.memberId,
      transactionDate: t.transactionDate,
      note: t.note || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这条记录吗？")) return;
    await api.delete(`/transactions/${id}`);
    loadData();
  };

  const totalPages = Math.ceil(total / 20);
  const filteredCategories = categories.filter((c) => !form.type || c.type === form.type);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold">记账管理</h2>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          className="flex items-center gap-1 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm"
        >
          <Plus className="h-4 w-4" /> 新增记录
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:flex-wrap">
        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className="w-full rounded border px-2 py-2 text-sm sm:w-auto">
          <option value="">全部类型</option>
          <option value="expense">支出</option>
          <option value="income">收入</option>
        </select>
        <select value={filters.memberId} onChange={(e) => setFilters({ ...filters, memberId: e.target.value })} className="w-full rounded border px-2 py-2 text-sm sm:w-auto">
          <option value="">全部成员</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })} className="w-full rounded border px-2 py-2 text-sm sm:w-auto">
          <option value="">全部分类</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} className="w-full rounded border px-2 py-2 text-sm sm:w-auto" />
        <span className="text-sm text-muted-foreground self-center">至</span>
        <input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} className="w-full rounded border px-2 py-2 text-sm sm:w-auto" />
        <input type="text" placeholder="搜索描述..." value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} className="w-full rounded border px-2 py-2 text-sm sm:w-auto" />
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onClick={() => setShowForm(false)}>
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg bg-card p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold mb-4">{editingId ? "编辑记录" : "新增记录"}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex gap-2">
                <label className="flex items-center gap-1 text-sm">
                  <input type="radio" name="type" value="expense" checked={form.type === "expense"} onChange={() => setForm({ ...form, type: "expense", categoryId: "" })} /> 支出
                </label>
                <label className="flex items-center gap-1 text-sm">
                  <input type="radio" name="type" value="income" checked={form.type === "income"} onChange={() => setForm({ ...form, type: "income", categoryId: "" })} /> 收入
                </label>
              </div>
              <input type="number" step="0.01" placeholder="金额" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full px-3 py-2 border rounded text-sm" required />
              <input type="text" placeholder="描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border rounded text-sm" required />
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="w-full px-3 py-2 border rounded text-sm" required>
                <option value="">选择分类</option>
                {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
              <select value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} className="w-full px-3 py-2 border rounded text-sm" required>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })} className="w-full px-3 py-2 border rounded text-sm" required />
              <input type="text" placeholder="备注（可选）" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full px-3 py-2 border rounded text-sm" />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded text-sm">取消</button>
                <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left py-3 px-4">日期</th>
              <th className="text-left py-3 px-4">类型</th>
              <th className="text-left py-3 px-4">分类</th>
              <th className="text-left py-3 px-4">描述</th>
              <th className="text-left py-3 px-4">成员</th>
              <th className="text-right py-3 px-4">金额</th>
              <th className="text-left py-3 px-4">来源</th>
              <th className="text-right py-3 px-4">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">加载中...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">暂无数据</td></tr>
            ) : (
              data.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2 px-4">{t.transactionDate}</td>
                  <td className="py-2 px-4">
                    <span className={`px-2 py-0.5 rounded text-xs ${t.type === "expense" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                      {t.type === "expense" ? "支出" : "收入"}
                    </span>
                  </td>
                  <td className="py-2 px-4">{t.category?.icon} {t.category?.name}</td>
                  <td className="py-2 px-4">{t.description}</td>
                  <td className="py-2 px-4">{t.member?.name}</td>
                  <td className={`py-2 px-4 text-right font-medium ${t.type === "expense" ? "text-red-500" : "text-green-600"}`}>
                    {t.type === "expense" ? "-" : "+"}¥{t.amount.toFixed(2)}
                  </td>
                  <td className="py-2 px-4 text-muted-foreground">{sourceLabel(t.source)}</td>
                  <td className="py-2 px-4 text-right">
                    <button onClick={() => handleEdit(t)} className="p-1 hover:text-primary"><Edit2 className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(t.id)} className="p-1 hover:text-destructive ml-1"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
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

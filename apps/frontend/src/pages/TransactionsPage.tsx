import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import type { TransactionWithRelations, PaginatedResponse, Category, Member, InstallmentPlanWithProgress } from "@caiwu/shared";
import { buildInstallmentSchedule } from "@caiwu/shared";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { getBusinessToday } from "@/lib/date";

const SOURCE_LABELS: Record<string, string> = {
  "wechat": "微信文字",
  "wechat-voice": "微信语音",
  "wechat-image": "微信图片",
  "shortcut": "快捷指令",
  "shortcut-image": "快捷指令截图",
};

function sourceLabel(source?: string): string {
  return (source && SOURCE_LABELS[source]) || "手动录入";
}

function emptyForm(memberId = "") {
  return {
    type: "expense",
    amount: "",
    description: "",
    categoryId: "",
    memberId,
    transactionDate: getBusinessToday(),
    note: "",
    isInstallment: false,
    periods: "24",
    feePerPeriod: "0",
  };
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
    includeFutureInstallments: "",
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<InstallmentPlanWithProgress | null>(null);
  const [form, setForm] = useState(emptyForm());

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

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setEditingPlan(null);
    setForm(emptyForm(members[0]?.id || ""));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (form.isInstallment) {
        const body = {
          description: form.description,
          totalAmount: Number(form.amount),
          periods: Number(form.periods),
          feePerPeriod: Number(form.feePerPeriod || 0),
          firstDate: form.transactionDate,
          categoryId: form.categoryId,
          memberId: form.memberId,
          note: form.note,
        };
        if (editingPlan) {
          await api.put(`/installments/${editingPlan.id}`, body);
        } else {
          await api.post("/installments", body);
        }
      } else {
        const { isInstallment: _i, periods: _p, feePerPeriod: _f, ...rest } = form;
        const body = { ...rest, amount: Number(form.amount) };
        if (editingId) {
          await api.put(`/transactions/${editingId}`, body);
        } else {
          await api.post("/transactions", body);
        }
      }
    } catch (err) {
      alert((err as Error).message);
      return;
    }
    closeForm();
    loadData();
  };

  const openPlanEditor = async (planId: string) => {
    const plan = await api.get<InstallmentPlanWithProgress>(`/installments/${planId}`);
    setEditingId(null);
    setEditingPlan(plan);
    setForm({
      type: "expense",
      amount: String(plan.totalAmount),
      description: plan.description,
      categoryId: plan.categoryId,
      memberId: plan.memberId,
      transactionDate: plan.firstDate,
      note: plan.note || "",
      isInstallment: true,
      periods: String(plan.periods),
      feePerPeriod: String(plan.feePerPeriod),
    });
    setShowForm(true);
  };

  const handlePayoff = async (payoffDate: string | null) => {
    if (!editingPlan) return;
    const tip = payoffDate
      ? `确定在 ${payoffDate} 提前还清吗？剩余 ¥${editingPlan.remainingAmount.toFixed(2)} 会合并为当天一笔支出。`
      : "确定撤销提前还清，恢复为按期扣款吗？";
    if (!confirm(tip)) return;
    const plan = await api.post<InstallmentPlanWithProgress>(`/installments/${editingPlan.id}/payoff`, { payoffDate });
    setEditingPlan(plan);
    loadData();
  };

  const handleEdit = (t: TransactionWithRelations) => {
    if (t.installmentPlanId) {
      openPlanEditor(t.installmentPlanId);
      return;
    }
    setEditingPlan(null);
    setEditingId(t.id);
    setForm({
      type: t.type,
      amount: String(t.amount),
      description: t.description,
      categoryId: t.categoryId,
      memberId: t.memberId,
      transactionDate: t.transactionDate,
      note: t.note || "",
      isInstallment: false,
      periods: "24",
      feePerPeriod: "0",
    });
    setShowForm(true);
  };

  const handleDelete = async (t: TransactionWithRelations) => {
    if (t.installmentPlanId) {
      const periods = t.installmentPlan?.periods ?? "";
      if (!confirm(`这是一笔分期记录，删除会移除整个分期计划（共 ${periods} 期）的所有记录，确定吗？`)) return;
      await api.delete(`/installments/${t.installmentPlanId}`);
    } else {
      if (!confirm("确定删除这条记录吗？")) return;
      await api.delete(`/transactions/${t.id}`);
    }
    loadData();
  };

  const today = getBusinessToday();
  const totalPages = Math.ceil(total / 20);
  const filteredCategories = categories.filter((c) => !form.type || c.type === form.type);
  const schedule =
    form.isInstallment && Number(form.amount) > 0 && Number(form.periods) >= 2 && form.transactionDate
      ? buildInstallmentSchedule({
          totalAmount: Number(form.amount),
          periods: Number(form.periods),
          feePerPeriod: Number(form.feePerPeriod || 0),
          firstDate: form.transactionDate,
        })
      : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold">记账管理</h2>
        <button
          onClick={() => { setForm(emptyForm(members[0]?.id || "")); setEditingId(null); setEditingPlan(null); setShowForm(true); }}
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
        <label className="flex items-center gap-1 self-center text-sm text-muted-foreground">
          <input type="checkbox" checked={filters.includeFutureInstallments === "true"} onChange={(e) => setFilters({ ...filters, includeFutureInstallments: e.target.checked ? "true" : "" })} />
          显示未到期分期
        </label>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onClick={closeForm}>
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg bg-card p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold mb-4">{editingPlan ? "编辑分期计划" : editingId ? "编辑记录" : "新增记录"}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex gap-2">
                <label className="flex items-center gap-1 text-sm">
                  <input type="radio" name="type" value="expense" checked={form.type === "expense"} disabled={!!editingPlan} onChange={() => setForm({ ...form, type: "expense", categoryId: "" })} /> 支出
                </label>
                <label className="flex items-center gap-1 text-sm">
                  <input type="radio" name="type" value="income" checked={form.type === "income"} disabled={!!editingPlan} onChange={() => setForm({ ...form, type: "income", categoryId: "", isInstallment: false })} /> 收入
                </label>
                {form.type === "expense" && !editingId && (
                  <label className="ml-auto flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={form.isInstallment} disabled={!!editingPlan} onChange={(e) => setForm({ ...form, isInstallment: e.target.checked })} /> 分期付款
                  </label>
                )}
              </div>
              <input type="number" step="0.01" placeholder={form.isInstallment ? "商品总价（不含手续费）" : "金额"} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full px-3 py-2 border rounded text-sm" required />
              <input type="text" placeholder="描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border rounded text-sm" required />
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="w-full px-3 py-2 border rounded text-sm" required>
                <option value="">选择分类</option>
                {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
              <select value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} className="w-full px-3 py-2 border rounded text-sm" required>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {form.isInstallment && (
                <div className="flex gap-2">
                  <label className="flex-1 text-xs text-muted-foreground">
                    期数
                    <input type="number" min={2} max={120} step={1} value={form.periods} onChange={(e) => setForm({ ...form, periods: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded text-sm text-foreground" required />
                  </label>
                  <label className="flex-1 text-xs text-muted-foreground">
                    每期手续费（免息填 0）
                    <input type="number" min={0} step="0.01" value={form.feePerPeriod} onChange={(e) => setForm({ ...form, feePerPeriod: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded text-sm text-foreground" />
                  </label>
                </div>
              )}
              <label className="block text-xs text-muted-foreground">
                {form.isInstallment && "首期扣款日"}
                <input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })} className="w-full px-3 py-2 border rounded text-sm text-foreground" required />
              </label>
              {schedule.length > 0 && (
                <div className="rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                  <div>
                    每期 <span className="font-medium text-foreground">¥{schedule[0].amount.toFixed(2)}</span> × {schedule.length} 期
                    {schedule[schedule.length - 1].amount !== schedule[0].amount && `（末期 ¥${schedule[schedule.length - 1].amount.toFixed(2)}）`}
                  </div>
                  <div>
                    合计 ¥{(schedule.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100).toFixed(2)}，
                    {schedule[0].date} 至 {schedule[schedule.length - 1].date}，每月计入当期支出
                  </div>
                </div>
              )}
              {editingPlan && (
                <div className="rounded border px-3 py-2 text-xs space-y-1">
                  <div>
                    已扣 {editingPlan.paidPeriods}/{editingPlan.periods} 期 ¥{editingPlan.paidAmount.toFixed(2)}，
                    剩余 ¥{editingPlan.remainingAmount.toFixed(2)}
                  </div>
                  {editingPlan.payoffDate ? (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">已于 {editingPlan.payoffDate} 提前还清</span>
                      <button type="button" onClick={() => handlePayoff(null)} className="text-primary hover:underline">撤销还清</button>
                    </div>
                  ) : editingPlan.remainingAmount > 0 ? (
                    <button type="button" onClick={() => handlePayoff(today)} className="text-primary hover:underline">今天提前还清</button>
                  ) : null}
                </div>
              )}
              <input type="text" placeholder="备注（可选）" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full px-3 py-2 border rounded text-sm" />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={closeForm} className="px-4 py-2 border rounded text-sm">取消</button>
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
                <tr key={t.id} className={`border-b last:border-0 hover:bg-muted/30 ${t.transactionDate > today ? "opacity-50" : ""}`}>
                  <td className="py-2 px-4">{t.transactionDate}</td>
                  <td className="py-2 px-4">
                    <span className={`px-2 py-0.5 rounded text-xs ${t.type === "expense" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                      {t.type === "expense" ? "支出" : "收入"}
                    </span>
                    {t.installmentPlanId && (
                      <span className="ml-1 px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                        {t.transactionDate > today ? "未到期" : "分期"}
                      </span>
                    )}
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
                    <button onClick={() => handleDelete(t)} className="p-1 hover:text-destructive ml-1"><Trash2 className="h-4 w-4" /></button>
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

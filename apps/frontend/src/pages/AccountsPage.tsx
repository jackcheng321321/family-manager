import { useState, useEffect } from "react";
import { api } from "@/api/client";
import type { Account } from "@caiwu/shared";
import { Plus, Trash2, Edit2 } from "lucide-react";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash: "现金", bank: "银行卡", alipay: "支付宝", wechat: "微信", credit: "信用卡", other: "其他",
};

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "bank", icon: "" });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try { setAccounts(await api.get<Account[]>("/accounts")); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) await api.put(`/accounts/${editingId}`, form);
    else await api.post("/accounts", form);
    setShowForm(false);
    setEditingId(null);
    setForm({ name: "", type: "bank", icon: "" });
    loadData();
  };

  const handleEdit = (a: Account) => {
    setEditingId(a.id);
    setForm({ name: a.name, type: a.type, icon: a.icon || "" });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该账户吗？")) return;
    await api.delete(`/accounts/${id}`);
    loadData();
  };

  const toggleActive = async (a: Account) => {
    await api.put(`/accounts/${a.id}`, { isActive: !a.isActive });
    loadData();
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold">账户管理</h2>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: "", type: "bank", icon: "" }); }}
          className="flex items-center gap-1 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm">
          <Plus className="h-4 w-4" /> 新增账户
        </button>
      </div>
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onClick={() => setShowForm(false)}>
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg bg-card p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold mb-4">{editingId ? "编辑账户" : "新增账户"}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="text" placeholder="账户名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded text-sm" required />
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 border rounded text-sm">
                {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="text" placeholder="图标（emoji，可选）" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} className="w-full px-3 py-2 border rounded text-sm" />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded text-sm">取消</button>
                <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead><tr className="border-b bg-muted/50">
            <th className="text-left py-3 px-4">图标</th>
            <th className="text-left py-3 px-4">名称</th>
            <th className="text-left py-3 px-4">类型</th>
            <th className="text-left py-3 px-4">状态</th>
            <th className="text-right py-3 px-4">操作</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">加载中...</td></tr>
            ) : accounts.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">暂无账户</td></tr>
            ) : accounts.map((a) => (
              <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-2 px-4 text-lg">{a.icon || "-"}</td>
                <td className="py-2 px-4 font-medium">{a.name}</td>
                <td className="py-2 px-4">{ACCOUNT_TYPE_LABELS[a.type] || a.type}</td>
                <td className="py-2 px-4">
                  <button onClick={() => toggleActive(a)} className={`px-2 py-0.5 rounded text-xs ${a.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {a.isActive ? "启用" : "禁用"}
                  </button>
                </td>
                <td className="py-2 px-4 text-right">
                  <button onClick={() => handleEdit(a)} className="p-1 hover:text-primary"><Edit2 className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(a.id)} className="p-1 hover:text-destructive ml-1"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

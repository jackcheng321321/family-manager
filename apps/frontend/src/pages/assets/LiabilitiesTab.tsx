import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Liability, LiabilityType, Asset, Member } from "@caiwu/shared";
import { LIABILITY_TYPE_LABELS } from "@caiwu/shared";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { formatCurrency, formatPercent } from "./helpers";

const TYPES = Object.keys(LIABILITY_TYPE_LABELS) as LiabilityType[];

const emptyForm = {
  type: "mortgage" as LiabilityType,
  name: "",
  balance: "",
  originalAmount: "",
  interestRate: "",
  monthlyPayment: "",
  memberId: "",
  linkedAssetId: "",
  note: "",
};

export function LiabilitiesTab({ onChanged }: { onChanged?: () => void }) {
  const [items, setItems] = useState<Liability[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [l, a, m] = await Promise.all([
        api.get<Liability[]>("/liabilities"),
        api.get<Asset[]>("/assets"),
        api.get<Member[]>("/members"),
      ]);
      setItems(l);
      setAssets(a);
      setMembers(m);
    } finally {
      setLoading(false);
    }
  };

  const memberName = (id: string | null) => (id ? members.find((m) => m.id === id)?.name || "未知" : "家庭共有");
  const assetName = (id: string | null) => (id ? assets.find((a) => a.id === id)?.name || "" : "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      type: form.type,
      name: form.name,
      balance: Number(form.balance),
      originalAmount: form.originalAmount === "" ? undefined : Number(form.originalAmount),
      interestRate: form.interestRate === "" ? undefined : Number(form.interestRate),
      monthlyPayment: form.monthlyPayment === "" ? undefined : Number(form.monthlyPayment),
      memberId: form.memberId || undefined,
      linkedAssetId: form.linkedAssetId || undefined,
      note: form.note || undefined,
    };
    if (editingId) await api.put(`/liabilities/${editingId}`, body);
    else await api.post("/liabilities", body);
    closeForm();
    loadData();
    onChanged?.();
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleEdit = (l: Liability) => {
    setEditingId(l.id);
    setForm({
      type: l.type,
      name: l.name,
      balance: String(l.balance),
      originalAmount: l.originalAmount == null ? "" : String(l.originalAmount),
      interestRate: l.interestRate == null ? "" : String(l.interestRate),
      monthlyPayment: l.monthlyPayment == null ? "" : String(l.monthlyPayment),
      memberId: l.memberId || "",
      linkedAssetId: l.linkedAssetId || "",
      note: l.note || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该负债？")) return;
    await api.delete(`/liabilities/${id}`);
    loadData();
    onChanged?.();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">记录房贷、车贷、信用卡等负债，用于计算净资产</p>
        <button
          onClick={() => {
            setForm(emptyForm);
            setEditingId(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> 新增负债
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left">名称</th>
                <th className="px-4 py-3 text-left">类型</th>
                <th className="px-4 py-3 text-right">剩余本金</th>
                <th className="px-4 py-3 text-right">月供</th>
                <th className="px-4 py-3 text-right">年利率</th>
                <th className="px-4 py-3 text-left">关联资产</th>
                <th className="px-4 py-3 text-left">归属</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    加载中...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    暂无数据
                  </td>
                </tr>
              ) : (
                items.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{l.name}</td>
                    <td className="px-4 py-2">{LIABILITY_TYPE_LABELS[l.type] || l.type}</td>
                    <td className="px-4 py-2 text-right font-medium text-red-500">{formatCurrency(l.balance)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {l.monthlyPayment == null ? "-" : formatCurrency(l.monthlyPayment)}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{formatPercent(l.interestRate)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{assetName(l.linkedAssetId) || "-"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{memberName(l.memberId)}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => handleEdit(l)} className="p-1 hover:text-primary">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(l.id)} className="ml-1 p-1 hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onClick={closeForm}>
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg bg-card p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 font-bold">{editingId ? "编辑负债" : "新增负债"}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="text" placeholder="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded border px-3 py-2 text-sm" required />
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LiabilityType })} className="w-full rounded border px-3 py-2 text-sm">
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LIABILITY_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <input type="number" step="0.01" placeholder="当前剩余本金" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} className="w-full rounded border px-3 py-2 text-sm" required />
              <div className="flex gap-2">
                <input type="number" step="0.01" placeholder="原始金额（可选）" value={form.originalAmount} onChange={(e) => setForm({ ...form, originalAmount: e.target.value })} className="w-full flex-1 rounded border px-3 py-2 text-sm" />
                <input type="number" step="0.01" placeholder="月供（可选）" value={form.monthlyPayment} onChange={(e) => setForm({ ...form, monthlyPayment: e.target.value })} className="w-full flex-1 rounded border px-3 py-2 text-sm" />
              </div>
              <input type="number" step="0.01" placeholder="年利率 %（可选）" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} className="w-full rounded border px-3 py-2 text-sm" />
              <select value={form.linkedAssetId} onChange={(e) => setForm({ ...form, linkedAssetId: e.target.value })} className="w-full rounded border px-3 py-2 text-sm">
                <option value="">关联资产（如房贷↔房产，可选）</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} className="w-full rounded border px-3 py-2 text-sm">
                <option value="">家庭共有</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input type="text" placeholder="备注（可选）" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full rounded border px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={closeForm} className="rounded border px-4 py-2 text-sm">
                  取消
                </button>
                <button type="submit" className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

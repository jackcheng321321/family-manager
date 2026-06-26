import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { InsurancePolicy, InsuranceCategory, AssetFrequency, Member } from "@caiwu/shared";
import { INSURANCE_CATEGORY_LABELS } from "@caiwu/shared";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { formatCurrency } from "./helpers";

const CATEGORIES = Object.keys(INSURANCE_CATEGORY_LABELS) as InsuranceCategory[];
const FREQ_LABELS: Record<AssetFrequency, string> = {
  monthly: "每月",
  quarterly: "每季",
  yearly: "每年",
  "one-time": "一次性",
};

const emptyForm = {
  name: "",
  category: "medical" as InsuranceCategory,
  insuredMemberId: "",
  insurer: "",
  coverageAmount: "",
  premium: "",
  premiumFrequency: "" as AssetFrequency | "",
  cashValue: "",
  note: "",
};

export function InsuranceTab() {
  const [items, setItems] = useState<InsurancePolicy[]>([]);
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
      const [i, m] = await Promise.all([api.get<InsurancePolicy[]>("/insurance"), api.get<Member[]>("/members")]);
      setItems(i);
      setMembers(m);
    } finally {
      setLoading(false);
    }
  };

  const memberName = (id: string | null) => (id ? members.find((m) => m.id === id)?.name || "未知" : "-");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      name: form.name,
      category: form.category,
      insuredMemberId: form.insuredMemberId || undefined,
      insurer: form.insurer || undefined,
      coverageAmount: form.coverageAmount === "" ? undefined : Number(form.coverageAmount),
      premium: form.premium === "" ? undefined : Number(form.premium),
      premiumFrequency: form.premiumFrequency || undefined,
      cashValue: form.cashValue === "" ? undefined : Number(form.cashValue),
      note: form.note || undefined,
    };
    if (editingId) await api.put(`/insurance/${editingId}`, body);
    else await api.post("/insurance", body);
    closeForm();
    loadData();
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleEdit = (p: InsurancePolicy) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      category: p.category,
      insuredMemberId: p.insuredMemberId || "",
      insurer: p.insurer || "",
      coverageAmount: p.coverageAmount == null ? "" : String(p.coverageAmount),
      premium: p.premium == null ? "" : String(p.premium),
      premiumFrequency: p.premiumFrequency || "",
      cashValue: p.cashValue == null ? "" : String(p.cashValue),
      note: p.note || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该保单？")) return;
    await api.delete(`/insurance/${id}`);
    loadData();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">记录社保、商业医疗、寿险等保单；填写「现金价值」会计入净资产的保障部分</p>
        <button
          onClick={() => {
            setForm(emptyForm);
            setEditingId(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> 新增保单
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left">名称</th>
                <th className="px-4 py-3 text-left">险种</th>
                <th className="px-4 py-3 text-left">被保人</th>
                <th className="px-4 py-3 text-right">保额</th>
                <th className="px-4 py-3 text-right">保费</th>
                <th className="px-4 py-3 text-right">现金价值</th>
                <th className="px-4 py-3 text-left">备注</th>
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
                items.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2">{INSURANCE_CATEGORY_LABELS[p.category] || p.category}</td>
                    <td className="px-4 py-2 text-muted-foreground">{memberName(p.insuredMemberId)}</td>
                    <td className="px-4 py-2 text-right">{p.coverageAmount == null ? "-" : formatCurrency(p.coverageAmount)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {p.premium == null ? "-" : formatCurrency(p.premium)}
                      {p.premium != null && p.premiumFrequency ? `/${FREQ_LABELS[p.premiumFrequency]}` : ""}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{p.cashValue == null ? "-" : formatCurrency(p.cashValue)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{p.note || "-"}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => handleEdit(p)} className="p-1 hover:text-primary">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="ml-1 p-1 hover:text-destructive">
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
            <h3 className="mb-4 font-bold">{editingId ? "编辑保单" : "新增保单"}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="text" placeholder="保单名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded border px-3 py-2 text-sm" required />
              <div className="flex gap-2">
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as InsuranceCategory })} className="flex-1 rounded border px-3 py-2 text-sm">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {INSURANCE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
                <select value={form.insuredMemberId} onChange={(e) => setForm({ ...form, insuredMemberId: e.target.value })} className="flex-1 rounded border px-3 py-2 text-sm">
                  <option value="">被保人（可选）</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <input type="text" placeholder="承保公司（可选）" value={form.insurer} onChange={(e) => setForm({ ...form, insurer: e.target.value })} className="w-full rounded border px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <input type="number" step="0.01" placeholder="保额（可选）" value={form.coverageAmount} onChange={(e) => setForm({ ...form, coverageAmount: e.target.value })} className="flex-1 rounded border px-3 py-2 text-sm" />
                <input type="number" step="0.01" placeholder="保费（可选）" value={form.premium} onChange={(e) => setForm({ ...form, premium: e.target.value })} className="flex-1 rounded border px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2">
                <select value={form.premiumFrequency} onChange={(e) => setForm({ ...form, premiumFrequency: e.target.value as AssetFrequency | "" })} className="flex-1 rounded border px-3 py-2 text-sm">
                  <option value="">缴费频率（可选）</option>
                  {(Object.keys(FREQ_LABELS) as AssetFrequency[]).map((f) => (
                    <option key={f} value={f}>
                      {FREQ_LABELS[f]}
                    </option>
                  ))}
                </select>
                <input type="number" step="0.01" placeholder="现金价值（可选，计入净资产）" value={form.cashValue} onChange={(e) => setForm({ ...form, cashValue: e.target.value })} className="flex-1 rounded border px-3 py-2 text-sm" />
              </div>
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

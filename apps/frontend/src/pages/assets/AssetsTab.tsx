import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Asset, AssetType, AllocationBucket, AssetValuation, Member } from "@caiwu/shared";
import {
  ASSET_TYPE_LABELS,
  ALLOCATION_BUCKET_LABELS,
  ASSET_TYPE_TO_BUCKET,
} from "@caiwu/shared";
import { Plus, Trash2, Edit2, LineChart } from "lucide-react";
import { formatCurrency } from "./helpers";
import { getBusinessToday } from "@/lib/date";

const ASSET_TYPES = Object.keys(ASSET_TYPE_LABELS) as AssetType[];
const BUCKETS = Object.keys(ALLOCATION_BUCKET_LABELS) as AllocationBucket[];

const emptyForm = {
  type: "cash" as AssetType,
  name: "",
  amount: "",
  allocationBucket: "liquid" as AllocationBucket,
  accountInfo: "",
  costBasis: "",
  memberId: "",
  note: "",
};

export function AssetsTab({ onChanged }: { onChanged?: () => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [valuationFor, setValuationFor] = useState<Asset | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [a, m] = await Promise.all([api.get<Asset[]>("/assets"), api.get<Member[]>("/members")]);
      setAssets(a);
      setMembers(m);
    } finally {
      setLoading(false);
    }
  };

  const memberName = (id: string | null) => (id ? members.find((m) => m.id === id)?.name || "未知" : "家庭共有");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      type: form.type,
      name: form.name,
      amount: Number(form.amount),
      allocationBucket: form.allocationBucket,
      accountInfo: form.accountInfo || undefined,
      costBasis: form.costBasis === "" ? undefined : Number(form.costBasis),
      memberId: form.memberId || undefined,
      note: form.note || undefined,
    };
    if (editingId) await api.put(`/assets/${editingId}`, body);
    else await api.post("/assets", body);
    closeForm();
    loadData();
    onChanged?.();
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleEdit = (a: Asset) => {
    setEditingId(a.id);
    setForm({
      type: a.type,
      name: a.name,
      amount: String(a.amount),
      allocationBucket: a.allocationBucket,
      accountInfo: a.accountInfo || "",
      costBasis: a.costBasis == null ? "" : String(a.costBasis),
      memberId: a.memberId || "",
      note: a.note || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该资产？相关估值记录也会删除")) return;
    await api.delete(`/assets/${id}`);
    loadData();
    onChanged?.();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">记录所有资产，新建资产会按大类自动归入配置象限，可手动调整</p>
        <button
          onClick={() => {
            setForm(emptyForm);
            setEditingId(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> 新增资产
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left">资产名称</th>
                <th className="px-4 py-3 text-left">大类</th>
                <th className="px-4 py-3 text-left">配置象限</th>
                <th className="px-4 py-3 text-left">账户信息</th>
                <th className="px-4 py-3 text-right">当前市值</th>
                <th className="px-4 py-3 text-right">成本</th>
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
              ) : assets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    暂无数据
                  </td>
                </tr>
              ) : (
                assets.map((a) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{a.name}</td>
                    <td className="px-4 py-2">{ASSET_TYPE_LABELS[a.type] || a.type}</td>
                    <td className="px-4 py-2">{ALLOCATION_BUCKET_LABELS[a.allocationBucket] || a.allocationBucket}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.accountInfo || "-"}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatCurrency(a.amount)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {a.costBasis == null ? "-" : formatCurrency(a.costBasis)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{memberName(a.memberId)}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => setValuationFor(a)} className="p-1 hover:text-primary" title="更新市值/查看趋势">
                        <LineChart className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleEdit(a)} className="ml-1 p-1 hover:text-primary">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(a.id)} className="ml-1 p-1 hover:text-destructive">
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
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={closeForm}
        >
          <div
            className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg bg-card p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 font-bold">{editingId ? "编辑资产" : "新增资产"}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="资产名称"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded border px-3 py-2 text-sm"
                required
              />
              <div className="flex gap-2">
                <label className="flex-1 text-xs text-muted-foreground">
                  大类
                  <select
                    value={form.type}
                    onChange={(e) => {
                      const type = e.target.value as AssetType;
                      setForm({ ...form, type, allocationBucket: ASSET_TYPE_TO_BUCKET[type] });
                    }}
                    className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  >
                    {ASSET_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ASSET_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex-1 text-xs text-muted-foreground">
                  配置象限
                  <select
                    value={form.allocationBucket}
                    onChange={(e) => setForm({ ...form, allocationBucket: e.target.value as AllocationBucket })}
                    className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  >
                    {BUCKETS.map((b) => (
                      <option key={b} value={b}>
                        {ALLOCATION_BUCKET_LABELS[b]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <input
                type="number"
                step="0.01"
                placeholder="当前市值或余额"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full rounded border px-3 py-2 text-sm"
                required
              />
              <input
                type="number"
                step="0.01"
                placeholder="投入成本（投资类填，用于算收益，可选）"
                value={form.costBasis}
                onChange={(e) => setForm({ ...form, costBasis: e.target.value })}
                className="w-full rounded border px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="具体账户信息，如 程伟光-招行（可选）"
                value={form.accountInfo}
                onChange={(e) => setForm({ ...form, accountInfo: e.target.value })}
                className="w-full rounded border px-3 py-2 text-sm"
              />
              <select
                value={form.memberId}
                onChange={(e) => setForm({ ...form, memberId: e.target.value })}
                className="w-full rounded border px-3 py-2 text-sm"
              >
                <option value="">家庭共有</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="备注（可选）"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="w-full rounded border px-3 py-2 text-sm"
              />
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

      {valuationFor && (
        <ValuationModal
          asset={valuationFor}
          onClose={() => setValuationFor(null)}
          onSaved={() => {
            loadData();
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

function ValuationModal({ asset, onClose, onSaved }: { asset: Asset; onClose: () => void; onSaved: () => void }) {
  const [history, setHistory] = useState<AssetValuation[]>([]);
  const [date, setDate] = useState(getBusinessToday());
  const [value, setValue] = useState(String(asset.amount));

  useEffect(() => {
    api.get<AssetValuation[]>(`/assets/${asset.id}/valuations`).then(setHistory);
  }, [asset.id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post(`/assets/${asset.id}/valuations`, { date, value: Number(value) });
    const next = await api.get<AssetValuation[]>(`/assets/${asset.id}/valuations`);
    setHistory(next);
    onSaved();
  };

  const remove = async (vid: string) => {
    await api.delete(`/assets/valuations/${vid}`);
    setHistory(await api.get<AssetValuation[]>(`/assets/${asset.id}/valuations`));
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg bg-card p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 font-bold">{asset.name} · 市值记录</h3>
        <p className="mb-4 text-xs text-muted-foreground">记录每次市值，最新一条会同步为当前市值，并汇入净资产趋势</p>
        <form onSubmit={save} className="mb-4 flex gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border px-2 py-2 text-sm" required />
          <input
            type="number"
            step="0.01"
            placeholder="市值"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="flex-1 rounded border px-3 py-2 text-sm"
            required
          />
          <button type="submit" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">
            记录
          </button>
        </form>
        <div className="space-y-1">
          {history.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">暂无记录</p>
          ) : (
            history.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                <span className="text-muted-foreground">{h.date}</span>
                <span className="font-medium">{formatCurrency(h.value)}</span>
                <button onClick={() => remove(h.id)} className="p-1 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded border px-4 py-2 text-sm">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

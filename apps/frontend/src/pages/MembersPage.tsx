import { useState, useEffect } from "react";
import { api } from "@/api/client";
import type { Member } from "@caiwu/shared";
import { Edit2, UserPlus } from "lucide-react";

const ROLE_LABELS: Record<string, string> = { admin: "管理员", member: "成员" };

export function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", role: "member" });
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", role: "member" });
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try { setMembers(await api.get<Member[]>("/members")); }
    finally { setLoading(false); }
  };

  const handleEdit = (m: Member) => {
    setEditingId(m.id);
    setForm({ name: m.name, role: m.role });
  };

  const handleSave = async () => {
    if (!editingId) return;
    await api.put(`/members/${editingId}`, form);
    setEditingId(null);
    loadData();
  };

  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      await api.post("/members", createForm);
      setShowCreate(false);
      setCreateForm({ name: "", role: "member" });
      loadData();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">成员管理</h2>
          <p className="text-sm text-muted-foreground">微信用户对话时自动注册；没有微信的成员（如小孩）可手动新增。</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm">
          <UserPlus className="h-4 w-4" /> 新增成员
        </button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b bg-muted/50">
            <th className="text-left py-3 px-4">名称</th>
            <th className="text-left py-3 px-4">角色</th>
            <th className="text-left py-3 px-4">微信ID</th>
            <th className="text-left py-3 px-4">注册时间</th>
            <th className="text-right py-3 px-4">操作</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">加载中...</td></tr>
            ) : members.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">暂无成员</td></tr>
            ) : members.map((m) => (
              <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-2 px-4">
                  {editingId === m.id ? (
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-2 py-1 border rounded text-sm w-32" />
                  ) : <span className="font-medium">{m.name}</span>}
                </td>
                <td className="py-2 px-4">
                  {editingId === m.id ? (
                    <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="px-2 py-1 border rounded text-sm">
                      <option value="admin">管理员</option>
                      <option value="member">成员</option>
                    </select>
                  ) : <span className={`px-2 py-0.5 rounded text-xs ${m.role === "admin" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>{ROLE_LABELS[m.role]}</span>}
                </td>
                <td className="py-2 px-4 text-muted-foreground">{m.wechatUserId || "-"}</td>
                <td className="py-2 px-4 text-muted-foreground">{new Date(m.createdAt).toLocaleDateString("zh-CN")}</td>
                <td className="py-2 px-4 text-right">
                  {editingId === m.id ? (
                    <div className="flex gap-1 justify-end">
                      <button onClick={handleSave} className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs">保存</button>
                      <button onClick={() => setEditingId(null)} className="px-2 py-1 border rounded text-xs">取消</button>
                    </div>
                  ) : <button onClick={() => handleEdit(m)} className="p-1 hover:text-primary"><Edit2 className="h-4 w-4" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-card p-5 shadow-xl space-y-4">
            <h3 className="text-lg font-bold">新增成员</h3>
            <div>
              <label className="text-sm text-muted-foreground">名称 *</label>
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="如：小孩姓名"
                className="mt-1 w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">角色</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                className="mt-1 w-full px-3 py-2 border rounded-md text-sm"
              >
                <option value="member">成员</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground">手动新增的成员没有微信ID，可用于健康档案归属。</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-3 py-2 border rounded-md text-sm" disabled={creating}>取消</button>
              <button onClick={handleCreate} disabled={creating} className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50">
                {creating ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

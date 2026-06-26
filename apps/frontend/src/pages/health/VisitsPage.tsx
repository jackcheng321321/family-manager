import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import type { MedicalVisit, Member } from "@caiwu/shared";
import { Plus, Trash2, Eye, Paperclip, Pill } from "lucide-react";

type VisitRow = MedicalVisit & {
  memberName?: string | null;
  attachmentCount?: number;
  medicationCount?: number;
};

export function VisitsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<VisitRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMember, setFilterMember] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const q = filterMember ? `?memberId=${filterMember}` : "";
      setRows(await api.get<VisitRow[]>(`/health/visits${q}`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get<Member[]>("/members").then(setMembers);
  }, []);
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMember]);

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这条就诊记录及其附件、用药？")) return;
    await api.delete(`/health/visits/${id}`);
    loadData();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">就诊记录</h2>
          <p className="text-sm text-muted-foreground">
            记录家人每次看病：主诉、检查、诊断、用药，检查结果图片可上传并自动识别。
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm"
        >
          <Plus className="h-4 w-4" /> 新增就诊记录
        </button>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={filterMember}
          onChange={(e) => setFilterMember(e.target.value)}
          className="px-3 py-1.5 border rounded-md text-sm"
        >
          <option value="">全部成员</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-3 px-4">成员</th>
                <th className="text-left py-3 px-4">就诊日期</th>
                <th className="text-left py-3 px-4">医院/科室</th>
                <th className="text-left py-3 px-4">主诉</th>
                <th className="text-left py-3 px-4">诊断</th>
                <th className="text-left py-3 px-4">附件/用药</th>
                <th className="text-right py-3 px-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">加载中...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">暂无就诊记录</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                    onClick={() => navigate(`/visits/${r.id}`)}
                  >
                    <td className="py-2 px-4 font-medium">{r.memberName || "-"}</td>
                    <td className="py-2 px-4">{r.visitDate}</td>
                    <td className="py-2 px-4 text-muted-foreground">
                      {r.hospital || "-"}
                      {r.department ? ` / ${r.department}` : ""}
                    </td>
                    <td className="py-2 px-4 text-muted-foreground max-w-[200px] truncate">{r.chiefComplaint || "-"}</td>
                    <td className="py-2 px-4 text-muted-foreground max-w-[200px] truncate">{r.diagnosis || "-"}</td>
                    <td className="py-2 px-4 text-muted-foreground">
                      <span className="inline-flex items-center gap-1 mr-3">
                        <Paperclip className="h-3.5 w-3.5" />
                        {r.attachmentCount ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Pill className="h-3.5 w-3.5" />
                        {r.medicationCount ?? 0}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => navigate(`/visits/${r.id}`)} className="p-1 hover:text-primary" title="查看">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="p-1 hover:text-red-600" title="删除">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateModal
          members={members}
          onClose={() => setShowCreate(false)}
          onDone={(id) => {
            setShowCreate(false);
            navigate(`/visits/${id}`);
          }}
        />
      )}
    </div>
  );
}

function CreateModal({
  members,
  onClose,
  onDone,
}: {
  members: Member[];
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const [form, setForm] = useState({
    memberId: members[0]?.id || "",
    visitDate: new Date().toISOString().slice(0, 10),
    hospital: "",
    department: "",
    chiefComplaint: "",
    examinations: "",
    diagnosis: "",
    treatment: "",
    followUp: "",
    cost: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: string) => setForm({ ...form, [k]: v });

  const submit = async () => {
    if (!form.memberId) return setError("请选择成员");
    setBusy(true);
    setError("");
    try {
      const payload = { ...form, cost: form.cost ? Number(form.cost) : null };
      const created = await api.post<{ id: string }>("/health/visits", payload);
      onDone(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-card p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold">新增就诊记录</h3>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted-foreground">成员 *</label>
            <select value={form.memberId} onChange={(e) => set("memberId", e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-md text-sm">
              <option value="">请选择</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">就诊日期 *</label>
            <input type="date" value={form.visitDate} onChange={(e) => set("visitDate", e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">医院</label>
            <input value={form.hospital} onChange={(e) => set("hospital", e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">科室</label>
            <input value={form.department} onChange={(e) => set("department", e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
          </div>
        </div>
        <Textarea label="主诉（什么情况去看病）" value={form.chiefComplaint} onChange={(v) => set("chiefComplaint", v)} />
        <Textarea label="做了哪些检查" value={form.examinations} onChange={(v) => set("examinations", v)} />
        <Textarea label="诊断结果" value={form.diagnosis} onChange={(v) => set("diagnosis", v)} />
        <Textarea label="医嘱 / 处理" value={form.treatment} onChange={(v) => set("treatment", v)} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted-foreground">随访建议</label>
            <input value={form.followUp} onChange={(e) => set("followUp", e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">费用（元）</label>
            <input type="number" value={form.cost} onChange={(e) => set("cost", e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
          </div>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">备注</label>
          <input value={form.note} onChange={(e) => set("note", e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
        </div>
        <p className="text-xs text-muted-foreground">保存后可在详情页上传检查结果图片/处方，并自动识别填充。</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 border rounded-md text-sm" disabled={busy}>取消</button>
          <button onClick={submit} disabled={busy} className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50">
            {busy ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-sm text-muted-foreground">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
    </div>
  );
}

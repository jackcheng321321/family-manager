import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import type { MedicalVisitWithRelations, Member, ParsedVisitImage } from "@caiwu/shared";
import { ATTACHMENT_TYPE, ATTACHMENT_TYPE_OPTIONS } from "./shared";
import { ArrowLeft, Save, Trash2, Upload, Plus, Sparkles, Download } from "lucide-react";

interface MedRow {
  drugName: string;
  spec: string;
  dosage: string;
  quantity: string;
}

export function VisitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<MedicalVisitWithRelations | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [meds, setMeds] = useState<MedRow[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [suggestion, setSuggestion] = useState<ParsedVisitImage | null>(null);

  const syncForm = (d: MedicalVisitWithRelations) => {
    setForm({
      memberId: d.memberId,
      visitDate: d.visitDate || "",
      hospital: d.hospital || "",
      department: d.department || "",
      chiefComplaint: d.chiefComplaint || "",
      examinations: d.examinations || "",
      diagnosis: d.diagnosis || "",
      treatment: d.treatment || "",
      followUp: d.followUp || "",
      cost: d.cost != null ? String(d.cost) : "",
      note: d.note || "",
    });
    setMeds(
      d.medications.map((m) => ({
        drugName: m.drugName,
        spec: m.spec || "",
        dosage: m.dosage || "",
        quantity: m.quantity || "",
      }))
    );
  };

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const d = await api.get<MedicalVisitWithRelations>(`/health/visits/${id}`);
      setData(d);
      syncForm(d);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get<Member[]>("/members").then(setMembers);
  }, []);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!id) return;
    const payload = {
      ...form,
      cost: form.cost ? Number(form.cost) : null,
      medications: meds.filter((m) => m.drugName.trim()),
    };
    await api.put(`/health/visits/${id}`, payload);
    setEditing(false);
    setSuggestion(null);
    load();
  };

  const cancelEdit = () => {
    if (data) syncForm(data);
    setEditing(false);
  };

  const applySuggestion = () => {
    if (!suggestion) return;
    setEditing(true);
    setForm((f) => ({
      ...f,
      examinations: [f.examinations, suggestion.examinations].filter(Boolean).join("\n"),
      diagnosis: f.diagnosis || suggestion.diagnosis || "",
      treatment: [f.treatment, suggestion.treatment].filter(Boolean).join("\n"),
    }));
    if (suggestion.medications?.length) {
      setMeds((prev) => [
        ...prev,
        ...suggestion.medications!.map((m) => ({
          drugName: m.drugName,
          spec: m.spec || "",
          dosage: m.dosage || "",
          quantity: m.quantity || "",
        })),
      ]);
    }
    setSuggestion(null);
  };

  const deleteAttachment = async (attId: string) => {
    if (!confirm("删除该附件？")) return;
    await api.delete(`/health/visits/attachments/${attId}`);
    load();
  };

  if (loading || !data) {
    return <div className="py-8 text-center text-muted-foreground">加载中...</div>;
  }

  const memberName = members.find((m) => m.id === data.memberId)?.name;

  return (
    <div className="space-y-4">
      <button onClick={() => navigate("/visits")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> 返回就诊记录
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">
          {memberName || "就诊记录"} · {data.visitDate}
        </h2>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={cancelEdit} className="px-3 py-2 border rounded-md text-sm">取消</button>
              <button onClick={save} className="flex items-center gap-1 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm">
                <Save className="h-4 w-4" /> 保存
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="px-3 py-2 border rounded-md text-sm">编辑</button>
          )}
        </div>
      </div>

      {suggestion && (
        <div className="flex items-start justify-between gap-3 rounded-md bg-violet-50 border border-violet-200 p-3 text-sm text-violet-900">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 mt-0.5 shrink-0" />
            <span>已从图片识别出信息（检查/诊断/用药）。可一键填入表单后再确认保存。</span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={applySuggestion} className="px-2 py-1 bg-violet-600 text-white rounded text-xs">应用</button>
            <button onClick={() => setSuggestion(null)} className="px-2 py-1 border border-violet-300 rounded text-xs">忽略</button>
          </div>
        </div>
      )}

      {/* 基本信息 */}
      <div className="rounded-lg border bg-card p-4 grid gap-4 sm:grid-cols-2">
        <FieldEdit label="成员" editing={editing}
          view={memberName || "-"}
          edit={
            <select value={form.memberId} onChange={(e) => set("memberId", e.target.value)} className="w-full px-2 py-1 border rounded text-sm">
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          }
        />
        <FieldEdit label="就诊日期" editing={editing} view={data.visitDate}
          edit={<input type="date" value={form.visitDate} onChange={(e) => set("visitDate", e.target.value)} className="w-full px-2 py-1 border rounded text-sm" />} />
        <FieldEdit label="医院" editing={editing} view={data.hospital || "-"}
          edit={<input value={form.hospital} onChange={(e) => set("hospital", e.target.value)} className="w-full px-2 py-1 border rounded text-sm" />} />
        <FieldEdit label="科室" editing={editing} view={data.department || "-"}
          edit={<input value={form.department} onChange={(e) => set("department", e.target.value)} className="w-full px-2 py-1 border rounded text-sm" />} />
        <FieldEdit label="费用" editing={editing} view={data.cost != null ? `¥${data.cost}` : "-"}
          edit={<input type="number" value={form.cost} onChange={(e) => set("cost", e.target.value)} className="w-full px-2 py-1 border rounded text-sm" />} />
        <FieldEdit label="随访建议" editing={editing} view={data.followUp || "-"}
          edit={<input value={form.followUp} onChange={(e) => set("followUp", e.target.value)} className="w-full px-2 py-1 border rounded text-sm" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LongField label="主诉" editing={editing} view={data.chiefComplaint} value={form.chiefComplaint} onChange={(v) => set("chiefComplaint", v)} />
        <LongField label="做了哪些检查" editing={editing} view={data.examinations} value={form.examinations} onChange={(v) => set("examinations", v)} />
        <LongField label="诊断结果" editing={editing} view={data.diagnosis} value={form.diagnosis} onChange={(v) => set("diagnosis", v)} />
        <LongField label="医嘱 / 处理" editing={editing} view={data.treatment} value={form.treatment} onChange={(v) => set("treatment", v)} />
      </div>

      {data.note && !editing && (
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">备注</div>
          <p className="text-sm whitespace-pre-wrap">{data.note}</p>
        </div>
      )}
      {editing && (
        <LongField label="备注" editing view={data.note} value={form.note} onChange={(v) => set("note", v)} />
      )}

      {/* 用药 */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">用药（{editing ? meds.length : data.medications.length}）</h3>
          {editing && (
            <button onClick={() => setMeds([...meds, { drugName: "", spec: "", dosage: "", quantity: "" }])} className="flex items-center gap-1 text-sm text-primary">
              <Plus className="h-4 w-4" /> 添加药品
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-2 px-4">药名</th>
                <th className="text-left py-2 px-4">规格</th>
                <th className="text-left py-2 px-4">用法用量</th>
                <th className="text-left py-2 px-4">数量</th>
                {editing && <th className="py-2 px-4"></th>}
              </tr>
            </thead>
            <tbody>
              {editing ? (
                meds.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">点击「添加药品」录入</td></tr>
                ) : (
                  meds.map((m, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1 px-2"><input value={m.drugName} onChange={(e) => updateMed(meds, setMeds, i, "drugName", e.target.value)} className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="py-1 px-2"><input value={m.spec} onChange={(e) => updateMed(meds, setMeds, i, "spec", e.target.value)} className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="py-1 px-2"><input value={m.dosage} onChange={(e) => updateMed(meds, setMeds, i, "dosage", e.target.value)} className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="py-1 px-2"><input value={m.quantity} onChange={(e) => updateMed(meds, setMeds, i, "quantity", e.target.value)} className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="py-1 px-2 text-right">
                        <button onClick={() => setMeds(meds.filter((_, idx) => idx !== i))} className="p-1 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))
                )
              ) : data.medications.length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">暂无用药记录</td></tr>
              ) : (
                data.medications.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2 px-4 font-medium">{m.drugName}</td>
                    <td className="py-2 px-4 text-muted-foreground">{m.spec || "-"}</td>
                    <td className="py-2 px-4 text-muted-foreground">{m.dosage || "-"}</td>
                    <td className="py-2 px-4 text-muted-foreground">{m.quantity || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 附件 */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">检查结果 / 处方 / 票据（{data.attachments.length}）</h3>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-1 text-sm text-primary">
            <Upload className="h-4 w-4" /> 上传图片
          </button>
        </div>
        {data.attachments.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">暂无附件</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
            {data.attachments.map((a) => (
              <AttachmentCard key={a.id} attId={a.id} type={a.type} caption={a.caption} fileName={a.originalFileName} onDelete={() => deleteAttachment(a.id)} />
            ))}
          </div>
        )}
      </div>

      {showUpload && (
        <UploadAttachmentModal
          visitId={data.id}
          onClose={() => setShowUpload(false)}
          onDone={(sug) => {
            setShowUpload(false);
            if (sug) setSuggestion(sug);
            load();
          }}
        />
      )}
    </div>
  );
}

function updateMed(meds: MedRow[], setMeds: (m: MedRow[]) => void, i: number, key: keyof MedRow, value: string) {
  setMeds(meds.map((m, idx) => (idx === i ? { ...m, [key]: value } : m)));
}

function FieldEdit({ label, editing, view, edit }: { label: string; editing: boolean; view: React.ReactNode; edit: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-sm">{editing ? edit : view}</div>
    </div>
  );
}

function LongField({ label, editing, view, value, onChange }: { label: string; editing: boolean; view: string | null; value: string; onChange: (v: string) => void }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {editing ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full px-2 py-1 border rounded text-sm" />
      ) : (
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{view || "暂无"}</p>
      )}
    </div>
  );
}

function AttachmentCard({
  attId,
  type,
  caption,
  fileName,
  onDelete,
}: {
  attId: string;
  type: string;
  caption: string | null;
  fileName: string | null;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = !fileName || /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(fileName);

  useEffect(() => {
    let current: string | null = null;
    if (isImage) {
      api.fetchBlobUrl(`/health/visits/attachments/${attId}/file`).then((u) => {
        current = u;
        setUrl(u);
      }).catch(() => {});
    }
    return () => {
      if (current) URL.revokeObjectURL(current);
    };
  }, [attId, isImage]);

  return (
    <div className="group relative rounded-md border overflow-hidden">
      <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] z-10">
        {ATTACHMENT_TYPE[type as keyof typeof ATTACHMENT_TYPE] || type}
      </div>
      <button onClick={onDelete} className="absolute top-1 right-1 z-10 p-1 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition" title="删除">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={caption || "附件"} className="h-32 w-full object-cover" />
        </a>
      ) : (
        <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
          {isImage ? "加载中..." : (fileName || "文件")}
        </div>
      )}
      {caption && <div className="px-2 py-1 text-xs text-muted-foreground truncate">{caption}</div>}
    </div>
  );
}

function UploadAttachmentModal({
  visitId,
  onClose,
  onDone,
}: {
  visitId: string;
  onClose: () => void;
  onDone: (suggestion: ParsedVisitImage | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState("exam_result");
  const [caption, setCaption] = useState("");
  const [ocr, setOcr] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!file) return setError("请选择文件");
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("type", type);
      if (caption) form.append("caption", caption);
      form.append("ocr", String(ocr));
      form.append("file", file);
      const res = await api.postForm<{ suggestion: ParsedVisitImage | null }>(`/health/visits/${visitId}/attachments`, form);
      onDone(res.suggestion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-5 shadow-xl space-y-4">
        <h3 className="text-lg font-bold">上传附件</h3>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label className="text-sm text-muted-foreground">文件 *</label>
          <div className="mt-1">
            <label className="flex items-center gap-2 px-3 py-2 border rounded-md text-sm cursor-pointer hover:bg-accent">
              <Upload className="h-4 w-4" />
              {file ? file.name : "选择图片"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">类型</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-md text-sm">
            {ATTACHMENT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">说明</label>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="可选" className="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ocr} onChange={(e) => setOcr(e.target.checked)} />
          自动识别图片内容（检查结论 / 药品），辅助填表
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 border rounded-md text-sm" disabled={busy}>取消</button>
          <button onClick={submit} disabled={busy} className="flex items-center gap-1 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50">
            <Download className="h-4 w-4" /> {busy ? "上传识别中..." : "上传"}
          </button>
        </div>
      </div>
    </div>
  );
}

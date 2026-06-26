import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import type { HealthCheckup, Member } from "@caiwu/shared";
import { CHECKUP_STATUS } from "./shared";
import { Upload, Trash2, FileText, Eye } from "lucide-react";

type CheckupRow = HealthCheckup & { memberName?: string | null };

export function CheckupsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CheckupRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMember, setFilterMember] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const q = filterMember ? `?memberId=${filterMember}` : "";
      setRows(await api.get<CheckupRow[]>(`/health/checkups${q}`));
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
    if (!confirm("确定删除这份体检报告及其明细？原文件也会删除。")) return;
    await api.delete(`/health/checkups/${id}`);
    loadData();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">体检报告</h2>
          <p className="text-sm text-muted-foreground">
            上传每年的体检 PDF，自动解析姓名、结论和明细项，按成员归档。
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm"
        >
          <Upload className="h-4 w-4" /> 上传体检报告
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
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-3 px-4">成员</th>
                <th className="text-left py-3 px-4">体检日期</th>
                <th className="text-left py-3 px-4">机构</th>
                <th className="text-left py-3 px-4">状态</th>
                <th className="text-left py-3 px-4">异常摘要</th>
                <th className="text-right py-3 px-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    加载中...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    暂无体检报告
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const st = CHECKUP_STATUS[r.status] ?? CHECKUP_STATUS.pending;
                  return (
                    <tr
                      key={r.id}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/checkups/${r.id}`)}
                    >
                      <td className="py-2 px-4 font-medium">{r.memberName || "-"}</td>
                      <td className="py-2 px-4">{r.checkupDate}</td>
                      <td className="py-2 px-4 text-muted-foreground">{r.institution || "-"}</td>
                      <td className="py-2 px-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="py-2 px-4 text-muted-foreground max-w-[280px] truncate">
                        {r.abnormalSummary || r.parseMessage || "-"}
                      </td>
                      <td className="py-2 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => navigate(`/checkups/${r.id}`)}
                            className="p-1 hover:text-primary"
                            title="查看"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="p-1 hover:text-red-600"
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showUpload && (
        <UploadModal
          members={members}
          onClose={() => setShowUpload(false)}
          onDone={(id) => {
            setShowUpload(false);
            navigate(`/checkups/${id}`);
          }}
        />
      )}
    </div>
  );
}

function UploadModal({
  members,
  onClose,
  onDone,
}: {
  members: Member[];
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const [memberId, setMemberId] = useState(members[0]?.id || "");
  const [checkupDate, setCheckupDate] = useState("");
  const [institution, setInstitution] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!memberId) return setError("请选择成员");
    if (!file) return setError("请选择 PDF 文件");
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("memberId", memberId);
      if (checkupDate) form.append("checkupDate", checkupDate);
      if (institution) form.append("institution", institution);
      if (note) form.append("note", note);
      form.append("file", file);
      const created = await api.postForm<{ id: string }>("/health/checkups", form);
      onDone(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-5 shadow-xl space-y-4">
        <h3 className="text-lg font-bold">上传体检报告</h3>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground">成员 *</label>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">请选择</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">PDF 文件 *</label>
            <div className="mt-1 flex items-center gap-2">
              <label className="flex items-center gap-2 px-3 py-2 border rounded-md text-sm cursor-pointer hover:bg-accent">
                <FileText className="h-4 w-4" />
                {file ? file.name : "选择 PDF"}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-muted-foreground">体检日期</label>
              <input
                type="date"
                value={checkupDate}
                onChange={(e) => setCheckupDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 border rounded-md text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">留空则由 AI 从报告中识别</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">体检机构</label>
              <input
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="可选"
                className="mt-1 w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">备注</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="可选"
              className="mt-1 w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          上传后会自动解析（电子版 PDF 效果最佳；扫描件会保存原文件并提示手动补充）。
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 border rounded-md text-sm" disabled={busy}>
            取消
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50"
          >
            {busy ? "上传解析中..." : "上传并解析"}
          </button>
        </div>
      </div>
    </div>
  );
}

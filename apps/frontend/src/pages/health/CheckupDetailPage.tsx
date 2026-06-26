import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import type { HealthCheckupWithItems, Member } from "@caiwu/shared";
import { CHECKUP_STATUS, ITEM_FLAG } from "./shared";
import { ArrowLeft, RefreshCw, Save, AlertTriangle, Download } from "lucide-react";

export function CheckupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<HealthCheckupWithItems | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const d = await api.get<HealthCheckupWithItems>(`/health/checkups/${id}`);
      setData(d);
      setForm({
        memberId: d.memberId,
        checkupDate: d.checkupDate || "",
        institution: d.institution || "",
        overallSummary: d.overallSummary || "",
        abnormalSummary: d.abnormalSummary || "",
        note: d.note || "",
      });
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

  // 加载原始 PDF 预览（带 token）
  useEffect(() => {
    let revoked: string | null = null;
    if (data?.filePath) {
      api
        .fetchBlobUrl(`/health/checkups/${data.id}/file`)
        .then((url) => {
          revoked = url;
          setFileUrl(url);
        })
        .catch(() => setFileUrl(null));
    }
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [data?.id, data?.filePath]);

  const save = async () => {
    if (!id) return;
    await api.put(`/health/checkups/${id}`, form);
    setEditing(false);
    load();
  };

  const reparse = async () => {
    if (!id) return;
    setReparsing(true);
    try {
      await api.post(`/health/checkups/${id}/reparse`, {});
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "重新解析失败");
    } finally {
      setReparsing(false);
    }
  };

  if (loading || !data) {
    return <div className="py-8 text-center text-muted-foreground">加载中...</div>;
  }

  const memberName = members.find((m) => m.id === data.memberId)?.name;
  const nameMismatch =
    data.parsedName && memberName && !data.parsedName.includes(memberName) && !memberName.includes(data.parsedName);
  const st = CHECKUP_STATUS[data.status] ?? CHECKUP_STATUS.pending;

  return (
    <div className="space-y-4">
      <button onClick={() => navigate("/checkups")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> 返回体检报告
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">{memberName || "体检报告"}</h2>
          <span className={`px-2 py-0.5 rounded text-xs ${st.cls}`}>{st.label}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reparse}
            disabled={reparsing}
            className="flex items-center gap-1 px-3 py-2 border rounded-md text-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${reparsing ? "animate-spin" : ""}`} /> 重新解析
          </button>
          {editing ? (
            <button onClick={save} className="flex items-center gap-1 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm">
              <Save className="h-4 w-4" /> 保存
            </button>
          ) : (
            <button onClick={() => setEditing(true)} className="px-3 py-2 border rounded-md text-sm">
              编辑
            </button>
          )}
        </div>
      </div>

      {data.parseMessage && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{data.parseMessage}</span>
        </div>
      )}
      {nameMismatch && (
        <div className="flex items-start gap-2 rounded-md bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            报告中识别到的姓名「{data.parsedName}」与所选成员「{memberName}」不一致，请确认归属是否正确。
          </span>
        </div>
      )}

      {/* 基本信息 */}
      <div className="rounded-lg border bg-card p-4 grid gap-3 sm:grid-cols-2">
        <Field label="成员">
          {editing ? (
            <select value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} className="w-full px-2 py-1 border rounded text-sm">
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          ) : (
            memberName || "-"
          )}
        </Field>
        <Field label="体检日期">
          {editing ? (
            <input type="date" value={form.checkupDate} onChange={(e) => setForm({ ...form, checkupDate: e.target.value })} className="w-full px-2 py-1 border rounded text-sm" />
          ) : (
            data.checkupDate
          )}
        </Field>
        <Field label="体检机构">
          {editing ? (
            <input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} className="w-full px-2 py-1 border rounded text-sm" />
          ) : (
            data.institution || "-"
          )}
        </Field>
        <Field label="备注">
          {editing ? (
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full px-2 py-1 border rounded text-sm" />
          ) : (
            data.note || "-"
          )}
        </Field>
      </div>

      {/* 结论 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold mb-2">总体结论</h3>
          {editing ? (
            <textarea value={form.overallSummary} onChange={(e) => setForm({ ...form, overallSummary: e.target.value })} rows={5} className="w-full px-2 py-1 border rounded text-sm" />
          ) : (
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{data.overallSummary || "暂无"}</p>
          )}
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold mb-2">异常汇总</h3>
          {editing ? (
            <textarea value={form.abnormalSummary} onChange={(e) => setForm({ ...form, abnormalSummary: e.target.value })} rows={5} className="w-full px-2 py-1 border rounded text-sm" />
          ) : (
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{data.abnormalSummary || "暂无"}</p>
          )}
        </div>
      </div>

      {/* 明细项 */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">检查明细（{data.items.length}）</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-2 px-4">分组</th>
                <th className="text-left py-2 px-4">项目</th>
                <th className="text-left py-2 px-4">结果</th>
                <th className="text-left py-2 px-4">单位</th>
                <th className="text-left py-2 px-4">参考范围</th>
                <th className="text-left py-2 px-4">判定</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">暂无明细项</td>
                </tr>
              ) : (
                data.items.map((it) => {
                  const flag = ITEM_FLAG[it.flag] ?? ITEM_FLAG.unknown;
                  const abnormal = it.flag === "high" || it.flag === "low" || it.flag === "abnormal";
                  return (
                    <tr key={it.id} className={`border-b last:border-0 ${abnormal ? "bg-red-50/50" : ""}`}>
                      <td className="py-2 px-4 text-muted-foreground">{it.groupName || "-"}</td>
                      <td className="py-2 px-4 font-medium">{it.itemName}</td>
                      <td className={`py-2 px-4 ${abnormal ? "font-semibold text-red-700" : ""}`}>{it.result || "-"}</td>
                      <td className="py-2 px-4 text-muted-foreground">{it.unit || "-"}</td>
                      <td className="py-2 px-4 text-muted-foreground">{it.referenceRange || "-"}</td>
                      <td className="py-2 px-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${flag.cls}`}>{flag.label}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 原始 PDF */}
      {data.filePath && (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold">原始报告</h3>
            {fileUrl && (
              <a href={fileUrl} download={data.originalFileName || "report.pdf"} className="flex items-center gap-1 text-sm text-primary">
                <Download className="h-4 w-4" /> 下载
              </a>
            )}
          </div>
          {fileUrl ? (
            <iframe src={fileUrl} title="体检报告" className="w-full h-[600px]" />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">加载预览中...</p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

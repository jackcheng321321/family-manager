import { useState, useEffect } from "react";
import { api } from "@/api/client";
import type { Member, MemberToken, CreatedMemberToken } from "@caiwu/shared";
import { Copy, Trash2, X } from "lucide-react";

// 成员的快捷指令密钥：生成后明文只显示一次，列表里只留前几位用来辨认。

function formatTime(value: string | null): string {
  if (!value) return "从未使用";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const input = e.currentTarget.parentElement?.querySelector("input");
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // 非 HTTPS（如内网 IP 访问）时没有剪贴板权限，退回到选中文本让用户手动复制
      input?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="mt-1 flex gap-2">
        <input readOnly value={value} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 px-2 py-1.5 border rounded-md text-xs font-mono bg-muted/40" />
        <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-1.5 border rounded-md text-xs shrink-0">
          <Copy className="h-3.5 w-3.5" /> {copied ? "已复制" : "复制"}
        </button>
      </div>
    </div>
  );
}

export function ShortcutTokensDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const [tokens, setTokens] = useState<MemberToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceName, setDeviceName] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedMemberToken | null>(null);
  const [error, setError] = useState("");

  const endpoint = `${window.location.origin}/api/v1/quick/record`;

  useEffect(() => { loadTokens(); }, [member.id]);

  const loadTokens = async () => {
    setLoading(true);
    try { setTokens(await api.get<MemberToken[]>(`/members/${member.id}/tokens`)); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      const result = await api.post<CreatedMemberToken>(`/members/${member.id}/tokens`, {
        name: deviceName.trim() || undefined,
      });
      setCreated(result);
      setDeviceName("");
      loadTokens();
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (token: MemberToken) => {
    if (!confirm(`作废「${token.name}」后，用它的快捷指令将无法再记账。确定作废？`)) return;
    await api.delete(`/members/${member.id}/tokens/${token.id}`);
    if (created?.id === token.id) setCreated(null);
    loadTokens();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-card p-5 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">快捷指令密钥 · {member.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              用这里的密钥记的账都记在「{member.name}」名下，和 TA 在微信里记的账是同一个人。每台设备建议单独生成一把，丢了手机只作废那一把。
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:text-primary"><X className="h-5 w-5" /></button>
        </div>

        {created ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-3">
            <p className="text-sm font-medium text-amber-800">
              密钥只显示这一次，请现在复制到快捷指令里。关闭后就看不到了，丢了只能重新生成。
            </p>
            <CopyField label="接口地址" value={endpoint} />
            <CopyField label="密钥（填在请求头 Authorization 里，前面加 Bearer 和一个空格）" value={created.token} />
            <button onClick={() => setCreated(null)} className="px-3 py-1.5 border rounded-md text-xs">我已复制好</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="设备名，如：我的 iPhone"
              className="flex-1 min-w-0 px-3 py-2 border rounded-md text-sm"
            />
            <button onClick={handleCreate} disabled={creating} className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm shrink-0 disabled:opacity-50">
              {creating ? "生成中..." : "生成密钥"}
            </button>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="rounded-md border">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">加载中...</p>
          ) : tokens.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">还没有密钥</p>
          ) : tokens.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 border-b last:border-0 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{t.name}</div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono">{t.tokenPrefix}…</span> · 生成于 {formatTime(t.createdAt)} · 最近使用：{formatTime(t.lastUsedAt)}
                </div>
              </div>
              <button onClick={() => handleRevoke(t)} className="p-1 text-muted-foreground hover:text-red-600 shrink-0" title="作废">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

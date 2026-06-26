import { useState, useEffect } from "react";
import { api } from "@/api/client";
import { Save } from "lucide-react";

interface SettingsMap { [key: string]: string }

const SECTIONS = [
  {
    title: "AI 配置",
    description: "DeepSeek 大模型接口配置，用于微信消息的语义解析",
    fields: [
      { key: "ai.api_key", label: "API Key", type: "password", placeholder: "sk-..." },
      { key: "ai.base_url", label: "API 地址", type: "text", placeholder: "https://api.deepseek.com/v1" },
      { key: "ai.model", label: "模型名称", type: "text", placeholder: "deepseek-chat" },
      { key: "ai.temperature", label: "Temperature", type: "number", placeholder: "0.3" },
    ],
  },
  {
    title: "图片识别（阿里云百炼）",
    description: "qwen3-vl-flash 识别消费小票/支付截图并直接记账，留空则用 .env 里的 DASHSCOPE_* 配置",
    fields: [
      { key: "vision.api_key", label: "API Key", type: "password", placeholder: "sk-..." },
      { key: "vision.base_url", label: "API 地址", type: "text", placeholder: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
      { key: "vision.model", label: "模型名称", type: "text", placeholder: "qwen3-vl-flash" },
      { key: "vision.prompt", label: "图片解析提示词", type: "textarea", placeholder: "你是一个家庭财务助手。用户会发送一张图片..." },
    ],
  },
  {
    title: "AI 提示词",
    description: "自定义 AI 解析和月度总结的提示词模板",
    fields: [
      { key: "ai.parse_prompt", label: "消息解析提示词", type: "textarea", placeholder: "你是一个家庭财务助手..." },
      { key: "ai.monthly_summary_prompt", label: "月度总结提示词", type: "textarea", placeholder: "请根据以下数据生成月度财务分析..." },
      { key: "ai.financial_analysis_prompt", label: "前台 AI 分析提示词", type: "textarea", placeholder: "你是一个务实的家庭财务分析师..." },
    ],
  },
  {
    title: "月度总结推送",
    description: "每月自动生成财务分析报告并推送到微信",
    fields: [
      { key: "monthly_summary.enabled", label: "启用推送", type: "toggle" },
      { key: "monthly_summary.day", label: "推送日期（每月几号）", type: "number", placeholder: "1" },
      { key: "monthly_summary.hour", label: "推送时间（小时）", type: "number", placeholder: "9" },
    ],
  },
  {
    title: "微信机器人",
    description: "OpenILink Hub 连接配置",
    fields: [
      { key: "hub.url", label: "Hub 地址", type: "text", placeholder: "https://hub.openilink.com" },
      { key: "hub.base_url", label: "系统公网地址", type: "text", placeholder: "https://your-domain.com" },
    ],
  },
];
export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try { setSettings(await api.get<SettingsMap>("/settings")); }
    finally { setLoading(false); }
  };

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/settings", settings);
      setMessage("保存成功");
      setTimeout(() => setMessage(""), 2000);
    } catch { setMessage("保存失败"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-muted-foreground">加载中...</div>;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold">系统设置</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          {message && <span className="text-sm text-green-600">{message}</span>}
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? "保存中..." : "保存设置"}
          </button>
        </div>
      </div>
      {SECTIONS.map((section) => (
        <div key={section.title} className="bg-card border rounded-lg p-5 space-y-4">
          <div>
            <h3 className="font-medium">{section.title}</h3>
            <p className="text-sm text-muted-foreground">{section.description}</p>
            {section.title === "微信机器人" && (
              <p className="text-xs text-muted-foreground mt-1">
                保存后会直接影响 OAuth、Manifest 和消息发送，不需要再额外改后端代码。
              </p>
            )}
          </div>
          {section.fields.map((field) => (
            <div key={field.key} className="space-y-1">
              <label className="text-sm font-medium">{field.label}</label>
              {field.type === "textarea" ? (
                <textarea value={settings[field.key] || ""} onChange={(e) => handleChange(field.key, e.target.value)}
                  placeholder={field.placeholder} rows={4} className="w-full px-3 py-2 border rounded text-sm resize-y" />
              ) : field.type === "toggle" ? (
                <button onClick={() => handleChange(field.key, settings[field.key] === "true" ? "false" : "true")}
                  className={`px-3 py-1 rounded text-sm ${settings[field.key] === "true" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {settings[field.key] === "true" ? "已启用" : "已禁用"}
                </button>
              ) : (
                <input type={field.type} value={settings[field.key] || ""} onChange={(e) => handleChange(field.key, e.target.value)}
                  placeholder={field.placeholder} className="w-full px-3 py-2 border rounded text-sm" />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

import { useState } from "react";
import { OverviewTab } from "./assets/OverviewTab";
import { AssetsTab } from "./assets/AssetsTab";
import { LiabilitiesTab } from "./assets/LiabilitiesTab";
import { InsuranceTab } from "./assets/InsuranceTab";

type Tab = "overview" | "assets" | "liabilities" | "insurance";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "总览" },
  { key: "assets", label: "资产明细" },
  { key: "liabilities", label: "负债" },
  { key: "insurance", label: "保险" },
];

export function AssetsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  // 资产/负债/保险变更后，递增此 key 触发总览重新计算
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">资产管理</h2>
        <p className="mt-1 text-sm text-muted-foreground">资产负债总览、配置分析与投资收益</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab refreshKey={refreshKey} />}
      {tab === "assets" && <AssetsTab onChanged={bumpRefresh} />}
      {tab === "liabilities" && <LiabilitiesTab onChanged={bumpRefresh} />}
      {tab === "insurance" && <InsuranceTab />}
    </div>
  );
}

import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  Landmark,
  Tags,
  Wallet,
  Users,
  Settings,
  MessageSquare,
  Brain,
  HeartPulse,
  Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "首页" },
  { to: "/analysis", icon: Brain, label: "AI分析" },
  { to: "/transactions", icon: Receipt, label: "记账管理" },
  { to: "/assets", icon: Landmark, label: "资产管理" },
  { to: "/checkups", icon: HeartPulse, label: "体检报告" },
  { to: "/visits", icon: Stethoscope, label: "就诊记录" },
  { to: "/categories", icon: Tags, label: "分类管理" },
  { to: "/accounts", icon: Wallet, label: "账户管理" },
  { to: "/members", icon: Users, label: "成员管理" },
  { to: "/messages", icon: MessageSquare, label: "消息日志" },
  { to: "/settings", icon: Settings, label: "系统设置" },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="flex min-h-screen w-60 flex-col border-r bg-card p-4">
      <div className="mb-8 px-2">
        <h1 className="text-lg font-bold">🏠 家庭管理</h1>
        <p className="text-xs text-muted-foreground mt-1">系统</p>
      </div>
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

import { useAuthStore } from "@/stores/auth";
import { LogOut, Menu } from "lucide-react";

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { username, logout } = useAuthStore();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
        aria-label="打开导航"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="hidden lg:block" />
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <span className="truncate text-sm text-muted-foreground">{username}</span>
        <button
          onClick={logout}
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          退出
        </button>
      </div>
    </header>
  );
}

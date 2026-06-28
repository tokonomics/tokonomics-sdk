import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  BarChart3,
  Users,
  TrendingUp,
  Bell,
  Settings,
  Zap,
  Key,
  Calculator,
  GitBranch,
  FileText,
  Users2,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/overview", label: "Overview", icon: BarChart3 },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/margin", label: "Margin", icon: TrendingUp },
  { href: "/simulator", label: "Simulator", icon: Calculator },
  { href: "/routing", label: "Routing", icon: GitBranch },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/settings/sdk-keys", label: "SDK Keys", icon: Key },
  { href: "/settings/team", label: "Team", icon: Users2 },
  { href: "/settings/api-keys", label: "API Keys", icon: Key },
  { href: "/settings/providers", label: "Settings", icon: Settings },
] as const;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const { userId } = auth();
  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r bg-card">
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold text-foreground">Tokonomics</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* User profile */}
        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <UserButton afterSignOutUrl="/" />
            <span className="text-sm text-muted-foreground">Account</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </main>
    </div>
  );
}

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  Images,
  Sparkles,
  Wrench,
  Crop,
  User,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  indent?: boolean;
  group?: string;
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/wallpapers", label: "Wallpapers", icon: Images },
  { to: "/visualizations", label: "Visualizations", icon: Sparkles },
];

const TOOLS: NavItem[] = [
  { to: "/visualizer", label: "Wallpaper Visualizer", icon: Sparkles },
  { to: "/tools/image-crop", label: "Image Crop", icon: Crop, indent: true },
];

const MOBILE_TABS: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/wallpapers", label: "Wallpapers", icon: Images },
  { to: "/visualizations", label: "Visuals", icon: Sparkles },
  { to: "/profile", label: "Profile", icon: User },
];

export function AppShell({
  children,
  contentClassName = "",
}: {
  children: ReactNode;
  contentClassName?: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);
  return (
    <div className="min-h-screen bg-brand-50">
      <Sidebar />
      <MobileTopBar onMenu={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} pathname={pathname} />
      <main className={"lg:pl-64 min-h-screen pt-14 lg:pt-0 pb-20 lg:pb-0 " + contentClassName}>
        {children}
      </main>
      <MobileTabBar pathname={pathname} />
    </div>
  );
}

function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}

function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-card/95 backdrop-blur border-b border-brand-900/8 flex items-center justify-between px-4">
      <Link to="/" className="text-lg font-serif italic tracking-tight text-brand-900">
        Murra.
      </Link>
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="size-9 grid place-items-center -mr-2 text-brand-900/70 hover:text-brand-900"
      >
        <Menu className="size-5" />
      </button>
    </header>
  );
}

function MobileDrawer({
  open,
  onClose,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
}) {
  const logout = useLogout();
  return (
    <div
      className={
        "lg:hidden fixed inset-0 z-50 transition-opacity " +
        (open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
      }
      aria-hidden={!open}
    >
      <div className="absolute inset-0 bg-brand-900/40" onClick={onClose} />
      <aside
        className={
          "absolute inset-y-0 left-0 w-[82%] max-w-xs bg-card flex flex-col shadow-2xl transition-transform " +
          (open ? "translate-x-0" : "-translate-x-full")
        }
      >
        <div className="px-6 pt-6 pb-6 border-b border-brand-900/5 flex items-start justify-between">
          <div>
            <Link to="/" className="text-2xl font-serif italic tracking-tight text-brand-900">
              Murra.
            </Link>
            <p className="text-[10px] uppercase tracking-[0.22em] text-brand-900/40 mt-1">Studio</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="size-9 grid place-items-center -mr-2 text-brand-900/60 hover:text-brand-900"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
          <NavGroup label="Workspace" items={NAV} pathname={pathname} />
          <NavGroup label="Tools" items={TOOLS} pathname={pathname} />
        </nav>
        <div className="border-t border-brand-900/5 p-3">
          <Link
            to="/profile"
            className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-brand-900/5"
          >
            <div className="size-9 rounded-full bg-gilded text-brand-50 grid place-items-center font-serif text-base shrink-0">
              A
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">Anna Lindqvist</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-brand-900/45 truncate">
                Heim Studio
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={logout}
            className="mt-1 w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs uppercase tracking-[0.18em] text-brand-900/55 hover:text-destructive hover:bg-destructive/5"
          >
            <LogOut className="size-3.5" />
            Logout
          </button>
        </div>
      </aside>
    </div>
  );
}

function MobileTabBar({ pathname }: { pathname: string }) {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-card/95 backdrop-blur border-t border-brand-900/8 grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
      {MOBILE_TABS.map((t) => {
        const active = pathname === t.to || pathname.startsWith(t.to + "/");
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={
              "flex flex-col items-center justify-center gap-0.5 text-[10px] uppercase tracking-[0.16em] transition-colors " +
              (active ? "text-brand-900" : "text-brand-900/45")
            }
          >
            <Icon className={"size-5 " + (active ? "text-accent" : "")} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const logout = useLogout();

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-64 flex-col bg-card border-r border-brand-900/8">
      {/* Brand */}
      <div className="px-7 pt-7 pb-8 border-b border-brand-900/5">
        <Link to="/" className="text-2xl font-serif italic tracking-tight text-brand-900">
          Murra.
        </Link>
        <p className="text-[10px] uppercase tracking-[0.22em] text-brand-900/40 mt-1">Studio</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-6">
        <NavGroup label="Workspace" items={NAV} pathname={pathname} />
        <NavGroup label="Tools" items={TOOLS} pathname={pathname} />
      </nav>

      {/* User */}
      <div className="border-t border-brand-900/5 p-3">
        <Link
          to="/profile"
          className={
            "flex items-center gap-3 px-3 py-3 rounded-md transition-colors " +
            (pathname.startsWith("/profile") ? "bg-brand-900/5" : "hover:bg-brand-900/5")
          }
        >
          <div className="size-9 rounded-full bg-gilded text-brand-50 grid place-items-center font-serif text-base shrink-0">
            A
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">Anna Lindqvist</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-brand-900/45 truncate">
              Heim Studio
            </p>
          </div>
          <User className="size-3.5 text-brand-900/40 shrink-0" />
        </Link>
        <button
          type="button"
          onClick={logout}
          className="mt-1 w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs uppercase tracking-[0.18em] text-brand-900/55 hover:text-destructive hover:bg-destructive/5 transition-colors"
        >
          <LogOut className="size-3.5" />
          Logout
        </button>
      </div>
    </aside>
  );
}

function NavGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div>
      <p className="px-4 mb-2 text-[9px] uppercase tracking-[0.24em] text-brand-900/35 font-medium flex items-center gap-2">
        {label === "Tools" && <Wrench className="size-3" />}
        {label}
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.to
            : pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <li key={item.to} className="relative">
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-accent" />
              )}
              <Link
                to={item.to}
                className={
                  "flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-md text-sm transition-colors " +
                  (item.indent ? "ml-4 " : "") +
                  (active
                    ? "bg-brand-900/5 text-brand-900 font-medium"
                    : "text-brand-900/65 hover:bg-brand-900/5 hover:text-brand-900")
                }
              >
                <Icon className={"size-4 " + (active ? "text-accent" : "text-brand-900/50")} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

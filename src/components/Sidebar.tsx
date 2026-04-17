"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { LayoutDashboard, Map, Table, CalendarClock, AlertTriangle, Database, Menu, X, ChevronDown, PanelLeftClose, PanelLeftOpen, Briefcase, Activity, Sun, Moon, UserCircle } from "lucide-react";
import { UserButton, useUser } from "@clerk/nextjs";
import { useProperties, useActivePropertyId } from "@/hooks/useConvexData";
import { useTheme } from "@/components/ThemeProvider";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, badge: null },
  { href: "/site-plan", label: "Site Plan", icon: Map, badge: null },
  { href: "/rent-roll", label: "Rent Roll", icon: Table, badge: null },
  { href: "/leases", label: "Lease Expirations", icon: CalendarClock, badge: null },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle, badge: null },
  { href: "/deals", label: "Deal Pipeline", icon: Briefcase, badge: null },
  { href: "/activity", label: "Activity", icon: Activity, badge: null },
  { href: "/data-pipeline", label: "Data Pipeline", icon: Database, badge: null },
  { href: "/account", label: "Account", icon: UserCircle, badge: null },
];

function SidebarContent({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const { properties } = useProperties();
  const { propId, setActiveProperty } = useActivePropertyId();
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const { user } = useUser();
  const firstName = user?.firstName || "";

  const current = properties.find(p => p.code === propId) || properties[0];

  function switchProperty(code: string) {
    setActiveProperty(code);
    setPortfolioOpen(false);
  }

  if (collapsed) {
    return (
      <>
        <div className="px-2 pt-4 pb-3 flex justify-center">
          <span className="text-[14px] font-bold text-white">R</span>
        </div>
        <nav className="flex-1 px-2 py-2 space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href}
                title={label}
                className={`flex items-center justify-center w-9 h-9 rounded transition-colors ${
                  active ? "bg-white/[0.08] text-white" : "text-[#71717a] hover:text-[#d4d4d8] hover:bg-white/[0.04]"
                }`}>
                <Icon size={16} strokeWidth={1.5} />
              </Link>
            );
          })}
        </nav>
        <div className="px-2 py-2 flex flex-col items-center gap-2 border-t border-white/[0.06]">
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex items-center justify-center w-9 h-9 rounded text-[#71717a] hover:text-[#d4d4d8] hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            {theme === "dark" ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
          </button>
          <UserButton appearance={{ elements: { avatarBox: "w-7 h-7" } }} />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="px-5 pt-5 pb-3 border-b border-white/[0.06]">
        <img src="/redhorn-logo.png" alt="Redhorn Capital Partners" className="h-9 w-auto brightness-0 invert opacity-90" />
      </div>

      {/* Portfolio Selector (read-only) */}
      <div className="mx-3 mt-3 mb-2">
        <p className="text-[9px] text-[#52525b] font-medium uppercase tracking-[0.12em] mb-1 px-2">Portfolio</p>
        {current && (
          <button
            onClick={() => setPortfolioOpen(!portfolioOpen)}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded bg-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <div className="text-left">
              <p className="text-[12px] font-medium text-[#d4d4d8]">{current.name}</p>
              <p className="text-[10px] text-[#52525b]">{current.location}{current.sqft ? ` \u00B7 ${current.sqft}` : ""}</p>
            </div>
            <ChevronDown size={14} className={`text-[#52525b] transition-transform ${portfolioOpen ? "rotate-180" : ""}`} />
          </button>
        )}

        {portfolioOpen && (
          <div className="mt-1 bg-[#27272a] rounded border border-white/[0.06] overflow-hidden">
            {properties.map(prop => (
              <button
                key={prop._id}
                onClick={() => switchProperty(prop.code)}
                className={`w-full text-left px-3 py-2 text-[11px] transition-colors cursor-pointer ${
                  prop.code === propId
                    ? "bg-white/[0.08] text-white"
                    : "text-[#a1a1aa] hover:bg-white/[0.04] hover:text-[#d4d4d8]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{prop.name}</p>
                  {!prop.hasData && <span className="text-[8px] text-[#52525b] uppercase">No data</span>}
                </div>
                <p className="text-[9px] text-[#52525b] mt-0.5">{prop.location}{prop.sqft ? ` \u00B7 ${prop.sqft}` : ""}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 mt-4 mb-2">
        <p className="text-[9px] text-[#52525b] font-medium uppercase tracking-[0.12em] px-2">Navigation</p>
      </div>
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} onClick={onNavigate}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded text-[12px] transition-colors ${
                active ? "bg-white/[0.08] text-white font-medium" : "text-[#71717a] hover:text-[#d4d4d8] hover:bg-white/[0.04]"
              }`}>
              <Icon size={15} strokeWidth={1.5} />
              <span className="flex-1">{label}</span>
              {badge && <span className="text-[10px] text-[#52525b] font-medium">{badge}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-3 border-t border-white/[0.06] flex items-center gap-2.5">
        <UserButton appearance={{ elements: { avatarBox: "w-7 h-7" } }} />
        <div className="leading-none min-w-0 flex-1">
          <p className="text-[12px] text-white/80 font-medium truncate">{user?.fullName || firstName || "User"}</p>
          <p className="text-[10px] text-white/30 truncate leading-relaxed pb-0.5">{user?.primaryEmailAddress?.emailAddress}</p>
        </div>
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="flex items-center justify-center w-7 h-7 rounded text-[#71717a] hover:text-[#d4d4d8] hover:bg-white/[0.04] transition-colors cursor-pointer flex-shrink-0"
        >
          {theme === "dark" ? <Sun size={14} strokeWidth={1.5} /> : <Moon size={14} strokeWidth={1.5} />}
        </button>
      </div>

      <div className="px-4 py-2 pb-3 border-t border-white/[0.04] text-center">
        <p className="text-[9px] text-white/25 leading-relaxed">Powered by Deal Manager AI</p>
      </div>
    </>
  );
}

const COLLAPSED_KEY = "redhorn_sidebar_collapsed";

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(COLLAPSED_KEY);
    if (saved === "true") setCollapsed(true);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, String(next));
    window.dispatchEvent(new CustomEvent("sidebar-toggle", { detail: { collapsed: next } }));
  }

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("sidebar-toggle", { detail: { collapsed } }));
  }, [collapsed]);

  const width = collapsed ? "w-[52px]" : "w-[240px]";

  return (
    <>
      {/* Desktop */}
      <aside className={`sidebar-desktop fixed left-0 top-0 h-screen ${width} bg-[#18181b] flex flex-col z-50 transition-all duration-200`}>
        <SidebarContent collapsed={collapsed} />
        <button
          onClick={toggle}
          className="absolute top-3 -right-3 w-6 h-6 bg-[#18181b] border border-[#3f3f46] rounded-full flex items-center justify-center text-[#71717a] hover:text-white cursor-pointer transition-colors z-50"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
        </button>
      </aside>

      {/* Mobile Header */}
      <div className="mobile-nav fixed top-0 left-0 right-0 h-12 bg-[#18181b] flex items-center justify-between px-4 z-50">
        <img src="/redhorn-logo.png" alt="Redhorn Capital" className="h-6 w-auto brightness-0 invert opacity-90" />
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-[#a1a1aa] p-1">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed left-0 top-0 h-screen w-[260px] bg-[#18181b] flex flex-col z-50 lg:hidden">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </>
      )}
      <div className="h-12 lg:hidden" />
    </>
  );
}

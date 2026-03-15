"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Map, Table, CalendarClock, AlertTriangle, Database, ChevronRight, Menu, X } from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, badge: null },
  { href: "/site-plan", label: "Site Plan", icon: Map, badge: null },
  { href: "/rent-roll", label: "Rent Roll", icon: Table, badge: "52" },
  { href: "/leases", label: "Lease Expirations", icon: CalendarClock, badge: "7" },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle, badge: "6" },
  { href: "/data-pipeline", label: "Data Pipeline", icon: Database, badge: null },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {/* Logo */}
      <div className="px-6 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4f6ef7] to-[#7c5cfc] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#4f6ef7]/25">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white" opacity="0.95"/>
              <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
              <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
            </svg>
          </div>
          <div>
            <p className="text-[15px] font-semibold text-white tracking-tight leading-tight">Deal Manager</p>
            <p className="text-[10px] text-[#8b8fa3] font-medium tracking-[0.15em] uppercase">AI Platform</p>
          </div>
        </div>
      </div>

      {/* Client Selector */}
      <div className="mx-4 mb-5">
        <div className="bg-white/[0.06] hover:bg-white/[0.08] rounded-xl px-4 py-3 cursor-pointer transition-colors border border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-[#8b8fa3] font-medium uppercase tracking-wider">Portfolio</p>
              <p className="text-[13px] font-semibold text-white mt-0.5">Redhorn Capital</p>
            </div>
            <ChevronRight size={14} className="text-[#8b8fa3]" />
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-4 mb-3">
        <p className="text-[10px] font-semibold text-[#8b8fa3] uppercase tracking-[0.15em] px-3">Navigation</p>
      </div>
      <nav className="flex-1 px-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-all duration-150 group ${
                active
                  ? "bg-[#4f6ef7] text-white shadow-lg shadow-[#4f6ef7]/25 font-medium"
                  : "text-[#8b8fa3] hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.5} />
              <span className="flex-1">{label}</span>
              {badge && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                  active ? "bg-white/20 text-white" : "bg-white/[0.08] text-[#8b8fa3]"
                }`}>{badge}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" />
          <p className="text-[11px] text-[#8b8fa3]">System Online</p>
        </div>
        <p className="text-[10px] text-[#5a5e73]">Hollister Business Park · Houston, TX</p>
        <p className="text-[10px] text-[#5a5e73] mt-0.5">Powered by Deal Manager AI</p>
      </div>
    </>
  );
}

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="sidebar-desktop fixed left-0 top-0 h-screen w-[260px] bg-[#1e1e2d] flex flex-col z-50 shadow-xl">
        <SidebarContent />
      </aside>

      {/* Mobile Header */}
      <div className="mobile-nav fixed top-0 left-0 right-0 h-14 bg-[#1e1e2d] flex items-center justify-between px-4 z-50 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#4f6ef7] to-[#7c5cfc] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white" opacity="0.95"/>
              <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
              <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
            </svg>
          </div>
          <span className="text-white text-sm font-semibold">Redhorn Capital</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-white p-1">
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed left-0 top-0 h-screen w-[280px] bg-[#1e1e2d] flex flex-col z-50 shadow-xl lg:hidden">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </>
      )}

      {/* Mobile spacer */}
      <div className="h-14 lg:hidden" />
    </>
  );
}

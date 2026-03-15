"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Map, Table, CalendarClock, AlertTriangle, Database, Menu, X } from "lucide-react";

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
      <div className="px-5 pt-5 pb-3 border-b border-white/[0.06]">
        <img src="/redhorn-logo.png" alt="Redhorn Capital Partners" className="h-9 w-auto brightness-0 invert opacity-90" />
        <p className="text-[9px] text-[#52525b] font-medium tracking-[0.12em] uppercase mt-2">Deal Manager AI</p>
      </div>

      <div className="mx-4 mt-4 mb-3">
        <p className="text-[9px] text-[#52525b] font-medium uppercase tracking-[0.12em] mb-1 px-2">Portfolio</p>
        <div className="text-[12px] font-medium text-[#d4d4d8] px-2 py-1.5">Hollister Business Park</div>
        <p className="text-[10px] text-[#52525b] px-2">Houston, TX · ~325K SF</p>
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

      <div className="px-5 py-3 border-t border-white/[0.06]">
        <p className="text-[10px] text-[#52525b]">Last updated: Mar 15, 2026 2:30 PM</p>
      </div>
    </>
  );
}

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <>
      <aside className="sidebar-desktop fixed left-0 top-0 h-screen w-[240px] bg-[#18181b] flex flex-col z-50">
        <SidebarContent />
      </aside>

      <div className="mobile-nav fixed top-0 left-0 right-0 h-12 bg-[#18181b] flex items-center justify-between px-4 z-50">
        <img src="/redhorn-logo.png" alt="Redhorn Capital" className="h-6 w-auto brightness-0 invert opacity-90" />
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-[#a1a1aa] p-1">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

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

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Map, Table, CalendarClock, AlertTriangle, Database, Menu, X, ChevronDown, Plus } from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, badge: null },
  { href: "/site-plan", label: "Site Plan", icon: Map, badge: null },
  { href: "/rent-roll", label: "Rent Roll", icon: Table, badge: "52" },
  { href: "/leases", label: "Lease Expirations", icon: CalendarClock, badge: "7" },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle, badge: "6" },
  { href: "/data-pipeline", label: "Data Pipeline", icon: Database, badge: null },
];

const portfolioProperties = [
  { id: "hollister", name: "Hollister Business Park", location: "Houston, TX", sqft: "~325K SF", active: true },
  { id: "rv-ohio", name: "RV Park — Ohio", location: "Ohio", sqft: "~40 lots", active: false },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [activeProperty, setActiveProperty] = useState("hollister");
  const current = portfolioProperties.find(p => p.id === activeProperty) || portfolioProperties[0];

  return (
    <>
      <div className="px-5 pt-5 pb-3 border-b border-white/[0.06]">
        <img src="/redhorn-logo.png" alt="Redhorn Capital Partners" className="h-9 w-auto brightness-0 invert opacity-90" />
        <p className="text-[9px] text-[#52525b] font-medium tracking-[0.12em] uppercase mt-2">Deal Manager AI</p>
      </div>

      {/* Portfolio Selector */}
      <div className="mx-3 mt-3 mb-2">
        <p className="text-[9px] text-[#52525b] font-medium uppercase tracking-[0.12em] mb-1 px-2">Portfolio</p>
        <button
          onClick={() => setPortfolioOpen(!portfolioOpen)}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded bg-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer"
        >
          <div className="text-left">
            <p className="text-[12px] font-medium text-[#d4d4d8]">{current.name}</p>
            <p className="text-[10px] text-[#52525b]">{current.location} · {current.sqft}</p>
          </div>
          <ChevronDown size={14} className={`text-[#52525b] transition-transform ${portfolioOpen ? "rotate-180" : ""}`} />
        </button>

        {portfolioOpen && (
          <div className="mt-1 bg-[#27272a] rounded border border-white/[0.06] overflow-hidden">
            {portfolioProperties.map(prop => (
              <button
                key={prop.id}
                onClick={() => { setActiveProperty(prop.id); setPortfolioOpen(false); }}
                className={`w-full text-left px-3 py-2 text-[11px] transition-colors cursor-pointer ${
                  prop.id === activeProperty
                    ? "bg-white/[0.08] text-white"
                    : "text-[#a1a1aa] hover:bg-white/[0.04] hover:text-[#d4d4d8]"
                }`}
              >
                <p className="font-medium">{prop.name}</p>
                <p className="text-[9px] text-[#52525b] mt-0.5">{prop.location} · {prop.sqft}</p>
              </button>
            ))}
            <button className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] text-[#52525b] hover:text-[#a1a1aa] border-t border-white/[0.06] cursor-pointer transition-colors">
              <Plus size={12} /> Add Property
            </button>
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

      <div className="px-5 py-3 border-t border-white/[0.06] space-y-2">
        <button className="w-full flex items-center justify-between px-2 py-1.5 rounded bg-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer group">
          <span className="text-[11px] text-[#71717a] group-hover:text-[#d4d4d8]">Search</span>
          <kbd className="text-[10px] text-[#52525b] bg-white/[0.06] border border-white/[0.06] rounded px-1.5 py-0.5 font-mono">⌘K</kbd>
        </button>
        <p className="text-[10px] text-[#52525b]">Updated Mar 15, 2026 2:30 PM</p>
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

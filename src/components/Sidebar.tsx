"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Map, Table, CalendarClock, AlertTriangle, Database } from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/site-plan", label: "Site Plan", icon: Map },
  { href: "/rent-roll", label: "Rent Roll", icon: Table },
  { href: "/leases", label: "Lease Expirations", icon: CalendarClock },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle },
  { href: "/data-pipeline", label: "Data Pipeline", icon: Database },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-[#111] border-r border-[#262626] flex flex-col z-50">
      {/* Deal Manager AI Branding */}
      <div className="p-5 border-b border-[#262626]">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white" opacity="0.9"/>
              <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
              <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-tight">Deal Manager</p>
            <p className="text-[10px] text-blue-400 font-medium tracking-widest uppercase">AI</p>
          </div>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
          <p className="text-xs font-semibold text-white">REDHORN CAPITAL</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Asset Management Dashboard</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-blue-600/20 text-blue-400 font-medium"
                  : "text-gray-400 hover:text-white hover:bg-[#1a1a1a]"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#262626]">
        <p className="text-xs text-gray-600">Hollister Business Park</p>
        <p className="text-xs text-gray-600">Houston, TX</p>
        <div className="mt-3 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <p className="text-[10px] text-gray-500">Powered by Deal Manager AI</p>
        </div>
      </div>
    </aside>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    label: "Action Board",
    href: "/",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="5" height="7" rx="1" />
        <rect x="11" y="2" width="5" height="4" rx="1" />
        <rect x="2" y="12" width="5" height="4" rx="1" />
        <rect x="11" y="9" width="5" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: "Collections",
    href: "/collections",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 2L2 6l7 4 7-4-7-4z" />
        <path d="M2 12l7 4 7-4" />
        <path d="M2 9l7 4 7-4" />
      </svg>
    ),
  },
  {
    label: "Posting Tracker",
    href: "/posting",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9l3 3 7-7" />
        <rect x="2" y="2" width="14" height="14" rx="2" />
      </svg>
    ),
  },
  {
    label: "Rent Roll",
    href: "/rent-roll",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5h12M3 9h12M3 13h8" />
      </svg>
    ),
  },
  {
    label: "Leases",
    href: "/leases",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 2v14l4-3 4 3V2H5z" />
      </svg>
    ),
  },
  {
    label: "Site Plan",
    href: "/site-plan",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="14" height="14" rx="2" />
        <path d="M2 9h14M9 2v14" />
      </svg>
    ),
  },
  {
    label: "Data Pipeline",
    href: "/pipeline",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="4" cy="9" r="2" />
        <circle cx="14" cy="5" r="2" />
        <circle cx="14" cy="13" r="2" />
        <path d="M6 9h4l2-4M10 9l2 4" />
      </svg>
    ),
  },
  {
    label: "Call Prep",
    href: "/call-prep",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h4l2 4-2.5 1.5A11 11 0 009.5 11.5L11 9l4 2v4a1 1 0 01-1 1A14 14 0 012 2a1 1 0 011-1z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Portfolio selector */}
      <div className={`px-4 pt-5 pb-4 border-b border-zinc-800 ${collapsed ? "px-2 text-center" : ""}`}>
        {!collapsed && (
          <>
            <div className="text-xs font-medium uppercase tracking-widest text-zinc-500 mb-1">Portfolio</div>
            <div className="text-sm font-semibold text-white">Hollister Business Park</div>
            <div className="text-xs text-zinc-500 mt-0.5">Houston, TX &middot; ~325K SF</div>
          </>
        )}
        {collapsed && (
          <div className="text-xs font-bold text-zinc-400">HBP</div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                active
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
              } ${collapsed ? "justify-center px-2" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={`px-4 py-4 border-t border-zinc-800 ${collapsed ? "px-2 text-center" : ""}`}>
        {!collapsed && (
          <>
            <div className="text-xs font-semibold text-zinc-300 tracking-wide">REDHORN CAPITAL</div>
            <div className="text-[10px] text-zinc-600 mt-1">Updated Mar 15, 2026</div>
          </>
        )}
        {collapsed && (
          <div className="text-[10px] text-zinc-600">RC</div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`sidebar-desktop fixed left-0 top-0 h-screen bg-[#18181b] flex flex-col z-40 transition-all duration-200 ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-7 w-6 h-6 bg-[#18181b] border border-zinc-700 rounded-full flex items-center justify-center text-zinc-400 hover:text-white z-50"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? (
              <path d="M4 2l4 4-4 4" />
            ) : (
              <path d="M8 2L4 6l4 4" />
            )}
          </svg>
        </button>
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <div className="mobile-nav fixed top-0 left-0 right-0 h-14 bg-[#18181b] flex items-center px-4 z-50">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-zinc-400 hover:text-white mr-3"
          aria-label="Toggle navigation"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            {mobileOpen ? (
              <>
                <path d="M6 6l10 10" />
                <path d="M16 6L6 16" />
              </>
            ) : (
              <>
                <path d="M4 6h14" />
                <path d="M4 11h14" />
                <path d="M4 16h14" />
              </>
            )}
          </svg>
        </button>
        <span className="text-sm font-semibold text-white">Redhorn Capital</span>
        <span className="text-xs text-zinc-500 ml-2">Hollister Business Park</span>
      </div>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div className="mobile-nav fixed inset-0 z-40 flex" onClick={() => setMobileOpen(false)}>
          <div
            className="w-64 bg-[#18181b] h-full pt-14 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </div>
          <div className="flex-1 bg-black/40" />
        </div>
      )}

      {/* Spacer for desktop layout */}
      <div className={`sidebar-desktop flex-shrink-0 transition-all duration-200 ${collapsed ? "w-16" : "w-56"}`} />
      {/* Spacer for mobile layout */}
      <div className="mobile-nav h-14" />
    </>
  );
}

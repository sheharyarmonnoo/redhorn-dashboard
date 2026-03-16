"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { LayoutDashboard, Map, Table, CalendarClock, AlertTriangle, Database, Menu, X, ChevronDown, PanelLeftClose, PanelLeftOpen, Plus, Trash2, Pencil } from "lucide-react";
import { getProperties, getActiveProperty, setActiveProperty, addProperty, deleteProperty, editProperty, Property } from "@/data/portfolio";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, badge: null },
  { href: "/site-plan", label: "Site Plan", icon: Map, badge: null },
  { href: "/rent-roll", label: "Rent Roll", icon: Table, badge: "52" },
  { href: "/leases", label: "Lease Expirations", icon: CalendarClock, badge: "7" },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle, badge: "6" },
  { href: "/data-pipeline", label: "Data Pipeline", icon: Database, badge: null },
];

function SidebarContent({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [activeProp, setActiveProp] = useState("hollister");
  const [propList, setPropList] = useState<Property[]>(getProperties());
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addLocation, setAddLocation] = useState("");
  const [addSqft, setAddSqft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingProp, setEditingProp] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editSqft, setEditSqft] = useState("");
  const current = propList.find(p => p.id === activeProp) || propList[0];

  useEffect(() => {
    setActiveProp(getActiveProperty());
    setPropList(getProperties());
    function handleListChange() { setPropList(getProperties()); }
    window.addEventListener("portfolio-list-changed", handleListChange);
    return () => window.removeEventListener("portfolio-list-changed", handleListChange);
  }, []);

  function switchProperty(id: string) {
    setActiveProp(id);
    setActiveProperty(id);
    setPortfolioOpen(false);
  }

  function handleAddProperty() {
    if (!addName.trim()) return;
    const prop = addProperty(addName.trim(), addLocation.trim(), addSqft.trim());
    setPropList(getProperties());
    setAddName(""); setAddLocation(""); setAddSqft("");
    setShowAddForm(false);
    switchProperty(prop.id);
  }

  function handleDeleteProperty(id: string) {
    deleteProperty(id);
    setPropList(getProperties());
    setConfirmDelete(null);
    setActiveProp(getActiveProperty());
  }

  function startEditProperty(prop: Property) {
    setEditingProp(prop.id);
    setEditName(prop.name);
    setEditLocation(prop.location);
    setEditSqft(prop.sqft);
  }

  function handleEditProperty() {
    if (!editingProp || !editName.trim()) return;
    editProperty(editingProp, { name: editName.trim(), location: editLocation.trim(), sqft: editSqft.trim() });
    setPropList(getProperties());
    setEditingProp(null);
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
      </>
    );
  }

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
            {propList.map(prop => (
              <div key={prop.id} className="group relative">
                {editingProp === prop.id ? (
                  <div className="p-2.5 space-y-1.5 border-b border-white/[0.06]">
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                      placeholder="Property name"
                      className="w-full text-[11px] px-2 py-1.5 bg-[#3f3f46] text-white border border-white/[0.1] rounded focus:outline-none focus:border-white/[0.2] placeholder-[#71717a]"
                      autoFocus />
                    <input type="text" value={editLocation} onChange={e => setEditLocation(e.target.value)}
                      placeholder="Location"
                      className="w-full text-[11px] px-2 py-1.5 bg-[#3f3f46] text-white border border-white/[0.1] rounded focus:outline-none focus:border-white/[0.2] placeholder-[#71717a]" />
                    <input type="text" value={editSqft} onChange={e => setEditSqft(e.target.value)}
                      placeholder="Size"
                      className="w-full text-[11px] px-2 py-1.5 bg-[#3f3f46] text-white border border-white/[0.1] rounded focus:outline-none focus:border-white/[0.2] placeholder-[#71717a]" />
                    <div className="flex gap-1.5 pt-0.5">
                      <button onClick={handleEditProperty} disabled={!editName.trim()}
                        className="text-[10px] font-medium px-2.5 py-1 bg-white text-[#18181b] rounded hover:bg-[#f4f4f5] disabled:opacity-40 cursor-pointer transition-colors">
                        Save
                      </button>
                      <button onClick={() => setEditingProp(null)}
                        className="text-[10px] text-[#71717a] cursor-pointer px-2 py-1">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => switchProperty(prop.id)}
                      className={`w-full text-left px-3 py-2 text-[11px] transition-colors cursor-pointer ${
                        prop.id === activeProp
                          ? "bg-white/[0.08] text-white"
                          : "text-[#a1a1aa] hover:bg-white/[0.04] hover:text-[#d4d4d8]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{prop.name}</p>
                        {!prop.hasData && <span className="text-[8px] text-[#52525b] uppercase">No data</span>}
                      </div>
                      <p className="text-[9px] text-[#52525b] mt-0.5">{prop.location}{prop.sqft ? ` · ${prop.sqft}` : ""}</p>
                    </button>
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={(e) => { e.stopPropagation(); startEditProperty(prop); }}
                        className="text-[#52525b] hover:text-[#d4d4d8] cursor-pointer p-0.5"
                        title="Edit property"
                      >
                        <Pencil size={11} />
                      </button>
                      {propList.length > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(prop.id); }}
                          className="text-[#52525b] hover:text-[#dc2626] cursor-pointer p-0.5"
                          title="Delete property"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Add Property */}
            {showAddForm ? (
              <div className="p-2.5 border-t border-white/[0.06] space-y-1.5">
                <input type="text" value={addName} onChange={e => setAddName(e.target.value)}
                  placeholder="Property name"
                  className="w-full text-[11px] px-2 py-1.5 bg-[#3f3f46] text-white border border-white/[0.1] rounded focus:outline-none focus:border-white/[0.2] placeholder-[#71717a]"
                  autoFocus />
                <input type="text" value={addLocation} onChange={e => setAddLocation(e.target.value)}
                  placeholder="Location (e.g. Houston, TX)"
                  className="w-full text-[11px] px-2 py-1.5 bg-[#3f3f46] text-white border border-white/[0.1] rounded focus:outline-none focus:border-white/[0.2] placeholder-[#71717a]" />
                <input type="text" value={addSqft} onChange={e => setAddSqft(e.target.value)}
                  placeholder="Size (e.g. ~50K SF)"
                  className="w-full text-[11px] px-2 py-1.5 bg-[#3f3f46] text-white border border-white/[0.1] rounded focus:outline-none focus:border-white/[0.2] placeholder-[#71717a]" />
                <div className="flex gap-1.5 pt-0.5">
                  <button onClick={handleAddProperty} disabled={!addName.trim()}
                    className="text-[10px] font-medium px-2.5 py-1 bg-white text-[#18181b] rounded hover:bg-[#f4f4f5] disabled:opacity-40 cursor-pointer transition-colors">
                    Add
                  </button>
                  <button onClick={() => { setShowAddForm(false); setAddName(""); setAddLocation(""); setAddSqft(""); }}
                    className="text-[10px] text-[#71717a] cursor-pointer px-2 py-1">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddForm(true)}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] text-[#52525b] hover:text-[#a1a1aa] border-t border-white/[0.06] cursor-pointer transition-colors">
                <Plus size={11} /> Add Property
              </button>
            )}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {confirmDelete && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
            <div className="relative bg-white rounded p-5 w-[340px] mx-4">
              <p className="text-[14px] font-semibold text-[#18181b]">Delete Property</p>
              <p className="text-[12px] text-[#71717a] mt-2 leading-relaxed">
                Are you sure you want to delete <strong className="text-[#18181b]">{propList.find(p => p.id === confirmDelete)?.name}</strong>? This will remove it from your portfolio list. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setConfirmDelete(null)}
                  className="text-[12px] font-medium px-3 py-1.5 text-[#71717a] hover:text-[#18181b] cursor-pointer">
                  Cancel
                </button>
                <button onClick={() => handleDeleteProperty(confirmDelete)}
                  className="text-[12px] font-medium px-3 py-1.5 bg-[#dc2626] text-white rounded hover:bg-[#b91c1c] cursor-pointer transition-colors">
                  Delete
                </button>
              </div>
            </div>
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

      <div className="px-5 py-3 border-t border-white/[0.06]">
        <p className="text-[10px] text-[#52525b]">Updated Mar 15, 2026 2:30 PM</p>
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

  // Emit initial state
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

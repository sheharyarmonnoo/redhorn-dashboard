"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { tenants, formatCurrency } from "@/data/tenants";
import { loadKanban, addKanbanItem } from "@/data/store";

interface CommandItem {
  id: string;
  label: string;
  sublabel?: string;
  category: "navigation" | "unit" | "action" | "search";
  onSelect: () => void;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Cmd+K / Ctrl+K toggle
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
        setQuery("");
        setSelectedIdx(0);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const nav: CommandItem[] = [
      { id: "nav-dash", label: "Dashboard", sublabel: "KPIs, charts, action items", category: "navigation", onSelect: () => router.push("/") },
      { id: "nav-site", label: "Site Plan", sublabel: "Interactive property map", category: "navigation", onSelect: () => router.push("/site-plan") },
      { id: "nav-rent", label: "Rent Roll", sublabel: "All units and tenants", category: "navigation", onSelect: () => router.push("/rent-roll") },
      { id: "nav-leases", label: "Lease Expirations", sublabel: "Renewal pipeline", category: "navigation", onSelect: () => router.push("/leases") },
      { id: "nav-alerts", label: "Alerts & Oversight", sublabel: "PM accountability", category: "navigation", onSelect: () => router.push("/alerts") },
      { id: "nav-data", label: "Data Pipeline", sublabel: "File syncs, workflow, protocol", category: "navigation", onSelect: () => router.push("/data-pipeline") },
    ];

    const unitItems: CommandItem[] = tenants.map(t => ({
      id: `unit-${t.unit}`,
      label: t.unit,
      sublabel: t.tenant ? `${t.tenant} — ${formatCurrency(t.monthlyRent)}/mo · ${t.status.replace("_", " ")}` : `Vacant — ${t.sqft.toLocaleString()} SF`,
      category: "unit" as const,
      onSelect: () => { router.push("/site-plan"); },
    }));

    const actions: CommandItem[] = [
      { id: "act-pastdue", label: "Show past due tenants", category: "action", onSelect: () => router.push("/alerts") },
      { id: "act-electric", label: "Check electric postings", category: "action", onSelect: () => router.push("/alerts") },
      { id: "act-expiring", label: "View expiring leases", category: "action", onSelect: () => router.push("/leases") },
      { id: "act-export", label: "Export full data package", sublabel: "Downloads .xlsx", category: "action", onSelect: () => router.push("/data-pipeline") },
      { id: "act-kanban", label: "View Kanban board", category: "action", onSelect: () => router.push("/") },
    ];

    return [...nav, ...actions, ...unitItems];
  }, [router]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 12);
    const q = query.toLowerCase();
    return items.filter(i =>
      i.label.toLowerCase().includes(q) ||
      (i.sublabel && i.sublabel.toLowerCase().includes(q))
    ).slice(0, 12);
  }, [items, query]);

  useEffect(() => { setSelectedIdx(0); }, [query]);

  function handleSelect(item: CommandItem) {
    item.onSelect();
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && filtered[selectedIdx]) { handleSelect(filtered[selectedIdx]); }
  }

  if (!open) return null;

  const categoryLabels: Record<string, string> = {
    navigation: "Pages",
    action: "Actions",
    unit: "Units",
    search: "Search",
  };

  // Group by category
  const grouped: { category: string; items: CommandItem[] }[] = [];
  const seen = new Set<string>();
  filtered.forEach(item => {
    if (!seen.has(item.category)) {
      seen.add(item.category);
      grouped.push({ category: item.category, items: [] });
    }
    grouped.find(g => g.category === item.category)!.items.push(item);
  });

  let flatIdx = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-[560px] mx-4 bg-white border border-[#e4e4e7] rounded overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e4e4e7]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search units, tenants, pages, actions..."
            className="flex-1 text-[14px] text-[#18181b] placeholder-[#a1a1aa] bg-transparent outline-none"
          />
          <kbd className="text-[10px] text-[#a1a1aa] bg-[#f4f4f5] border border-[#e4e4e7] rounded px-1.5 py-0.5 font-mono">esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="text-[13px] text-[#a1a1aa] text-center py-8">No results for &quot;{query}&quot;</p>
          )}
          {grouped.map(group => (
            <div key={group.category}>
              <p className="text-[10px] text-[#a1a1aa] font-medium uppercase tracking-wider px-4 py-1.5">
                {categoryLabels[group.category] || group.category}
              </p>
              {group.items.map(item => {
                const idx = flatIdx++;
                const isSelected = idx === selectedIdx;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left cursor-pointer transition-colors ${
                      isSelected ? "bg-[#f4f4f5]" : "hover:bg-[#fafafa]"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#18181b]">{item.label}</p>
                      {item.sublabel && <p className="text-[11px] text-[#a1a1aa] truncate">{item.sublabel}</p>}
                    </div>
                    {isSelected && (
                      <kbd className="text-[10px] text-[#a1a1aa] bg-white border border-[#e4e4e7] rounded px-1 py-0.5 font-mono flex-shrink-0">↵</kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[#f4f4f5] text-[10px] text-[#a1a1aa]">
          <span className="flex items-center gap-1"><kbd className="bg-[#f4f4f5] border border-[#e4e4e7] rounded px-1 py-0.5 font-mono">↑↓</kbd> Navigate</span>
          <span className="flex items-center gap-1"><kbd className="bg-[#f4f4f5] border border-[#e4e4e7] rounded px-1 py-0.5 font-mono">↵</kbd> Select</span>
          <span className="flex items-center gap-1"><kbd className="bg-[#f4f4f5] border border-[#e4e4e7] rounded px-1 py-0.5 font-mono">esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

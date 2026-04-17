"use client";
import { useState, useMemo } from "react";
import { tenants, formatCurrency } from "@/data/_seed_tenants";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  selectedUnits: Set<string>;
  onApply: (units: Set<string>) => void;
}

export default function RevenueFilter({ open, onClose, selectedUnits, onApply }: Props) {
  const [local, setLocal] = useState<Set<string>>(new Set(selectedUnits));

  const occupiedTenants = useMemo(() =>
    tenants.filter(t => t.status !== "vacant" && t.monthlyRent > 0 && !t.tenant.includes("Owner")),
  []);

  const buildings = useMemo(() => {
    const map = new Map<string, typeof occupiedTenants>();
    occupiedTenants.forEach(t => {
      if (!map.has(t.building)) map.set(t.building, []);
      map.get(t.building)!.push(t);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [occupiedTenants]);

  if (!open) return null;

  const allUnits = new Set(occupiedTenants.map(t => t.unit));
  const allSelected = allUnits.size === local.size;
  const noneSelected = local.size === 0;

  function toggleUnit(unit: string) {
    const next = new Set(local);
    if (next.has(unit)) next.delete(unit);
    else next.add(unit);
    setLocal(next);
  }

  function toggleBuilding(units: typeof occupiedTenants) {
    const bldgUnits = units.map(t => t.unit);
    const allIn = bldgUnits.every(u => local.has(u));
    const next = new Set(local);
    if (allIn) bldgUnits.forEach(u => next.delete(u));
    else bldgUnits.forEach(u => next.add(u));
    setLocal(next);
  }

  function selectAll() {
    setLocal(new Set(allUnits));
  }

  function selectNone() {
    setLocal(new Set());
  }

  function apply() {
    onApply(local);
    onClose();
  }

  const filteredRent = occupiedTenants
    .filter(t => local.has(t.unit))
    .reduce((s, t) => s + t.monthlyRent, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded w-full max-w-[520px] mx-4 max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e4e4e7] dark:border-[#3f3f46]">
          <div>
            <p className="text-[14px] font-semibold text-[#18181b] dark:text-[#fafafa]">Filter Revenue by Unit</p>
            <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a] mt-0.5">
              {local.size} of {allUnits.size} units selected — {formatCurrency(filteredRent)}/mo
            </p>
          </div>
          <button onClick={onClose} className="text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer p-1">
            <X size={18} />
          </button>
        </div>

        {/* Select All / None */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-[#f4f4f5] dark:border-[#27272a]">
          <button
            onClick={selectAll}
            className={`text-[11px] font-medium px-2.5 py-1 rounded cursor-pointer transition-colors ${allSelected ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b]" : "bg-[#f4f4f5] dark:bg-[#27272a] text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#e4e4e7] dark:hover:bg-[#3f3f46]"}`}
          >
            Select All
          </button>
          <button
            onClick={selectNone}
            className={`text-[11px] font-medium px-2.5 py-1 rounded cursor-pointer transition-colors ${noneSelected ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b]" : "bg-[#f4f4f5] dark:bg-[#27272a] text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#e4e4e7] dark:hover:bg-[#3f3f46]"}`}
          >
            Clear All
          </button>
        </div>

        {/* Building groups */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {buildings.map(([bldg, units]) => {
            const allIn = units.every(t => local.has(t.unit));
            const someIn = units.some(t => local.has(t.unit));
            return (
              <div key={bldg}>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => toggleBuilding(units)}
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors ${
                      allIn ? "bg-[#18181b] dark:bg-[#fafafa] border-[#18181b] dark:border-[#fafafa]" : someIn ? "bg-[#e4e4e7] dark:bg-[#3f3f46] border-[#a1a1aa]" : "border-[#d4d4d8] dark:border-[#52525b]"
                    }`}
                  >
                    {allIn && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-white dark:text-[#18181b]" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                    {!allIn && someIn && <span className="w-2 h-0.5 bg-[#71717a] rounded" />}
                  </button>
                  <p className="text-[11px] font-semibold text-[#18181b] dark:text-[#fafafa] uppercase tracking-wide">
                    Building {bldg}
                  </p>
                  <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">
                    {units.filter(t => local.has(t.unit)).length}/{units.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 ml-6">
                  {units.map(t => (
                    <button
                      key={t.unit}
                      onClick={() => toggleUnit(t.unit)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-left cursor-pointer transition-colors ${
                        local.has(t.unit) ? "bg-[#f4f4f5] dark:bg-[#27272a]" : "hover:bg-[#fafafa] dark:hover:bg-[#27272a]"
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        local.has(t.unit) ? "bg-[#18181b] dark:bg-[#fafafa] border-[#18181b] dark:border-[#fafafa]" : "border-[#d4d4d8] dark:border-[#52525b]"
                      }`}>
                        {local.has(t.unit) && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-white dark:text-[#18181b]" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-[#18181b] dark:text-[#fafafa]">{t.unit}</p>
                        <p className="text-[9px] text-[#a1a1aa] dark:text-[#71717a] truncate">{t.tenant} — {formatCurrency(t.monthlyRent)}/mo</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#e4e4e7] dark:border-[#3f3f46]">
          <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa]">{local.size} units · {formatCurrency(filteredRent)}/mo</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-[11px] font-medium px-3 py-1.5 text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer">
              Cancel
            </button>
            <button onClick={apply} className="text-[11px] font-medium px-4 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] transition-colors cursor-pointer">
              Apply Filter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

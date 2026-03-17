"use client";

import { useState, useMemo } from "react";
import { tenants, Tenant, formatCurrency, getStatusLabel } from "@/data/tenants";
import PageHeader from "@/components/PageHeader";
import Drawer from "@/components/Drawer";

function getCardColor(t: Tenant): { bg: string; border: string; dot: string } {
  if (t.status === "vacant") return { bg: "#f4f4f5", border: "#d4d4d8", dot: "#a1a1aa" };
  if (t.status === "past_due") return { bg: "#fef2f2", border: "#fecaca", dot: "#dc2626" };
  if (t.status === "expiring_soon") return { bg: "#fffbeb", border: "#fde68a", dot: "#d97706" };
  if (t.status === "locked_out") return { bg: "#fef2f2", border: "#fca5a5", dot: "#b91c1c" };
  return { bg: "#ffffff", border: "#e4e4e7", dot: "#16a34a" };
}

export default function SitePlanPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Tenant | null>(null);

  const buildings = useMemo(() => {
    const grouped: Record<string, Tenant[]> = { A: [], C: [], D: [] };
    for (const t of tenants) {
      grouped[t.building].push(t);
    }
    // Sort each building by unit number
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true }));
    }
    return grouped;
  }, []);

  const buildingStats = useMemo(() => {
    const stats: Record<string, { total: number; occupied: number; sf: number; rent: number }> = {};
    for (const [bldg, units] of Object.entries(buildings)) {
      stats[bldg] = {
        total: units.length,
        occupied: units.filter((u) => u.status !== "vacant").length,
        sf: units.reduce((s, u) => s + u.sqft, 0),
        rent: units.reduce((s, u) => s + u.monthlyRent, 0),
      };
    }
    return stats;
  }, [buildings]);

  return (
    <>
      <PageHeader title="Site Plan" subtitle="Hollister Business Park — Buildings A, C, D">
        <a
          href="https://www.google.com/maps/place/Hollister+Business+Park,+Houston,+TX"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs border border-[#e4e4e7] rounded px-3 py-1.5 bg-white text-[#71717a] hover:text-[#18181b] hover:bg-[#f4f4f5] transition-colors inline-flex items-center gap-1"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 1C4.8 1 3 2.8 3 5c0 3.5 4 7.5 4 7.5s4-4 4-7.5C11 2.8 9.2 1 7 1z" />
            <circle cx="7" cy="5" r="1.5" />
          </svg>
          Google Maps
        </a>
      </PageHeader>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-6 text-xs text-[#71717a]">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#16a34a]" /> Current
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#dc2626]" /> Past Due
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#d97706]" /> Expiring
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#a1a1aa]" /> Vacant
        </span>
      </div>

      {/* Buildings */}
      <div className="space-y-8">
        {(["A", "C", "D"] as const).map((bldg) => {
          const stats = buildingStats[bldg];
          return (
            <div key={bldg}>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <h2 className="text-base font-semibold text-[#18181b]">Building {bldg}</h2>
                  <p className="text-xs text-[#71717a] mt-0.5">
                    {stats.occupied}/{stats.total} occupied &middot; {stats.sf.toLocaleString()} SF &middot; {formatCurrency(stats.rent)}/mo
                  </p>
                </div>
                <div className="text-xs text-[#71717a]">
                  {Math.round((stats.occupied / stats.total) * 100)}% occ
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                {buildings[bldg].map((t) => {
                  const colors = getCardColor(t);
                  return (
                    <button
                      key={t.unit}
                      onClick={() => {
                        setSelected(t);
                        setDrawerOpen(true);
                      }}
                      className="text-left border rounded px-3 py-2 transition-colors hover:opacity-80"
                      style={{ background: colors.bg, borderColor: colors.border }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: colors.dot }}
                        />
                        <span className="text-sm font-semibold text-[#18181b]">{t.unit}</span>
                      </div>
                      <div className="text-[11px] text-[#71717a] mt-0.5 truncate">
                        {t.tenant || "VACANT"}
                      </div>
                      <div className="text-[10px] text-[#a1a1aa] mt-0.5">
                        {t.sqft.toLocaleString()} SF
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `${selected.unit}${selected.tenant ? ` — ${selected.tenant}` : " — VACANT"}` : ""}
        subtitle={selected ? `Building ${selected.building} · ${selected.sqft.toLocaleString()} SF` : ""}
      >
        {selected && (
          <div className="space-y-5">
            <div>
              <span
                className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded ${
                  selected.status === "current"
                    ? "bg-green-100 text-green-700"
                    : selected.status === "past_due"
                    ? "bg-red-100 text-red-700"
                    : selected.status === "vacant"
                    ? "bg-zinc-100 text-zinc-600"
                    : selected.status === "expiring_soon"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {getStatusLabel(selected.status)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-[#71717a] text-xs block">Lease Type</span>
                <span className="font-medium">{selected.leaseType}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Square Feet</span>
                <span className="font-medium">{selected.sqft.toLocaleString()} SF</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Monthly Rent</span>
                <span className="font-medium">{selected.monthlyRent > 0 ? formatCurrency(selected.monthlyRent) : "—"}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Monthly Electric</span>
                <span className="font-medium">{selected.monthlyElectric > 0 ? formatCurrency(selected.monthlyElectric) : "—"}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Lease Start</span>
                <span className="font-medium">{selected.leaseFrom || "—"}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Lease End</span>
                <span className="font-medium">{selected.leaseTo || "—"}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Security Deposit</span>
                <span className="font-medium">{selected.securityDeposit > 0 ? formatCurrency(selected.securityDeposit) : "—"}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Last Payment</span>
                <span className="font-medium">{selected.lastPaymentDate || "—"}</span>
              </div>
              {selected.amps && (
                <div>
                  <span className="text-[#71717a] text-xs block">Amps</span>
                  <span className="font-medium">{selected.amps}A</span>
                </div>
              )}
              {selected.makeReady && (
                <div>
                  <span className="text-[#71717a] text-xs block">Make-Ready</span>
                  <span className="font-medium text-amber-600">Needed</span>
                </div>
              )}
              {selected.splittable && (
                <div>
                  <span className="text-[#71717a] text-xs block">Splittable</span>
                  <span className="font-medium">{selected.splitDetail || "Yes"}</span>
                </div>
              )}
              {selected.pastDueAmount > 0 && (
                <div>
                  <span className="text-[#71717a] text-xs block">Past Due</span>
                  <span className="font-semibold text-red-600">{formatCurrency(selected.pastDueAmount)}</span>
                </div>
              )}
            </div>

            {selected.notes && (
              <div>
                <span className="text-[#71717a] text-xs block mb-1">Notes</span>
                <p className="text-sm bg-[#f4f4f5] px-3 py-2 rounded">{selected.notes}</p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}

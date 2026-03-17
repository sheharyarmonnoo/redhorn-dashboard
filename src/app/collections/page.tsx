"use client";

import { useState, useMemo, useCallback } from "react";
import { tenants, Tenant, DelinquencyStage, formatCurrency } from "@/data/tenants";
import PageHeader from "@/components/PageHeader";
import Drawer from "@/components/Drawer";

const STAGES: { key: DelinquencyStage; label: string }[] = [
  { key: "past_due", label: "Past Due" },
  { key: "default_notice", label: "Default Notice" },
  { key: "lockout_pending", label: "Lockout Pending" },
  { key: "locked_out", label: "Locked Out" },
  { key: "auction_pending", label: "Auction Pending" },
  { key: "auction", label: "Auction" },
];

const STAGE_COLORS: Record<DelinquencyStage, string> = {
  none: "#a1a1aa",
  past_due: "#dc2626",
  default_notice: "#ea580c",
  lockout_pending: "#d97706",
  locked_out: "#b91c1c",
  auction_pending: "#7c3aed",
  auction: "#18181b",
};

function daysPastDue(lastPaymentDate: string): number {
  if (!lastPaymentDate) return 0;
  const today = new Date("2026-03-17");
  const last = new Date(lastPaymentDate);
  const diff = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export default function CollectionsPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [localStages, setLocalStages] = useState<Record<string, DelinquencyStage>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("collections-stages");
      if (saved) return JSON.parse(saved);
    }
    return {};
  });

  const delinquentTenants = useMemo(
    () =>
      tenants.filter(
        (t) =>
          t.pastDueAmount > 0 ||
          (t.delinquencyStage && t.delinquencyStage !== "none")
      ),
    []
  );

  const getStage = useCallback(
    (t: Tenant): DelinquencyStage => {
      if (localStages[t.unit]) return localStages[t.unit];
      return t.delinquencyStage || (t.pastDueAmount > 0 ? "past_due" : "none");
    },
    [localStages]
  );

  const totalPastDue = useMemo(
    () => delinquentTenants.reduce((sum, t) => sum + t.pastDueAmount, 0),
    [delinquentTenants]
  );

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STAGES) counts[s.key] = 0;
    for (const t of delinquentTenants) {
      const stage = getStage(t);
      if (counts[stage] !== undefined) counts[stage]++;
    }
    return counts;
  }, [delinquentTenants, getStage]);

  const tenantsInStage = useCallback(
    (stage: DelinquencyStage) =>
      delinquentTenants.filter((t) => getStage(t) === stage),
    [delinquentTenants, getStage]
  );

  const advanceStage = useCallback(
    (unit: string) => {
      const currentIdx = STAGES.findIndex(
        (s) => s.key === (localStages[unit] || tenants.find((t) => t.unit === unit)?.delinquencyStage || "past_due")
      );
      const nextIdx = Math.min(currentIdx + 1, STAGES.length - 1);
      const updated = { ...localStages, [unit]: STAGES[nextIdx].key };
      setLocalStages(updated);
      localStorage.setItem("collections-stages", JSON.stringify(updated));
    },
    [localStages]
  );

  return (
    <>
      <PageHeader title="Collections" subtitle="Delinquency pipeline — track and advance past due tenants" />

      {/* Summary */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
          <div className="text-xs text-[#71717a] uppercase tracking-wide font-medium">Total Past Due</div>
          <div className="text-lg font-semibold text-red-600 mt-0.5">{formatCurrency(totalPastDue)}</div>
        </div>
        {STAGES.map((s) => (
          <div key={s.key} className="border border-[#e4e4e7] bg-white px-4 py-3 rounded min-w-[100px]">
            <div className="text-xs text-[#71717a] uppercase tracking-wide font-medium">{s.label}</div>
            <div className="text-lg font-semibold mt-0.5">{stageCounts[s.key]}</div>
          </div>
        ))}
      </div>

      {/* Pipeline columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {STAGES.map((stage) => {
          const stTenants = tenantsInStage(stage.key);
          return (
            <div key={stage.key} className="border border-[#e4e4e7] bg-white rounded">
              <div
                className="px-3 py-2 border-b border-[#e4e4e7] flex items-center gap-2"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: STAGE_COLORS[stage.key] }}
                />
                <span className="text-xs font-medium uppercase tracking-wide text-[#71717a]">
                  {stage.label}
                </span>
                <span className="text-xs text-[#a1a1aa] ml-auto">{stTenants.length}</span>
              </div>
              <div className="p-2 space-y-2 min-h-[80px]">
                {stTenants.length === 0 && (
                  <p className="text-xs text-[#a1a1aa] text-center py-4">No tenants</p>
                )}
                {stTenants.map((t) => (
                  <button
                    key={t.unit}
                    onClick={() => {
                      setSelected(t);
                      setDrawerOpen(true);
                    }}
                    className="w-full text-left border border-[#e4e4e7] rounded px-3 py-2 hover:bg-[#f4f4f5] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[#18181b]">{t.unit}</span>
                      <span className="text-xs font-semibold text-red-600">
                        {formatCurrency(t.pastDueAmount)}
                      </span>
                    </div>
                    <div className="text-xs text-[#71717a] mt-0.5 truncate">{t.tenant}</div>
                    <div className="text-[10px] text-[#a1a1aa] mt-1">
                      {daysPastDue(t.lastPaymentDate)} days past due
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `${selected.unit} — ${selected.tenant}` : ""}
        subtitle={selected ? `Building ${selected.building} · ${selected.leaseType}` : ""}
      >
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-[#71717a] text-xs block">Past Due Amount</span>
                <span className="font-semibold text-red-600">{formatCurrency(selected.pastDueAmount)}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Days Past Due</span>
                <span className="font-semibold">{daysPastDue(selected.lastPaymentDate)}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Current Stage</span>
                <span className="font-semibold">
                  {(getStage(selected)).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Last Payment</span>
                <span className="font-semibold">{selected.lastPaymentDate || "—"}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Monthly Rent</span>
                <span className="font-medium">{formatCurrency(selected.monthlyRent)}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Security Deposit</span>
                <span className="font-medium">{formatCurrency(selected.securityDeposit)}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Lease End</span>
                <span className="font-medium">{selected.leaseTo}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Square Feet</span>
                <span className="font-medium">{selected.sqft.toLocaleString()} SF</span>
              </div>
            </div>

            {selected.notes && (
              <div>
                <span className="text-[#71717a] text-xs block mb-1">Notes</span>
                <p className="text-sm bg-[#f4f4f5] px-3 py-2 rounded">{selected.notes}</p>
              </div>
            )}

            {/* Stage timeline */}
            <div>
              <span className="text-[#71717a] text-xs block mb-2">Delinquency Timeline</span>
              <div className="space-y-1">
                {STAGES.map((s, i) => {
                  const current = getStage(selected);
                  const currentIdx = STAGES.findIndex((st) => st.key === current);
                  const isPast = i < currentIdx;
                  const isCurrent = i === currentIdx;
                  return (
                    <div
                      key={s.key}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${
                        isCurrent
                          ? "bg-[#18181b] text-white font-medium"
                          : isPast
                          ? "bg-[#f4f4f5] text-[#71717a]"
                          : "text-[#a1a1aa]"
                      }`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          background: isCurrent
                            ? "#fff"
                            : isPast
                            ? STAGE_COLORS[s.key]
                            : "#d4d4d8",
                        }}
                      />
                      {s.label}
                      {isPast && <span className="ml-auto text-[10px]">Done</span>}
                      {isCurrent && <span className="ml-auto text-[10px]">Current</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => advanceStage(selected.unit)}
              className="w-full py-2 bg-[#18181b] text-white text-sm font-medium rounded hover:bg-zinc-800 transition-colors"
            >
              Advance Stage
            </button>
          </div>
        )}
      </Drawer>
    </>
  );
}

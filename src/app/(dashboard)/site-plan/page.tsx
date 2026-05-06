"use client";
import { useState, useMemo, useEffect } from "react";
import { useActiveProperty, useTenants, useUnits, leasedUnitKeys } from "@/hooks/useConvexData";
import UnitDetailPanel from "@/components/UnitDetailPanel";
import PageHeader from "@/components/PageHeader";
import SitePlanFullSite from "@/components/SitePlanFullSite";
import SitePlanFloorPlan from "@/components/SitePlanFloorPlan";

export default function SitePlanPage() {
  const property = useActiveProperty();
  const tenantsList = useTenants(property?._id) as any[];
  const units = useUnits(property?._id) as any[];
  // Track only the unit string. Re-resolve the full tenant object from the
  // live list each render so override mutations (e.g. status toggle) flow
  // back into the open drawer immediately, without a close + reopen.
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [execOpen, setExecOpen] = useState(false);

  // Allow the modal to close on Escape — same pattern the drawers use.
  useEffect(() => {
    if (!execOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExecOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [execOpen]);

  // Resolve selectedUnit (single unit code) to the underlying lease, even
  // when the lease covers multiple units (e.g. tenant.unit = "A-103, A-112,
  // A-85"). Falls back to a synthetic vacant tenant pulled from the units
  // feed so vacant slots still open the drawer with sqft / building data.
  const selected = useMemo(() => {
    if (!selectedUnit) return null;
    const norm = (s: string) => (s || "").trim().toLowerCase();
    const target = norm(selectedUnit);
    const lease = tenantsList.find((t: any) =>
      (t.unit || "").split(",").map((s: string) => norm(s)).includes(target)
    );
    if (lease) return { ...lease, unit: selectedUnit };
    const u = units.find((x: any) => norm(x.unit) === target);
    if (!u) return null;
    return {
      unit: u.unit,
      building: u.building || "",
      sqft: u.sqft || 0,
      tenant: "",
      status: "vacant",
      leaseType: "",
      leaseFrom: "",
      leaseTo: "",
      monthlyRent: 0,
      monthlyElectric: 0,
      pastDueAmount: 0,
      electricPosted: false,
      propertyId: property?._id,
    };
  }, [tenantsList, units, selectedUnit, property?._id]);

  const pastDue = tenantsList.filter((t: any) => t.status === "past_due");
  // Vacancy = units in the Total Units listing without an active lease.
  // Multi-unit leases (tenant.unit = "A-103, A-112, A-85") are expanded so
  // each individual unit counts toward Occupied, not just the lease row.
  const tenantUnitKeys = leasedUnitKeys(tenantsList);
  const vacant = units.filter((u: any) => !tenantUnitKeys.has((u.unit || "").trim().toLowerCase()));
  const totalUnits = units.length > 0 ? units.length : tenantsList.length;
  const occupiedCount = tenantUnitKeys.size;
  // Combined list for the Unit Index (shows all units including vacants).
  const allSlots: any[] = [
    ...tenantsList,
    ...vacant.map((u: any) => ({
      unit: u.unit,
      building: u.building || "",
      sqft: u.sqft || 0,
      tenant: "",
      status: "vacant",
      leaseType: "",
      monthlyRent: 0,
      monthlyElectric: 0,
      pastDueAmount: 0,
      electricPosted: false,
    })),
  ];

  return (
    <div>
      <PageHeader title="Site Plan" subtitle="Click any unit for details" />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: "Total Units", value: totalUnits, color: "text-[#18181b] dark:text-[#fafafa]" },
          { label: "Occupied", value: occupiedCount, color: "text-[#16a34a]" },
          { label: "Past Due", value: pastDue.length, color: "text-[#dc2626]" },
          { label: "Vacant", value: vacant.length, color: "text-[#71717a] dark:text-[#a1a1aa]" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 text-center">
            <p className={`text-[20px] sm:text-[24px] font-semibold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] font-medium uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <SitePlanFullSite
          tenants={tenantsList}
          units={units}
          selectedUnit={selectedUnit}
          onSelectUnit={(unit: string) => setSelectedUnit(unit)}
          onOpenExecSuites={() => setExecOpen(true)}
        />
      </div>

      <UnitDetailPanel tenant={selected} onClose={() => setSelectedUnit(null)} />

      {/* Executive Suites focus modal — full-screen with zoom-in animation
          so the floor plan gets the breathing room it needs. Click backdrop
          or hit Escape to dismiss. */}
      {execOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4 sm:p-6 rh-backdrop"
          onClick={() => setExecOpen(false)}
        >
          <div
            className="relative bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto rh-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-white dark:bg-[#18181b]">
              <button
                onClick={() => setExecOpen(false)}
                className="flex items-center gap-1.5 text-[12px] font-medium text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"
              >
                ← Back to site
              </button>
              <div className="text-center">
                <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Executive Suites</p>
                <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">Building A · A-101 → A-130 · floor plan</p>
              </div>
              <button
                onClick={() => setExecOpen(false)}
                className="text-[16px] text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-[#f4f4f5] dark:hover:bg-[#27272a]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-4 sm:p-5">
              <SitePlanFloorPlan
                tenants={tenantsList}
                units={units}
                selectedUnit={selectedUnit}
                onSelect={(t: any) => setSelectedUnit(t?.unit ?? null)}
                propertyId={property?._id}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

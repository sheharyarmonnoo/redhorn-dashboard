"use client";
import { useState, useMemo } from "react";
import { useActiveProperty, useTenants, useUnits, leasedUnitKeys } from "@/hooks/useConvexData";
import UnitDetailPanel from "@/components/UnitDetailPanel";
import PageHeader from "@/components/PageHeader";
import SitePlan3D from "@/components/SitePlan3D";

export default function SitePlanPage() {
  const property = useActiveProperty();
  const tenantsList = useTenants(property?._id) as any[];
  const units = useUnits(property?._id) as any[];
  // Track only the unit string. Re-resolve the full tenant object from the
  // live list each render so override mutations (e.g. status toggle) flow
  // back into the open drawer immediately, without a close + reopen.
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (!selectedUnit) return null;
    return tenantsList.find((t: any) => t.unit === selectedUnit) || null;
  }, [tenantsList, selectedUnit]);

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
        <SitePlan3D onSelect={(t: any) => setSelectedUnit(t?.unit ?? null)} selectedUnit={selectedUnit} />
      </div>

      <UnitDetailPanel tenant={selected} onClose={() => setSelectedUnit(null)} />
    </div>
  );
}

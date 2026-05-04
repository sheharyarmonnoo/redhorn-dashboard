"use client";
import { useState } from "react";
import { useActiveProperty, useTenants, useUnits } from "@/hooks/useConvexData";
import UnitDetailPanel from "@/components/UnitDetailPanel";
import PageHeader from "@/components/PageHeader";
import SitePlan3D from "@/components/SitePlan3D";

export default function SitePlanPage() {
  const property = useActiveProperty();
  const tenantsList = useTenants(property?._id) as any[];
  const units = useUnits(property?._id) as any[];
  const [selected, setSelected] = useState<any | null>(null);

  const occupied = tenantsList.filter((t: any) => t.status !== "vacant");
  const pastDue = tenantsList.filter((t: any) => t.status === "past_due");
  // Vacancy = units in the Total Units listing without an active lease.
  const tenantUnitKeys = new Set(tenantsList.map((t: any) => (t.unit || "").trim().toLowerCase()));
  const vacant = units.filter((u: any) => !tenantUnitKeys.has((u.unit || "").trim().toLowerCase()));
  const totalUnits = units.length > 0 ? units.length : tenantsList.length;
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
          { label: "Occupied", value: occupied.length, color: "text-[#16a34a]" },
          { label: "Past Due", value: pastDue.length, color: "text-[#dc2626]" },
          { label: "Vacant", value: vacant.length, color: "text-[#71717a] dark:text-[#a1a1aa]" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 text-center">
            <p className={`text-[20px] sm:text-[24px] font-semibold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] font-medium uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Unit Index */}
      <div className="mt-4 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-4">
        <p className="text-[12px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-3">All Units</p>
        <div className="flex flex-wrap gap-1">
          {allSlots.map((t: any) => (
            <button
              key={t.unit}
              onClick={() => setSelected(t)}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                t.status === "current" ? "bg-white dark:bg-[#18181b] border-[#e4e4e7] dark:border-[#3f3f46] text-[#18181b] dark:text-[#fafafa] hover:bg-[#fafafa] dark:hover:bg-[#27272a]" :
                t.status === "past_due" ? "bg-white dark:bg-[#18181b] border-[#dc2626]/30 text-[#dc2626] hover:bg-red-50 dark:hover:bg-red-950/30" :
                t.status === "expiring_soon" ? "bg-white dark:bg-[#18181b] border-[#2563eb]/30 text-[#2563eb] dark:text-[#60a5fa] hover:bg-blue-50 dark:hover:bg-blue-950/30" :
                t.status === "vacant" ? "bg-[#fafafa] dark:bg-[#27272a] border-[#e4e4e7] dark:border-[#3f3f46] text-[#a1a1aa] dark:text-[#71717a]" :
                "bg-white dark:bg-[#18181b] border-[#d97706]/30 text-[#d97706] hover:bg-amber-50 dark:hover:bg-amber-950/30"
              }`}
            >
              {t.unit}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <SitePlan3D onSelect={setSelected} selectedUnit={selected?.unit || null} />
      </div>

      <UnitDetailPanel tenant={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

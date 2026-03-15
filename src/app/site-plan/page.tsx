"use client";
import { useState } from "react";
import { tenants, Tenant } from "@/data/tenants";
import UnitDetailPanel from "@/components/UnitDetailPanel";
import PageHeader from "@/components/PageHeader";
import SitePlan3D from "@/components/SitePlan3D";

export default function SitePlanPage() {
  const [selected, setSelected] = useState<Tenant | null>(null);

  const occupied = tenants.filter(t => t.status !== "vacant");
  const pastDue = tenants.filter(t => t.status === "past_due");
  const vacant = tenants.filter(t => t.status === "vacant");

  return (
    <div>
      <PageHeader title="Site Plan" subtitle="Click any unit for details" />

      <SitePlan3D onSelect={setSelected} selectedUnit={selected?.unit || null} />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4">
        {[
          { label: "Total Units", value: tenants.length, color: "text-[#18181b]" },
          { label: "Occupied", value: occupied.length, color: "text-[#16a34a]" },
          { label: "Past Due", value: pastDue.length, color: "text-[#dc2626]" },
          { label: "Vacant", value: vacant.length, color: "text-[#71717a]" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#e4e4e7] rounded p-3 text-center">
            <p className={`text-[20px] sm:text-[24px] font-semibold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-[#a1a1aa] font-medium uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Unit Index */}
      <div className="mt-4 bg-white border border-[#e4e4e7] rounded p-4">
        <p className="text-[12px] font-semibold text-[#18181b] mb-3">All Units</p>
        <div className="flex flex-wrap gap-1">
          {tenants.map(t => (
            <button
              key={t.unit}
              onClick={() => setSelected(t)}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                t.status === "current" ? "bg-white border-[#e4e4e7] text-[#18181b] hover:bg-[#fafafa]" :
                t.status === "past_due" ? "bg-white border-[#dc2626]/30 text-[#dc2626] hover:bg-red-50" :
                t.status === "expiring_soon" ? "bg-white border-[#2563eb]/30 text-[#2563eb] hover:bg-blue-50" :
                t.status === "vacant" ? "bg-[#fafafa] border-[#e4e4e7] text-[#a1a1aa]" :
                "bg-white border-[#d97706]/30 text-[#d97706] hover:bg-amber-50"
              }`}
            >
              {t.unit}
            </button>
          ))}
        </div>
      </div>

      <UnitDetailPanel tenant={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { tenants, Tenant } from "@/data/tenants";
import UnitDetailPanel from "@/components/UnitDetailPanel";
import PageHeader from "@/components/PageHeader";

const SitePlan3D = dynamic(() => import("@/components/SitePlan3D"), { ssr: false });

export default function SitePlanPage() {
  const [selected, setSelected] = useState<Tenant | null>(null);

  const occupied = tenants.filter(t => t.status !== "vacant");
  const pastDue = tenants.filter(t => t.status === "past_due");
  const expiring = tenants.filter(t => t.status === "expiring_soon");
  const vacant = tenants.filter(t => t.status === "vacant");

  const legend = [
    { label: "Current", color: "bg-emerald-500" },
    { label: "Past Due", color: "bg-red-500" },
    { label: "Locked Out", color: "bg-amber-500" },
    { label: "Vacant", color: "bg-gray-400" },
    { label: "Expiring Soon", color: "bg-[#4f6ef7]" },
  ];

  return (
    <div>
      <PageHeader title="Interactive Site Plan" subtitle="3D property map — click any unit, drag to rotate, scroll to zoom">
        <div className="flex items-center gap-4">
          {legend.map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
              <span className="text-[11px] text-[#8b8fa3] font-medium">{l.label}</span>
            </div>
          ))}
        </div>
      </PageHeader>

      <SitePlan3D onSelect={setSelected} selectedUnit={selected?.unit || null} />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mt-5">
        {[
          { label: "Total Units", value: tenants.length, color: "text-[#1e1e2d]" },
          { label: "Occupied", value: occupied.length, color: "text-emerald-600" },
          { label: "Past Due", value: pastDue.length, color: "text-red-500" },
          { label: "Vacant", value: vacant.length, color: "text-[#8b8fa3]" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 border border-[#e8eaef] shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-center">
            <p className={`text-[24px] font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-[#8b8fa3] font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Unit Grid */}
      <div className="mt-5 bg-white rounded-2xl p-6 border border-[#e8eaef] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="text-[13px] font-bold text-[#1e1e2d] mb-4">All Units</h3>
        <div className="flex flex-wrap gap-1.5">
          {tenants.map(t => (
            <button
              key={t.unit}
              onClick={() => setSelected(t)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer hover:scale-105 ${
                t.status === "current" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
                t.status === "past_due" ? "bg-red-50 border-red-200 text-red-700" :
                t.status === "expiring_soon" ? "bg-blue-50 border-blue-200 text-blue-700" :
                t.status === "vacant" ? "bg-gray-50 border-gray-200 text-gray-400" :
                "bg-amber-50 border-amber-200 text-amber-700"
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

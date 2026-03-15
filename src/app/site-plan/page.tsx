"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { tenants, Tenant, getStatusColor, getStatusLabel, formatCurrency } from "@/data/tenants";
import UnitDetailPanel from "@/components/UnitDetailPanel";

// Dynamic import to avoid SSR issues with Three.js
const SitePlan3D = dynamic(() => import("@/components/SitePlan3D"), { ssr: false });

export default function SitePlanPage() {
  const [selected, setSelected] = useState<Tenant | null>(null);

  const legend = [
    { status: "current", label: "Current", color: "bg-emerald-500" },
    { status: "past_due", label: "Past Due", color: "bg-red-500" },
    { status: "locked_out", label: "Locked Out", color: "bg-amber-500" },
    { status: "vacant", label: "Vacant", color: "bg-gray-400" },
    { status: "expiring_soon", label: "Expiring Soon", color: "bg-[#4f6ef7]" },
  ];

  // Summary stats
  const occupied = tenants.filter(t => t.status !== "vacant");
  const pastDue = tenants.filter(t => t.status === "past_due");
  const expiring = tenants.filter(t => t.status === "expiring_soon");
  const vacant = tenants.filter(t => t.status === "vacant");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interactive Site Plan</h1>
          <p className="text-gray-500 text-sm mt-1">3D property map — click any unit, drag to rotate, scroll to zoom</p>
        </div>
        <div className="flex items-center gap-4">
          {legend.map(l => (
            <div key={l.status} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-full ${l.color}`} />
              <span className="text-xs text-gray-600">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 3D View */}
      <SitePlan3D onSelect={setSelected} selectedUnit={selected?.unit || null} />

      {/* Quick Stats Below Map */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-gray-900">{tenants.length}</p>
          <p className="text-xs text-gray-500">Total Units</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-emerald-600">{occupied.length}</p>
          <p className="text-xs text-gray-500">Occupied</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-red-500">{pastDue.length}</p>
          <p className="text-xs text-gray-500">Past Due</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-gray-400">{vacant.length}</p>
          <p className="text-xs text-gray-500">Vacant</p>
        </div>
      </div>

      {/* Unit Grid Fallback / Quick Reference */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">All Units — Quick Reference</h3>
        <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-13 gap-2">
          {tenants.map(t => (
            <button
              key={t.unit}
              onClick={() => setSelected(t)}
              className={`px-2 py-1.5 rounded text-xs font-medium border transition-all cursor-pointer ${
                t.status === "current" ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" :
                t.status === "past_due" ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100" :
                t.status === "expiring_soon" ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100" :
                t.status === "vacant" ? "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100" :
                "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
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

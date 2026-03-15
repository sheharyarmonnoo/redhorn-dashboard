"use client";
import { useState } from "react";
import { tenants, Tenant, getStatusColor, getStatusLabel } from "@/data/tenants";
import UnitDetailPanel from "@/components/UnitDetailPanel";

function UnitBlock({ tenant, onClick }: { tenant: Tenant; onClick: () => void }) {
  const statusColors: Record<string, string> = {
    current: "bg-emerald-500/20 border-emerald-500/40 hover:bg-emerald-500/30",
    past_due: "bg-red-500/20 border-red-500/40 hover:bg-red-500/30",
    locked_out: "bg-yellow-500/20 border-yellow-500/40 hover:bg-yellow-500/30",
    vacant: "bg-gray-500/10 border-gray-500/30 hover:bg-gray-500/20",
    expiring_soon: "bg-blue-500/20 border-blue-500/40 hover:bg-blue-500/30",
  };

  const dotColors: Record<string, string> = {
    current: "bg-emerald-400",
    past_due: "bg-red-400",
    locked_out: "bg-yellow-400",
    vacant: "bg-gray-500",
    expiring_soon: "bg-blue-400",
  };

  return (
    <button
      onClick={onClick}
      className={`border rounded-lg p-3 text-left transition-all cursor-pointer ${statusColors[tenant.status]}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold text-white">{tenant.unit}</span>
        <span className={`w-2.5 h-2.5 rounded-full ${dotColors[tenant.status]}`} />
      </div>
      <p className="text-xs text-gray-300 truncate">{tenant.tenant || "Vacant"}</p>
      <p className="text-xs text-gray-500">{tenant.sqft.toLocaleString()} sf</p>
    </button>
  );
}

export default function SitePlanPage() {
  const [selected, setSelected] = useState<Tenant | null>(null);

  const buildingA = tenants.filter(t => t.building === "A").sort((a, b) => a.unit.localeCompare(b.unit));
  const buildingC1 = tenants.filter(t => t.building === "C" && !t.unit.startsWith("C-3")).sort((a, b) => a.unit.localeCompare(b.unit));
  const buildingC3 = tenants.filter(t => t.building === "C" && t.unit.startsWith("C-3")).sort((a, b) => a.unit.localeCompare(b.unit));
  const buildingD = tenants.filter(t => t.building === "D").sort((a, b) => a.unit.localeCompare(b.unit));

  const legend = [
    { status: "current", label: "Current", color: "bg-emerald-400" },
    { status: "past_due", label: "Past Due", color: "bg-red-400" },
    { status: "locked_out", label: "Locked Out", color: "bg-yellow-400" },
    { status: "vacant", label: "Vacant", color: "bg-gray-500" },
    { status: "expiring_soon", label: "Expiring Soon", color: "bg-blue-400" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Interactive Site Plan</h1>
          <p className="text-gray-500 text-sm mt-1">Click any unit for tenant details & payment history</p>
        </div>
        <div className="flex items-center gap-4">
          {legend.map(l => (
            <div key={l.status} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-full ${l.color}`} />
              <span className="text-xs text-gray-400">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Building A */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span className="bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded text-xs font-bold">A</span>
          Building A — Industrial / Warehouse
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {buildingA.map(t => (
            <UnitBlock key={t.unit} tenant={t} onClick={() => setSelected(t)} />
          ))}
        </div>
      </div>

      {/* Building C — Floors 1-2 */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span className="bg-purple-600/20 text-purple-400 px-2 py-0.5 rounded text-xs font-bold">C</span>
          Building C — Office (1st & 2nd Floor)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-3">
          {buildingC1.map(t => (
            <UnitBlock key={t.unit} tenant={t} onClick={() => setSelected(t)} />
          ))}
        </div>
      </div>

      {/* Building C — Floor 3 */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span className="bg-purple-600/20 text-purple-400 px-2 py-0.5 rounded text-xs font-bold">C</span>
          Building C — Office (3rd Floor)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {buildingC3.map(t => (
            <UnitBlock key={t.unit} tenant={t} onClick={() => setSelected(t)} />
          ))}
        </div>
      </div>

      {/* Building D */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span className="bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded text-xs font-bold">D</span>
          Building D — Warehouse / Industrial
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {buildingD.map(t => (
            <UnitBlock key={t.unit} tenant={t} onClick={() => setSelected(t)} />
          ))}
        </div>
      </div>

      <UnitDetailPanel tenant={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

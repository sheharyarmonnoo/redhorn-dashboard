"use client";
import { tenants, Tenant, TenantStatus } from "@/data/tenants";

function getColor(status: TenantStatus) {
  switch (status) {
    case "current": return { bg: "bg-emerald-500", border: "border-emerald-600", text: "text-white" };
    case "past_due": return { bg: "bg-red-500", border: "border-red-600", text: "text-white" };
    case "locked_out": return { bg: "bg-amber-500", border: "border-amber-600", text: "text-white" };
    case "vacant": return { bg: "bg-gray-300", border: "border-gray-400", text: "text-gray-600" };
    case "expiring_soon": return { bg: "bg-blue-500", border: "border-blue-600", text: "text-white" };
  }
}

function UnitBlock({ tenant, onSelect, isSelected, size = "md" }: {
  tenant: Tenant;
  onSelect: (t: Tenant) => void;
  isSelected: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const colors = getColor(tenant.status);
  const sizeClasses = {
    sm: "min-w-[60px] h-[52px]",
    md: "min-w-[72px] h-[58px]",
    lg: "min-w-[90px] h-[64px]",
    xl: "min-w-[110px] h-[70px]",
  };

  return (
    <button
      onClick={() => onSelect(tenant)}
      className={`
        ${sizeClasses[size]} ${colors.bg} ${colors.border} ${colors.text}
        border-2 rounded-lg flex flex-col items-center justify-center
        transition-all duration-150 cursor-pointer relative
        ${isSelected ? "ring-2 ring-offset-2 ring-indigo-500 scale-105 shadow-lg z-10" : "hover:scale-105 hover:shadow-md"}
      `}
    >
      <span className="text-[11px] font-bold leading-tight">{tenant.unit}</span>
      {tenant.tenant && !tenant.tenant.includes("Owner") ? (
        <span className="text-[8px] opacity-80 leading-tight px-1 text-center truncate max-w-full">
          {tenant.tenant.split(" ").slice(0, 2).join(" ")}
        </span>
      ) : tenant.status === "vacant" ? (
        <span className="text-[8px] opacity-60 leading-tight">VACANT</span>
      ) : (
        <span className="text-[8px] opacity-60 leading-tight">Owner</span>
      )}
      {tenant.pastDueAmount > 0 && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-600 rounded-full border border-white animate-pulse" />
      )}
      {!tenant.electricPosted && tenant.leaseType === "Office Net Lease" && tenant.tenant && !tenant.tenant.includes("Owner") && (
        <span className="absolute -top-1 -left-1 w-3 h-3 bg-yellow-400 rounded-full border border-white" title="Electric not posted" />
      )}
    </button>
  );
}

function BuildingSection({ title, subtitle, units, onSelect, selectedUnit, gridCols }: {
  title: string;
  subtitle: string;
  units: Tenant[];
  onSelect: (t: Tenant) => void;
  selectedUnit: string | null;
  gridCols: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-[13px] font-bold text-[#1e1e2d]">{title}</h3>
          <p className="text-[10px] text-[#8b8fa3]">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[#8b8fa3]">
          <span>{units.filter(u => u.status !== "vacant").length} occupied</span>
          <span className="text-gray-300">|</span>
          <span>{units.filter(u => u.status === "vacant").length} vacant</span>
        </div>
      </div>
      <div className={`grid grid-cols-3 sm:grid-cols-4 md:${gridCols} gap-1.5 sm:gap-2`}>
        {units.map(t => {
          const size = t.sqft > 8000 ? "xl" : t.sqft > 5000 ? "lg" : t.sqft > 2500 ? "md" : "sm";
          return (
            <UnitBlock
              key={t.unit}
              tenant={t}
              onSelect={onSelect}
              isSelected={selectedUnit === t.unit}
              size={size}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function SitePlan3D({ onSelect, selectedUnit }: { onSelect: (t: Tenant) => void; selectedUnit: string | null }) {
  const buildingA = tenants.filter(t => t.building === "A");
  const buildingC_lower = tenants.filter(t => t.building === "C" && !t.unit.startsWith("C-3"));
  const buildingC_upper = tenants.filter(t => t.building === "C" && t.unit.startsWith("C-3"));
  const buildingD = tenants.filter(t => t.building === "D");

  return (
    <div className="w-full bg-white rounded-2xl border border-[#e8eaef] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Property Header Bar */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white px-6 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-bold">Hollister Business Park</h2>
          <p className="text-[11px] text-slate-300">Houston, TX — ~325,000 SF Industrial/Office</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] text-slate-300">Live</span>
        </div>
      </div>

      {/* Site Plan Grid */}
      <div className="p-5 space-y-4">
        {/* Top Row: Building A + Building D */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <BuildingSection
              title="Building A"
              subtitle="Industrial / Warehouse"
              units={buildingA}
              onSelect={onSelect}
              selectedUnit={selectedUnit}
              gridCols="grid-cols-7"
            />
          </div>
          <BuildingSection
            title="Building D"
            subtitle="Warehouse / Industrial"
            units={buildingD}
            onSelect={onSelect}
            selectedUnit={selectedUnit}
            gridCols="grid-cols-2"
          />
        </div>

        {/* Parking / Road divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-6 bg-gray-700 rounded flex items-center justify-center">
            <span className="text-[9px] text-gray-300 tracking-widest font-medium">HOLLISTER RD</span>
          </div>
          <div className="flex-1 h-6 bg-gray-200 rounded flex items-center justify-center">
            <span className="text-[9px] text-gray-500 tracking-wider font-medium">PARKING</span>
          </div>
        </div>

        {/* Building C */}
        <BuildingSection
          title="Building C — Floors 1 & 2"
          subtitle="Office Suites"
          units={buildingC_lower}
          onSelect={onSelect}
          selectedUnit={selectedUnit}
          gridCols="grid-cols-9"
        />

        <BuildingSection
          title="Building C — Floor 3"
          subtitle="Office Suites (Upper)"
          units={buildingC_upper}
          onSelect={onSelect}
          selectedUnit={selectedUnit}
          gridCols="grid-cols-8"
        />
      </div>

      {/* Indicators Legend */}
      <div className="px-5 pb-4 flex items-center gap-4 text-[10px] text-[#8b8fa3]">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse inline-block" /> Past due indicator</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /> Electric not posted</span>
      </div>
    </div>
  );
}

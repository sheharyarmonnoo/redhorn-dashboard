"use client";
import { tenants, Tenant, TenantStatus } from "@/data/tenants";

function statusColor(status: TenantStatus) {
  switch (status) {
    case "current": return { bg: "bg-[#16a34a]", text: "text-white" };
    case "past_due": return { bg: "bg-[#dc2626]", text: "text-white" };
    case "locked_out": return { bg: "bg-[#d97706]", text: "text-white" };
    case "vacant": return { bg: "bg-[#e4e4e7]", text: "text-[#71717a]" };
    case "expiring_soon": return { bg: "bg-[#2563eb]", text: "text-white" };
  }
}

function UnitBlock({ tenant, onSelect, isSelected }: {
  tenant: Tenant;
  onSelect: (t: Tenant) => void;
  isSelected: boolean;
}) {
  const c = statusColor(tenant.status);
  return (
    <button
      onClick={() => onSelect(tenant)}
      className={`
        w-full ${c.bg} ${c.text} rounded flex flex-col items-center justify-center
        transition-all duration-100 cursor-pointer relative
        ${tenant.sqft > 5000 ? "h-[68px] sm:h-[76px]" : "h-[52px] sm:h-[60px]"}
        ${isSelected ? "ring-2 ring-[#18181b] ring-offset-1 z-10" : "hover:opacity-90"}
      `}
    >
      <span className="text-[11px] font-semibold leading-none">{tenant.unit}</span>
      {tenant.tenant && !tenant.tenant.includes("Owner") ? (
        <span className="text-[7px] opacity-75 leading-tight px-1 text-center truncate max-w-full mt-0.5">
          {tenant.tenant.split(" ").slice(0, 2).join(" ")}
        </span>
      ) : tenant.status === "vacant" ? (
        <span className="text-[7px] opacity-50 mt-0.5 uppercase tracking-wide">Vacant</span>
      ) : (
        <span className="text-[7px] opacity-50 mt-0.5">Owner</span>
      )}
      {tenant.sqft > 5000 && (
        <span className="text-[7px] opacity-50 mt-0.5">{(tenant.sqft / 1000).toFixed(0)}K SF</span>
      )}
      {tenant.pastDueAmount > 0 && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#dc2626] rounded-full border-2 border-white" />
      )}
      {!tenant.electricPosted && tenant.leaseType === "Office Net Lease" && tenant.tenant && !tenant.tenant.includes("Owner") && (
        <span className="absolute -top-1 -left-1 w-3 h-3 bg-[#d97706] rounded-full border-2 border-white" />
      )}
    </button>
  );
}

function BuildingHeader({ label, sub, occ, vac }: { label: string; sub: string; occ: number; vac: number }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <h3 className="text-[12px] font-semibold text-[#18181b]">{label}</h3>
        <p className="text-[10px] text-[#a1a1aa]">{sub}</p>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-[#71717a]">
        <span>{occ} occ</span>
        {vac > 0 && <><span className="text-[#d4d4d8]">/</span><span>{vac} vac</span></>}
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
    <div className="w-full bg-white border border-[#e4e4e7] rounded overflow-hidden">
      {/* Header */}
      <div className="bg-[#18181b] text-white px-4 sm:px-5 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold tracking-tight">Hollister Business Park</h2>
          <p className="text-[10px] text-[#a1a1aa] mt-0.5">Houston, TX — ~325,000 SF</p>
        </div>
        <div className="flex items-center gap-3 text-[9px] text-[#a1a1aa]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#16a34a]" /> Current</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#dc2626]" /> Past Due</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#2563eb]" /> Expiring</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#e4e4e7]" /> Vacant</span>
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-3 bg-[#fafafa]">
        {/* Building A + Building D */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-8 bg-white border border-[#e4e4e7] rounded p-3 sm:p-4">
            <BuildingHeader label="Building A" sub="Industrial / Warehouse"
              occ={buildingA.filter(u => u.status !== "vacant").length}
              vac={buildingA.filter(u => u.status === "vacant").length} />
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 gap-1.5">
              {buildingA.map(t => (
                <UnitBlock key={t.unit} tenant={t} onSelect={onSelect} isSelected={selectedUnit === t.unit} />
              ))}
            </div>
          </div>
          <div className="lg:col-span-4 bg-white border border-[#e4e4e7] rounded p-3 sm:p-4">
            <BuildingHeader label="Building D" sub="Warehouse / Industrial"
              occ={buildingD.filter(u => u.status !== "vacant").length}
              vac={buildingD.filter(u => u.status === "vacant").length} />
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {buildingD.map(t => (
                <UnitBlock key={t.unit} tenant={t} onSelect={onSelect} isSelected={selectedUnit === t.unit} />
              ))}
            </div>
          </div>
        </div>

        {/* Road */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-5 bg-[#3f3f46] rounded flex items-center justify-center">
            <span className="text-[8px] text-[#a1a1aa] tracking-[0.15em] font-medium">HOLLISTER RD</span>
          </div>
          <div className="flex-1 h-5 bg-[#e4e4e7] rounded flex items-center justify-center">
            <span className="text-[8px] text-[#71717a] tracking-wider font-medium">PARKING</span>
          </div>
        </div>

        {/* Building C — Floors 1 & 2 */}
        <div className="bg-white border border-[#e4e4e7] rounded p-3 sm:p-4">
          <BuildingHeader label="Building C — Floors 1 & 2" sub="Office Suites"
            occ={buildingC_lower.filter(u => u.status !== "vacant").length}
            vac={buildingC_lower.filter(u => u.status === "vacant").length} />
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-9 gap-1.5">
            {buildingC_lower.map(t => (
              <UnitBlock key={t.unit} tenant={t} onSelect={onSelect} isSelected={selectedUnit === t.unit} />
            ))}
          </div>
        </div>

        {/* Building C — Floor 3 */}
        <div className="bg-white border border-[#e4e4e7] rounded p-3 sm:p-4">
          <BuildingHeader label="Building C — Floor 3" sub="Office Suites (Upper)"
            occ={buildingC_upper.filter(u => u.status !== "vacant").length}
            vac={buildingC_upper.filter(u => u.status === "vacant").length} />
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-8 gap-1.5">
            {buildingC_upper.map(t => (
              <UnitBlock key={t.unit} tenant={t} onSelect={onSelect} isSelected={selectedUnit === t.unit} />
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[#e4e4e7] flex items-center gap-4 text-[9px] text-[#a1a1aa]">
        <span>Last updated: Mar 15, 2026 2:30 PM</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#dc2626]" /> Past due</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#d97706]" /> Electric missing</span>
      </div>
    </div>
  );
}

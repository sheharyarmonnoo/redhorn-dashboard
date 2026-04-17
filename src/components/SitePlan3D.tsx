"use client";
import { useActiveProperty, useTenants } from "@/hooks/useConvexData";

type TenantStatus = "current" | "past_due" | "locked_out" | "vacant" | "expiring_soon";
type Tenant = any;

function statusColor(status: TenantStatus) {
  switch (status) {
    case "current": return { bg: "bg-[#16a34a]", text: "text-white" };
    case "past_due": return { bg: "bg-[#dc2626]", text: "text-white" };
    case "locked_out": return { bg: "bg-[#d97706]", text: "text-white" };
    case "vacant": return { bg: "bg-[#e4e4e7] dark:bg-[#3f3f46]", text: "text-[#71717a] dark:text-[#a1a1aa]" };
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
        ${isSelected ? "ring-2 ring-[#18181b] dark:ring-[#fafafa] ring-offset-1 ring-offset-white dark:ring-offset-[#18181b] z-10" : "hover:opacity-90"}
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
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#dc2626] rounded-full border-2 border-white dark:border-[#18181b]" />
      )}
      {!tenant.electricPosted && tenant.leaseType === "Office Net Lease" && tenant.tenant && !tenant.tenant.includes("Owner") && (
        <span className="absolute -top-1 -left-1 w-3 h-3 bg-[#d97706] rounded-full border-2 border-white dark:border-[#18181b]" />
      )}
    </button>
  );
}

function BuildingHeader({ label, sub, occ, vac }: { label: string; sub: string; occ: number; vac: number }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <h3 className="text-[12px] font-semibold text-[#18181b] dark:text-[#fafafa]">{label}</h3>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">{sub}</p>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-[#71717a] dark:text-[#a1a1aa]">
        <span>{occ} occ</span>
        {vac > 0 && <><span className="text-[#d4d4d8] dark:text-[#52525b]">/</span><span>{vac} vac</span></>}
      </div>
    </div>
  );
}

export default function SitePlan3D({ onSelect, selectedUnit }: { onSelect: (t: Tenant) => void; selectedUnit: string | null }) {
  const property = useActiveProperty();
  const tenants = useTenants(property?._id) as Tenant[];

  // Group units dynamically by the `building` field on each unit, so this works
  // for any property — not just Hollister's A / C (lower) / C (upper) / D layout.
  const byBuilding: Record<string, Tenant[]> = {};
  for (const t of tenants) {
    const key = t.building || "—";
    if (!byBuilding[key]) byBuilding[key] = [];
    byBuilding[key].push(t);
  }
  const buildingGroups = Object.entries(byBuilding).sort(([a], [b]) => a.localeCompare(b));

  const totalSqft = tenants.reduce((s, t) => s + (t.sqft || 0), 0);
  const sqftLabel = totalSqft > 0 ? `~${Math.round(totalSqft / 1000)}K SF` : "";

  return (
    <div className="w-full bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded overflow-hidden">
      {/* Header */}
      <div className="bg-[#18181b] dark:bg-[#09090b] text-white px-4 sm:px-5 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold tracking-tight">{property?.name || "Property"}</h2>
          <p className="text-[10px] text-[#a1a1aa] mt-0.5">
            {[property?.location, sqftLabel].filter(Boolean).join(" — ") || "—"}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[9px] text-[#a1a1aa]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#16a34a]" /> Current</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#dc2626]" /> Past Due</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#2563eb]" /> Expiring</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#e4e4e7]" /> Vacant</span>
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-3 bg-[#fafafa] dark:bg-[#27272a]">
        {buildingGroups.length === 0 ? (
          <div className="bg-white dark:bg-[#18181b] border border-dashed border-[#e4e4e7] dark:border-[#3f3f46] rounded p-8 text-center">
            <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa]">No units loaded for this property yet.</p>
          </div>
        ) : (
          buildingGroups.map(([building, units]) => (
            <div key={building} className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 sm:p-4">
              <BuildingHeader
                label={building === "—" ? "Unassigned" : `Building ${building}`}
                sub={`${units.length} unit${units.length === 1 ? "" : "s"}`}
                occ={units.filter(u => u.status !== "vacant").length}
                vac={units.filter(u => u.status === "vacant").length}
              />
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
                {units.map(t => (
                  <UnitBlock key={t.unit} tenant={t} onSelect={onSelect} isSelected={selectedUnit === t.unit} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[#e4e4e7] dark:border-[#3f3f46] flex items-center gap-4 text-[9px] text-[#a1a1aa] dark:text-[#71717a]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#dc2626]" /> Past due</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#d97706]" /> Electric missing</span>
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useActiveProperty, useTenants, useUnits, showsElectricIndicator } from "@/hooks/useConvexData";

type TenantStatus = string;
type Tenant = any;

// Status → block fill for the site plan grid. Includes the Slice 2 manual
// override statuses (auction_posted, in_eviction, needs_review, etc.)
// so a unit overridden in the rent roll picks up the right color here.
// Color semantics mirror StatusPill.tsx: green Current, yellow Past Due,
// orange Locked Out / Auction Posted, red In Eviction, blue Needs Review,
// gray Vacant / Auction Completed.
const STATUS_BLOCK: Record<string, { bg: string; text: string }> = {
  current: { bg: "bg-[#16a34a]", text: "text-white" },
  past_due: { bg: "bg-[#ca8a04]", text: "text-white" },
  locked_out: { bg: "bg-[#ea580c]", text: "text-white" },
  auction_posted: { bg: "bg-[#ea580c]", text: "text-white" },
  in_eviction: { bg: "bg-[#dc2626]", text: "text-white" },
  expiring_soon: { bg: "bg-[#2563eb]", text: "text-white" },
  needs_review: { bg: "bg-[#2563eb]", text: "text-white" },
  auction_completed: {
    bg: "bg-[#e4e4e7] dark:bg-[#3f3f46]",
    text: "text-[#52525b] dark:text-[#a1a1aa]",
  },
  vacant: {
    bg: "bg-[#e4e4e7] dark:bg-[#3f3f46]",
    text: "text-[#71717a] dark:text-[#a1a1aa]",
  },
};

function statusColor(status: TenantStatus) {
  const key = String(status || "").toLowerCase();
  return STATUS_BLOCK[key] || STATUS_BLOCK.vacant;
}

function compactUnit(unit: string): string {
  // Compress combined unit codes like "A-103, A-112, A-85" → "A-103 +2" so the
  // label fits a uniform box without wrapping.
  if (!unit) return "";
  const parts = unit.split(/[,/]\s*/).filter(Boolean);
  if (parts.length <= 1) return unit;
  return `${parts[0]} +${parts.length - 1}`;
}

function UnitBlock({ tenant, onSelect, isSelected, propertyCode }: {
  tenant: Tenant;
  onSelect: (t: Tenant) => void;
  isSelected: boolean;
  propertyCode?: string;
}) {
  const c = statusColor(tenant.status);
  const label = compactUnit(tenant.unit || "");
  const fullUnit = tenant.unit || "";
  return (
    <button
      onClick={() => onSelect(tenant)}
      title={fullUnit !== label ? fullUnit : undefined}
      className={`
        w-full ${c.bg} ${c.text} rounded flex flex-col items-center justify-center
        transition-all duration-100 cursor-pointer relative px-1
        h-[56px] sm:h-[64px]
        ${isSelected ? "ring-2 ring-[#18181b] dark:ring-[#fafafa] ring-offset-1 ring-offset-white dark:ring-offset-[#18181b] z-10" : "hover:opacity-90"}
      `}
    >
      <span className="text-[11px] font-semibold leading-none truncate max-w-full">{label}</span>
      {tenant.tenant && !tenant.tenant.includes("Owner") ? (
        <span className="text-[7px] opacity-75 leading-tight text-center truncate max-w-full mt-0.5">
          {tenant.tenant.split(" ").slice(0, 2).join(" ")}
        </span>
      ) : tenant.status === "vacant" ? (
        <span className="text-[7px] opacity-50 mt-0.5 uppercase tracking-wide">Vacant</span>
      ) : (
        <span className="text-[7px] opacity-50 mt-0.5">Owner</span>
      )}
      {tenant.pastDueAmount > 0 && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#dc2626] rounded-full border-2 border-white dark:border-[#18181b]" />
      )}
      {!tenant.electricPosted && showsElectricIndicator(tenant, propertyCode) && tenant.tenant && !tenant.tenant.includes("Owner") && (
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
  const units = useUnits(property?._id) as any[];

  // Merge tenants (active leases) with the full units list so vacant slots
  // render alongside leased ones. Tenants are canonical for status/lease info;
  // units fill in the empty space.
  const tenantByUnit: Record<string, Tenant> = {};
  for (const t of tenants) tenantByUnit[(t.unit || "").trim().toLowerCase()] = t;
  const merged: Tenant[] = [...tenants];
  for (const u of units) {
    const key = (u.unit || "").trim().toLowerCase();
    if (!tenantByUnit[key]) {
      merged.push({
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
      } as any);
    }
  }

  // Group by building so each property's layout reflects its own structure.
  const byBuilding: Record<string, Tenant[]> = {};
  for (const t of merged) {
    const key = t.building || "—";
    if (!byBuilding[key]) byBuilding[key] = [];
    byBuilding[key].push(t);
  }
  const buildingGroups = Object.entries(byBuilding).sort(([a], [b]) => a.localeCompare(b));

  const totalSqft = merged.reduce((s, t) => s + (t.sqft || 0), 0);
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
        ) : property?.code === "belgold" ? (
          <BelgoldRow
            tenants={merged}
            onSelect={onSelect}
            selectedUnit={selectedUnit}
            propertyCode={property?.code}
          />
        ) : (
          buildingGroups.map(([building, units]) => (
            <div key={building} className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 sm:p-4">
              {building !== "—" && (
                <BuildingHeader
                  label={`Building ${building}`}
                  sub={`${units.length} unit${units.length === 1 ? "" : "s"}`}
                  occ={units.filter(u => u.status !== "vacant").length}
                  vac={units.filter(u => u.status === "vacant").length}
                />
              )}
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
                {units.map(t => (
                  <UnitBlock key={t.unit} tenant={t} onSelect={onSelect} isSelected={selectedUnit === t.unit} propertyCode={property?.code} />
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

// Belgold's actual building is a single linear strip of 7 units, with I as
// the largest (anchor end-cap) and A as the second-largest. Visual order
// (left→right) matches the printed site plan: I, F, E, D, C, B, A. Block
// widths track sqft so the proportions read like the real building.
function BelgoldRow({
  tenants,
  onSelect,
  selectedUnit,
  propertyCode,
}: {
  tenants: Tenant[];
  onSelect: (t: Tenant) => void;
  selectedUnit: string | null;
  propertyCode?: string;
}) {
  const ORDER = ["I", "F", "E", "D", "C", "B", "A"] as const;
  const byUnit: Record<string, Tenant> = {};
  for (const t of tenants) byUnit[(t.unit || "").trim().toUpperCase()] = t;

  // Size each column by sqft so I (4500sf) and A (3600sf) read as the
  // visually larger end-caps the way they do on the actual site map.
  const ordered = ORDER.map(u => byUnit[u]).filter(Boolean);
  if (ordered.length === 0) return null;
  const minSqft = Math.min(...ordered.map(t => t.sqft || 1));
  const fr = (sqft: number) => `${Math.max(1, (sqft || minSqft) / minSqft).toFixed(2)}fr`;
  const gridCols = ordered.map(t => fr(t.sqft || minSqft)).join(" ");
  const occCount = ordered.filter(t => t.status !== "vacant").length;
  const vacCount = ordered.filter(t => t.status === "vacant").length;

  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 sm:p-4">
      <BuildingHeader
        label="Belgold Strip"
        sub={`${ordered.length} unit${ordered.length === 1 ? "" : "s"} · I → A`}
        occ={occCount}
        vac={vacCount}
      />
      <div
        className="grid gap-1.5 w-full"
        style={{ gridTemplateColumns: gridCols }}
      >
        {ordered.map(t => (
          <BelgoldUnitBlock
            key={t.unit}
            tenant={t}
            onSelect={onSelect}
            isSelected={selectedUnit === t.unit}
            propertyCode={propertyCode}
          />
        ))}
      </div>
    </div>
  );
}

// Same translucent fill palette Hollister uses (SitePlanFullSite). Keeping
// the visual language consistent across properties so the dashboard reads
// as one site-plan, not two skinned-differently grids. Past Due is now
// yellow (not red) to match the Slice 1 pill semantics; red is reserved
// for In Eviction. Slice 2 statuses (auction_posted, in_eviction,
// needs_review, auction_completed) are wired here so a unit overridden
// in the rent roll picks up the correct fill instead of falling back to
// vacant gray.
const BELGOLD_FILL: Record<string, string> = {
  current:           "rgba(22,163,74,0.10)",
  past_due:          "rgba(202,138,4,0.16)",
  locked_out:        "rgba(234,88,12,0.16)",
  auction_posted:    "rgba(234,88,12,0.16)",
  in_eviction:       "rgba(220,38,38,0.16)",
  expiring_soon:     "rgba(37,99,235,0.14)",
  needs_review:      "rgba(37,99,235,0.14)",
  auction_completed: "rgba(100,116,139,0.10)",
  vacant:            "transparent",
};
const BELGOLD_HOVER: Record<string, string> = {
  current:           "rgba(22,163,74,0.16)",
  past_due:          "rgba(202,138,4,0.22)",
  locked_out:        "rgba(234,88,12,0.22)",
  auction_posted:    "rgba(234,88,12,0.22)",
  in_eviction:       "rgba(220,38,38,0.22)",
  expiring_soon:     "rgba(37,99,235,0.20)",
  needs_review:      "rgba(37,99,235,0.20)",
  auction_completed: "rgba(100,116,139,0.16)",
  vacant:            "rgba(100,116,139,0.16)",
};
const BELGOLD_STROKE: Record<string, string> = {
  current:           "rgba(22,163,74,0.55)",
  past_due:          "rgba(202,138,4,0.70)",
  locked_out:        "rgba(234,88,12,0.70)",
  auction_posted:    "rgba(234,88,12,0.70)",
  in_eviction:       "rgba(220,38,38,0.70)",
  expiring_soon:     "rgba(37,99,235,0.65)",
  needs_review:      "rgba(37,99,235,0.65)",
  auction_completed: "rgba(161,161,170,0.50)",
  vacant:            "rgba(161,161,170,0.50)",
};

function BelgoldUnitBlock({ tenant, onSelect, isSelected, propertyCode }: {
  tenant: Tenant;
  onSelect: (t: Tenant) => void;
  isSelected: boolean;
  propertyCode?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const rawStatus = String(tenant.status || "vacant").toLowerCase();
  const status = (rawStatus in BELGOLD_FILL ? rawStatus : "vacant") as keyof typeof BELGOLD_FILL;
  const fill = hovered ? BELGOLD_HOVER[status] : BELGOLD_FILL[status];
  const stroke = isSelected ? BELGOLD_STROKE[status] : "rgba(63,63,70,0.6)";
  const fullUnit = tenant.unit || "";
  return (
    <button
      onClick={() => onSelect(tenant)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={fullUnit}
      className="w-full rounded flex flex-col items-center justify-center transition-all duration-100 cursor-pointer relative px-2 h-[140px] sm:h-[180px] text-[#18181b] dark:text-[#fafafa]"
      style={{
        backgroundColor: fill,
        border: `${isSelected ? 2.5 : 1}px solid ${stroke}`,
        transition: "background-color 140ms ease, border-color 140ms ease",
      }}
    >
      <span className="text-[20px] sm:text-[24px] font-semibold leading-none">{fullUnit}</span>
      {tenant.tenant ? (
        <span className="text-[10px] text-[#52525b] dark:text-[#a1a1aa] leading-tight text-center truncate max-w-full mt-2 px-1">
          {tenant.tenant}
        </span>
      ) : status === "vacant" ? (
        <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-2 uppercase tracking-wide">Vacant</span>
      ) : null}
      {tenant.sqft ? (
        <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-1 tabular-nums">
          {tenant.sqft.toLocaleString()} SF
        </span>
      ) : null}
      {/* Subtle status dot in the corner — same convention as Hollister */}
      {status !== "vacant" && (
        <span
          className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: BELGOLD_STROKE[status] }}
        />
      )}
      {tenant.pastDueAmount > 0 && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#dc2626] rounded-full border-2 border-white dark:border-[#18181b]" />
      )}
      {!tenant.electricPosted && showsElectricIndicator(tenant, propertyCode) && tenant.tenant && (
        <span className="absolute -top-1 -left-1 w-3 h-3 bg-[#d97706] rounded-full border-2 border-white dark:border-[#18181b]" />
      )}
    </button>
  );
}

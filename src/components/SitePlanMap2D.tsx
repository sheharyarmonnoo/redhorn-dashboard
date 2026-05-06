"use client";
import { useMemo, useState } from "react";

type Tenant = any;

interface Props {
  tenants: Tenant[];
  units: any[];
  selectedUnit: string | null;
  onSelect: (t: Tenant) => void;
  propertyId?: string;
}

// Hotspot rectangles over the generated A-building floor plan PNG.
// Coordinates are percentages relative to the image (which renders at 3:2
// aspect inside the parent container). Tweak these if a unit's box drifts
// from the underlying drawing — we sized them generously so labels sit
// inside the room outline without crossing wall lines.
const UNIT_HOTSPOTS: Record<string, { left: number; top: number; width: number; height: number }> = {
  // Top row
  "A-107":  { left: 23.5, top:  9.5, width:  8.5, height: 12.5 },
  "A-111":  { left: 32.5, top:  9.5, width:  8.0, height: 12.5 },
  "A-106":  { left: 41.0, top:  9.5, width:  8.0, height: 12.5 },
  "A-106A": { left: 49.5, top:  9.5, width:  9.5, height: 12.5 },
  "A-103":  { left: 59.5, top:  9.5, width: 12.5, height: 18.0 },
  // Right column
  "A-101":  { left: 72.5, top: 24.5, width: 13.0, height: 17.0 },
  "A-102":  { left: 65.0, top: 35.5, width:  7.0, height: 19.0 },
  "A-100":  { left: 72.5, top: 47.5, width: 13.0, height: 17.0 },
  // Inner cluster
  "A-108":  { left: 22.5, top: 24.0, width:  9.0, height:  9.5 },
  "A-110":  { left: 31.5, top: 31.5, width:  9.5, height: 17.5 },
  "A-113":  { left: 22.0, top: 38.0, width:  9.5, height: 18.5 },
  "A-85":   { left: 31.5, top: 50.5, width:  9.5, height: 11.5 },
  "A-120":  { left: 10.5, top: 35.0, width: 11.5, height: 17.5 },
  // Bottom row
  "A-114":  { left: 10.5, top: 64.0, width: 13.0, height: 14.0 },
  "A-112":  { left: 24.0, top: 64.0, width: 13.5, height: 14.0 },
  "A-85A":  { left: 51.0, top: 64.0, width:  6.5, height: 14.0 },
  "A-90":   { left: 58.0, top: 64.0, width:  6.5, height: 14.0 },
  // Bottom large
  "A-130":  { left: 15.5, top: 79.0, width: 43.0, height: 16.5 },
};

const NORM = (s: string) => (s || "").trim().toLowerCase();

// Resolve a single unit code to its lease (handling multi-unit leases like
// "A-103, A-112, A-85") OR return null if the unit is vacant.
function findLeaseForUnit(unit: string, tenants: Tenant[]): Tenant | null {
  const target = NORM(unit);
  return tenants.find((t: any) => {
    const parts = (t.unit || "").split(",").map((s: string) => NORM(s));
    return parts.includes(target);
  }) || null;
}

const STATUS_COLORS: Record<string, { fill: string; ring: string; text: string }> = {
  current:        { fill: "rgba(22,163,74,0.18)",  ring: "rgba(22,163,74,0.55)",  text: "#15803d" },
  past_due:       { fill: "rgba(220,38,38,0.22)",  ring: "rgba(220,38,38,0.65)",  text: "#b91c1c" },
  expiring_soon:  { fill: "rgba(217,119,6,0.20)",  ring: "rgba(217,119,6,0.60)",  text: "#b45309" },
  locked_out:     { fill: "rgba(217,119,6,0.20)",  ring: "rgba(217,119,6,0.60)",  text: "#b45309" },
  vacant:         { fill: "rgba(161,161,170,0.10)", ring: "rgba(161,161,170,0.45)", text: "#71717a" },
};

export default function SitePlanMap2D({ tenants, units, selectedUnit, onSelect, propertyId }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  // Pre-resolve every drawn unit to its tenant + status so the map paints
  // with current context (red for past due, etc.) without re-walking the
  // tenants array on every hover.
  const decorated = useMemo(() => {
    const out: Record<string, { tenant: Tenant | null; status: string; sqft: number }> = {};
    for (const unit of Object.keys(UNIT_HOTSPOTS)) {
      const lease = findLeaseForUnit(unit, tenants);
      const u = units.find((x: any) => NORM(x.unit) === NORM(unit));
      out[unit] = {
        tenant: lease,
        status: lease?.status || "vacant",
        sqft: u?.sqft || lease?.sqft || 0,
      };
    }
    return out;
  }, [tenants, units]);

  function handleClick(unit: string) {
    const lease = decorated[unit].tenant;
    if (lease) {
      // Multi-unit leases store the combined unit string. Show this specific
      // unit on the drawer header so it's clear which one was clicked.
      onSelect({ ...lease, unit });
    } else {
      const u = units.find((x: any) => NORM(x.unit) === NORM(unit));
      onSelect({
        unit,
        building: u?.building || "",
        sqft: u?.sqft || 0,
        tenant: "",
        status: "vacant",
        leaseType: "",
        leaseFrom: "",
        leaseTo: "",
        monthlyRent: 0,
        monthlyElectric: 0,
        securityDeposit: 0,
        pastDueAmount: 0,
        electricPosted: false,
        propertyId,
      });
    }
  }

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-[#e4e4e7] dark:border-[#3f3f46] bg-white dark:bg-[#18181b] shadow-sm">
      {/* Background floor plan */}
      <img
        src="/site-plan-a-building.png"
        alt="Hollister Building A floor plan"
        className="block w-full h-auto select-none"
        draggable={false}
      />
      {/* Hotspot overlay */}
      <div className="absolute inset-0">
        {Object.entries(UNIT_HOTSPOTS).map(([unit, pos]) => {
          const dec = decorated[unit];
          const isSelected = selectedUnit === unit;
          const isHovered = hovered === unit;
          const colors = STATUS_COLORS[dec.status] || STATUS_COLORS.vacant;
          const ringWidth = isSelected ? 3 : isHovered ? 2 : 0;
          return (
            <button
              key={unit}
              type="button"
              onClick={() => handleClick(unit)}
              onMouseEnter={() => setHovered(unit)}
              onMouseLeave={() => setHovered(null)}
              title={dec.tenant ? `${unit} — ${dec.tenant.tenant || ""}` : `${unit} — Vacant`}
              style={{
                position: "absolute",
                left: `${pos.left}%`,
                top: `${pos.top}%`,
                width: `${pos.width}%`,
                height: `${pos.height}%`,
                backgroundColor: isHovered || isSelected ? colors.fill : "transparent",
                boxShadow: ringWidth > 0 ? `inset 0 0 0 ${ringWidth}px ${colors.ring}` : "none",
                transition: "background-color 140ms ease, box-shadow 140ms ease",
              }}
              className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#18181b] dark:focus-visible:ring-[#fafafa] focus-visible:ring-offset-1"
              aria-label={`Unit ${unit}`}
            />
          );
        })}
      </div>
      {/* Hover info pill */}
      {hovered && (
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:max-w-xs bg-white/95 dark:bg-[#18181b]/95 backdrop-blur border border-[#e4e4e7] dark:border-[#3f3f46] rounded-md px-3 py-2 shadow-lg">
          <p className="text-[11px] font-semibold text-[#18181b] dark:text-[#fafafa]">{hovered}</p>
          <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] truncate">
            {decorated[hovered].tenant ? (decorated[hovered].tenant!.tenant || "—") : "Vacant"}
          </p>
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-0.5">
            {decorated[hovered].sqft ? `${decorated[hovered].sqft.toLocaleString()} SF` : ""}
            {decorated[hovered].status && decorated[hovered].status !== "vacant" ? ` · ${decorated[hovered].status.replace(/_/g, " ")}` : ""}
          </p>
        </div>
      )}
      {/* Legend */}
      <div className="absolute top-3 right-3 bg-white/90 dark:bg-[#18181b]/90 backdrop-blur border border-[#e4e4e7] dark:border-[#3f3f46] rounded-md px-2 py-1.5 flex items-center gap-3 text-[10px] text-[#71717a] dark:text-[#a1a1aa]">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS.current.ring }} />Occupied</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS.past_due.ring }} />Past Due</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS.vacant.ring }} />Vacant</span>
      </div>
    </div>
  );
}

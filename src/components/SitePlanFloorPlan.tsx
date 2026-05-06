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

// Pure-SVG floor plan for Hollister A-building (executive suites). Coordinates
// in a 1200x800 viewBox roughly trace the source map. Tweak any room's box if
// the proportions drift from the printed layout.
type Room = {
  unit?: string;     // Interactive — click opens UnitDetailPanel
  label?: string;    // Static label only (Common Area, restrooms, EXIT)
  type: "unit" | "common" | "exit";
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize?: number; // Override default label size (used for tiny rooms like W/M)
};

const ROOMS: Room[] = [
  // Top row of executive suites
  { unit: "A-107", x: 290, y: 100, w: 90, h: 100, type: "unit" },
  { unit: "A-111", x: 380, y: 100, w: 90, h: 100, type: "unit" },
  { unit: "A-106", x: 470, y: 100, w: 90, h: 100, type: "unit" },
  { unit: "A-106A", x: 560, y: 100, w: 120, h: 100, type: "unit" },
  { unit: "A-103", x: 680, y: 100, w: 240, h: 200, type: "unit" },

  // Top-left: Break Room/Kitchen with EXIT
  { label: "Break Room / Kitchen", x: 100, y: 100, w: 190, h: 100, type: "common" },
  { label: "EXIT", x: 200, y: 60, w: 80, h: 38, type: "exit" },

  // Restrooms cluster
  { label: "Womans", x: 100, y: 220, w: 75, h: 75, type: "common", fontSize: 13 },
  { label: "Mens", x: 175, y: 220, w: 65, h: 75, type: "common", fontSize: 13 },

  // A-108 (small upper-middle)
  { unit: "A-108", x: 240, y: 220, w: 100, h: 75, type: "unit" },

  // Inner column / cluster
  { unit: "A-120", x: 100, y: 295, w: 140, h: 230, type: "unit" },
  { unit: "A-113", x: 240, y: 295, w: 100, h: 200, type: "unit" },
  { unit: "A-110", x: 340, y: 295, w: 100, h: 160, type: "unit" },
  { unit: "A-85",  x: 380, y: 455, w: 90,  h: 90,  type: "unit" },

  // Tiny W/M
  { label: "W", x: 100, y: 440, w: 40, h: 40, type: "common", fontSize: 14 },
  { label: "M", x: 100, y: 480, w: 40, h: 40, type: "common", fontSize: 14 },

  // Right column suites
  { unit: "A-101", x: 920, y: 280, w: 130, h: 170, type: "unit" },
  { unit: "A-102", x: 830, y: 340, w: 90,  h: 200, type: "unit" },
  { unit: "A-100", x: 920, y: 520, w: 130, h: 160, type: "unit" },

  // Common Area (center)
  { label: "Common Area", x: 450, y: 270, w: 300, h: 280, type: "common" },

  // Bottom row
  { unit: "A-114", x: 100, y: 545, w: 180, h: 130, type: "unit" },
  { unit: "A-112", x: 280, y: 545, w: 160, h: 130, type: "unit" },
  { label: "Conference Room", x: 440, y: 545, w: 170, h: 130, type: "common" },
  { unit: "A-85A", x: 610, y: 545, w: 110, h: 130, type: "unit" },
  { unit: "A-90",  x: 720, y: 545, w: 60,  h: 130, type: "unit" },

  // EXIT (right side)
  { label: "EXIT", x: 780, y: 590, w: 80, h: 50, type: "exit" },

  // Bottom-spanning suite
  { unit: "A-130", x: 200, y: 680, w: 520, h: 80, type: "unit" },
];

const NORM = (s: string) => (s || "").trim().toLowerCase();

function findLeaseForUnit(unit: string, tenants: Tenant[]): Tenant | null {
  const target = NORM(unit);
  return tenants.find((t: any) =>
    (t.unit || "").split(",").map((s: string) => NORM(s)).includes(target)
  ) || null;
}

const STATUS_FILL: Record<string, string> = {
  current:       "rgba(22,163,74,0.10)",
  past_due:      "rgba(220,38,38,0.16)",
  expiring_soon: "rgba(217,119,6,0.14)",
  locked_out:    "rgba(217,119,6,0.14)",
  vacant:        "rgba(161,161,170,0.06)",
};
const STATUS_STROKE: Record<string, string> = {
  current:       "rgba(22,163,74,0.55)",
  past_due:      "rgba(220,38,38,0.70)",
  expiring_soon: "rgba(217,119,6,0.65)",
  locked_out:    "rgba(217,119,6,0.65)",
  vacant:        "rgba(161,161,170,0.40)",
};

export default function SitePlanFloorPlan({ tenants, units, selectedUnit, onSelect, propertyId }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  const decorated = useMemo(() => {
    const out: Record<string, { tenant: Tenant | null; status: string; sqft: number }> = {};
    for (const r of ROOMS) {
      const unit = r.unit;
      if (!unit) continue;
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
    const dec = decorated[unit];
    if (dec.tenant) {
      onSelect({ ...dec.tenant, unit });
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
    <div className="relative w-full rounded-lg border border-[#e4e4e7] dark:border-[#3f3f46] bg-white dark:bg-[#18181b] shadow-sm overflow-hidden">
      <svg
        viewBox="0 0 1200 800"
        className="block w-full h-auto"
        style={{ maxHeight: "70vh" }}
      >
        {/* Building outline */}
        <rect x={90} y={90} width={1000} height={680} fill="none" stroke="#1f2937" strokeWidth={4} className="dark:[stroke:#e5e7eb]" />

        {ROOMS.map((r, i) => {
          if (r.type === "exit") {
            return (
              <g key={`exit-${i}`}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" />
                <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#dc2626" letterSpacing="0.05em">EXIT</text>
              </g>
            );
          }
          if (r.type === "common") {
            return (
              <g key={`common-${r.label}-${i}`}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(244,244,245,0.5)" stroke="#1f2937" strokeWidth={2} className="dark:[fill:rgba(39,39,42,0.5)] dark:[stroke:#e5e7eb]" />
                <text
                  x={r.x + r.w / 2}
                  y={r.y + r.h / 2 + (r.fontSize || 13) / 3}
                  textAnchor="middle"
                  fontSize={r.fontSize || 13}
                  fontWeight={500}
                  fill="#71717a"
                >
                  {r.label}
                </text>
              </g>
            );
          }
          // unit
          const dec = decorated[r.unit!];
          const isSelected = selectedUnit === r.unit;
          const isHovered = hovered === r.unit;
          const fill = isSelected || isHovered ? STATUS_FILL[dec.status] : "rgba(255,255,255,0.0)";
          const stroke = isSelected ? STATUS_STROKE[dec.status] : "#1f2937";
          const strokeWidth = isSelected ? 3 : 2;
          return (
            <g
              key={r.unit}
              onClick={() => handleClick(r.unit!)}
              onMouseEnter={() => setHovered(r.unit!)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                className={!isSelected ? "dark:[stroke:#e5e7eb]" : ""}
                style={{ transition: "fill 140ms ease, stroke 140ms ease, stroke-width 140ms ease" }}
              />
              {/* Status dot in top-right corner if not vacant */}
              {dec.status !== "vacant" && (
                <circle cx={r.x + r.w - 10} cy={r.y + 10} r={4} fill={STATUS_STROKE[dec.status]} />
              )}
              <text
                x={r.x + r.w / 2}
                y={r.y + r.h / 2 + 5}
                textAnchor="middle"
                fontSize={Math.min(r.fontSize || 16, Math.max(11, Math.min(r.w, r.h) / 5))}
                fontWeight={600}
                fill="#18181b"
                className="dark:[fill:#fafafa]"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {r.unit}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover info pill */}
      {hovered && decorated[hovered] && (
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:max-w-xs bg-white/95 dark:bg-[#18181b]/95 backdrop-blur border border-[#e4e4e7] dark:border-[#3f3f46] rounded-md px-3 py-2 shadow-lg">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="text-[11px] font-semibold text-[#18181b] dark:text-[#fafafa]">{hovered}</p>
            {decorated[hovered].sqft > 0 && (
              <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">{decorated[hovered].sqft.toLocaleString()} SF</span>
            )}
          </div>
          <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] truncate">
            {decorated[hovered].tenant ? (decorated[hovered].tenant!.tenant || "—") : "Vacant"}
          </p>
          {decorated[hovered].status && decorated[hovered].status !== "vacant" && decorated[hovered].status !== "current" && (
            <p className="text-[10px] mt-0.5 capitalize" style={{ color: STATUS_STROKE[decorated[hovered].status] }}>
              {decorated[hovered].status.replace(/_/g, " ")}
            </p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-3 right-3 bg-white/90 dark:bg-[#18181b]/90 backdrop-blur border border-[#e4e4e7] dark:border-[#3f3f46] rounded-md px-2.5 py-1.5 flex items-center gap-3 text-[10px] text-[#71717a] dark:text-[#a1a1aa]">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_STROKE.current }} />Occupied</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_STROKE.past_due }} />Past Due</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full border border-[#a1a1aa]" />Vacant</span>
      </div>
    </div>
  );
}

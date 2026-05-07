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
// in a 1200x800 viewBox were traced from the printed reference map by sampling
// wall pixel positions and projecting them through:
//   x = 90 + (image_x -  14) * 2.410   (image is 461 wide, walls span 14..429)
//   y = 90 + (image_y -  19) * 1.910   (image is 400 tall, walls span 19..375)
// so room boxes match the source proportions to within ~1 viewBox px.
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
  // ── Top strip (image y 19 → 107) ─────────────────────────────────────────
  // Break Room/Kitchen 14→126, A-107 126→174, A-111 174→222,
  // A-106 222→270, A-106A 270→345, A-103 345→429 (A-103 extends down to 141)
  { label: "Break Room / Kitchen", x: 90,  y: 90, w: 270, h: 168, type: "common" },
  { unit:  "A-107",                 x: 360, y: 90, w: 116, h: 168, type: "unit" },
  { unit:  "A-111",                 x: 476, y: 90, w: 115, h: 168, type: "unit" },
  { unit:  "A-106",                 x: 591, y: 90, w: 116, h: 168, type: "unit" },
  { unit:  "A-106A",                x: 707, y: 90, w: 181, h: 168, type: "unit" },
  // A-103: x 345→429 (888→1090), y 19→141 (90→323) — taller than rest of top row
  { unit:  "A-103",                 x: 888, y: 90, w: 202, h: 233, type: "unit" },

  // EXIT door above Break Room (image x ~80, y ~10)
  { label: "EXIT", x: 200, y: 70, w: 50, h: 16, type: "exit" },

  // Restroom cluster + A-108 sit at image y 107→138 (mapped 258→323)
  { label: "Womans", x: 90,  y: 258, w: 76,  h: 65, type: "common", fontSize: 12 },
  { label: "Mens",   x: 166, y: 258, w: 78,  h: 65, type: "common", fontSize: 12 },
  { unit:  "A-108",  x: 244, y: 258, w: 244, h: 65, type: "unit" },

  // ── Inner cluster (image y 138 → 263 for A-120) ─────────────────────────
  // A-120: x 14→111 (90→324), y 138→263 (235→558)  — left column, tall
  // A-113: x 111→179 (324→488), y 138→263 (235→558)
  // A-110: x 179→229 (488→608), y 138→212 (235→459)
  // A-85:  x 179→229 (488→608), y 212→263 (459→558)
  { unit: "A-120", x: 90,  y: 235, w: 234, h: 323, type: "unit" },
  { unit: "A-113", x: 324, y: 235, w: 164, h: 323, type: "unit" },
  { unit: "A-110", x: 488, y: 235, w: 120, h: 224, type: "unit" },
  { unit: "A-85",  x: 488, y: 459, w: 120, h:  99, type: "unit" },

  // ── Common Area (center): image x 229→345, y 141→283 (608→888, 323→594) ─
  { label: "Common Area", x: 608, y: 323, w: 280, h: 271, type: "common" },

  // ── Right-side suites (image x 345→429) ──────────────────────────────────
  // A-101: y 141→199 (323→434) right of A-103
  // A-102: x 295→345 (767→888), y 199→283 (434→594)  — narrow corridor box
  // A-100: y 199→283 (434→594) right column
  { unit: "A-101", x: 888, y: 323, w: 202, h: 111, type: "unit" },
  { unit: "A-102", x: 767, y: 434, w: 121, h: 160, type: "unit" },
  { unit: "A-100", x: 888, y: 434, w: 202, h: 160, type: "unit" },

  // EXIT marker on the right side (image x ~295, y ~283)
  { label: "EXIT", x: 870, y: 540, w: 50, h: 16, type: "exit" },

  // ── W/M small restrooms left side (image x 14→50, y 211→263) ────────────
  // Two stacked tiny rooms inside the building, between A-120 and A-114.
  { label: "W", x: 90,  y: 489, w: 58, h: 35, type: "common", fontSize: 14 },
  { label: "M", x: 90,  y: 524, w: 58, h: 34, type: "common", fontSize: 14 },

  // ── Bottom rows ──────────────────────────────────────────────────────────
  // A-114 is tall: x 14→84 (90→259), y 264→374 (558→768) — full bottom-left strip
  { unit:  "A-114", x: 90, y: 558, w: 169, h: 210, type: "unit" },

  // Middle-bottom row (image y 264→307, mapped 558→640):
  // A-112: x  84→167 (259→459)
  // Conf:  x 167→247 (459→652)
  // A-85A: x 247→292 (652→760)
  // A-90:  x 292→333 (760→859)
  { unit:  "A-112",            x: 259, y: 558, w: 200, h:  82, type: "unit" },
  { label: "Conference Room", x: 459, y: 558, w: 193, h:  82, type: "common" },
  { unit:  "A-85A",            x: 652, y: 558, w: 108, h:  82, type: "unit" },
  { unit:  "A-90",             x: 760, y: 558, w:  99, h:  82, type: "unit" },

  // A-130: wide bottom strip (image x 84→333, y 307→374) → 259→859, 640→768
  { unit: "A-130", x: 259, y: 640, w: 600, h: 128, type: "unit" },
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
  vacant:        "transparent",
};
const HOVER_FILL: Record<string, string> = {
  current:       "rgba(22,163,74,0.16)",
  past_due:      "rgba(220,38,38,0.22)",
  expiring_soon: "rgba(217,119,6,0.20)",
  locked_out:    "rgba(217,119,6,0.20)",
  vacant:        "rgba(100,116,139,0.16)",
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
        {/* Building outline traced from the source map. The right side
            steps in at the bottom (the gray exterior on the source) — modeled
            as a polygon rather than a plain rect. */}
        <polygon
          points="90,90 1090,90 1090,594 859,594 859,768 90,768"
          fill="none"
          stroke="#1f2937"
          strokeWidth={4}
          className="dark:[stroke:#e5e7eb]"
          strokeLinejoin="miter"
        />
        {/* Subtle gray fill for the cut-out (exterior pavement) so the
            shape reads correctly */}
        <rect x={859} y={594} width={231} height={174} fill="#f4f4f5" stroke="none" className="dark:[fill:#27272a]" opacity={0.6} />

        {ROOMS.map((r, i) => {
          if (r.type === "exit") {
            return (
              <g key={`exit-${i}`}>
                <text x={r.x + r.w / 2} y={r.y + 11} textAnchor="middle" fontSize={9} fontWeight={600} fill="#dc2626" letterSpacing="0.08em" style={{ opacity: 0.7 }}>
                  ↑ EXIT
                </text>
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
          const fill = isHovered
            ? HOVER_FILL[dec.status]
            : STATUS_FILL[dec.status];
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
              {dec.status !== "vacant" && (
                <circle cx={r.x + r.w - 10} cy={r.y + 10} r={4} fill={STATUS_STROKE[dec.status]} />
              )}
              <text
                x={r.x + r.w / 2}
                y={r.y + r.h / 2 + (dec.status === "vacant" ? -2 : 5)}
                textAnchor="middle"
                fontSize={Math.min(r.fontSize || 16, Math.max(11, Math.min(r.w, r.h) / 5))}
                fontWeight={600}
                fill="#18181b"
                className="dark:[fill:#fafafa]"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {r.unit}
              </text>
              {dec.status === "vacant" && (
                <text
                  x={r.x + r.w / 2}
                  y={r.y + r.h / 2 + 14}
                  textAnchor="middle"
                  fontSize={11}
                  fontStyle="italic"
                  fill="#a1a1aa"
                  className="dark:[fill:#71717a]"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  vacant
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="absolute top-3 right-3 bg-white/90 dark:bg-[#18181b]/90 backdrop-blur border border-[#e4e4e7] dark:border-[#3f3f46] rounded-md px-2.5 py-1.5 flex items-center gap-3 text-[10px] text-[#71717a] dark:text-[#a1a1aa]">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_STROKE.current }} />Occupied</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_STROKE.past_due }} />Past Due</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full border border-[#a1a1aa]" />Vacant</span>
      </div>
    </div>
  );
}

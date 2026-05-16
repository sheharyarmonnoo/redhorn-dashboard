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

// Layout uses a clean snap-to-grid: every rectangle's edges align with one of
// a small set of x/y rails so adjacent rooms share boundaries instead of
// overlapping by a couple of px (which is what happened when coords were
// projected from a printed map). Vertical rails:
//   y=90 (top wall) · y=258 (top-strip / restroom row) ·
//   y=323 (restroom row / inner cluster) · y=434 (A-101 / A-102 split) ·
//   y=489 (A-120 / W bathroom) · y=524 (W / M) · y=558 (inner / bottom rows)
//   y=594 (A-100 / right gap) · y=640 (bottom-row-1 / A-130) · y=768 (floor)
// Horizontal rails:
//   x=90 · x=166 · x=244 · x=324 · x=360 · x=476 · x=488 · x=591 · x=608 ·
//   x=652 · x=707 · x=760 · x=767 · x=859 · x=888 · x=1090
const ROOMS: Room[] = [
  // ── Top strip (y 90 → 258) ───────────────────────────────────────────────
  { label: "Break Room / Kitchen", x: 90,  y: 90, w: 270, h: 168, type: "common" },
  { unit:  "A-107",                 x: 360, y: 90, w: 116, h: 168, type: "unit" },
  { unit:  "A-111",                 x: 476, y: 90, w: 115, h: 168, type: "unit" },
  { unit:  "A-106",                 x: 591, y: 90, w: 116, h: 168, type: "unit" },
  { unit:  "A-106A",                x: 707, y: 90, w: 181, h: 168, type: "unit" },
  // A-103 is taller than the rest of the top row — extends through the
  // restroom-row band (y=258→323) so its bottom aligns with A-101's top.
  { unit:  "A-103",                 x: 888, y: 90, w: 202, h: 233, type: "unit" },

  // EXIT door above Break Room
  { label: "EXIT", x: 200, y: 70, w: 50, h: 16, type: "exit" },

  // ── Restroom row (y 258 → 323) ───────────────────────────────────────────
  // Three lockers + A-108 fill the left half; right half is intentionally
  // empty (the printed map shows hallway, not units, beneath A-111/A-106/etc.)
  { label: "Womans", x: 90,  y: 258, w: 76,  h: 65, type: "common", fontSize: 12 },
  { label: "Mens",   x: 166, y: 258, w: 78,  h: 65, type: "common", fontSize: 12 },
  { unit:  "A-108",  x: 244, y: 258, w: 244, h: 65, type: "unit" },

  // ── Inner cluster (y 323 → 558) ──────────────────────────────────────────
  // Was previously y=235 — overlapped both the top strip and the restroom
  // row. Pushed down to y=323 so each row is its own band with no overlap.
  // A-120's height is shortened so the W/M lockers fit cleanly in its bottom-
  // left corner instead of being painted on top of it.
  { unit: "A-120", x: 90,  y: 323, w: 234, h: 166, type: "unit" },
  { unit: "A-113", x: 324, y: 323, w: 164, h: 235, type: "unit" },
  { unit: "A-110", x: 488, y: 323, w: 120, h: 136, type: "unit" },
  { unit: "A-85",  x: 488, y: 459, w: 120, h:  99, type: "unit" },

  // W/M stacked lockers below A-120 — share its left edge.
  { label: "W", x: 90,  y: 489, w: 58, h: 35, type: "common", fontSize: 14 },
  { label: "M", x: 90,  y: 524, w: 58, h: 34, type: "common", fontSize: 14 },
  // Vestibule notch right of W/M, beneath A-120 (rendered as a static label
  // so it's clearly part of the building footprint, not a missing rectangle).
  { label: "", x: 148, y: 489, w: 176, h: 69, type: "common" },

  // ── Common Area (y 323 → 558) ────────────────────────────────────────────
  // Height trimmed to end at y=558 (the top of the bottom-row band) so it
  // doesn't bleed under Conference Room / A-85A. Width 608→767 so it doesn't
  // bleed under A-102.
  { label: "Common Area", x: 608, y: 323, w: 159, h: 235, type: "common" },

  // ── Right-side suites ────────────────────────────────────────────────────
  // A-102 height trimmed to end at y=558 so the bottom-row units (A-90, A-85A)
  // get a clean horizontal band without A-102 dipping into them.
  { unit: "A-101", x: 888, y: 323, w: 202, h: 111, type: "unit" },
  { unit: "A-102", x: 767, y: 434, w: 121, h: 124, type: "unit" },
  { unit: "A-100", x: 888, y: 434, w: 202, h: 124, type: "unit" },

  { label: "EXIT", x: 870, y: 540, w: 50, h: 16, type: "exit" },

  // ── Bottom row 1 (y 558 → 640) ───────────────────────────────────────────
  { unit:  "A-114",            x: 90,  y: 558, w: 169, h: 210, type: "unit" },
  { unit:  "A-112",            x: 259, y: 558, w: 200, h:  82, type: "unit" },
  { label: "Conference Room", x: 459, y: 558, w: 193, h:  82, type: "common" },
  { unit:  "A-85A",            x: 652, y: 558, w: 108, h:  82, type: "unit" },
  { unit:  "A-90",             x: 760, y: 558, w:  99, h:  82, type: "unit" },

  // ── Bottom row 2 (y 640 → 768) ───────────────────────────────────────────
  { unit: "A-130", x: 259, y: 640, w: 600, h: 128, type: "unit" },
];

const NORM = (s: string) => (s || "").trim().toLowerCase();

function findLeaseForUnit(unit: string, tenants: Tenant[]): Tenant | null {
  const target = NORM(unit);
  return tenants.find((t: any) =>
    (t.unit || "").split(",").map((s: string) => NORM(s)).includes(target)
  ) || null;
}

// Status colors aligned with StatusPill (Slice 1+2): green Current,
// yellow Past Due, orange Locked Out / Auction Posted, red In Eviction,
// blue Needs Review / Expiring Soon, gray Vacant / Auction Completed.
// Unknown statuses route to vacant via normStatusKey() below.
const STATUS_FILL: Record<string, string> = {
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
const HOVER_FILL: Record<string, string> = {
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
const STATUS_STROKE: Record<string, string> = {
  current:           "rgba(22,163,74,0.55)",
  past_due:          "rgba(202,138,4,0.70)",
  locked_out:        "rgba(234,88,12,0.70)",
  auction_posted:    "rgba(234,88,12,0.70)",
  in_eviction:       "rgba(220,38,38,0.70)",
  expiring_soon:     "rgba(37,99,235,0.65)",
  needs_review:      "rgba(37,99,235,0.65)",
  auction_completed: "rgba(161,161,170,0.40)",
  vacant:            "rgba(161,161,170,0.40)",
};
function normStatusKey(s: string | undefined): keyof typeof STATUS_FILL {
  const k = String(s || "").toLowerCase();
  return (k in STATUS_FILL ? k : "vacant") as keyof typeof STATUS_FILL;
}

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
          const sKey = normStatusKey(dec.status);
          const fill = isHovered ? HOVER_FILL[sKey] : STATUS_FILL[sKey];
          const stroke = isSelected ? STATUS_STROKE[sKey] : "#1f2937";
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

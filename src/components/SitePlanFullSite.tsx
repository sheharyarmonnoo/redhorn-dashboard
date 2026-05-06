"use client";
import { useMemo, useState } from "react";

type Tenant = any;

interface Props {
  tenants: Tenant[];
  units: any[];
  selectedUnit: string | null;
  onSelectUnit: (unit: string) => void;
  onOpenExecSuites: () => void;
}

// Schematic top-down site plan of Hollister Business Park. Coordinates trace
// the marketing map layout (Building D top, Building C middle-left, Building B
// middle-right, Building A far right with Exec Suites annex). 1600x1000
// viewBox keeps it square-ish on a typical dashboard layout.
//
// Building outlines + per-unit boxes sized to the data we actually have in
// the units feed. Each unit is clickable; the Executive Suites annex is a
// special clickable region that drills into the dedicated floor plan.

type Box = { unit: string; x: number; y: number; w: number; h: number };
type BuildingDef = {
  name: string;
  subtitle?: string;
  outline: { x: number; y: number; w: number; h: number };
  outlineColor: string;
  units: Box[];
};

const NORM = (s: string) => (s || "").trim().toLowerCase();

const BUILDINGS: BuildingDef[] = [
  // Building D — Office/Flex/Warehouse, top of the property
  {
    name: "Building D",
    subtitle: "Office / Flex / Warehouse",
    outline: { x: 60, y: 60, w: 760, h: 130 },
    outlineColor: "#2563eb",
    units: [
      { unit: "D-154", x: 70,  y: 70, w: 100, h: 50 },
      { unit: "D-155", x: 70,  y: 120, w: 100, h: 60 },
      { unit: "D-150", x: 175, y: 70, w: 130, h: 110 },
      { unit: "D-145", x: 310, y: 70, w: 130, h: 110 },
      { unit: "D-140", x: 445, y: 70, w: 130, h: 110 },
      { unit: "D-130", x: 580, y: 70, w: 230, h: 110 },
    ],
  },
  // Building C — multi-column storage / commercial, left-middle.
  // Pushed down +60 from Building D's bottom edge so the building label
  // has breathing room and doesn't crash into D's unit row above.
  {
    name: "Building C",
    subtitle: "Storage + commercial",
    outline: { x: 60, y: 280, w: 480, h: 720 },
    outlineColor: "#eab308",
    units: [
      // Far-left column (C-205 down)
      { unit: "C-205", x: 70,  y: 290, w: 90, h: 50 },
      { unit: "C-204", x: 70,  y: 345, w: 90, h: 50 },
      { unit: "C-203", x: 70,  y: 400, w: 90, h: 50 },
      { unit: "C-202", x: 70,  y: 455, w: 90, h: 50 },
      { unit: "C-201", x: 70,  y: 510, w: 90, h: 50 },
      { unit: "C-200", x: 70,  y: 565, w: 90, h: 50 },
      { unit: "C-194", x: 70,  y: 620, w: 90, h: 50 },
      { unit: "C-192", x: 70,  y: 675, w: 90, h: 50 },
      { unit: "C-301", x: 70,  y: 740, w: 90, h: 50 },
      { unit: "C-302", x: 70,  y: 795, w: 90, h: 50 },
      { unit: "C-303", x: 70,  y: 850, w: 90, h: 50 },
      { unit: "C-304", x: 70,  y: 905, w: 90, h: 50 },
      { unit: "C-305", x: 70,  y: 960, w: 90, h: 35 },
      // Middle column (C-212A down)
      { unit: "C-212A", x: 165, y: 290, w: 80, h: 50 },
      { unit: "C-211",  x: 165, y: 345, w: 80, h: 50 },
      { unit: "C-210",  x: 165, y: 400, w: 80, h: 50 },
      { unit: "C-209",  x: 165, y: 455, w: 80, h: 50 },
      { unit: "C-208",  x: 165, y: 510, w: 80, h: 50 },
      { unit: "C-207",  x: 165, y: 565, w: 80, h: 50 },
      { unit: "C-206",  x: 165, y: 620, w: 80, h: 50 },
      { unit: "C-103",  x: 165, y: 675, w: 80, h: 50 },
      { unit: "C-102",  x: 165, y: 730, w: 80, h: 50 },
      { unit: "C-101",  x: 165, y: 785, w: 80, h: 50 },
      { unit: "C-306",  x: 165, y: 840, w: 80, h: 50 },
      { unit: "C-307",  x: 165, y: 895, w: 80, h: 50 },
      { unit: "C-308",  x: 165, y: 950, w: 80, h: 45 },
      // Right column (C-218 down)
      { unit: "C-218", x: 250, y: 290, w: 90, h: 50 },
      { unit: "C-217", x: 250, y: 345, w: 90, h: 50 },
      { unit: "C-216", x: 250, y: 400, w: 90, h: 50 },
      { unit: "C-215", x: 250, y: 455, w: 90, h: 50 },
      { unit: "C-214", x: 250, y: 510, w: 90, h: 50 },
      { unit: "C-213", x: 250, y: 565, w: 90, h: 50 },
      { unit: "C-212", x: 250, y: 620, w: 90, h: 50 },
      { unit: "C-100", x: 250, y: 860, w: 90, h: 130 },
    ],
  },
  // Building B — Office/Warehouse, right-middle. Shifted left so the
  // layout sits more centered within the viewBox (was 1080).
  {
    name: "Building B",
    subtitle: "Office / Warehouse",
    outline: { x: 900, y: 220, w: 200, h: 600 },
    outlineColor: "#dc2626",
    units: [
      { unit: "B-115", x: 910, y: 230, w: 180, h: 80 },
      { unit: "B-145", x: 910, y: 320, w: 90,  h: 80 },
      { unit: "B-130", x: 1010, y: 320, w: 80,  h: 90 },
      { unit: "B-120", x: 910, y: 410, w: 180, h: 80 },
      { unit: "B-110", x: 1010, y: 500, w: 80,  h: 50 },
      { unit: "B-105", x: 910, y: 560, w: 180, h: 130 },
      { unit: "B-100", x: 910, y: 700, w: 110, h: 110 },
      { unit: "B-398", x: 1030, y: 700, w: 60,  h: 110 },
    ],
  },
  // Building A — Manufacturing, far right (with Exec Suites annex).
  // Shifted left in lockstep with Building B (was 1320).
  {
    name: "Building A",
    subtitle: "Manufacturing",
    outline: { x: 1140, y: 220, w: 220, h: 600 },
    outlineColor: "#16a34a",
    units: [
      { unit: "A-150", x: 1150, y: 230, w: 200, h: 470 },
    ],
  },
];

// Status colors. Vacant default is transparent (so the card bg shows
// through and unit text stays legible in both themes); on hover we
// flash a subtle slate so vacants get a clear hit-area cue.
const STATUS_FILL: Record<string, string> = {
  current:       "rgba(22,163,74,0.10)",
  past_due:      "rgba(220,38,38,0.16)",
  expiring_soon: "rgba(217,119,6,0.14)",
  locked_out:    "rgba(217,119,6,0.14)",
  vacant:        "transparent",
};
// Hover fills — vacant gets a slate-gray lift; everything else uses the
// status color (the user feels the cell react without needing the info
// pill that used to sit in the bottom-right corner).
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
  vacant:        "rgba(161,161,170,0.50)",
};

function findLeaseForUnit(unit: string, tenants: Tenant[]): Tenant | null {
  const target = NORM(unit);
  return tenants.find((t: any) =>
    (t.unit || "").split(",").map((s: string) => NORM(s)).includes(target)
  ) || null;
}

export default function SitePlanFullSite({ tenants, units, selectedUnit, onSelectUnit, onOpenExecSuites }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredAnnex, setHoveredAnnex] = useState(false);

  const decorated = useMemo(() => {
    const out: Record<string, { tenant: Tenant | null; status: string; sqft: number }> = {};
    for (const b of BUILDINGS) {
      for (const r of b.units) {
        const lease = findLeaseForUnit(r.unit, tenants);
        const u = units.find((x: any) => NORM(x.unit) === NORM(r.unit));
        out[r.unit] = {
          tenant: lease,
          status: lease?.status || "vacant",
          sqft: u?.sqft || lease?.sqft || 0,
        };
      }
    }
    return out;
  }, [tenants, units]);

  return (
    <div className="relative w-full max-w-5xl mx-auto rounded-lg border border-[#e4e4e7] dark:border-[#3f3f46] bg-white dark:bg-[#18181b] shadow-sm overflow-hidden">
      <svg viewBox="0 0 1420 1100" className="block w-full h-auto" style={{ maxHeight: "78vh" }} preserveAspectRatio="xMidYMid meet">
        {/* No background rect — let the card's bg shine through so there's
            no gray-vs-white seam between the SVG and its container. */}

        {/* "Hollister Street" label at bottom */}
        <text x={710} y={1075} textAnchor="middle" fontSize={13} fontWeight={600} fill="#a1a1aa" letterSpacing="0.15em">
          16261 HOLLISTER STREET
        </text>

        {/* Each building */}
        {BUILDINGS.map(b => (
          <g key={b.name}>
            {/* Building label above the units (no outline rect — let the
                unit grid carry the visual structure) */}
            <text
              x={b.outline.x + b.outline.w / 2}
              y={b.outline.y - 22}
              textAnchor="middle"
              fontSize={16}
              fontWeight={700}
              fill="#18181b"
              className="dark:[fill:#fafafa]"
            >
              {b.name}
            </text>
            {b.subtitle && (
              <text
                x={b.outline.x + b.outline.w / 2}
                y={b.outline.y - 6}
                textAnchor="middle"
                fontSize={11}
                fill="#71717a"
              >
                {b.subtitle}
              </text>
            )}
            {/* Unit boxes inside the building */}
            {b.units.map(r => {
              const dec = decorated[r.unit];
              const isSelected = selectedUnit === r.unit;
              const isHovered = hovered === r.unit;
              const fill = isHovered
                ? HOVER_FILL[dec.status]
                : isSelected
                  ? STATUS_FILL[dec.status]
                  : STATUS_FILL.vacant;
              const stroke = isSelected ? STATUS_STROKE[dec.status] : "#3f3f46";
              const strokeWidth = isSelected ? 2.5 : 1;
              return (
                <g
                  key={r.unit}
                  onClick={() => onSelectUnit(r.unit)}
                  onMouseEnter={() => setHovered(r.unit)}
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
                    style={{ transition: "fill 140ms ease, stroke 140ms ease" }}
                    className={!isSelected ? "dark:[stroke:#52525b]" : ""}
                  />
                  {dec.status !== "vacant" && (
                    <circle cx={r.x + r.w - 6} cy={r.y + 6} r={3} fill={STATUS_STROKE[dec.status]} />
                  )}
                  <text
                    x={r.x + r.w / 2}
                    y={r.y + r.h / 2 + (dec.status === "vacant" ? -2 : 4)}
                    textAnchor="middle"
                    fontSize={Math.min(13, Math.max(9, Math.min(r.w, r.h) / 6))}
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
                      y={r.y + r.h / 2 + 11}
                      textAnchor="middle"
                      fontSize={Math.min(9, Math.max(7, Math.min(r.w, r.h) / 9))}
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
          </g>
        ))}

        {/* Executive Suites annex — separate clickable region inside Building A */}
        <g
          onClick={onOpenExecSuites}
          onMouseEnter={() => setHoveredAnnex(true)}
          onMouseLeave={() => setHoveredAnnex(false)}
          style={{ cursor: "pointer" }}
        >
          <rect
            x={1150}
            y={710}
            width={200}
            height={100}
            fill={hoveredAnnex ? "rgba(22,163,74,0.18)" : "rgba(22,163,74,0.08)"}
            stroke="#16a34a"
            strokeWidth={2.5}
            rx={4}
            style={{ transition: "fill 160ms ease" }}
          />
          <text x={1250} y={748} textAnchor="middle" fontSize={14} fontWeight={700} fill="#15803d">
            Executive Suites
          </text>
          <text x={1250} y={768} textAnchor="middle" fontSize={11} fill="#15803d">
            A-101 → A-130
          </text>
          <text x={1250} y={794} textAnchor="middle" fontSize={10} fontWeight={600} fill="#15803d" style={{ letterSpacing: "0.06em" }}>
            VIEW FLOOR PLAN ›
          </text>
        </g>

        {/* Parking */}
        <text x={700} y={520} textAnchor="middle" fontSize={11} fontStyle="italic" fill="#a1a1aa">
          Parking
        </text>
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

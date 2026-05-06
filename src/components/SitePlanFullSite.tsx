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
  // Building C — multi-column storage / commercial, left-middle
  {
    name: "Building C",
    subtitle: "Storage + commercial",
    outline: { x: 60, y: 220, w: 480, h: 720 },
    outlineColor: "#eab308",
    units: [
      // Far-left column (C-205 down)
      { unit: "C-205", x: 70,  y: 230, w: 90, h: 50 },
      { unit: "C-204", x: 70,  y: 285, w: 90, h: 50 },
      { unit: "C-203", x: 70,  y: 340, w: 90, h: 50 },
      { unit: "C-202", x: 70,  y: 395, w: 90, h: 50 },
      { unit: "C-201", x: 70,  y: 450, w: 90, h: 50 },
      { unit: "C-200", x: 70,  y: 505, w: 90, h: 50 },
      { unit: "C-194", x: 70,  y: 560, w: 90, h: 50 },
      { unit: "C-192", x: 70,  y: 615, w: 90, h: 50 },
      { unit: "C-301", x: 70,  y: 680, w: 90, h: 50 },
      { unit: "C-302", x: 70,  y: 735, w: 90, h: 50 },
      { unit: "C-303", x: 70,  y: 790, w: 90, h: 50 },
      { unit: "C-304", x: 70,  y: 845, w: 90, h: 50 },
      { unit: "C-305", x: 70,  y: 900, w: 90, h: 35 },
      // Middle column (C-212A down)
      { unit: "C-212A", x: 165, y: 230, w: 80, h: 50 },
      { unit: "C-211",  x: 165, y: 285, w: 80, h: 50 },
      { unit: "C-210",  x: 165, y: 340, w: 80, h: 50 },
      { unit: "C-209",  x: 165, y: 395, w: 80, h: 50 },
      { unit: "C-208",  x: 165, y: 450, w: 80, h: 50 },
      { unit: "C-207",  x: 165, y: 505, w: 80, h: 50 },
      { unit: "C-206",  x: 165, y: 560, w: 80, h: 50 },
      { unit: "C-103",  x: 165, y: 615, w: 80, h: 50 },
      { unit: "C-102",  x: 165, y: 670, w: 80, h: 50 },
      { unit: "C-101",  x: 165, y: 725, w: 80, h: 50 },
      { unit: "C-306",  x: 165, y: 780, w: 80, h: 50 },
      { unit: "C-307",  x: 165, y: 835, w: 80, h: 50 },
      { unit: "C-308",  x: 165, y: 890, w: 80, h: 45 },
      // Right column (C-218 down)
      { unit: "C-218", x: 250, y: 230, w: 90, h: 50 },
      { unit: "C-217", x: 250, y: 285, w: 90, h: 50 },
      { unit: "C-216", x: 250, y: 340, w: 90, h: 50 },
      { unit: "C-215", x: 250, y: 395, w: 90, h: 50 },
      { unit: "C-214", x: 250, y: 450, w: 90, h: 50 },
      { unit: "C-213", x: 250, y: 505, w: 90, h: 50 },
      { unit: "C-212", x: 250, y: 560, w: 90, h: 50 },
      { unit: "C-100", x: 250, y: 800, w: 90, h: 130 },
    ],
  },
  // Building B — Office/Warehouse, right-middle
  {
    name: "Building B",
    subtitle: "Office / Warehouse",
    outline: { x: 1080, y: 220, w: 200, h: 600 },
    outlineColor: "#dc2626",
    units: [
      { unit: "B-115", x: 1090, y: 230, w: 180, h: 80 },
      { unit: "B-145", x: 1090, y: 320, w: 90,  h: 80 },
      { unit: "B-130", x: 1190, y: 320, w: 80,  h: 90 },
      { unit: "B-120", x: 1090, y: 410, w: 180, h: 80 },
      { unit: "B-110", x: 1190, y: 500, w: 80,  h: 50 },
      { unit: "B-105", x: 1090, y: 560, w: 180, h: 130 },
      { unit: "B-100", x: 1090, y: 700, w: 110, h: 110 },
      { unit: "B-398", x: 1210, y: 700, w: 60,  h: 110 },
    ],
  },
  // Building A — Manufacturing, far right (with Exec Suites annex)
  {
    name: "Building A",
    subtitle: "Manufacturing",
    outline: { x: 1320, y: 220, w: 220, h: 600 },
    outlineColor: "#16a34a",
    units: [
      // A-150 occupies the main manufacturing block. The Exec Suites annex
      // sits below it as a separate clickable region (handled outside this
      // unit list since clicking it opens the focus modal, not the drawer).
      { unit: "A-150", x: 1330, y: 230, w: 200, h: 470 },
    ],
  },
];

// Status colors mirror SitePlanFloorPlan
const STATUS_FILL: Record<string, string> = {
  current:       "rgba(22,163,74,0.10)",
  past_due:      "rgba(220,38,38,0.16)",
  expiring_soon: "rgba(217,119,6,0.14)",
  locked_out:    "rgba(217,119,6,0.14)",
  vacant:        "rgba(244,244,245,1)",
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
    <div className="relative w-full rounded-lg border border-[#e4e4e7] dark:border-[#3f3f46] bg-white dark:bg-[#18181b] shadow-sm overflow-hidden">
      <svg viewBox="0 0 1600 1000" className="block w-full h-auto" style={{ maxHeight: "75vh" }}>
        {/* Soft grass / lot background tint */}
        <rect x={0} y={0} width={1600} height={1000} fill="#fafafa" className="dark:[fill:#0f0f10]" />

        {/* "Hollister Street" label at bottom */}
        <text x={800} y={985} textAnchor="middle" fontSize={13} fontWeight={600} fill="#a1a1aa" letterSpacing="0.15em">
          16261 HOLLISTER STREET
        </text>

        {/* Each building */}
        {BUILDINGS.map(b => (
          <g key={b.name}>
            {/* Building outline */}
            <rect
              x={b.outline.x}
              y={b.outline.y}
              width={b.outline.w}
              height={b.outline.h}
              fill="none"
              stroke={b.outlineColor}
              strokeWidth={3}
              rx={4}
            />
            {/* Building label above the outline */}
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
              const fill = isSelected || isHovered ? STATUS_FILL[dec.status] : STATUS_FILL.vacant;
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
                    y={r.y + r.h / 2 + 4}
                    textAnchor="middle"
                    fontSize={Math.min(13, Math.max(9, Math.min(r.w, r.h) / 6))}
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
            x={1330}
            y={710}
            width={200}
            height={100}
            fill={hoveredAnnex ? "rgba(22,163,74,0.18)" : "rgba(22,163,74,0.08)"}
            stroke="#16a34a"
            strokeWidth={2.5}
            rx={4}
            style={{ transition: "fill 160ms ease" }}
          />
          <text x={1430} y={748} textAnchor="middle" fontSize={14} fontWeight={700} fill="#15803d">
            Executive Suites
          </text>
          <text x={1430} y={768} textAnchor="middle" fontSize={11} fill="#15803d">
            A-101 → A-130
          </text>
          <text x={1430} y={794} textAnchor="middle" fontSize={10} fontWeight={600} fill="#15803d" style={{ letterSpacing: "0.06em" }}>
            VIEW FLOOR PLAN ›
          </text>
        </g>

        {/* Parking + entrance hint */}
        <text x={760} y={520} textAnchor="middle" fontSize={11} fontStyle="italic" fill="#a1a1aa">
          Parking
        </text>
        <text x={760} y={540} textAnchor="middle" fontSize={11} fontStyle="italic" fill="#a1a1aa">
          (You Are Here ★)
        </text>
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

"use client";
import { useMemo, useState, useRef, useCallback } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

type Tenant = any;

interface Props {
  tenants: Tenant[];
  units: any[];
  selectedUnit: string | null;
  onSelectUnit: (unit: string) => void;
  onOpenExecSuites: () => void;
}

// Top-down site plan of Hollister Business Park, traced from the LandPark
// Commercial marketing map. The 1600x1100 viewBox holds:
//   - Building D across the top (Office/Flex/Warehouse, blue)
//   - Building C down the left as a 3-column storage stack (yellow)
//   - Building B in the right-center, irregular L-shape (red)
//   - Building A on the far right with the Exec Suites annex (green)
//
// Every <rect> with a unit label is clickable -> onSelectUnit. The Exec
// Suites annex is a single clickable region -> onOpenExecSuites.

type Box = { unit: string; x: number; y: number; w: number; h: number };
type BuildingDef = {
  name: string;
  subtitle?: string;
  // Outline rect for the building chrome (drawn behind the unit grid)
  outline: { x: number; y: number; w: number; h: number };
  outlineColor: string;
  units: Box[];
};

const NORM = (s: string) => (s || "").trim().toLowerCase();

// ---------- Layout constants ----------
// Building D (top row). Stretches across most of the top of the viewBox.
const D_X = 80;
const D_Y = 70;
const D_H = 200;          // total vertical extent of Building D
const D_TOP_H = 95;        // height of D-154 (top half of left stack)
const D_BOT_H = D_H - D_TOP_H;
// Cell widths along D. D-160 is the skinny vertical on the far left,
// D-154/D-155 are stacked, then four large square-ish blocks.
const D_W_160 = 90;
const D_W_154 = 170;
const D_W_150 = 260;       // largest, includes 400 sf common area
const D_W_145 = 200;
const D_W_140 = 200;
const D_W_130 = 200;

// Compute D x-offsets
const D_X_160 = D_X;
const D_X_154 = D_X_160 + D_W_160;
const D_X_150 = D_X_154 + D_W_154;
const D_X_145 = D_X_150 + D_W_150;
const D_X_140 = D_X_145 + D_W_145;
const D_X_130 = D_X_140 + D_W_140;
const D_TOTAL_W = D_W_160 + D_W_154 + D_W_150 + D_W_145 + D_W_140 + D_W_130;

// Building C — 3 columns of storage on the left.
const C_X = 80;
const C_Y = 340;
const C_W = 480;
const C_COL_W = 150;        // each of the 3 columns
const C_COL_GAP = 5;
const C_LEFT_X   = C_X + 10;
const C_MID_X    = C_LEFT_X + C_COL_W + C_COL_GAP;
const C_RIGHT_X  = C_MID_X + C_COL_W + C_COL_GAP;
const C_ROW_H    = 44;       // typical storage row height
const C_TOP      = C_Y + 30;

// Building B — irregular footprint on the right-center.
const B_X = 920;
const B_Y = 320;

// Building A — far right.
const A_X = 1240;
const A_Y = 320;
const A_W = 280;
const A_BLOCK_H = 470;
const A_ANNEX_H = 130;

// ---------- Building data ----------

const BUILDINGS: BuildingDef[] = [
  // ============ Building D — Office / Flex / Warehouse ============
  {
    name: "Building D",
    subtitle: "Office / Flex / Warehouse",
    outline: { x: D_X - 6, y: D_Y - 6, w: D_TOTAL_W + 12, h: D_H + 12 },
    outlineColor: "#2563eb",
    units: [
      // D-160 — skinny full-height column on the far left
      { unit: "D-160", x: D_X_160, y: D_Y, w: D_W_160, h: D_H },
      // D-154 (top half) and D-155 (bottom half) stacked
      { unit: "D-154", x: D_X_154, y: D_Y,             w: D_W_154, h: D_TOP_H },
      { unit: "D-155", x: D_X_154, y: D_Y + D_TOP_H,   w: D_W_154, h: D_BOT_H },
      // D-150 — large block, includes the 400 sf common-area note
      { unit: "D-150", x: D_X_150, y: D_Y, w: D_W_150, h: D_H },
      // D-145 — has the Common Loading Dock annex underneath in the photo
      { unit: "D-145", x: D_X_145, y: D_Y, w: D_W_145, h: D_H },
      // D-140 and D-130 finish the row
      { unit: "D-140", x: D_X_140, y: D_Y, w: D_W_140, h: D_H },
      { unit: "D-130", x: D_X_130, y: D_Y, w: D_W_130, h: D_H },
    ],
  },

  // ============ Building C — Storage (3 columns) ============
  {
    name: "Building C",
    subtitle: "Storage",
    outline: { x: C_X, y: C_Y, w: C_W, h: 700 },
    outlineColor: "#eab308",
    units: [
      // ----- Left column (top -> bottom): C-205 .. C-305 -----
      { unit: "C-205", x: C_LEFT_X, y: C_TOP + C_ROW_H * 0,  w: C_COL_W, h: C_ROW_H },
      { unit: "C-204", x: C_LEFT_X, y: C_TOP + C_ROW_H * 1,  w: C_COL_W, h: C_ROW_H },
      { unit: "C-203", x: C_LEFT_X, y: C_TOP + C_ROW_H * 2,  w: C_COL_W, h: C_ROW_H },
      { unit: "C-202", x: C_LEFT_X, y: C_TOP + C_ROW_H * 3,  w: C_COL_W, h: C_ROW_H },
      { unit: "C-201", x: C_LEFT_X, y: C_TOP + C_ROW_H * 4,  w: C_COL_W, h: C_ROW_H },
      { unit: "C-200", x: C_LEFT_X, y: C_TOP + C_ROW_H * 5,  w: C_COL_W, h: C_ROW_H },
      { unit: "C-194", x: C_LEFT_X, y: C_TOP + C_ROW_H * 6,  w: C_COL_W, h: C_ROW_H },
      { unit: "C-192", x: C_LEFT_X, y: C_TOP + C_ROW_H * 7,  w: C_COL_W, h: C_ROW_H },
      { unit: "C-301", x: C_LEFT_X, y: C_TOP + C_ROW_H * 8,  w: C_COL_W, h: C_ROW_H },
      { unit: "C-302", x: C_LEFT_X, y: C_TOP + C_ROW_H * 9,  w: C_COL_W, h: C_ROW_H },
      { unit: "C-303", x: C_LEFT_X, y: C_TOP + C_ROW_H * 10, w: C_COL_W, h: C_ROW_H },
      { unit: "C-304", x: C_LEFT_X, y: C_TOP + C_ROW_H * 11, w: C_COL_W, h: C_ROW_H },
      { unit: "C-305", x: C_LEFT_X, y: C_TOP + C_ROW_H * 12, w: C_COL_W, h: C_ROW_H },

      // ----- Middle column (top -> bottom): C-211 .. C-101, gap, C-306..C-308 -----
      { unit: "C-211", x: C_MID_X, y: C_TOP + C_ROW_H * 0, w: C_COL_W, h: C_ROW_H },
      { unit: "C-210", x: C_MID_X, y: C_TOP + C_ROW_H * 1, w: C_COL_W, h: C_ROW_H },
      { unit: "C-209", x: C_MID_X, y: C_TOP + C_ROW_H * 2, w: C_COL_W, h: C_ROW_H },
      { unit: "C-208", x: C_MID_X, y: C_TOP + C_ROW_H * 3, w: C_COL_W, h: C_ROW_H },
      { unit: "C-207", x: C_MID_X, y: C_TOP + C_ROW_H * 4, w: C_COL_W, h: C_ROW_H },
      { unit: "C-206", x: C_MID_X, y: C_TOP + C_ROW_H * 5, w: C_COL_W, h: C_ROW_H },
      { unit: "C-103", x: C_MID_X, y: C_TOP + C_ROW_H * 6, w: C_COL_W, h: C_ROW_H },
      { unit: "C-102", x: C_MID_X, y: C_TOP + C_ROW_H * 7, w: C_COL_W, h: C_ROW_H },
      { unit: "C-101", x: C_MID_X, y: C_TOP + C_ROW_H * 8, w: C_COL_W, h: C_ROW_H },
      // gap at row 9 (no unit there in the photo)
      { unit: "C-306", x: C_MID_X, y: C_TOP + C_ROW_H * 10, w: C_COL_W, h: C_ROW_H },
      { unit: "C-307", x: C_MID_X, y: C_TOP + C_ROW_H * 11, w: C_COL_W, h: C_ROW_H },
      { unit: "C-308", x: C_MID_X, y: C_TOP + C_ROW_H * 12, w: C_COL_W, h: C_ROW_H },

      // ----- Right column (top -> bottom): C-212A, C-218..C-212, then C-100 at bottom -----
      { unit: "C-212A", x: C_RIGHT_X, y: C_TOP + C_ROW_H * 0, w: C_COL_W, h: C_ROW_H * 0.7 },
      { unit: "C-218",  x: C_RIGHT_X, y: C_TOP + C_ROW_H * 0.7, w: C_COL_W, h: C_ROW_H },
      { unit: "C-217",  x: C_RIGHT_X, y: C_TOP + C_ROW_H * 1.7, w: C_COL_W, h: C_ROW_H },
      { unit: "C-216",  x: C_RIGHT_X, y: C_TOP + C_ROW_H * 2.7, w: C_COL_W, h: C_ROW_H },
      { unit: "C-215",  x: C_RIGHT_X, y: C_TOP + C_ROW_H * 3.7, w: C_COL_W, h: C_ROW_H },
      { unit: "C-214",  x: C_RIGHT_X, y: C_TOP + C_ROW_H * 4.7, w: C_COL_W, h: C_ROW_H },
      { unit: "C-213",  x: C_RIGHT_X, y: C_TOP + C_ROW_H * 5.7, w: C_COL_W, h: C_ROW_H },
      { unit: "C-212",  x: C_RIGHT_X, y: C_TOP + C_ROW_H * 6.7, w: C_COL_W, h: C_ROW_H },
      // C-100 sits as a wider block at the bottom of the right column
      { unit: "C-100",  x: C_RIGHT_X, y: C_TOP + C_ROW_H * 10, w: C_COL_W, h: C_ROW_H * 3 },
    ],
  },

  // ============ Building B — Office / Warehouse (irregular) ============
  // The photo shows an irregular footprint:
  //   - B-115 (top) juts out wider on the left than the rest of the building
  //   - B-145/B-130 sit side by side
  //   - B-120 wider, with B-110 small unit beside it
  //   - B-105 large block
  //   - B-100 with B-398 small unit beside it at the bottom
  {
    name: "Building B",
    subtitle: "Office / Warehouse",
    outline: { x: B_X - 30, y: B_Y - 6, w: 290, h: 612 },
    outlineColor: "#dc2626",
    units: [
      // B-115 — irregular, wider, juts out left
      { unit: "B-115", x: B_X - 24, y: B_Y,       w: 244, h: 80 },
      // B-145 (left) and B-130 (right)
      { unit: "B-145", x: B_X,      y: B_Y + 85,  w: 110, h: 70 },
      { unit: "B-130", x: B_X + 115, y: B_Y + 85, w: 105, h: 70 },
      // B-120 wider, with B-110 small unit beside it
      { unit: "B-120", x: B_X,       y: B_Y + 160, w: 150, h: 80 },
      { unit: "B-110", x: B_X + 155, y: B_Y + 160, w: 65,  h: 80 },
      // B-105 — large block
      { unit: "B-105", x: B_X,       y: B_Y + 245, w: 220, h: 140 },
      // B-100 with B-398 small unit beside it
      { unit: "B-100", x: B_X,       y: B_Y + 390, w: 150, h: 210 },
      { unit: "B-398", x: B_X + 155, y: B_Y + 390, w: 65,  h: 210 },
    ],
  },

  // ============ Building A — Manufacturing ============
  // A-150 is the large block; the Exec Suites annex (A-101..A-130) is a
  // separate clickable region drawn after this list (drills to floor plan).
  {
    name: "Building A",
    subtitle: "Manufacturing",
    outline: { x: A_X - 6, y: A_Y - 6, w: A_W + 12, h: A_BLOCK_H + A_ANNEX_H + 18 },
    outlineColor: "#16a34a",
    units: [
      { unit: "A-150", x: A_X, y: A_Y, w: A_W, h: A_BLOCK_H },
    ],
  },
];

// ---------- Status colors ----------
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

  // Pan + zoom state. viewBox starts at full extents (0 0 1600 1100); zoom
  // and pan modify it so the SVG scales/translates without losing crispness.
  const VB_W = 1600;
  const VB_H = 1100;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; startPanX: number; startPanY: number }>({
    active: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0,
  });
  const svgRef = useRef<SVGSVGElement | null>(null);

  const viewW = VB_W / zoom;
  const viewH = VB_H / zoom;
  const viewBox = `${pan.x} ${pan.y} ${viewW} ${viewH}`;

  const clampPan = useCallback((px: number, py: number, vw: number, vh: number) => {
    return { x: Math.max(0, Math.min(VB_W - vw, px)), y: Math.max(0, Math.min(VB_H - vh, py)) };
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * (VB_W / zoom) + pan.x;
    const cy = ((e.clientY - rect.top) / rect.height) * (VB_H / zoom) + pan.y;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nextZoom = Math.max(1, Math.min(6, zoom * factor));
    if (nextZoom === zoom) return;
    const nextVW = VB_W / nextZoom;
    const nextVH = VB_H / nextZoom;
    const nextPanX = cx - (cx - pan.x) * (nextVW / (VB_W / zoom));
    const nextPanY = cy - (cy - pan.y) * (nextVH / (VB_H / zoom));
    const c = clampPan(nextPanX, nextPanY, nextVW, nextVH);
    setZoom(nextZoom);
    setPan(c);
  }, [zoom, pan, clampPan]);

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (zoom <= 1) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
  }, [zoom, pan]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current.active) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((e.clientX - dragRef.current.startX) / rect.width) * viewW;
    const dy = ((e.clientY - dragRef.current.startY) / rect.height) * viewH;
    const c = clampPan(dragRef.current.startPanX - dx, dragRef.current.startPanY - dy, viewW, viewH);
    setPan(c);
  }, [viewW, viewH, clampPan]);

  const onMouseUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  const zoomIn = () => {
    const next = Math.min(6, zoom * 1.4);
    const nextVW = VB_W / next;
    const nextVH = VB_H / next;
    const c = clampPan(pan.x + (viewW - nextVW) / 2, pan.y + (viewH - nextVH) / 2, nextVW, nextVH);
    setZoom(next); setPan(c);
  };
  const zoomOut = () => {
    const next = Math.max(1, zoom / 1.4);
    const nextVW = VB_W / next;
    const nextVH = VB_H / next;
    const c = clampPan(pan.x - (nextVW - viewW) / 2, pan.y - (nextVH - viewH) / 2, nextVW, nextVH);
    setZoom(next); setPan(c);
  };
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

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
      {/* Zoom controls — bottom-right, above the legend */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1 bg-white/90 dark:bg-[#18181b]/90 backdrop-blur border border-[#e4e4e7] dark:border-[#3f3f46] rounded-md p-1 shadow-sm">
        <button
          onClick={zoomIn}
          disabled={zoom >= 6}
          title="Zoom in"
          className="w-8 h-8 flex items-center justify-center rounded text-[#18181b] dark:text-[#fafafa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        ><ZoomIn size={14} /></button>
        <button
          onClick={zoomOut}
          disabled={zoom <= 1}
          title="Zoom out"
          className="w-8 h-8 flex items-center justify-center rounded text-[#18181b] dark:text-[#fafafa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        ><ZoomOut size={14} /></button>
        <button
          onClick={reset}
          disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
          title="Reset view"
          className="w-8 h-8 flex items-center justify-center rounded text-[#18181b] dark:text-[#fafafa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        ><Maximize2 size={13} /></button>
      </div>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="block w-full h-auto select-none"
        style={{ maxHeight: "78vh", cursor: zoom > 1 ? (dragRef.current.active ? "grabbing" : "grab") : "default", touchAction: "none" }}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Site title */}
        <text x={VB_W / 2} y={32} textAnchor="middle" fontSize={18} fontWeight={800} fill="#18181b" className="dark:[fill:#fafafa]" letterSpacing="0.18em">
          HOLLISTER BUSINESS PARK
        </text>

        {/* Hollister Street label at bottom */}
        <text x={VB_W / 2} y={1075} textAnchor="middle" fontSize={13} fontWeight={600} fill="#a1a1aa" letterSpacing="0.15em">
          16261 HOLLISTER STREET
        </text>

        {/* ENTRY arrow — between Building D and Building C (left edge) */}
        <text x={140} y={310} textAnchor="middle" fontSize={11} fontWeight={700} fill="#dc2626" letterSpacing="0.1em">
          ENTRY ›
        </text>

        {/* Each building */}
        {BUILDINGS.map(b => (
          <g key={b.name}>
            {/* Building outline (drawn behind units) */}
            <rect
              x={b.outline.x}
              y={b.outline.y}
              width={b.outline.w}
              height={b.outline.h}
              fill="none"
              stroke={b.outlineColor}
              strokeWidth={3}
              rx={4}
              opacity={0.85}
            />
            {/* Building label above */}
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
                    fontSize={Math.min(13, Math.max(9, Math.min(r.w, r.h) / 4.5))}
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

        {/* TUNNEL label between D-155 (left stack) and D-150 */}
        <text x={D_X_150} y={D_Y + D_TOP_H + 6} textAnchor="middle" fontSize={9} fontWeight={700} fill="#71717a" letterSpacing="0.18em">
          TUNNEL
        </text>

        {/* "Includes 400 sf common area" annotation under D-150 */}
        <text x={D_X_150 + D_W_150 / 2} y={D_Y + D_H + 14} textAnchor="middle" fontSize={9} fontStyle="italic" fill="#a1a1aa">
          Includes 400 sf common area
        </text>

        {/* Common Loading Dock — annex underneath D-145 */}
        <g>
          <rect
            x={D_X_145 + 20}
            y={D_Y + D_H + 4}
            width={D_W_145 - 40}
            height={26}
            fill="rgba(37,99,235,0.06)"
            stroke="#2563eb"
            strokeWidth={1}
            strokeDasharray="3 3"
            rx={2}
          />
          <text
            x={D_X_145 + D_W_145 / 2}
            y={D_Y + D_H + 22}
            textAnchor="middle"
            fontSize={9}
            fontWeight={600}
            fill="#2563eb"
            style={{ letterSpacing: "0.04em" }}
          >
            Common Loading Dock
          </text>
        </g>

        {/* Cage HBP Storage label at bottom edge of Building D */}
        <text x={D_X + D_TOTAL_W / 2} y={D_Y + D_H + 56} textAnchor="middle" fontSize={10} fontWeight={600} fill="#71717a" letterSpacing="0.1em">
          Cage HBP Storage
        </text>

        {/* Building C secondary label inside the building (top) */}
        <text x={C_X + C_W / 2} y={C_Y + 18} textAnchor="middle" fontSize={10} fontWeight={600} fill="#a1a1aa" letterSpacing="0.12em">
          Cage HBP Storage
        </text>

        {/* EXIT label on Building C left side */}
        <text x={C_X - 10} y={C_Y + 350} textAnchor="end" fontSize={11} fontWeight={700} fill="#dc2626" letterSpacing="0.1em">
          ‹ EXIT
        </text>

        {/* Beam label between buildings */}
        <text x={750} y={620} textAnchor="middle" fontSize={11} fontStyle="italic" fill="#a1a1aa">
          Beam
        </text>

        {/* Parking — between Building B/A and below Building C */}
        <text x={750} y={520} textAnchor="middle" fontSize={11} fontStyle="italic" fill="#a1a1aa">
          Parking
        </text>
        <text x={750} y={950} textAnchor="middle" fontSize={11} fontStyle="italic" fill="#a1a1aa">
          Parking
        </text>

        {/* Executive Suites annex — clickable region inside Building A footprint */}
        <g
          onClick={onOpenExecSuites}
          onMouseEnter={() => setHoveredAnnex(true)}
          onMouseLeave={() => setHoveredAnnex(false)}
          style={{ cursor: "pointer" }}
        >
          <rect
            x={A_X}
            y={A_Y + A_BLOCK_H + 10}
            width={A_W}
            height={A_ANNEX_H}
            fill={hoveredAnnex ? "rgba(22,163,74,0.18)" : "rgba(22,163,74,0.08)"}
            stroke="#16a34a"
            strokeWidth={2.5}
            rx={4}
            style={{ transition: "fill 160ms ease" }}
          />
          <text x={A_X + A_W / 2} y={A_Y + A_BLOCK_H + 48} textAnchor="middle" fontSize={14} fontWeight={700} fill="#15803d">
            Executive Suites
          </text>
          <text x={A_X + A_W / 2} y={A_Y + A_BLOCK_H + 70} textAnchor="middle" fontSize={11} fill="#15803d">
            A-101 → A-130
          </text>
          <text x={A_X + A_W / 2} y={A_Y + A_BLOCK_H + 96} textAnchor="middle" fontSize={10} fontWeight={600} fill="#15803d" style={{ letterSpacing: "0.06em" }}>
            VIEW FLOOR PLAN ›
          </text>
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute top-3 right-3 bg-white/90 dark:bg-[#18181b]/90 backdrop-blur border border-[#e4e4e7] dark:border-[#3f3f46] rounded-md px-2.5 py-1.5 flex items-center gap-3 text-[10px] text-[#71717a] dark:text-[#a1a1aa]">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "#16a34a" }} />Bldg A</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "#dc2626" }} />Bldg B</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "#eab308" }} />Bldg C</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "#2563eb" }} />Bldg D</span>
        <span className="inline-flex items-center gap-1.5 pl-2 border-l border-[#e4e4e7] dark:border-[#3f3f46]"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_STROKE.current }} />Occupied</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_STROKE.past_due }} />Past Due</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full border border-[#a1a1aa]" />Vacant</span>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, X } from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, RowClickedEvent } from "ag-grid-community";
import PageHeader from "@/components/PageHeader";
import StatusPill from "@/components/StatusPill";
import { useRvData, useRvLastUpdated, formatCurrency, formatLastUpdated } from "@/hooks/useConvexData";
import { useAgGridPersistence } from "@/hooks/useAgGridPersistence";

ModuleRegistry.registerModules([AllCommunityModule]);

// RV park rent roll. Per the user's directive:
//   - lead with site / unit info, NOT guest names (RV stays churn fast —
//     a per-guest column would be noise)
//   - on row click, show the current/next reservation's LINE ITEMS
//     (charges, occupancy, surcharges, tax, balance), not a ledger
//
// Visually matches Hollister/Belgold by reusing the AG Grid layout pattern.

type Row = any;
type SiteRow = {
  siteCode: string;
  siteCodeNumeric: number;
  siteType: string;
  siteClass?: string;
  // Status priority — past_due overrides occupancy since unpaid balance is
  // the most actionable flag. "arriving" is intentionally dropped per the
  // user feedback; transient turnover happens daily and an "arriving in 7
  // days" state was visual noise.
  status: "past_due" | "occupied" | "departing" | "vacant";
  reservationCount: number;
  totalCharges: number;
  totalPayments: number;
  totalBalance: number;
  percentPaid: number;
  totalPosCharges: number;
  totalUtilityCharges: number;
  hasOpenBalance: boolean;
  currentRes: Row | null;
  nextRes: Row | null;
  arrivalDate: string;
  departureDate: string;
  package?: string;
  reservations: Row[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Normalize whatever date string the parser stored back into "YYYY-MM-DD"
// for safe lexicographic comparison. Older bundles ingested before the
// rvParsers fix accepted "M/D/YYYY" raw — this catches those at read time
// so the rent-roll filters work without a re-ingest.
function normalizeDate(d: string | undefined): string {
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  const m2 = d.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m2) {
    const mm = m2[2].padStart(2, "0");
    const dd = m2[3].padStart(2, "0");
    return `${m2[1]}-${mm}-${dd}`;
  }
  const m3 = d.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m3) return `${m3[3]}-${m3[1]}-${m3[2]}`;
  // Fallback: hand off to Date.parse for anything else ("Apr 21 2026",
  // "21-Apr-2026", ISO with timestamp, etc.). If JS can't parse it we
  // return empty so downstream code treats the value as missing rather
  // than letting "Apr 21 2026" leak into a string compare and break the
  // Upcoming/Past filter (lex-compare puts "A" before any digit so
  // anything starting with a letter would always read as Past or Future
  // depending on direction).
  const ts = Date.parse(d);
  if (!Number.isNaN(ts)) {
    const dt = new Date(ts);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }
  return "";
}

function formatShortDate(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function rollupBySite(reservations: Row[], sites: Row[]): SiteRow[] {
  const today = todayIso();
  const siteByCode = new Map<string, Row>();
  for (const s of sites) siteByCode.set(s.siteCode, s);

  // Normalize once so every comparison runs against canonical YYYY-MM-DD,
  // immune to whatever format Campspot emitted in the original CSV.
  const reservationsN = reservations.map((r) => ({
    ...r,
    _arrival: normalizeDate(r.arrivalDate),
    _departure: normalizeDate(r.departureDate),
  }));

  const byCode = new Map<string, Row[]>();
  for (const r of reservationsN) {
    const code = r.siteCode;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code)!.push(r);
    if (!siteByCode.has(code)) {
      siteByCode.set(code, {
        siteCode: code,
        displayName: r.siteName || code,
        siteType: r.siteType,
        siteClass: r.siteClass,
      });
    }
  }

  const rows: SiteRow[] = [];
  for (const [code, site] of Array.from(siteByCode.entries())) {
    const rs = (byCode.get(code) || [])
      .slice()
      .sort((a, b) => (a._arrival || "").localeCompare(b._arrival || ""));

    let currentRes: Row | null = null;
    let nextRes: Row | null = null;
    for (const r of rs) {
      if (r._arrival && r._departure && r._arrival <= today && today <= r._departure) {
        currentRes = r;
        break;
      }
      if (r._arrival && r._arrival > today) {
        if (!nextRes || r._arrival < (nextRes as any)._arrival) nextRes = r;
      }
    }

    const totalCharges = rs.reduce((s, r) => s + (r.totalChargesOnInvoice || 0), 0);
    const totalPayments = rs.reduce((s, r) => s + (r.totalPaymentsOnInvoice || 0), 0);
    const totalBalance = rs.reduce((s, r) => s + (r.balanceOnInvoice || 0), 0);
    const percentPaid = totalCharges > 0 ? totalPayments / totalCharges : 1;
    const totalPosCharges = rs.reduce((s, r) => s + (r.posCharges || 0), 0);
    const totalUtilityCharges = rs.reduce((s, r) => s + (r.utilityCharges || 0), 0);
    const hasOpenBalance = totalBalance > 0.5;

    let status: SiteRow["status"] = "vacant";
    if (hasOpenBalance) {
      // Past due wins over everything else — money owed is the most
      // actionable signal whether the guest is in-house, departing, or gone.
      status = "past_due";
    } else if (currentRes) {
      const departInDays =
        (Date.parse((currentRes as any)._departure) - Date.parse(today)) / 86400000;
      status = departInDays <= 1 ? "departing" : "occupied";
    }

    const focus = currentRes || nextRes;
    const numericMatch = code.match(/^\d+/);
    rows.push({
      siteCode: code,
      siteCodeNumeric: numericMatch ? parseInt(numericMatch[0], 10) : Number.MAX_SAFE_INTEGER,
      siteType: site.siteType || "",
      siteClass: site.siteClass,
      status,
      reservationCount: rs.length,
      totalCharges,
      totalPayments,
      totalBalance,
      percentPaid,
      totalPosCharges,
      totalUtilityCharges,
      hasOpenBalance,
      currentRes,
      nextRes,
      arrivalDate: focus?.arrivalDate || "",
      departureDate: focus?.departureDate || "",
      package: focus?.packageApplied,
      reservations: rs,
    });
  }
  return rows;
}

// Status cell uses the shared StatusPill so RV occupancy reads with the
// same color semantics as commercial: green Occupied, yellow Past Due,
// blue Departing, gray Vacant. Single source of truth means status color
// changes only need to be made in StatusPill.tsx.
function StatusCellRenderer(props: { value: string }) {
  return <StatusPill status={props.value} />;
}

function CurrencyCellRenderer(props: { value: number }) {
  return <span>{props.value > 0 ? formatCurrency(props.value) : "—"}</span>;
}

function BalanceCellRenderer(props: { value: number }) {
  const v = props.value || 0;
  if (v <= 0.5) return <span className="text-[#a1a1aa]">—</span>;
  return <span className="text-[#dc2626] font-medium">{formatCurrency(v)}</span>;
}

function PaidPctCellRenderer(props: { value: number; data: SiteRow }) {
  if (!props.data || props.data.totalCharges === 0) return <span className="text-[#a1a1aa]">—</span>;
  const v = props.value || 0;
  return <span>{(v * 100).toFixed(0)}%</span>;
}

export default function RvRentRoll({
  propertyName,
  propertyId,
}: {
  propertyName: string;
  propertyId: string | undefined;
}) {
  const { reservations, sites, loading } = useRvData(propertyId);
  const { committedAt, period: lastBundlePeriod } = useRvLastUpdated(propertyId);
  const lastUpdated = formatLastUpdated(committedAt, lastBundlePeriod);
  // Deep-link support: ?unit=<siteCode> opens the rent roll filtered to that
  // site and auto-opens the ReservationDrawer. Used by the Past Due KPI
  // drawer on the dashboard so the user can drill from a balance row to
  // the site detail in one click. Mirrors how the commercial rent roll
  // handles the same param.
  const searchParams = useSearchParams();
  const deepLinkUnit = searchParams.get("unit");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const deepLinkAppliedRef = useRef<string | null>(null);
  const [quickSearch, setQuickSearch] = useState("");
  const gridRef = useRef<AgGridReact>(null);

  const allRows = useMemo(() => rollupBySite(reservations, sites), [reservations, sites]);
  const selectedRow = useMemo(
    () => (selectedCode ? allRows.find((r) => r.siteCode === selectedCode) || null : null),
    [allRows, selectedCode],
  );

  // Apply ?unit=<siteCode> once the row data is in: filter the grid to that
  // code and open its drawer. The drawer-side caller passes the value from
  // rv_balances.campsiteNames, which may be a long display string like
  // "Seasonal Premium RV Site 098" rather than a bare code. Match strategy:
  //   1. exact siteCode match (case-insensitive)
  //   2. target ends with " <siteCode>" (handles long Campspot display strings)
  //   3. target contains the siteCode token
  // First-match wins.
  useEffect(() => {
    if (!deepLinkUnit || allRows.length === 0) return;
    if (deepLinkAppliedRef.current === deepLinkUnit) return;
    const target = String(deepLinkUnit).trim().toLowerCase();
    if (!target) return;
    let match = allRows.find((r) => r.siteCode.toLowerCase() === target);
    if (!match) {
      match = allRows.find((r) => {
        const code = r.siteCode.toLowerCase();
        return target.endsWith(` ${code}`) || target.endsWith(`/${code}`);
      });
    }
    if (!match) {
      match = allRows.find((r) => {
        const code = r.siteCode.toLowerCase();
        // Token boundary so "98" doesn't accidentally match "098"/"198".
        const re = new RegExp(`(?:^|[\\s/-])${code.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?:[\\s/-]|$)`);
        return re.test(target);
      });
    }
    if (match) {
      deepLinkAppliedRef.current = deepLinkUnit;
      setSelectedCode(match.siteCode);
      setQuickSearch(match.siteCode);
    }
  }, [deepLinkUnit, allRows]);

  // KPI strip intentionally omitted — commercial rent rolls lead with the
  // grid and aggregate counts live on Dashboard / Site Plan, not Rent Roll.

  // All financial columns visible by default — Balance, Paid %, Charges,
  // Payments, POS, Utility, Stays. The drawer still carries the per-stay
  // timing detail (arrival/departure/package) and full reservation ledger.
  const columnDefs = useMemo<ColDef[]>(() => {
    return [
      {
        field: "siteCode",
        headerName: "Site",
        width: 100,
        pinned: "left",
        sort: "asc",
        comparator: (a: string, b: string) =>
          a.localeCompare(b, undefined, { numeric: true }),
      },
      { field: "siteType", headerName: "Unit Name", minWidth: 220, flex: 1 },
      {
        field: "status",
        headerName: "Current Status",
        width: 150,
        cellRenderer: StatusCellRenderer,
        filter: true,
      },
      {
        field: "totalBalance",
        headerName: "Balance",
        width: 120,
        cellRenderer: BalanceCellRenderer,
      },
      {
        field: "percentPaid",
        headerName: "Paid %",
        width: 100,
        cellRenderer: PaidPctCellRenderer,
      },
      {
        field: "totalCharges",
        headerName: "Charges",
        width: 120,
        cellRenderer: CurrencyCellRenderer,
      },
      {
        field: "totalPayments",
        headerName: "Payments",
        width: 120,
        cellRenderer: CurrencyCellRenderer,
      },
      {
        field: "totalPosCharges",
        headerName: "POS",
        width: 110,
        cellRenderer: CurrencyCellRenderer,
      },
      {
        field: "totalUtilityCharges",
        headerName: "Utility",
        width: 110,
        cellRenderer: CurrencyCellRenderer,
      },
      {
        field: "reservationCount",
        headerName: "Stays",
        width: 90,
      },
    ];
  }, []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    suppressMovable: false,
    cellStyle: { textAlign: "left" } as any,
    headerClass: "ag-left-aligned-header",
  }), []);

  const persistence = useAgGridPersistence({
    storageKey: `redhorn_grid_rv_rent_roll`,
    fallbackFit: typeof window !== "undefined" ? window.innerWidth >= 768 : true,
  });

  function onRowClicked(event: RowClickedEvent) {
    if (event.node?.group) return;
    if (!event.data) return;
    setSelectedCode((event.data as SiteRow).siteCode);
  }

  // Esc closes the drawer, mirroring the commercial RentRollDrawer behavior.
  useEffect(() => {
    if (!selectedRow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedCode(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedRow]);

  if (!propertyId) return null;

  if (loading) {
    // Match the commercial rent-roll loading skeleton shape: search bar
    // pill placeholders + a grid header + 10 row skeleton. The earlier
    // single h-96 block read as a different page during the load flash.
    return (
      <div>
        <PageHeader title="Rent Roll" subtitle="Loading…" />
        <div className="flex items-center gap-2 mb-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] rounded-lg px-3 py-1.5 h-8 w-28 animate-pulse" />
          ))}
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-6">
          <div className="grid grid-cols-6 gap-3 mb-4">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="h-3 bg-[#f4f4f5] dark:bg-[#27272a] rounded animate-pulse" />
            ))}
          </div>
          <div className="space-y-2.5 animate-pulse">
            {[1,2,3,4,5,6,7,8,9,10].map(i => (
              <div key={i} className="grid grid-cols-6 gap-3">
                {[1,2,3,4,5,6].map(j => (
                  <div key={j} className="h-4 bg-[#f4f4f5] dark:bg-[#27272a] rounded" style={{ opacity: 0.6 + (i + j) % 5 * 0.08 }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (allRows.length === 0) {
    return (
      <div>
        <PageHeader title="Rent Roll" subtitle={propertyName} />
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-10 text-center">
          <p className="text-[14px] font-semibold text-[#18181b] dark:text-[#fafafa]">No data yet</p>
          <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] mt-1.5">
            Drop the monthly bundle in <span className="font-medium">Pipeline Uploads</span> to populate the rent roll.
          </p>
        </div>
      </div>
    );
  }

  function exportCsv() {
    const fileName = `rent-roll-${propertyName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    gridRef.current?.api?.exportDataAsCsv({ fileName });
  }

  function clearFilters() {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    setQuickSearch("");
  }

  return (
    <div>
      <PageHeader
        title="Rent Roll"
        subtitle={`${propertyName} — Tap any row for details${
          lastUpdated ? ` · ${lastUpdated}` : ""
        }`}
      >
        <button
          onClick={exportCsv}
          disabled={allRows.length === 0}
          title="Export .csv"
          aria-label="Export .csv"
          className="flex items-center justify-center bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] hover:border-[#4f6ef7] text-[#5a5e73] dark:text-[#a1a1aa] hover:text-[#4f6ef7] w-8 h-8 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={14} />
        </button>
      </PageHeader>

      {/* Search + Clear filters — matches the commercial rent roll layout
          (rounded-lg pills, mb-4 rhythm, focus ring, w-64 input). */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-4 mb-4 text-[12px]">
        <div className="sm:ml-auto w-full sm:w-auto flex items-center gap-2">
          <input
            type="text"
            placeholder="Quick search all data..."
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            className="px-3 py-1.5 bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] rounded-lg text-sm text-gray-900 dark:text-[#fafafa] placeholder-gray-400 dark:placeholder-[#71717a] focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7] w-full sm:w-64"
          />
          <button
            onClick={clearFilters}
            className="text-[12px] font-medium px-3 py-1.5 bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] rounded-lg text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] hover:border-[#71717a] cursor-pointer whitespace-nowrap"
            title="Clear all column filters and quick search"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Grid — alpine theme + bordered wrapper match the commercial Hollister/
          Belgold rent roll exactly. Height tracks the commercial 100vh - 180px
          / minHeight 500 budget so both grids render the same number of visible
          rows at any given viewport. */}
      <div
        className="ag-theme-alpine w-full rounded overflow-auto border border-[#e4e4e7] dark:border-[#3f3f46]"
        style={{ height: "calc(100vh - 180px)", minHeight: 500 }}
      >
        <AgGridReact
          ref={gridRef}
          rowData={allRows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onRowClicked={onRowClicked}
          quickFilterText={quickSearch}
          rowHeight={36}
          headerHeight={36}
          suppressCellFocus
          pagination
          paginationPageSize={50}
          paginationPageSizeSelector={[25, 50, 100, 200]}
          {...persistence}
        />
      </div>

      {selectedRow && (
        <ReservationDrawer row={selectedRow} onClose={() => setSelectedCode(null)} />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClass = "text-[#18181b] dark:text-[#fafafa]",
  sub,
}: {
  label: string;
  value: number | string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 text-center">
      <p className={`text-[20px] sm:text-[24px] font-semibold ${valueClass}`}>{value}</p>
      <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] font-medium uppercase tracking-wide mt-0.5">
        {label}
      </p>
      {sub && <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-0.5">{sub}</p>}
    </div>
  );
}

// Drawer mirrors the commercial RentRollDrawer: header (site + type) + tab
// switcher with Details / Ledger. Details tab shows a 2-column field grid;
// Ledger tab shows the per-reservation table capped to ~5 rows visible at
// once with scroll, and clicking a row drills into its line items below.
const RV_STATUS_PILL: Record<string, { label: string; cls: string }> = {
  occupied: {
    label: "Occupied",
    cls: "bg-green-100 dark:bg-green-950/40 text-[#16a34a] border-green-200 dark:border-green-900",
  },
  past_due: {
    label: "Past Due",
    cls: "bg-red-100 dark:bg-red-950/40 text-[#dc2626] border-red-200 dark:border-red-900",
  },
  departing: {
    label: "Departing",
    cls: "bg-orange-100 dark:bg-orange-950/40 text-[#d97706] border-orange-200 dark:border-orange-900",
  },
  vacant: {
    label: "Vacant",
    cls: "bg-[#f4f4f5] dark:bg-[#27272a] text-[#71717a] border-[#e4e4e7] dark:border-[#3f3f46]",
  },
};

function ReservationDrawer({ row, onClose }: { row: SiteRow; onClose: () => void }) {
  const today = todayIso();
  const [tab, setTab] = useState<"details" | "ledger">("details");

  // Default-select the most relevant reservation: the one currently in-house,
  // else the next upcoming one, else the most recent past stay.
  const initial = useMemo(() => {
    if (row.currentRes) return row.currentRes.confirmation as string;
    if (row.nextRes) return row.nextRes.confirmation as string;
    return row.reservations[row.reservations.length - 1]?.confirmation || null;
  }, [row]);
  const [selectedConf, setSelectedConf] = useState<string | null>(initial);
  const selected = useMemo(
    () => row.reservations.find((r: Row) => r.confirmation === selectedConf) || null,
    [row.reservations, selectedConf],
  );

  const statusCfg =
    RV_STATUS_PILL[row.status] || {
      label: row.status,
      cls: "bg-[#f4f4f5] dark:bg-[#27272a] text-[#71717a] border-[#e4e4e7] dark:border-[#3f3f46]",
    };

  // Details tab is now site-level only — no per-guest fields, so the focus
  // reservation lookup is dropped. Per-guest detail still lives in the
  // Ledger tab where it belongs.

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 dark:bg-black/60 rh-backdrop"
      onClick={onClose}
    >
      <div
        className={`bg-white dark:bg-[#18181b] border-l border-[#e4e4e7] dark:border-[#3f3f46] shadow-xl w-full ${
          tab === "details" ? "max-w-md" : "max-w-5xl"
        } h-full overflow-y-auto rh-drawer transition-[max-width] duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4e4e7] dark:border-[#3f3f46] sticky top-0 bg-white dark:bg-[#18181b] z-10">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] truncate">
              {row.siteCode}
            </p>
            <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] truncate">
              {row.siteType || "—"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {row.hasOpenBalance && (
              <span className="text-[10px] font-medium text-[#dc2626] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 px-2 py-0.5 rounded">
                Past Due
              </span>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-[16px] text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Tab switcher — matches the Hollister/Belgold pattern */}
        <div className="px-5 pt-3 border-b border-[#e4e4e7] dark:border-[#3f3f46] flex items-center gap-4 sticky top-[57px] bg-white dark:bg-[#18181b] z-10">
          {(
            [
              { value: "details", label: "Details" },
              {
                value: "ledger",
                label: `Ledger${row.reservationCount ? ` (${row.reservationCount})` : ""}`,
              },
            ] as const
          ).map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value as any)}
              className={`text-[12px] font-medium pb-2 -mb-px border-b-2 transition-colors cursor-pointer ${
                tab === t.value
                  ? "border-[#18181b] dark:border-[#fafafa] text-[#18181b] dark:text-[#fafafa]"
                  : "border-transparent text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "details" && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Current Status">
                <span
                  className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded border ${statusCfg.cls}`}
                >
                  {statusCfg.label}
                </span>
                <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-1.5">
                  Auto-derived from monthly Campspot bundle.
                </p>
              </Field>
              <Field label="Site Type">
                <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">
                  {row.siteType || "—"}
                </p>
              </Field>

              <Field label="Unit Number">
                <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5 font-medium">
                  {row.siteCode || "—"}
                </p>
              </Field>

              <Field label="Total Charges">
                <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">
                  {row.totalCharges > 0 ? formatCurrency(row.totalCharges) : "—"}
                </p>
              </Field>
              <Field label="Total Payments">
                <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">
                  {row.totalPayments > 0 ? formatCurrency(row.totalPayments) : "—"}
                </p>
              </Field>

              <Field label="Total Balance">
                <p
                  className={`text-[12px] py-1.5 ${
                    row.hasOpenBalance
                      ? "text-[#dc2626] font-semibold"
                      : "text-[#18181b] dark:text-[#fafafa]"
                  }`}
                >
                  {row.totalBalance > 0.5 ? formatCurrency(row.totalBalance) : "—"}
                </p>
              </Field>
              <Field label="Paid %">
                <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">
                  {row.totalCharges > 0 ? `${(row.percentPaid * 100).toFixed(0)}%` : "—"}
                </p>
              </Field>

              <Field label="Stays on Record">
                <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">
                  {row.reservationCount}
                </p>
              </Field>
            </div>
          </div>
        )}

        {tab === "ledger" && (
          <div className="p-5 space-y-4">
            <ReservationLedger
              reservations={row.reservations}
              today={today}
              selectedConf={selectedConf}
              onSelect={setSelectedConf}
            />
            {selected && (
              <>
                <div>
                  <p className="text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide mb-2">
                    Reservation · {selected.confirmation}
                  </p>
                  <ReservationCard res={selected} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide mb-2">
                    Line Items
                  </p>
                  <ReservationLineItems res={selected} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Field — same pattern as the commercial RentRollDrawer.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide flex items-center gap-1.5 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function ReservationLedger({
  reservations,
  today,
  selectedConf,
  onSelect,
}: {
  reservations: Row[];
  today: string;
  selectedConf: string | null;
  onSelect: (conf: string) => void;
}) {
  // Current / Upcoming / Past / Past Due / All toggle. Initial value is
  // "auto" — once the data resolves we auto-pick the first non-empty
  // bucket (Current → Upcoming → Past Due → Past → All) so the user
  // never lands on a "No reservations" empty state if there's anything
  // to show.
  const [filter, setFilter] = useState<"current" | "upcoming" | "past" | "past_due" | "all" | "auto">("auto");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 7;
  // Reset to first page whenever the filter changes — otherwise switching
  // from a 50-row Upcoming list to an empty Past list would land on a
  // page that doesn't exist.
  useEffect(() => {
    setPage(0);
  }, [filter]);

  // Pre-normalize each reservation's arrival/departure once so every
  // comparison and sort runs against canonical YYYY-MM-DD strings. Without
  // this, bundles ingested before the parser fix stored "M/D/YYYY" raw and
  // string comparisons like "4/21/2026" >= "2026-05-09" returned true,
  // pulling already-departed stays into the Upcoming filter.
  const normalized = useMemo(
    () =>
      reservations.map((r) => ({
        ...r,
        _arrival: normalizeDate(r.arrivalDate),
        _departure: normalizeDate(r.departureDate),
      })),
    [reservations],
  );
  const sorted = useMemo(
    () =>
      [...normalized].sort((a, b) =>
        (b._arrival || "").localeCompare(a._arrival || ""),
      ),
    [normalized],
  );
  // Past Due is strict: balance must be at least $1 owed AND the row must
  // actually display a balance value (matches the same > 0.5 threshold the
  // Balance column uses, so the filter never includes a row whose balance
  // shows as "—"). Past stays that ended fully paid drop out.
  const isPastDue = (r: Row) => (r.balanceOnInvoice || 0) > 0.5;

  // While "auto" is resolving (initial mount), treat it as Current for the
  // underlying filtered list so the body doesn't flash an empty state.
  const effectiveFilter = filter === "auto" ? "current" : filter;

  const filtered = useMemo(() => {
    return sorted.filter((r) => {
      const isPast = !!r._departure && r._departure < today;
      const isCurrent =
        !!r._arrival && !!r._departure && r._arrival <= today && today <= r._departure;
      // Strict Upcoming: arrival is in the future. In-house stays land in
      // the Current bucket, not Upcoming — matches the user expectation
      // that "Upcoming" means "hasn't arrived yet".
      const isUpcoming = !!r._arrival && r._arrival > today;
      if (effectiveFilter === "current") return isCurrent;
      if (effectiveFilter === "upcoming") return isUpcoming;
      if (effectiveFilter === "past") return isPast;
      if (effectiveFilter === "past_due") return isPastDue(r);
      return true;
    });
  }, [sorted, effectiveFilter, today]);

  // 7 rows visible at once. Body height stays locked at this size whether
  // the filtered list has 1 row or 100 — switching tabs shouldn't make the
  // drawer reflow. Pagination kicks in past 7 rows.
  const ROW_PX = 36;
  const VISIBLE_ROWS = 7;
  const BODY_PX = ROW_PX * VISIBLE_ROWS;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const counts = useMemo(() => {
    let current = 0;
    let upcoming = 0;
    let past = 0;
    let pastDue = 0;
    for (const r of sorted) {
      const arr = r._arrival;
      const dep = r._departure;
      if (dep && dep < today) past += 1;
      else if (arr && dep && arr <= today && today <= dep) current += 1;
      else if (arr && arr > today) upcoming += 1;
      if ((r.balanceOnInvoice || 0) > 0.5) pastDue += 1;
    }
    return { current, upcoming, past, pastDue, all: sorted.length };
  }, [sorted, today]);

  // Resolve "auto" → the first bucket that actually has rows so the user
  // doesn't land on an empty view. Order: Current → Upcoming → Past Due →
  // Past → All. Locked in via useEffect so manual taps still stick.
  useEffect(() => {
    if (filter !== "auto") return;
    if (counts.current > 0) setFilter("current");
    else if (counts.upcoming > 0) setFilter("upcoming");
    else if (counts.pastDue > 0) setFilter("past_due");
    else if (counts.past > 0) setFilter("past");
    else setFilter("all");
  }, [filter, counts]);

  return (
    <div>
      {/* Past / Upcoming / Past Due / All filter pills above the ledger */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {(
          [
            { key: "current", label: "Current", count: counts.current },
            { key: "upcoming", label: "Upcoming", count: counts.upcoming },
            { key: "past", label: "Past", count: counts.past },
            { key: "past_due", label: "Past Due", count: counts.pastDue },
            { key: "all", label: "All", count: counts.all },
          ] as const
        ).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
              filter === f.key
                ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b]"
                : "bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
            }`}
          >
            {f.label}
            <span className="ml-1 opacity-70">{f.count}</span>
          </button>
        ))}
      </div>

      <div className="border border-[#e4e4e7] dark:border-[#3f3f46] rounded overflow-hidden">
        <div className="grid grid-cols-[90px_minmax(140px,1fr)_24px_90px_90px_90px_90px_90px_60px] px-3 py-2 bg-[#fafafa] dark:bg-[#27272a]/50 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
          <span>Status</span>
          <span>Guest</span>
          {/* spacer column for visual gap between Guest and Coming */}
          <span />
          <span>Coming</span>
          <span>Leaving</span>
          <span className="text-right">Charges</span>
          <span className="text-right">Paid</span>
          <span className="text-right">Balance</span>
          <span className="text-right">Paid %</span>
        </div>
        <div
          className="relative overflow-hidden"
          style={{ height: `${BODY_PX}px` }}
        >
          {filtered.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[#a1a1aa]">
              No {filter === "all" ? "" : filter.replace("_", " ")} reservations.
            </div>
          ) : (
            <div className="absolute inset-0">
            {pageRows.map((r) => {
              const arr = r._arrival;
              const dep = r._departure;
              const isCurrent = !!arr && !!dep && arr <= today && today <= dep;
              const isFuture = !!arr && arr > today;
              const isPast = !!dep && dep < today;
              const balance = r.balanceOnInvoice || 0;
              const isSelected = r.confirmation === selectedConf;
              const guestName = `${r.firstName || ""} ${r.lastName || ""}`.trim() || "—";
              return (
                <button
                  key={r.confirmation}
                  onClick={() => onSelect(r.confirmation)}
                  className={`w-full grid grid-cols-[90px_minmax(140px,1fr)_24px_90px_90px_90px_90px_90px_60px] px-3 py-2 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] items-center text-left cursor-pointer hover:bg-[#fafafa] dark:hover:bg-[#27272a]/50 ${
                    isSelected ? "bg-[#fef3c7]/40 dark:bg-[#422006]/20" : ""
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-[#71717a] dark:text-[#a1a1aa]">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isCurrent ? "bg-[#16a34a]" : isFuture ? "bg-[#2563eb]" : "bg-[#a1a1aa]"
                      }`}
                    />
                    {isCurrent ? "Current" : isFuture ? "Upcoming" : isPast ? "Past" : "—"}
                  </span>
                  <span className="truncate text-[#18181b] dark:text-[#fafafa]" title={guestName}>
                    {guestName}
                  </span>
                  {/* spacer column for visual gap between Guest and Coming */}
                  <span />
                  <span className="text-[10px] text-[#71717a] dark:text-[#a1a1aa] tabular-nums">
                    {formatShortDate(r.arrivalDate)}
                  </span>
                  <span className="text-[10px] text-[#71717a] dark:text-[#a1a1aa] tabular-nums">
                    {formatShortDate(r.departureDate)}
                  </span>
                  <span className="text-right tabular-nums text-[#18181b] dark:text-[#fafafa]">
                    {(r.totalChargesOnInvoice || 0) > 0 ? formatCurrency(r.totalChargesOnInvoice) : "—"}
                  </span>
                  <span className="text-right tabular-nums text-[#16a34a]">
                    {(r.totalPaymentsOnInvoice || 0) > 0 ? formatCurrency(r.totalPaymentsOnInvoice) : "—"}
                  </span>
                  <span
                    className={`text-right tabular-nums ${
                      balance > 0.5 ? "text-[#dc2626] font-medium" : "text-[#a1a1aa]"
                    }`}
                  >
                    {balance > 0.5 ? formatCurrency(balance) : "—"}
                  </span>
                  <span className="text-right tabular-nums text-[#71717a] dark:text-[#a1a1aa] text-[11px]">
                    {(r.totalChargesOnInvoice || 0) > 0
                      ? `${((r.percentPaid || 0) * 100).toFixed(0)}%`
                      : "—"}
                  </span>
                </button>
              );
            })}
            </div>
          )}
        </div>

        {/* Pagination footer — sits inside the bordered table so the entire
            ledger reads as one block. Mirrors the AG Grid pagination
            chrome on the rent roll grid (Page X of Y · prev / next). */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a]/40 px-3 py-2 text-[11px] text-[#71717a] dark:text-[#a1a1aa]">
            <span className="tabular-nums">
              {filtered.length === 0
                ? "0 reservations"
                : `${safePage * PAGE_SIZE + 1}-${Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="px-2 py-0.5 rounded border border-[#e4e4e7] dark:border-[#3f3f46] bg-white dark:bg-[#18181b] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="tabular-nums">
                Page {safePage + 1} of {pageCount}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="px-2 py-0.5 rounded border border-[#e4e4e7] dark:border-[#3f3f46] bg-white dark:bg-[#18181b] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DrawerStat({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-[9px] text-[#a1a1aa] dark:text-[#71717a] font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-[14px] font-semibold mt-0.5 ${valueClass || "text-[#18181b] dark:text-[#fafafa]"}`}>
        {value}
      </p>
    </div>
  );
}

// Compact line-item list. Mirrors the ledger's row rhythm so the two
// stack visually as one continuous block — no heavy emphasized rows.
// Empty line items are skipped entirely; totals carry only a slightly
// heavier weight, no background banding.
function ReservationLineItems({ res }: { res: Row }) {
  const items: { label: string; value: number; muted?: boolean; emphasize?: boolean }[] = [
    { label: "Reservation Charges", value: res.reservationCharges || 0 },
    { label: "Occupancy Charges", value: res.occupancyCharges || 0 },
    { label: "Surcharges", value: res.surcharges || 0 },
    { label: "Discounts", value: -(res.discounts || 0) },
    { label: "Tax", value: res.tax || 0 },
    { label: "Utility Charges", value: res.utilityCharges || 0 },
    { label: "POS Charges", value: res.posCharges || 0 },
    { label: "Total Charges on Invoice", value: res.totalChargesOnInvoice || 0, emphasize: true },
    { label: "Total Payments on Invoice", value: -(res.totalPaymentsOnInvoice || 0), muted: true },
    { label: "Balance on Invoice", value: res.balanceOnInvoice || 0, emphasize: true },
  ];
  const visible = items.filter((it) => it.value !== 0 || it.emphasize);
  if (visible.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-[11px] text-[#a1a1aa]">
        No charges or payments on this reservation.
      </div>
    );
  }
  return (
    <div className="border border-[#e4e4e7] dark:border-[#3f3f46] rounded overflow-hidden">
      {visible.map((it, i) => (
        <div
          key={i}
          className={`grid grid-cols-[1fr_120px] px-3 py-1.5 text-[11px] ${
            i > 0 ? "border-t border-[#f4f4f5] dark:border-[#27272a]" : ""
          } ${it.emphasize ? "font-medium" : ""}`}
        >
          <span
            className={
              it.emphasize
                ? "text-[#18181b] dark:text-[#fafafa]"
                : "text-[#71717a] dark:text-[#a1a1aa]"
            }
          >
            {it.label}
          </span>
          <span
            className={`text-right tabular-nums ${
              it.value === 0
                ? "text-[#a1a1aa]"
                : it.muted || it.value < 0
                ? "text-[#16a34a]"
                : it.emphasize
                ? "text-[#18181b] dark:text-[#fafafa]"
                : "text-[#18181b] dark:text-[#fafafa]"
            }`}
          >
            {it.value === 0
              ? "—"
              : it.value < 0
              ? `(${formatCurrency(Math.abs(it.value))})`
              : formatCurrency(it.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Reservation summary card — Nights up top, Package on its own line so
// long names ("5-Night Deal—30% OFF Cabins…") don't get clipped. Source
// is intentionally dropped — it's almost always "EXTERNAL" and added no
// per-stay context.
function ReservationCard({ res }: { res: Row }) {
  return (
    <div className="border border-[#e4e4e7] dark:border-[#3f3f46] rounded overflow-hidden">
      <div className="px-4 py-3">
        <DrawerStat label="Nights" value={`${res.nights || 0}`} />
      </div>
      <div className="border-t border-[#e4e4e7] dark:border-[#3f3f46] px-4 py-3">
        <p className="text-[9px] text-[#a1a1aa] dark:text-[#71717a] font-medium uppercase tracking-wide">
          Package
        </p>
        <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] mt-1 leading-snug">
          {res.packageApplied || "—"}
        </p>
      </div>
    </div>
  );
}

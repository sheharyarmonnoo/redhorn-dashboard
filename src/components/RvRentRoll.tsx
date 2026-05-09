"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, RowClickedEvent } from "ag-grid-community";
import PageHeader from "@/components/PageHeader";
import { useRvData, formatCurrency } from "@/hooks/useConvexData";
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

  const byCode = new Map<string, Row[]>();
  for (const r of reservations) {
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
      .sort((a, b) => (a.arrivalDate || "").localeCompare(b.arrivalDate || ""));

    let currentRes: Row | null = null;
    let nextRes: Row | null = null;
    for (const r of rs) {
      if (r.arrivalDate <= today && today <= r.departureDate) {
        currentRes = r;
        break;
      }
      if (r.arrivalDate > today) {
        if (!nextRes || r.arrivalDate < nextRes.arrivalDate) nextRes = r;
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
        (Date.parse(currentRes.departureDate) - Date.parse(today)) / 86400000;
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

// Status cell mirrors the commercial rent roll: dot + label for the everyday
// states (Occupied, Departing, Vacant). Past Due gets a stronger pill-style
// badge — same red treatment commercial uses for EXPIRED leases — so it
// reads as actionable across a long list.
function StatusCellRenderer(props: { value: string }) {
  const status = props.value;
  if (status === "past_due") {
    return (
      <span className="inline-flex items-center font-semibold text-[10px] px-1.5 py-0.5 rounded bg-[#dc2626] text-white whitespace-nowrap">
        PAST DUE
      </span>
    );
  }
  const dot: Record<string, string> = {
    occupied: "bg-[#16a34a]",
    departing: "bg-[#d97706]",
    vacant: "bg-[#a1a1aa]",
  };
  const label: Record<string, string> = {
    occupied: "Occupied",
    departing: "Departing",
    vacant: "Vacant",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#18181b] dark:text-[#fafafa]">
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status] || "bg-[#a1a1aa]"}`} />
      {label[status] || status}
    </span>
  );
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
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [quickSearch, setQuickSearch] = useState("");
  const gridRef = useRef<AgGridReact>(null);

  const allRows = useMemo(() => rollupBySite(reservations, sites), [reservations, sites]);
  const selectedRow = useMemo(
    () => (selectedCode ? allRows.find((r) => r.siteCode === selectedCode) || null : null),
    [allRows, selectedCode],
  );

  const stats = useMemo(() => {
    // Past Due wins over Occupied in the status column, so re-derive the
    // occupancy count from raw current/departing reservations rather than the
    // status string. Otherwise a site that's both occupied AND past due
    // would only show up in the Past Due bucket and the Occupied stat
    // would under-report.
    const today = todayIso();
    let occupied = 0;
    for (const r of allRows) {
      if (r.currentRes && r.currentRes.arrivalDate <= today && today <= r.currentRes.departureDate) {
        occupied += 1;
      }
    }
    const vacant = allRows.filter((r) => r.status === "vacant").length;
    const pastDueRows = allRows.filter((r) => r.hasOpenBalance);
    const totalAr = pastDueRows.reduce((s, r) => s + r.totalBalance, 0);
    return { total: allRows.length, occupied, vacant, pastDueCount: pastDueRows.length, totalAr };
  }, [allRows]);

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
      { field: "siteType", headerName: "Type", minWidth: 220, flex: 1 },
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
    return (
      <div>
        <PageHeader title="Rent Roll" subtitle={`${propertyName} — loading…`} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 animate-pulse h-[68px]"
            />
          ))}
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-6 h-96 animate-pulse" />
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
            Drop the monthly bundle in <span className="font-medium">Monthly Uploads</span> to populate the rent roll.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Rent Roll" subtitle={`${propertyName} — ${stats.total} sites`} />

      {/* Stats — mirrors the Hollister/Belgold KPI strip: 4 cards, no Arriving */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        <StatCard label="Total Sites" value={stats.total} />
        <StatCard label="Occupied" value={stats.occupied} valueClass="text-[#16a34a]" />
        <StatCard label="Vacant" value={stats.vacant} valueClass="text-[#71717a] dark:text-[#a1a1aa]" />
        <StatCard
          label="Past Due"
          value={stats.pastDueCount}
          valueClass="text-[#dc2626]"
          sub={stats.totalAr > 0 ? `${formatCurrency(stats.totalAr)} A/R` : undefined}
        />
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-4 mb-3 text-[12px]">
        <div className="sm:ml-auto w-full sm:w-auto flex items-center gap-2">
          <input
            type="text"
            placeholder="Quick search all data..."
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            className="bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] rounded px-3 py-1.5 text-[#18181b] dark:text-[#fafafa] w-full sm:w-72"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="ag-theme-quartz" style={{ height: "calc(100vh - 320px)", minHeight: 480 }}>
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

// Drawer = ledger view. Every reservation for the site is listed
// chronologically (one row per stay) so you can see the whole tenancy
// history including guest names, dates, charges, payments, balance, and
// POS. Click a reservation row → its line-item breakdown renders below.
// This is where the data the grid de-emphasizes (names, POS detail) lives.
function ReservationDrawer({ row, onClose }: { row: SiteRow; onClose: () => void }) {
  const today = todayIso();
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

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" />
      <div
        className="relative bg-white dark:bg-[#18181b] border-l border-[#e4e4e7] dark:border-[#3f3f46] shadow-2xl w-full max-w-[760px] h-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#e4e4e7] dark:border-[#3f3f46]">
          <div>
            <p className="text-[16px] font-semibold text-[#18181b] dark:text-[#fafafa]">Site {row.siteCode}</p>
            <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] mt-0.5">{row.siteType}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded hover:bg-[#71717a]/10 text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 px-5 py-3 border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a]/50">
          <DrawerStat label="Stays" value={`${row.reservationCount}`} />
          <DrawerStat label="Total Charges" value={row.totalCharges > 0 ? formatCurrency(row.totalCharges) : "—"} />
          <DrawerStat
            label="Total Balance"
            value={row.totalBalance > 0.5 ? formatCurrency(row.totalBalance) : "—"}
            valueClass={row.hasOpenBalance ? "text-[#dc2626]" : ""}
          />
          <DrawerStat
            label="Paid %"
            value={row.totalCharges > 0 ? `${(row.percentPaid * 100).toFixed(0)}%` : "—"}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-5 pt-4 pb-2">
            <p className="text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">
              Reservation Ledger
            </p>
          </div>
          <ReservationLedger
            reservations={row.reservations}
            today={today}
            selectedConf={selectedConf}
            onSelect={setSelectedConf}
          />
          {selected && (
            <>
              <div className="px-5 pt-5 pb-2">
                <p className="text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">
                  Line Items · {selected.confirmation}
                </p>
              </div>
              <ReservationLineItems res={selected} />
            </>
          )}
        </div>
      </div>
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
  // Chronological order — most recent / current at the top so the user sees
  // the active stay first, then prior history below.
  const sorted = [...reservations].sort((a, b) =>
    (b.arrivalDate || "").localeCompare(a.arrivalDate || ""),
  );

  return (
    <div className="border-y border-[#e4e4e7] dark:border-[#3f3f46]">
      <div className="grid grid-cols-[80px_1fr_140px_90px_90px_90px_60px] px-5 py-2 bg-[#fafafa] dark:bg-[#27272a]/50 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
        <span>Status</span>
        <span>Guest</span>
        <span>Dates</span>
        <span className="text-right">Charges</span>
        <span className="text-right">Paid</span>
        <span className="text-right">Balance</span>
        <span className="text-right">Paid %</span>
      </div>
      {sorted.map((r) => {
        const isCurrent = r.arrivalDate <= today && today <= r.departureDate;
        const isFuture = r.arrivalDate > today;
        const isPast = r.departureDate < today;
        const balance = r.balanceOnInvoice || 0;
        const isSelected = r.confirmation === selectedConf;
        const guestName = `${r.firstName || ""} ${r.lastName || ""}`.trim() || "—";
        return (
          <button
            key={r.confirmation}
            onClick={() => onSelect(r.confirmation)}
            className={`w-full grid grid-cols-[80px_1fr_140px_90px_90px_90px_60px] px-5 py-2 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] items-center text-left cursor-pointer hover:bg-[#fafafa] dark:hover:bg-[#27272a]/50 ${
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
            <span className="text-[10px] text-[#71717a] dark:text-[#a1a1aa] tabular-nums">
              {formatShortDate(r.arrivalDate)} → {formatShortDate(r.departureDate)}
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
  const hasNonZero = items.some((it) => it.value !== 0);

  return (
    <div className="divide-y divide-[#f4f4f5] dark:divide-[#27272a]">
      {!hasNonZero && (
        <div className="px-5 py-6 text-center text-[12px] text-[#a1a1aa]">
          No charges or payments on this reservation.
        </div>
      )}
      {hasNonZero &&
        items.map((it, i) => (
          <div
            key={i}
            className={`grid grid-cols-[1fr_140px] px-5 py-2.5 text-[12px] ${
              it.emphasize ? "bg-[#fafafa]/60 dark:bg-[#27272a]/40 font-medium" : ""
            }`}
          >
            <span
              className={
                it.emphasize
                  ? "text-[#18181b] dark:text-[#fafafa]"
                  : it.muted
                  ? "text-[#71717a] dark:text-[#a1a1aa]"
                  : "text-[#18181b] dark:text-[#fafafa]"
              }
            >
              {it.label}
            </span>
            <span
              className={`text-right tabular-nums ${
                it.value === 0
                  ? "text-[#a1a1aa]"
                  : it.muted
                  ? "text-[#16a34a]"
                  : it.value < 0
                  ? "text-[#16a34a]"
                  : "text-[#18181b] dark:text-[#fafafa]"
              }`}
            >
              {it.value === 0 ? "—" : it.value < 0 ? `(${formatCurrency(Math.abs(it.value))})` : formatCurrency(it.value)}
            </span>
          </div>
        ))}
      <div className="grid grid-cols-3 gap-3 px-5 py-4 bg-[#fafafa]/40 dark:bg-[#27272a]/30">
        <DrawerStat label="Nights" value={`${res.nights || 0}`} />
        <DrawerStat label="Source" value={res.reservationSource || "—"} />
        <DrawerStat label="Package" value={res.packageApplied || "—"} />
      </div>
    </div>
  );
}

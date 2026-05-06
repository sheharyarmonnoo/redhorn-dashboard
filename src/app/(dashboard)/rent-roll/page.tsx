"use client";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, RowClickedEvent } from "ag-grid-community";
import { useTenants, useUnits, useActiveProperty, formatCurrency, leasedUnitKeys, useChargeSummary, normalizeTenantName } from "@/hooks/useConvexData";
import { useAgGridPersistence } from "@/hooks/useAgGridPersistence";
import RentRollDrawer from "@/components/RentRollDrawer";
import PageHeader from "@/components/PageHeader";
import { Download } from "lucide-react";

type TenantStatus = "current" | "past_due" | "locked_out" | "vacant" | "expiring_soon";

function getStatusLabel(status: TenantStatus): string {
  switch (status) {
    case "current": return "Current";
    case "past_due": return "Past Due";
    case "locked_out": return "Locked Out";
    case "vacant": return "Vacant";
    case "expiring_soon": return "Expiring Soon";
  }
}

ModuleRegistry.registerModules([AllCommunityModule]);

function StatusCellRenderer(props: { value: string }) {
  const status = props.value;
  const dotColors: Record<string, string> = {
    current: "bg-[#16a34a]",
    past_due: "bg-[#dc2626]",
    expiring_soon: "bg-[#2563eb]",
    vacant: "bg-[#a1a1aa]",
    locked_out: "bg-[#d97706]",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#18181b] dark:text-[#fafafa]">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColors[status] || "bg-[#a1a1aa]"}`} />
      {getStatusLabel(status as TenantStatus)}
    </span>
  );
}

function CurrencyCellRenderer(props: { value: number }) {
  return <span>{props.value > 0 ? formatCurrency(props.value) : "—"}</span>;
}

// Electric posting only applies to net-lease tenants — gross leases include
// utilities in base rent. Renders one of: "—" for vacant or non-net-lease,
// green "Posted" or red "Not Posted" otherwise.
function ElectricPostedCellRenderer(props: { data: any }) {
  const t = props.data || {};
  const isVacant = t.status === "vacant";
  const isNet = typeof t.leaseType === "string" && /net\s*lease/i.test(t.leaseType);
  if (isVacant || !isNet) {
    return <span className="text-[11px] text-[#d4d4d8] dark:text-[#52525b]">—</span>;
  }
  // Secondary rows of multi-unit leases inherit the primary row's posting
  // state — show as not applicable to avoid duplicate "Not Posted" warnings.
  if (t._multiUnitLease && !t._multiUnitPrimary) {
    return <span className="text-[11px] text-[#a1a1aa] dark:text-[#71717a]">—</span>;
  }
  const posted = !!t.electricPosted;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${posted ? "text-[#16a34a]" : "text-[#dc2626] font-medium"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${posted ? "bg-[#16a34a]" : "bg-[#dc2626]"}`} />
      {posted ? "Posted" : "Not Posted"}
    </span>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export default function RentRollPage() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const gridRef = useRef<AgGridReact>(null);
  const isMobile = useIsMobile();
  const activeProperty = useActiveProperty();
  const tenantsLeased = useTenants(activeProperty?._id);
  const unitsAll = useUnits(activeProperty?._id);
  const { byTenant: chargeSummary, latestMonth: chargeMonth } = useChargeSummary(activeProperty?._id);

  // Build one row per individual unit so the rent roll matches Yardi's
  // Total Units count.
  //
  // Source of truth:
  //   - tenants.listByProperty: one row per LEASE. Multi-unit leases come
  //     as "A-103, A-112, A-85" in a single tenant.unit field.
  //   - units.listByProperty: one row per individual unit (always atomic).
  //
  // Strategy: expand each multi-unit lease into one row per unit, copying
  // the tenant info onto each row but only keeping rent/sqft on the FIRST
  // row of the lease. Secondary rows show "(incl. in <primary>)" so the
  // sum of rents equals the actual rent roll, not 3x for shared leases.
  // Unmatched units become vacant rows.
  const tenants = useMemo(() => {
    const norm = (s: string) => (s || "").trim().toLowerCase();
    const leasedKeys = leasedUnitKeys(tenantsLeased);
    // Sqft per unit comes from the Total Units feed (individual unit) — the
    // tenant.sqft field is the combined lease sqft, which would over-count
    // for multi-unit leases.
    const unitsByKey = new Map<string, any>(
      unitsAll.map((u: any) => [norm(u.unit), u])
    );
    const expanded: any[] = [];
    for (const t of tenantsLeased) {
      const parts = (t.unit || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      if (parts.length === 0) { expanded.push(t); continue; }
      parts.forEach((unit: string, idx: number) => {
        const isPrimary = idx === 0;
        const matchedUnit = unitsByKey.get(norm(unit));
        const chargeKey = normalizeTenantName(t.tenant || "");
        const cs = isPrimary ? chargeSummary.get(chargeKey) : null;
        expanded.push({
          ...t,
          _id: parts.length > 1 ? `${t._id}-${unit}` : t._id,
          unit,
          building: matchedUnit?.building || t.building || "",
          // Per-unit sqft from the Total Units feed (atomic). Falls back to
          // the lease.sqft only when units feed has nothing for this unit.
          sqft: matchedUnit?.sqft ?? (isPrimary ? t.sqft : 0),
          // Primary row carries the lease's financials. Secondary rows
          // (other units in the same lease) show 0 rent so the totals
          // don't multi-count. Tenant column gets a "(incl. lease)" tag.
          tenant: isPrimary ? t.tenant : `${t.tenant} (incl. lease)`,
          monthlyRent: isPrimary ? t.monthlyRent : 0,
          monthlyElectric: isPrimary ? t.monthlyElectric : 0,
          securityDeposit: isPrimary ? t.securityDeposit : 0,
          // Charge summary derived from receivable_details for the latest
          // posted month. Only on the primary row for multi-unit leases.
          camCharge: cs?.cam ?? 0,
          electricCharge: cs?.electric ?? 0,
          insuranceCharge: cs?.insurance ?? 0,
          currentMonthCharges: cs?.currentMonthCharges ?? 0,
          currentBalance: cs?.currentBalance ?? 0,
          _multiUnitLease: parts.length > 1,
          _multiUnitPrimary: isPrimary,
        });
      });
    }
    const vacancies = unitsAll
      .filter((u: any) => !leasedKeys.has(norm(u.unit)))
      .map((u: any) => ({
        _id: `vacant-${u.unit}`,
        unit: u.unit,
        building: u.building || "",
        sqft: u.sqft || 0,
        tenant: "",
        leaseType: "",
        leaseFrom: "",
        leaseTo: "",
        monthlyRent: 0,
        monthlyElectric: 0,
        securityDeposit: 0,
        pastDueAmount: 0,
        status: "vacant",
        electricPosted: false,
        propertyId: activeProperty?._id,
      }));
    return [...expanded, ...vacancies];
  }, [tenantsLeased, unitsAll, activeProperty?._id, chargeSummary]);

  // Re-resolve the selected tenant from the live list each render so the
  // drawer reflects the latest override state from Convex without a re-click.
  const selected = useMemo(() => {
    if (!selectedKey) return null;
    return tenants.find((t: any) => `${activeProperty?.code || "x"}-${t.unit}` === selectedKey) || null;
  }, [tenants, selectedKey]);

  const columnDefs = useMemo<ColDef[]>(() => {
    const unitWidth = isMobile ? 90 : 120;
    return [
      { field: "building", headerName: "Bldg", rowGroup: true, hide: true, filter: true },
      { field: "unit", headerName: "Unit", width: unitWidth, pinned: "left", sort: "asc" },
      { field: "tenant", headerName: "Tenant", minWidth: 180, flex: isMobile ? 0 : 1, width: isMobile ? 180 : undefined,
        valueFormatter: (p: { value: string }) => p.value || "— Vacant —" },
      { field: "leaseType", headerName: "Lease Type", width: 130,
        valueFormatter: (p: { value: string }) => p.value?.replace("Office ", "") || "" },
      { field: "sqft", headerName: "Sq Ft", width: 90, type: "numericColumn",
        valueFormatter: (p: { value: number }) => p.value?.toLocaleString() || "" },
      { field: "leaseFrom", headerName: "Lease Start", width: 110,
        valueFormatter: (p: { value: string }) => p.value || "—" },
      { field: "leaseTo", headerName: "Lease End", width: 110,
        valueFormatter: (p: { value: string }) => p.value || "—" },
      { field: "monthlyRent", headerName: "Rent", width: 110, type: "numericColumn",
        cellRenderer: CurrencyCellRenderer },
      // Prefer the Show Detail rent roll's monthlyRentPerSF column; fall
      // back to monthlyRent / sqft for properties not yet on the full
      // export. Display as $X.XX/SF.
      { field: "monthlyRentPerSF", headerName: "Rent / SF", width: 110, type: "numericColumn",
        valueGetter: (p: any) => {
          const d = p.data || {};
          if (typeof d.monthlyRentPerSF === "number" && d.monthlyRentPerSF > 0) return d.monthlyRentPerSF;
          if (d.monthlyRent > 0 && d.sqft > 0) return d.monthlyRent / d.sqft;
          return 0;
        },
        valueFormatter: (p: any) => p.value > 0 ? `$${p.value.toFixed(2)}/SF` : "—" },
      { field: "securityDeposit", headerName: "Security Deposit", width: 140, type: "numericColumn",
        cellRenderer: CurrencyCellRenderer },
      // Per-tenant current-month charges from the receivable detail. Hidden
      // by default — user enables via the column menu when they need them.
      { field: "camCharge", headerName: "CAM", width: 110, type: "numericColumn",
        hide: true, cellRenderer: CurrencyCellRenderer },
      { field: "electricCharge", headerName: "Electric Chg", width: 120, type: "numericColumn",
        hide: true, cellRenderer: CurrencyCellRenderer },
      { field: "insuranceCharge", headerName: "Insurance", width: 110, type: "numericColumn",
        hide: true, cellRenderer: CurrencyCellRenderer },
      { field: "currentMonthCharges", headerName: "Curr Charges", width: 130, type: "numericColumn",
        hide: false, cellRenderer: CurrencyCellRenderer },
      { field: "currentBalance", headerName: "Curr Balance", width: 130, type: "numericColumn",
        hide: false,
        cellRenderer: (p: { value: number }) => {
          const v = p.value || 0;
          if (v === 0) return <span className="text-[#a1a1aa]">—</span>;
          return <span className={v > 0 ? "text-[#dc2626] font-medium" : "text-[#16a34a]"}>{formatCurrency(Math.abs(v))}{v < 0 ? " CR" : ""}</span>;
        },
      },
      // Manual entry until the Tenancy Schedule scraper lands. Hidden by
      // default; user can toggle visibility via the column menu.
      { field: "nextRentIncrease", headerName: "Next Rent ↑", width: 130, hide: true,
        valueFormatter: (p: { value: string }) => p.value || "—",
      },
      { field: "nextRentIncreaseAmount", headerName: "New Rent", width: 110, hide: true,
        type: "numericColumn", cellRenderer: CurrencyCellRenderer,
      },
      // Net-lease electric posting status. Filterable so the user can
      // pull up "Not Posted" rows for the close.
      { field: "electricPosted", headerName: "Electric", width: 130, cellRenderer: ElectricPostedCellRenderer, filter: true,
        valueGetter: (p: any) => {
          const d = p.data || {};
          if (d.status === "vacant") return "n/a";
          if (typeof d.leaseType === "string" && !/net\s*lease/i.test(d.leaseType)) return "n/a";
          return d.electricPosted ? "Posted" : "Not Posted";
        } },
      // Security Deposit, Monthly Electric ($ amount), and Past Due
      // intentionally hidden from the grid — drawer still surfaces them.
      { field: "status", headerName: "Status", width: 130, cellRenderer: StatusCellRenderer, filter: true },
    ];
  }, [isMobile]);

  const autoGroupColumnDef = useMemo<ColDef>(() => ({
    headerName: "Building",
    minWidth: 200,
    pinned: "left",
    cellRendererParams: { suppressCount: false },
  }), []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    suppressMovable: false,
  }), []);

  const persistence = useAgGridPersistence({
    storageKey: "redhorn_grid_rent_roll",
    fallbackFit: typeof window !== "undefined" ? window.innerWidth >= 768 : true,
  });

  const onRowClicked = useCallback((event: RowClickedEvent) => {
    // Ignore clicks on group rows — only open the detail panel for leaf tenant rows
    if (event.node?.group) return;
    if (!event.data) return;
    const key = `${activeProperty?.code || "x"}-${event.data.unit}`;
    setSelectedKey(key);
    // activeProperty must be in deps — otherwise the closure captures the
    // first-render code and a property switch (Hollister → Belgold) makes
    // the click set selectedKey to "hollister-A" while the selected memo
    // looks for "belgold-A", so the drawer silently never opens.
  }, [activeProperty?.code]);

  const totalRent = tenants.filter((t: any) => t.status !== "vacant").reduce((s: number, t: any) => s + t.monthlyRent, 0);
  const totalSqft = tenants.reduce((s: number, t: any) => s + t.sqft, 0);

  // Real export: dump the current grid (filtered + grouped) to CSV via AG Grid.
  function exportRentRollReal() {
    const fileName = `rent-roll-${new Date().toISOString().slice(0, 10)}.csv`;
    gridRef.current?.api?.exportDataAsCsv({ fileName });
  }

  return (
    <div>
      <PageHeader title="Rent Roll" subtitle={`${activeProperty?.name || ""} — Tap any row for details`}>
        <button onClick={exportRentRollReal} disabled={tenants.length === 0} title="Export .csv" aria-label="Export .csv" className="flex items-center justify-center bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] hover:border-[#4f6ef7] text-[#5a5e73] dark:text-[#a1a1aa] hover:text-[#4f6ef7] w-8 h-8 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
          <Download size={14} />
        </button>
      </PageHeader>

      {/* Summary bar */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-4 mb-4 text-[12px]">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] rounded-lg px-3 py-1.5 text-[#1e1e2d] dark:text-[#fafafa] font-semibold whitespace-nowrap">
            {tenants.length} Units
          </span>
          <span className="bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] rounded-lg px-3 py-1.5 text-[#1e1e2d] dark:text-[#fafafa] whitespace-nowrap">
            {totalSqft.toLocaleString()} SF
          </span>
          <span className="bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] rounded-lg px-3 py-1.5 text-emerald-700 dark:text-emerald-400 font-semibold whitespace-nowrap">
            {formatCurrency(totalRent)}/mo
          </span>
        </div>
        <div className="sm:ml-auto w-full sm:w-auto">
          <input
            type="text"
            placeholder="Quick search all data..."
            className="px-3 py-1.5 bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] rounded-lg text-sm text-gray-900 dark:text-[#fafafa] placeholder-gray-400 dark:placeholder-[#71717a] focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7] w-full sm:w-64"
            onChange={(e) => {
              gridRef.current?.api?.setGridOption("quickFilterText", e.target.value);
            }}
          />
        </div>
      </div>

      {/* AG Grid Table */}
      <div className="ag-theme-alpine w-full rounded overflow-auto border border-[#e4e4e7] dark:border-[#3f3f46]" style={{ height: "min(calc(100vh - 220px), 700px)", minHeight: 350 }}>
        <AgGridReact
          ref={gridRef}
          rowData={tenants}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          autoGroupColumnDef={autoGroupColumnDef}
          groupDisplayType="groupRows"
          groupDefaultExpanded={1}
          onGridReady={persistence.onGridReady}
          onColumnResized={persistence.onColumnResized}
          onColumnMoved={persistence.onColumnMoved}
          onColumnVisible={persistence.onColumnVisible}
          onColumnPinned={persistence.onColumnPinned}
          onSortChanged={persistence.onSortChanged}
          onRowClicked={onRowClicked}
          rowSelection="single"
          animateRows={true}
          pagination={true}
          paginationAutoPageSize={false}
          paginationPageSize={500}
          suppressRowHoverHighlight={false}
          rowBuffer={20}
          cacheBlockSize={500}
          getRowId={(params) => `${activeProperty?.code || "x"}-${params.data.unit}`}
        />
      </div>

      <RentRollDrawer tenant={selected} onClose={() => setSelectedKey(null)} />
    </div>
  );
}

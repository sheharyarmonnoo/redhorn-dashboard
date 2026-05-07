"use client";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, ColGroupDef, RowClickedEvent } from "ag-grid-community";
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
  const [quickSearch, setQuickSearch] = useState("");
  const gridRef = useRef<AgGridReact>(null);
  const isMobile = useIsMobile();
  const activeProperty = useActiveProperty();
  const tenantsLeased = useTenants(activeProperty?._id);
  const unitsAll = useUnits(activeProperty?._id);
  const { byTenant: chargeSummary, latestMonth: chargeMonth } = useChargeSummary(activeProperty?._id);

  // Deep-link support: ?unit=A-103 (or ?unit=A-103,A-112,A-85 for multi-unit
  // leases) opens the rent-roll filtered to that unit and auto-opens the
  // drawer. Used by the dashboard KPI drawers (Past Due, Expiring) so the
  // user can drill from a tenant row to the rent roll in one click.
  const searchParams = useSearchParams();
  const deepLinkUnit = searchParams.get("unit");

  // Build the rent roll: one row per LEASE (multi-unit leases stay merged),
  // plus one row per VACANT unit.
  //
  // Source of truth:
  //   - tenants.listByProperty: one row per LEASE. Multi-unit leases come
  //     as "A-103, A-112, A-85" in a single tenant.unit field.
  //   - units.listByProperty: one row per individual unit (always atomic).
  //
  // Strategy: keep multi-unit leases as a SINGLE row whose `unit` is the
  // comma-separated string from Yardi. Compute combined sqft by summing
  // matched per-unit sqfts from the Units feed. Vacant units (no matching
  // lease) are still expanded one-per-unit so each appears as its own row.
  const tenants = useMemo(() => {
    const norm = (s: string) => (s || "").trim().toLowerCase();
    const leasedKeys = leasedUnitKeys(tenantsLeased);
    // Per-unit sqft / building from the Total Units feed — needed because
    // the tenant.sqft field on a multi-unit lease may be the combined or
    // single-unit value depending on the export.
    const unitsByKey = new Map<string, any>(
      unitsAll.map((u: any) => [norm(u.unit), u])
    );
    const merged: any[] = [];
    for (const t of tenantsLeased) {
      const parts = (t.unit || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      if (parts.length === 0) { merged.push(t); continue; }
      // Sum sqft across every unit in the lease's comma-list. Fall back to
      // the lease.sqft when the Units feed has no match for any of them.
      const matchedUnits = parts.map((u: string) => unitsByKey.get(norm(u))).filter(Boolean);
      const summedSqft = matchedUnits.reduce((s: number, u: any) => s + (u.sqft || 0), 0);
      const sqft = summedSqft > 0 ? summedSqft : (t.sqft || 0);
      // Building: first matched unit's building, or join distinct buildings
      // when the lease spans multiple. Falls back to lease.building.
      const buildings = Array.from(new Set(matchedUnits.map((u: any) => u.building).filter(Boolean)));
      const building = buildings.length > 1 ? buildings.join(", ") : (buildings[0] || t.building || "");
      const chargeKey = normalizeTenantName(t.tenant || "");
      const cs = chargeSummary.get(chargeKey);
      merged.push({
        ...t,
        unit: t.unit, // keep the comma-separated string from Yardi as-is
        building,
        sqft,
        camCharge: cs?.cam ?? 0,
        electricCharge: cs?.electric ?? 0,
        insuranceCharge: cs?.insurance ?? 0,
        totalRecoveries: cs?.recoveries ?? 0,
        currentMonthCharges: cs?.currentMonthCharges ?? 0,
        currentBalance: cs?.currentBalance ?? 0,
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
    return [...merged, ...vacancies];
  }, [tenantsLeased, unitsAll, activeProperty?._id, chargeSummary]);

  // Re-resolve the selected tenant from the live list each render so the
  // drawer reflects the latest override state from Convex without a re-click.
  const selected = useMemo(() => {
    if (!selectedKey) return null;
    return tenants.find((t: any) => `${activeProperty?.code || "x"}-${t.unit}` === selectedKey) || null;
  }, [tenants, selectedKey]);

  // When the page loads with ?unit= in the URL, find the matching tenant
  // row, open the drawer for it, and apply a quick filter so only that
  // tenant's rows are visible. Multi-unit leases come in as the comma
  // string from Yardi — match against the first unit token to find the row.
  // Apply ONCE per deep link — otherwise tenant query updates would re-open
  // the drawer every time the user closes it.
  const deepLinkAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLinkUnit || !activeProperty?.code || tenants.length === 0) return;
    if (deepLinkAppliedRef.current === deepLinkUnit) return;
    const norm = (s: string) => (s || "").trim().toLowerCase();
    const target = norm(deepLinkUnit);
    const match = tenants.find((t: any) => norm(t.unit) === target)
      || tenants.find((t: any) => (t.unit || "").split(",").map((s: string) => norm(s)).includes(target.split(",")[0].trim()));
    if (match) {
      deepLinkAppliedRef.current = deepLinkUnit;
      setSelectedKey(`${activeProperty.code}-${match.unit}`);
      const firstUnit = (match.unit || "").split(",")[0].trim();
      gridRef.current?.api?.setGridOption("quickFilterText", firstUnit);
      setQuickSearch(firstUnit);
    }
  }, [deepLinkUnit, activeProperty?.code, tenants]);

  const columnDefs = useMemo<(ColDef | ColGroupDef)[]>(() => {
    const unitWidth = isMobile ? 90 : 120;
    return [
      { field: "building", headerName: "Bldg", rowGroup: true, hide: true, filter: true },
      { field: "unit", headerName: "Unit", width: unitWidth, pinned: "left", sort: "asc" },
      // Tenant group — Tenant + Status + Electric stay visible when collapsed;
      // Lease Type / Lease Start / Lease End reveal on expand.
      {
        headerName: "",
        marryChildren: true,
        children: [
          { field: "tenant", headerName: "Tenant", minWidth: 180, flex: isMobile ? 0 : 1, width: isMobile ? 180 : undefined,
            valueFormatter: (p: { value: string }) => p.value || "— Vacant —" },
          { field: "leaseType", headerName: "Lease Type", width: 130, columnGroupShow: "open",
            valueFormatter: (p: { value: string }) => p.value?.replace("Office ", "") || "" },
          { field: "leaseFrom", headerName: "Lease Start", width: 110, columnGroupShow: "open",
            valueFormatter: (p: { value: string }) => p.value || "—" },
          { field: "leaseTo", headerName: "Lease End", width: 110, columnGroupShow: "open",
            valueFormatter: (p: { value: string }) => p.value || "—" },
          { field: "status", headerName: "Status", width: 130, cellRenderer: StatusCellRenderer, filter: true },
          { field: "electricPosted", headerName: "Electric", width: 130, cellRenderer: ElectricPostedCellRenderer, filter: true,
            valueGetter: (p: any) => {
              const d = p.data || {};
              if (d.status === "vacant") return "n/a";
              if (typeof d.leaseType === "string" && !/net\s*lease/i.test(d.leaseType)) return "n/a";
              return d.electricPosted ? "Posted" : "Not Posted";
            } },
        ],
      },
      { field: "sqft", headerName: "Sq Ft", width: 90,
        valueFormatter: (p: { value: number }) => p.value?.toLocaleString() || "" },
      // Days until lease expires + urgency band — replaces the old separate
      // /leases page. Always visible standalone.
      { field: "daysToExpiry", headerName: "Lease Exp.", width: 130,
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" } as any,
        headerClass: "ag-center-aligned-header",
        valueGetter: (p: any) => {
          const to = p.data?.leaseTo;
          if (!to) return null;
          const end = new Date(to).getTime();
          if (!Number.isFinite(end)) return null;
          return Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24));
        },
        cellRenderer: (p: { value: number | null; data: any }) => {
          if (p.data?.status === "vacant") return <span className="text-[#a1a1aa]">—</span>;
          const d = p.value;
          if (d === null || d === undefined) return <span className="text-[#a1a1aa]">—</span>;
          if (d <= 0) {
            // Cap stale-expired display: within a year show "EXPIRED Nd ago";
            // beyond a year drop the number — it gets meaningless visually.
            if (d <= -365) {
              return <span className="inline-flex items-center font-semibold text-[10px] px-1.5 py-0.5 rounded bg-[#dc2626] text-white whitespace-nowrap">EXPIRED</span>;
            }
            return <span className="inline-flex items-center font-semibold text-[10px] px-1.5 py-0.5 rounded bg-[#dc2626] text-white whitespace-nowrap">EXPIRED {-d}d</span>;
          }
          // Cap very long-future leases (>5 years) so the column stays narrow.
          if (d > 1825) {
            return <span className="text-[12px] text-[#16a34a]">1825d+</span>;
          }
          const color = d <= 90 ? "text-[#dc2626] font-semibold" : d <= 180 ? "text-[#d97706] font-medium" : "text-[#16a34a]";
          return <span className={`text-[12px] ${color}`}>{d}d</span>;
        },
      },
      { field: "leaseUrgency", headerName: "Urgency", width: 140, hide: true,
        valueGetter: (p: any) => {
          if (p.data?.status === "vacant") return "—";
          const to = p.data?.leaseTo;
          if (!to) return "—";
          const end = new Date(to).getTime();
          if (!Number.isFinite(end)) return "—";
          const d = Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24));
          if (d <= 0) return "Expired";
          if (d <= 90) return "Critical (<90d)";
          if (d <= 180) return "Warning (90-180d)";
          return "OK (180d+)";
        },
        cellRenderer: (p: { value: string }) => {
          const dots: Record<string, string> = {
            "Expired": "bg-[#7f1d1d]",
            "Critical (<90d)": "bg-[#dc2626]",
            "Warning (90-180d)": "bg-[#d97706]",
            "OK (180d+)": "bg-[#16a34a]",
          };
          return (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#18181b] dark:text-[#fafafa]">
              <span className={`w-1.5 h-1.5 rounded-full ${dots[p.value] || "bg-[#a1a1aa]"}`} />
              {p.value}
            </span>
          );
        },
      },
      // Rent group — Rent / SF stays visible; Rent and Security Deposit
      // reveal on expand.
      {
        headerName: "",
        marryChildren: true,
        children: [
          { field: "monthlyRent", headerName: "Rent", width: 110, columnGroupShow: "open",
            cellRenderer: CurrencyCellRenderer },
          { field: "monthlyRentPerSF", headerName: "Rent / SF", width: 110,
            valueGetter: (p: any) => {
              const d = p.data || {};
              if (typeof d.monthlyRentPerSF === "number" && d.monthlyRentPerSF > 0) return d.monthlyRentPerSF;
              if (d.monthlyRent > 0 && d.sqft > 0) return d.monthlyRent / d.sqft;
              return 0;
            },
            valueFormatter: (p: any) => p.value > 0 ? `$${p.value.toFixed(2)}/SF` : "—" },
          { field: "securityDeposit", headerName: "Security Deposit", width: 140, columnGroupShow: "open",
            cellRenderer: CurrencyCellRenderer },
        ],
      },
      // CAM / Electric / Insurance billbacks group — Total Recoveries +
      // CAM / SF stay visible; CAM, Electric, Insurance dollar amounts
      // reveal on expand. Total Recoveries = CAM + Electric + Insurance +
      // late fees (everything billed back to the tenant beyond base rent).
      {
        headerName: "",
        marryChildren: true,
        children: [
          { field: "totalRecoveries", headerName: "Recoveries", width: 120,
            cellRenderer: CurrencyCellRenderer },
          { field: "camPerSF", headerName: "CAM / SF", width: 110,
            valueGetter: (p: any) => {
              const d = p.data || {};
              if (d.camCharge > 0 && d.sqft > 0) return d.camCharge / d.sqft;
              return 0;
            },
            valueFormatter: (p: any) => p.value > 0 ? `$${p.value.toFixed(2)}/SF` : "—" },
          { field: "camCharge", headerName: "CAM", width: 110, columnGroupShow: "open",
            cellRenderer: CurrencyCellRenderer },
          { field: "electricCharge", headerName: "Electric Chg", width: 120, columnGroupShow: "open",
            cellRenderer: CurrencyCellRenderer },
          { field: "insuranceCharge", headerName: "Insurance", width: 110, columnGroupShow: "open",
            cellRenderer: CurrencyCellRenderer },
        ],
      },
      // Current group — Current Balance stays visible; Current Charges
      // reveals on expand.
      {
        headerName: "",
        marryChildren: true,
        children: [
          { field: "currentMonthCharges", headerName: "Curr Charges", width: 130, columnGroupShow: "open",
            cellRenderer: CurrencyCellRenderer },
          { field: "currentBalance", headerName: "Curr Balance", width: 130,
            cellRenderer: (p: { value: number }) => {
              const v = p.value || 0;
              if (v === 0) return <span className="text-[#a1a1aa]">—</span>;
              return <span className={v > 0 ? "text-[#dc2626] font-medium" : "text-[#16a34a]"}>{formatCurrency(Math.abs(v))}{v < 0 ? " CR" : ""}</span>;
            },
          },
        ],
      },
      // Synced from Yardi's Tenancy Schedule (CommTenancyScheduleSummary).
      // The scraper writes nextRentIncrease + nextRentIncreaseAmount directly
      // onto the tenant doc, so the row already carries the values — no
      // override merge needed. Visible by default now that the data is real.
      { field: "nextRentIncrease", headerName: "Next Rent ↑", width: 130,
        valueFormatter: (p: { value: string }) => p.value || "—",
      },
      { field: "nextRentIncreaseAmount", headerName: "New Rent", width: 110,
        cellRenderer: CurrencyCellRenderer,
      },
      // Monthly Electric ($ amount) and Past Due intentionally hidden from
      // the grid — drawer still surfaces them.
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
    cellStyle: { textAlign: "left" } as any,
    headerClass: "ag-left-aligned-header",
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
  // Each row's `unit` may be a comma-separated string for multi-unit leases.
  // Sum distinct units across all rows so the count matches Yardi's atomic
  // unit total even though we render one row per lease.
  const totalUnits = (() => {
    const set = new Set<string>();
    for (const t of tenants as any[]) {
      const parts = (t.unit || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      for (const p of parts) set.add(p.toLowerCase());
    }
    return set.size;
  })();

  // Real export: dump the current grid (filtered + grouped) to CSV via AG Grid.
  function exportRentRollReal() {
    const fileName = `rent-roll-${new Date().toISOString().slice(0, 10)}.csv`;
    gridRef.current?.api?.exportDataAsCsv({ fileName });
  }

  // Reset every active filter on the grid: column filter models, the
  // quick-search input, and any selected sort. Sort kept; only filters cleared.
  function clearAllFilters() {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    api.setGridOption("quickFilterText", "");
    setQuickSearch("");
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
            {totalUnits} Units
          </span>
          <span className="bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] rounded-lg px-3 py-1.5 text-[#1e1e2d] dark:text-[#fafafa] whitespace-nowrap">
            {totalSqft.toLocaleString()} SF
          </span>
          <span className="bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] rounded-lg px-3 py-1.5 text-emerald-700 dark:text-emerald-400 font-semibold whitespace-nowrap">
            {formatCurrency(totalRent)}/mo
          </span>
        </div>
        <div className="sm:ml-auto w-full sm:w-auto flex items-center gap-2">
          <input
            type="text"
            placeholder="Quick search all data..."
            value={quickSearch}
            className="px-3 py-1.5 bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] rounded-lg text-sm text-gray-900 dark:text-[#fafafa] placeholder-gray-400 dark:placeholder-[#71717a] focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7] w-full sm:w-64"
            onChange={(e) => {
              setQuickSearch(e.target.value);
              gridRef.current?.api?.setGridOption("quickFilterText", e.target.value);
            }}
          />
          <button
            onClick={clearAllFilters}
            className="text-[12px] font-medium px-3 py-1.5 bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] rounded-lg text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] hover:border-[#71717a] cursor-pointer whitespace-nowrap"
            title="Clear all column filters and quick search"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* AG Grid Table */}
      <div className="ag-theme-alpine w-full rounded overflow-auto border border-[#e4e4e7] dark:border-[#3f3f46]" style={{ height: "calc(100vh - 180px)", minHeight: 500 }}>
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
          paginationPageSize={50}
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

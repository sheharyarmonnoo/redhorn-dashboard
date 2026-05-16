"use client";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, ColGroupDef, RowClickedEvent } from "ag-grid-community";
import { useTenantsWithLoading, useUnits, useActiveProperty, formatCurrency, leasedUnitKeys, useChargeSummary, normalizeTenantName, showsElectricIndicator } from "@/hooks/useConvexData";
import { useAgGridPersistence } from "@/hooks/useAgGridPersistence";
import RentRollDrawer from "@/components/RentRollDrawer";
import PageHeader from "@/components/PageHeader";
import ComingSoonBanner from "@/components/ComingSoonBanner";
import RvRentRoll from "@/components/RvRentRoll";
import StatusPill, { ManualOverrideBadge } from "@/components/StatusPill";
import { Download, X } from "lucide-react";

ModuleRegistry.registerModules([AllCommunityModule]);

// Row renderer for the Status column. Color-coded pill (StatusPill) plus
// an optional Manual Override badge inline next to it when the tenant row
// has a tenant_overrides entry. Inline (vs stacked) keeps the existing
// row height — the full override metadata (by/when) still surfaces in
// the drawer.
function StatusCellRenderer(props: { value: string; data: any }) {
  const d = props.data || {};
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusPill status={props.value} />
      {d.hasOverride && <ManualOverrideBadge size="xs" />}
    </span>
  );
}

function CurrencyCellRenderer(props: { value: number }) {
  return <span>{props.value > 0 ? formatCurrency(props.value) : "—"}</span>;
}

// Electric posting indicator. Visibility is now an allowlist per property +
// per unit (see showsElectricIndicator). Hollister: a specific set of units;
// Belgold: never; everything else: never.
function ElectricPostedCellRenderer(props: { data: any; context: any }) {
  const t = props.data || {};
  const propertyCode = props.context?.propertyCode;
  if (!showsElectricIndicator(t, propertyCode)) {
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
  const { tenants: tenantsLeased, loading: tenantsLoading } = useTenantsWithLoading(activeProperty?._id);
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
  // string from Yardi (often with irregular whitespace like "A-103,  A-112,
  // A-85"). Tokenize on comma and compare the normalized token sets so
  // any-order matches work too.
  const deepLinkAppliedRef = useRef<string | null>(null);
  // Reset the applied-ref when property changes so the same `?unit=` value
  // doesn't get treated as "already applied" against a different property's
  // tenants. Also clear stale filter + selection so the user doesn't see an
  // empty grid when the unit doesn't exist in the new property.
  useEffect(() => {
    deepLinkAppliedRef.current = null;
    setSelectedKey(null);
    setQuickSearch("");
  }, [activeProperty?._id]);
  useEffect(() => {
    if (!deepLinkUnit || !activeProperty?.code || tenants.length === 0) return;
    if (deepLinkAppliedRef.current === deepLinkUnit) return;
    const tokenize = (s: string) =>
      (s || "")
        .toLowerCase()
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    const targetTokens = tokenize(deepLinkUnit);
    if (targetTokens.length === 0) return;
    // Strict-only match: every target token must be present in the lease's
    // unit list. The previous fallback `tt[0] === targetTokens[0]` could
    // produce false positives where the deep-link unit didn't actually exist
    // in the lease (e.g. `?unit=A-103` matching "A-103-X, B-201").
    const match = tenants.find((t: any) => {
      const tt = tokenize(t.unit);
      return targetTokens.every((tk) => tt.includes(tk));
    });
    if (match) {
      deepLinkAppliedRef.current = deepLinkUnit;
      setSelectedKey(`${activeProperty.code}-${match.unit}`);
      const firstUnit = tokenize(match.unit)[0] || match.unit;
      // quickSearch state drives the AgGridReact quickFilterText prop, so
      // the filter applies regardless of whether the grid has mounted yet.
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
              const code = p.context?.propertyCode;
              if (!showsElectricIndicator(d, code)) return "n/a";
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
      // Rent group — only Rent/SF stays visible by default. The other cols
      // (In-Place Rent, Annual In-Place, Annual In-Place/SF, Security Deposit)
      // reveal on column-group expand.
      {
        headerName: "",
        marryChildren: true,
        children: [
          { field: "monthlyRent", headerName: "In-Place Rent", width: 130, columnGroupShow: "open",
            cellRenderer: CurrencyCellRenderer },
          { field: "annualInPlaceRent", headerName: "Annual In-Place", width: 140, columnGroupShow: "open",
            valueGetter: (p: any) => (p.data?.monthlyRent || 0) * 12,
            cellRenderer: CurrencyCellRenderer },
          { field: "monthlyRentPerSF", headerName: "Rent / SF", width: 110,
            valueGetter: (p: any) => {
              const d = p.data || {};
              if (typeof d.monthlyRentPerSF === "number" && d.monthlyRentPerSF > 0) return d.monthlyRentPerSF;
              if (d.monthlyRent > 0 && d.sqft > 0) return d.monthlyRent / d.sqft;
              return 0;
            },
            valueFormatter: (p: any) => p.value > 0 ? `$${p.value.toFixed(2)}/SF` : "—" },
          { field: "annualInPlacePerSF", headerName: "Annual In-Place / SF", width: 160, columnGroupShow: "open",
            valueGetter: (p: any) => {
              const d = p.data || {};
              const monthlyPerSF = (typeof d.monthlyRentPerSF === "number" && d.monthlyRentPerSF > 0)
                ? d.monthlyRentPerSF
                : (d.monthlyRent > 0 && d.sqft > 0 ? d.monthlyRent / d.sqft : 0);
              return monthlyPerSF * 12;
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
    // Per-property key so column widths/order from one property don't bleed
    // into another's grid when the user switches in the sidebar.
    storageKey: `redhorn_grid_rent_roll_${activeProperty?.code || "_"}`,
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
    setQuickSearch("");
  }

  // Loading skeleton for the initial query stream — especially important when
  // navigating in via the dashboard deep link, otherwise the user sees a flash
  // of empty grid before the rows populate.
  if (tenantsLoading) {
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

  // RV park has no Yardi feed; data comes from the monthly Campspot bundle
  // upload. RvRentRoll consumes rv_reservations + rv_balances and rolls them
  // up per site (per the user's directive: lead with site/unit data, treat
  // guests as ephemeral context since RV stays churn fast).
  if (activeProperty?.propertyType === "rv_park") {
    return (
      <RvRentRoll
        propertyName={activeProperty.name}
        propertyId={activeProperty._id as string}
      />
    );
  }

  // No leases AND no units = property hasn't been onboarded into Yardi.
  // Show a banner above the (empty) grid so the user doesn't stare at a
  // blank "0 Units" / "$0/mo" header wondering whether the page is broken.
  const noYardiData = !activeProperty?.hasData && tenantsLeased.length === 0 && unitsAll.length === 0;

  return (
    <div>
      <PageHeader title="Rent Roll" subtitle={`${activeProperty?.name || ""} — Tap any row for details`}>
        <button onClick={exportRentRollReal} disabled={tenants.length === 0} title="Export .csv" aria-label="Export .csv" className="flex items-center justify-center bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] hover:border-[#4f6ef7] text-[#5a5e73] dark:text-[#a1a1aa] hover:text-[#4f6ef7] w-8 h-8 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
          <Download size={14} />
        </button>
      </PageHeader>

      {noYardiData && (
        <div className="mb-4 bg-[#fef9c3] dark:bg-[#422006]/40 border border-[#fde68a] dark:border-[#854d0e] rounded p-3">
          <p className="text-[12px] font-semibold text-[#713f12] dark:text-[#fde68a]">No rent roll data yet for {activeProperty?.name}</p>
          <p className="text-[11px] text-[#854d0e] dark:text-[#fcd34d] mt-0.5">
            This property hasn't been synced from Yardi yet — or it doesn't have a Yardi feed. Once tenants are imported they'll show up here.
          </p>
        </div>
      )}

      {/* Summary bar. Search input has an inline clear-X (visible only when
          text is present) and an active filter chip surfaces the current
          query so the user always knows they're filtered. */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-4 mb-4 text-[12px]">
        {quickSearch && (
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border bg-blue-50 dark:bg-blue-950/30 text-[#2563eb] dark:text-[#60a5fa] border-blue-200 dark:border-blue-900/50"
            title={`Active filter: ${quickSearch}`}
          >
            <span className="text-[#a1a1aa]">Filter:</span>
            <span className="truncate max-w-[180px]">{quickSearch}</span>
            <button
              type="button"
              onClick={() => setQuickSearch("")}
              className="hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"
              aria-label="Clear active filter"
            >
              <X size={11} />
            </button>
          </span>
        )}
        <div className="sm:ml-auto w-full sm:w-auto flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Search tenant, unit, lease…"
              value={quickSearch}
              className="w-full px-3 py-1.5 pr-7 bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] rounded-lg text-sm text-gray-900 dark:text-[#fafafa] placeholder-gray-400 dark:placeholder-[#71717a] focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7]"
              onChange={(e) => setQuickSearch(e.target.value)}
            />
            {quickSearch && (
              <button
                type="button"
                onClick={() => setQuickSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
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
          quickFilterText={quickSearch}
          // Context flows to every cell renderer + valueGetter so the
          // electric-posting indicator can read the active property code
          // and apply the per-property allowlist.
          context={{ propertyCode: activeProperty?.code }}
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

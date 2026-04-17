"use client";
import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, GridReadyEvent } from "ag-grid-community";
import { useActiveProperty, useTenants, formatCurrency } from "@/hooks/useConvexData";
import PageHeader from "@/components/PageHeader";

ModuleRegistry.registerModules([AllCommunityModule]);

const now = new Date("2026-03-15");

type UrgencyFilter = "all" | "Expired" | "Critical (<90d)" | "Warning (90-180d)" | "OK (180d+)";

function getUrgency(leaseTo: string) {
  const end = new Date(leaseTo);
  if (end <= now) return "Expired";
  const days = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 90) return "Critical (<90d)";
  if (days <= 180) return "Warning (90-180d)";
  return "OK (180d+)";
}

function daysUntil(date: string) {
  return Math.ceil((new Date(date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function DaysRenderer(props: { value: number }) {
  const d = props.value;
  const color = d <= 0 ? "text-[#dc2626]" : d <= 90 ? "text-[#dc2626]" : d <= 180 ? "text-[#d97706]" : "text-[#16a34a]";
  return <span className={`font-semibold text-[12px] ${color}`}>{d <= 0 ? "EXPIRED" : `${d}d`}</span>;
}

function UrgencyRenderer(props: { value: string }) {
  const dots: Record<string, string> = {
    "Expired": "bg-[#dc2626]",
    "Critical (<90d)": "bg-[#dc2626]",
    "Warning (90-180d)": "bg-[#d97706]",
    "OK (180d+)": "bg-[#16a34a]",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#18181b] dark:text-[#fafafa]">
      <span className={`w-1.5 h-1.5 rounded-full ${dots[props.value] || "bg-[#a1a1aa]"}`} />
      {props.value}
    </span>
  );
}

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => { const c = () => setM(window.innerWidth < 768); c(); window.addEventListener("resize", c); return () => window.removeEventListener("resize", c); }, []);
  return m;
}

export default function LeasesPage() {
  const gridRef = useRef<AgGridReact>(null);
  const isMobile = useIsMobile();
  const [activeFilter, setActiveFilter] = useState<UrgencyFilter>("all");
  const activeProperty = useActiveProperty();
  const tenants = useTenants(activeProperty?._id);

  const leaseData = useMemo(() => {
    return tenants
      .filter((t: any) => t.leaseTo && t.tenant && !t.tenant.includes("Owner"))
      .map((t: any) => ({ ...t, urgency: getUrgency(t.leaseTo), daysLeft: daysUntil(t.leaseTo) }))
      .sort((a: any, b: any) => a.daysLeft - b.daysLeft);
  }, [tenants]);

  const filteredData = useMemo(() => {
    if (activeFilter === "all") return leaseData;
    return leaseData.filter((t: any) => t.urgency === activeFilter);
  }, [leaseData, activeFilter]);

  const counts = useMemo(() => ({
    expired: leaseData.filter((t: any) => t.urgency === "Expired").length,
    critical: leaseData.filter((t: any) => t.urgency === "Critical (<90d)").length,
    warning: leaseData.filter((t: any) => t.urgency === "Warning (90-180d)").length,
    ok: leaseData.filter((t: any) => t.urgency === "OK (180d+)").length,
  }), [leaseData]);

  const filters: { key: UrgencyFilter; label: string; count: number; dot: string }[] = [
    { key: "all", label: "All", count: leaseData.length, dot: "bg-[#18181b] dark:bg-[#fafafa]" },
    { key: "Expired", label: "Expired", count: counts.expired, dot: "bg-[#dc2626]" },
    { key: "Critical (<90d)", label: "Critical", count: counts.critical, dot: "bg-[#dc2626]" },
    { key: "Warning (90-180d)", label: "Warning", count: counts.warning, dot: "bg-[#d97706]" },
    { key: "OK (180d+)", label: "OK", count: counts.ok, dot: "bg-[#16a34a]" },
  ];

  const columnDefs = useMemo<ColDef[]>(() => {
    if (isMobile) {
      return [
        { field: "unit", headerName: "Unit", width: 90 },
        { field: "tenant", headerName: "Tenant", minWidth: 120, flex: 1 },
        { field: "daysLeft", headerName: "Days", width: 70, type: "numericColumn", sort: "asc", cellRenderer: DaysRenderer },
        { field: "urgency", headerName: "Urgency", width: 120, cellRenderer: UrgencyRenderer },
      ];
    }
    return [
      { field: "unit", headerName: "Unit", width: 110 },
      { field: "tenant", headerName: "Tenant", minWidth: 180, flex: 1 },
      { field: "building", headerName: "Bldg", width: 70 },
      { field: "sqft", headerName: "Sq Ft", width: 90, type: "numericColumn",
        valueFormatter: (p: { value: number }) => p.value?.toLocaleString() || "" },
      { field: "leaseFrom", headerName: "Start", width: 110 },
      { field: "leaseTo", headerName: "End", width: 110 },
      { field: "daysLeft", headerName: "Days Left", width: 100, type: "numericColumn", sort: "asc", cellRenderer: DaysRenderer },
      { field: "monthlyRent", headerName: "Rent/Mo", width: 110, type: "numericColumn",
        valueFormatter: (p: { value: number }) => p.value > 0 ? formatCurrency(p.value) : "—" },
      { field: "urgency", headerName: "Urgency", width: 150, cellRenderer: UrgencyRenderer, filter: true },
    ];
  }, [isMobile]);

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, resizable: true, filter: true }), []);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    if (window.innerWidth >= 768) params.api.sizeColumnsToFit();
  }, []);

  const atRiskRent = leaseData
    .filter((t: any) => t.urgency === "Expired" || t.urgency === "Critical (<90d)")
    .reduce((s: number, t: any) => s + t.monthlyRent, 0);

  return (
    <div>
      <PageHeader title="Lease Expirations" subtitle={`${leaseData.length} leases · ${formatCurrency(atRiskRent)}/mo at risk (expired + critical)`} />

      {/* Filter tabs — click to filter the table */}
      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`flex items-center gap-2 px-3 py-2 rounded border text-[12px] font-medium cursor-pointer transition-colors ${
              activeFilter === f.key
                ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] border-[#18181b] dark:border-[#fafafa]"
                : "bg-white dark:bg-[#18181b] text-[#71717a] dark:text-[#a1a1aa] border-[#e4e4e7] dark:border-[#3f3f46] hover:border-[#a1a1aa] dark:hover:border-[#52525b] hover:text-[#18181b] dark:hover:text-[#fafafa]"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${activeFilter === f.key ? "bg-white dark:bg-[#18181b]" : f.dot}`} />
            {f.label}
            <span className={`text-[10px] font-semibold ${activeFilter === f.key ? "text-white/70 dark:text-[#18181b]/70" : "text-[#a1a1aa] dark:text-[#71717a]"}`}>{f.count}</span>
          </button>
        ))}
      </div>

      {/* Summary row */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa]">
          {activeFilter === "all" ? `${leaseData.length} leases` : `${filteredData.length} leases — ${activeFilter}`}
        </p>
        <input
          type="text"
          placeholder="Search..."
          className="px-3 py-1.5 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded text-[12px] text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] focus:outline-none focus:border-[#71717a] w-full sm:w-48"
          onChange={(e) => gridRef.current?.api?.setGridOption("quickFilterText", e.target.value)}
        />
      </div>

      {/* AG Grid */}
      <div className="ag-theme-alpine w-full rounded overflow-auto border border-[#e4e4e7] dark:border-[#3f3f46]" style={{ height: "min(calc(100vh - 260px), 550px)", minHeight: 300 }}>
        <AgGridReact
          ref={gridRef}
          rowData={filteredData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          animateRows={true}
          pagination={true}
          paginationPageSize={500}
          getRowId={(params) => params.data.unit}
        />
      </div>
    </div>
  );
}

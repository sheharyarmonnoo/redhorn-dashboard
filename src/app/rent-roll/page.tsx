"use client";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, GridReadyEvent, RowClickedEvent } from "ag-grid-community";
import { tenants, formatCurrency, getStatusLabel, Tenant } from "@/data/tenants";
import { exportRentRoll } from "@/data/export";
import UnitDetailPanel from "@/components/UnitDetailPanel";
import PageHeader from "@/components/PageHeader";
import { Download } from "lucide-react";

ModuleRegistry.registerModules([AllCommunityModule]);

function StatusCellRenderer(props: { value: string }) {
  const status = props.value;
  const colors: Record<string, string> = {
    current: "bg-emerald-50 text-emerald-700 border-emerald-200",
    past_due: "bg-red-50 text-red-700 border-red-200",
    expiring_soon: "bg-blue-50 text-blue-700 border-blue-200",
    vacant: "bg-gray-100 text-gray-500 border-gray-200",
    locked_out: "bg-amber-50 text-amber-700 border-amber-200",
  };
  const dotColors: Record<string, string> = {
    current: "bg-emerald-500",
    past_due: "bg-red-500",
    expiring_soon: "bg-blue-500",
    vacant: "bg-gray-400",
    locked_out: "bg-amber-500",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${colors[status] || ""}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColors[status] || ""}`} />
      {getStatusLabel(status as Tenant["status"])}
    </span>
  );
}

function CurrencyCellRenderer(props: { value: number }) {
  return <span>{props.value > 0 ? formatCurrency(props.value) : "—"}</span>;
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
  const [selected, setSelected] = useState<Tenant | null>(null);
  const gridRef = useRef<AgGridReact>(null);
  const isMobile = useIsMobile();

  const columnDefs = useMemo<ColDef[]>(() => {
    if (isMobile) {
      // Mobile: show only essential columns
      return [
        { field: "unit", headerName: "Unit", width: 90, pinned: "left", sort: "asc" },
        { field: "tenant", headerName: "Tenant", minWidth: 130, flex: 1,
          valueFormatter: (p: { value: string }) => p.value || "Vacant" },
        { field: "monthlyRent", headerName: "Rent", width: 90, type: "numericColumn",
          cellRenderer: CurrencyCellRenderer },
        { field: "status", headerName: "Status", width: 110, cellRenderer: StatusCellRenderer },
      ];
    }
    // Desktop: full columns
    return [
      { field: "unit", headerName: "Unit", width: 120, pinned: "left", sort: "asc" },
      { field: "tenant", headerName: "Tenant", minWidth: 200, flex: 1,
        valueFormatter: (p: { value: string }) => p.value || "— Vacant —" },
      { field: "leaseType", headerName: "Lease Type", width: 140,
        valueFormatter: (p: { value: string }) => p.value?.replace("Office ", "") || "" },
      { field: "building", headerName: "Bldg", width: 80, filter: true },
      { field: "sqft", headerName: "Sq Ft", width: 100, type: "numericColumn",
        valueFormatter: (p: { value: number }) => p.value?.toLocaleString() || "" },
      { field: "leaseFrom", headerName: "Lease Start", width: 120,
        valueFormatter: (p: { value: string }) => p.value || "—" },
      { field: "leaseTo", headerName: "Lease End", width: 120,
        valueFormatter: (p: { value: string }) => p.value || "—" },
      { field: "monthlyRent", headerName: "Monthly Rent", width: 130, type: "numericColumn",
        cellRenderer: CurrencyCellRenderer },
      { field: "monthlyElectric", headerName: "Electric", width: 100, type: "numericColumn",
        cellRenderer: CurrencyCellRenderer },
      { field: "pastDueAmount", headerName: "Past Due", width: 110, type: "numericColumn",
        cellRenderer: CurrencyCellRenderer },
      { field: "status", headerName: "Status", width: 140, cellRenderer: StatusCellRenderer, filter: true },
    ];
  }, [isMobile]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    suppressMovable: false,
  }), []);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  }, []);

  const onRowClicked = useCallback((event: RowClickedEvent) => {
    setSelected(event.data as Tenant);
  }, []);

  const totalRent = tenants.filter(t => t.status !== "vacant").reduce((s, t) => s + t.monthlyRent, 0);
  const totalSqft = tenants.reduce((s, t) => s + t.sqft, 0);

  return (
    <div>
      <PageHeader title="Rent Roll" subtitle="All units as of March 2026 — Tap any row for details">
        <button onClick={exportRentRoll} className="flex items-center gap-1.5 bg-white border border-[#e8eaef] hover:border-[#4f6ef7] text-[#5a5e73] hover:text-[#4f6ef7] text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
          <Download size={13} /> Export .xlsx
        </button>
      </PageHeader>

      {/* Summary bar */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-4 mb-4 text-[12px]">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="bg-white border border-[#e8eaef] rounded-lg px-3 py-1.5 text-[#1e1e2d] font-semibold whitespace-nowrap">
            {tenants.length} Units
          </span>
          <span className="bg-white border border-[#e8eaef] rounded-lg px-3 py-1.5 text-[#1e1e2d] whitespace-nowrap">
            {totalSqft.toLocaleString()} SF
          </span>
          <span className="bg-white border border-[#e8eaef] rounded-lg px-3 py-1.5 text-emerald-700 font-semibold whitespace-nowrap">
            {formatCurrency(totalRent)}/mo
          </span>
        </div>
        <div className="sm:ml-auto w-full sm:w-auto">
          <input
            type="text"
            placeholder="Quick search all data..."
            className="px-3 py-1.5 bg-white border border-[#e8eaef] rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7] w-full sm:w-64"
            onChange={(e) => {
              gridRef.current?.api?.setGridOption("quickFilterText", e.target.value);
            }}
          />
        </div>
      </div>

      {/* AG Grid Table */}
      <div className="ag-theme-alpine w-full rounded-2xl overflow-hidden border border-[#e8eaef] shadow-[0_1px_3px_rgba(0,0,0,0.04)]" style={{ height: "min(calc(100vh - 220px), 700px)", minHeight: 350 }}>
        <AgGridReact
          ref={gridRef}
          rowData={tenants}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          onRowClicked={onRowClicked}
          rowSelection="single"
          animateRows={true}
          pagination={true}
          paginationAutoPageSize={false}
          paginationPageSize={500}
          suppressRowHoverHighlight={false}
          rowBuffer={20}
          cacheBlockSize={500}
          getRowId={(params) => params.data.unit}
        />
      </div>

      <UnitDetailPanel tenant={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

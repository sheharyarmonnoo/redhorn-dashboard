"use client";
import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, GridReadyEvent } from "ag-grid-community";
import { tenants, formatCurrency } from "@/data/tenants";
import PageHeader from "@/components/PageHeader";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

ModuleRegistry.registerModules([AllCommunityModule]);

const now = new Date("2026-03-15");

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

function UrgencyCellRenderer(props: { value: string }) {
  const colors: Record<string, string> = {
    "Expired": "bg-red-100 text-red-700 border-red-200",
    "Critical (<90d)": "bg-red-50 text-red-600 border-red-200",
    "Warning (90-180d)": "bg-amber-50 text-amber-700 border-amber-200",
    "OK (180d+)": "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${colors[props.value] || ""}`}>
      {props.value}
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

export default function LeasesPage() {
  const gridRef = useRef<AgGridReact>(null);
  const isMobile = useIsMobile();

  const leaseData = useMemo(() => {
    return tenants
      .filter(t => t.leaseTo && t.tenant && !t.tenant.includes("Owner"))
      .map(t => ({
        ...t,
        urgency: getUrgency(t.leaseTo),
        daysLeft: daysUntil(t.leaseTo),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, []);

  const expired = leaseData.filter(t => t.urgency === "Expired").length;
  const critical = leaseData.filter(t => t.urgency === "Critical (<90d)").length;
  const warning = leaseData.filter(t => t.urgency === "Warning (90-180d)").length;
  const ok = leaseData.filter(t => t.urgency === "OK (180d+)").length;

  const columnDefs = useMemo<ColDef[]>(() => {
    if (isMobile) {
      return [
        { field: "unit", headerName: "Unit", width: 90, sort: "asc" },
        { field: "tenant", headerName: "Tenant", minWidth: 120, flex: 1 },
        { field: "daysLeft", headerName: "Days", width: 70, type: "numericColumn",
          cellRenderer: (p: { value: number }) => (
            <span className={`font-semibold text-[12px] ${p.value <= 0 ? "text-red-600" : p.value <= 90 ? "text-red-500" : p.value <= 180 ? "text-amber-500" : "text-emerald-600"}`}>
              {p.value <= 0 ? "EXP" : `${p.value}d`}
            </span>
          )},
        { field: "urgency", headerName: "Urgency", width: 120, cellRenderer: UrgencyCellRenderer },
      ];
    }
    return [
      { field: "unit", headerName: "Unit", width: 110, sort: "asc" },
      { field: "tenant", headerName: "Tenant", minWidth: 180, flex: 1 },
      { field: "building", headerName: "Bldg", width: 70 },
      { field: "sqft", headerName: "Sq Ft", width: 90, type: "numericColumn",
        valueFormatter: (p: { value: number }) => p.value?.toLocaleString() || "" },
      { field: "leaseFrom", headerName: "Start", width: 110 },
      { field: "leaseTo", headerName: "End", width: 110 },
      { field: "daysLeft", headerName: "Days Left", width: 100, type: "numericColumn",
        cellRenderer: (p: { value: number }) => (
          <span className={`font-semibold ${p.value <= 0 ? "text-red-600" : p.value <= 90 ? "text-red-500" : p.value <= 180 ? "text-amber-500" : "text-emerald-600"}`}>
            {p.value <= 0 ? "EXPIRED" : `${p.value}d`}
          </span>
        )},
      { field: "monthlyRent", headerName: "Rent/Mo", width: 110, type: "numericColumn",
        valueFormatter: (p: { value: number }) => p.value > 0 ? formatCurrency(p.value) : "—" },
      { field: "urgency", headerName: "Urgency", width: 150, cellRenderer: UrgencyCellRenderer, filter: true },
    ];
  }, [isMobile]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true, resizable: true, filter: true,
  }), []);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  }, []);

  // Timeline chart
  const timelineOptions: ApexCharts.ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "60%" } },
    colors: ["#ef4444", "#ef4444", "#f59e0b", "#10b981"],
    xaxis: { categories: ["Expired", "Critical (<90d)", "Warning (90-180d)", "OK (180d+)"],
      labels: { style: { colors: "#8b8fa3", fontSize: "11px" } } },
    yaxis: { labels: { style: { colors: "#8b8fa3", fontSize: "11px" } } },
    grid: { borderColor: "#f0f0f5" },
    dataLabels: { enabled: true, style: { fontSize: "12px", fontWeight: "bold" } },
    legend: { show: false },
    tooltip: { enabled: false },
  };

  const timelineSeries = [{
    name: "Leases",
    data: [
      { x: "Expired", y: expired, fillColor: "#ef4444" },
      { x: "Critical (<90d)", y: critical, fillColor: "#f87171" },
      { x: "Warning (90-180d)", y: warning, fillColor: "#f59e0b" },
      { x: "OK (180d+)", y: ok, fillColor: "#10b981" },
    ],
  }];

  return (
    <div>
      <PageHeader title="Lease Expiration Timeline" subtitle="Renewal pipeline — as of March 15, 2026" />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Expired", value: expired, bg: "bg-red-50", border: "border-red-200", text: "text-red-500", sub: "text-red-400" },
          { label: "Critical (<90d)", value: critical, bg: "bg-red-50/50", border: "border-red-200", text: "text-red-400", sub: "text-red-300" },
          { label: "Warning (90-180d)", value: warning, bg: "bg-amber-50/50", border: "border-amber-200", text: "text-amber-500", sub: "text-amber-400" },
          { label: "OK (180d+)", value: ok, bg: "bg-emerald-50/50", border: "border-emerald-200", text: "text-emerald-600", sub: "text-emerald-400" },
        ].map(c => (
          <div key={c.label} className={`${c.bg} border ${c.border} rounded-xl p-3 sm:p-4 text-center shadow-sm`}>
            <p className={`text-2xl sm:text-3xl font-bold ${c.text}`}>{c.value}</p>
            <p className={`text-[11px] ${c.sub}`}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e8eaef] mb-6">
        <h3 className="text-[14px] font-bold text-[#1e1e2d] mb-2">Expiration Distribution</h3>
        <Chart options={timelineOptions} series={timelineSeries} type="bar" height={180} />
      </div>

      {/* AG Grid */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-bold text-[#1e1e2d]">All Leases</h3>
        <input
          type="text"
          placeholder="Search leases..."
          className="px-3 py-1.5 bg-white border border-[#e8eaef] rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#4f6ef7] w-48 sm:w-64"
          onChange={(e) => {
            gridRef.current?.api?.setGridOption("quickFilterText", e.target.value);
          }}
        />
      </div>
      <div className="ag-theme-alpine w-full rounded-2xl overflow-hidden border border-[#e8eaef] shadow-[0_1px_3px_rgba(0,0,0,0.04)]" style={{ height: 420 }}>
        <AgGridReact
          ref={gridRef}
          rowData={leaseData}
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

"use client";
import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, GridReadyEvent } from "ag-grid-community";
import { tenants, ledgerA102, monthlyRevenue, formatCurrency } from "@/data/tenants";
import { exportRentRoll, exportLeaseLedger, exportIncomeStatement, exportAlerts, exportFullPackage } from "@/data/export";
import PageHeader from "@/components/PageHeader";
import { Download, Database, FileSpreadsheet, ArrowRight, CheckCircle2, Clock, AlertCircle } from "lucide-react";

ModuleRegistry.registerModules([AllCommunityModule]);

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

// Last 10 file sync history
const fileSyncHistory = [
  { id: 1, filename: "RentRoll03_12_2026.xlsx", source: "Yardi", type: "Rent Roll", records: 52, size: "13.3 KB", status: "Success", syncedAt: "2026-03-12 09:15:22", syncedBy: "Auto" },
  { id: 2, filename: "LeaseLedger03_12_2026.xlsx", source: "Yardi", type: "Lease Ledger", records: 48, size: "14.0 KB", status: "Success", syncedAt: "2026-03-12 09:15:18", syncedBy: "Auto" },
  { id: 3, filename: "IncomeStatement03_12_2026.xlsx", source: "Yardi", type: "Income Statement", records: 9, size: "12.1 KB", status: "Success", syncedAt: "2026-03-12 09:14:55", syncedBy: "Auto" },
  { id: 4, filename: "RentRoll03_01_2026.xlsx", source: "Yardi", type: "Rent Roll", records: 52, size: "13.1 KB", status: "Success", syncedAt: "2026-03-01 08:30:10", syncedBy: "Manual" },
  { id: 5, filename: "LeaseLedger03_01_2026.xlsx", source: "Yardi", type: "Lease Ledger", records: 45, size: "13.8 KB", status: "Success", syncedAt: "2026-03-01 08:29:45", syncedBy: "Manual" },
  { id: 6, filename: "IncomeStatement02_2026.xlsx", source: "Yardi", type: "Income Statement", records: 8, size: "11.9 KB", status: "Success", syncedAt: "2026-02-28 14:22:33", syncedBy: "Auto" },
  { id: 7, filename: "ElectricBilling_Feb2026.pdf", source: "CenterPoint", type: "Utility Bill", records: 1, size: "284 KB", status: "Warning", syncedAt: "2026-02-15 10:05:12", syncedBy: "Manual" },
  { id: 8, filename: "RentRoll02_01_2026.xlsx", source: "Yardi", type: "Rent Roll", records: 52, size: "13.0 KB", status: "Success", syncedAt: "2026-02-01 08:30:08", syncedBy: "Auto" },
  { id: 9, filename: "LeaseLedger02_01_2026.xlsx", source: "Yardi", type: "Lease Ledger", records: 42, size: "13.5 KB", status: "Success", syncedAt: "2026-02-01 08:29:40", syncedBy: "Auto" },
  { id: 10, filename: "CAM_Reconciliation_2025.xlsx", source: "Yardi", type: "CAM Recon", records: 35, size: "28.4 KB", status: "Failed", syncedAt: "2026-01-15 11:44:00", syncedBy: "Manual" },
];

function StatusBadge(props: { value: string }) {
  const v = props.value;
  if (v === "Success") return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"><CheckCircle2 size={11} /> Success</span>;
  if (v === "Warning") return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"><AlertCircle size={11} /> Warning</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full"><AlertCircle size={11} /> Failed</span>;
}

type ActiveTab = "rent-roll" | "ledger" | "income";

export default function DataPipelinePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("rent-roll");
  const gridRef = useRef<AgGridReact>(null);
  const fileGridRef = useRef<AgGridReact>(null);
  const isMobile = useIsMobile();

  // --- File Sync History columns ---
  const fileSyncCols = useMemo<ColDef[]>(() => {
    if (isMobile) {
      return [
        { field: "filename", headerName: "File", minWidth: 140, flex: 1,
          cellRenderer: (p: { value: string; data: typeof fileSyncHistory[0] }) => (
            <div className="leading-tight py-1">
              <p className="text-[12px] font-medium text-[#1e1e2d] truncate">{p.value}</p>
              <p className="text-[10px] text-[#8b8fa3]">{p.data.type} · {p.data.size}</p>
            </div>
          )},
        { field: "syncedAt", headerName: "Synced", width: 100,
          valueFormatter: (p: { value: string }) => p.value?.slice(5, 10) || "" },
        { field: "status", headerName: "Status", width: 95, cellRenderer: StatusBadge },
      ];
    }
    return [
      { field: "filename", headerName: "Filename", minWidth: 220, flex: 1 },
      { field: "source", headerName: "Source", width: 100 },
      { field: "type", headerName: "Type", width: 130 },
      { field: "records", headerName: "Records", width: 85, type: "numericColumn" },
      { field: "size", headerName: "Size", width: 85 },
      { field: "syncedAt", headerName: "Synced At", width: 160 },
      { field: "syncedBy", headerName: "By", width: 80 },
      { field: "status", headerName: "Status", width: 110, cellRenderer: StatusBadge },
    ];
  }, [isMobile]);

  // --- Rent Roll columns ---
  const rentRollCols = useMemo<ColDef[]>(() => {
    if (isMobile) {
      return [
        { field: "unit", headerName: "Unit", width: 75 },
        { field: "tenant", headerName: "Tenant", flex: 1, valueFormatter: (p: { value: string }) => p.value || "Vacant" },
        { field: "monthlyRent", headerName: "Rent", width: 90, type: "numericColumn",
          valueFormatter: (p: { value: number }) => p.value > 0 ? formatCurrency(p.value) : "—" },
        { field: "status", headerName: "Status", width: 100,
          valueFormatter: (p: { value: string }) => p.value?.replace("_", " ").toUpperCase() || "" },
      ];
    }
    return [
      { field: "unit", headerName: "Unit", width: 80 },
      { field: "building", headerName: "Bldg", width: 65 },
      { field: "tenant", headerName: "Tenant", minWidth: 180, flex: 1, valueFormatter: (p: { value: string }) => p.value || "(Vacant)" },
      { field: "leaseType", headerName: "Lease Type", width: 130, valueFormatter: (p: { value: string }) => p.value?.replace("Office ", "") || "" },
      { field: "sqft", headerName: "Sq Ft", width: 80, type: "numericColumn", valueFormatter: (p: { value: number }) => p.value?.toLocaleString() || "" },
      { field: "leaseFrom", headerName: "Start", width: 100 },
      { field: "leaseTo", headerName: "End", width: 100 },
      { field: "monthlyRent", headerName: "Rent", width: 100, type: "numericColumn", valueFormatter: (p: { value: number }) => p.value > 0 ? formatCurrency(p.value) : "—" },
      { field: "monthlyElectric", headerName: "Electric", width: 85, type: "numericColumn", valueFormatter: (p: { value: number }) => p.value > 0 ? formatCurrency(p.value) : "—" },
      { field: "securityDeposit", headerName: "Deposit", width: 90, type: "numericColumn", valueFormatter: (p: { value: number }) => p.value > 0 ? formatCurrency(p.value) : "—" },
      { field: "status", headerName: "Status", width: 110, valueFormatter: (p: { value: string }) => p.value?.replace("_", " ").toUpperCase() || "" },
      { field: "pastDueAmount", headerName: "Past Due", width: 90, type: "numericColumn", valueFormatter: (p: { value: number }) => p.value > 0 ? formatCurrency(p.value) : "" },
      { field: "electricPosted", headerName: "Elec Posted", width: 95, valueFormatter: (p: { value: boolean }) => p.value ? "Yes" : "No" },
      { field: "lastPaymentDate", headerName: "Last Pay", width: 100 },
      { field: "notes", headerName: "Notes", minWidth: 200, flex: 1 },
    ];
  }, [isMobile]);

  // --- Ledger columns ---
  const ledgerCols = useMemo<ColDef[]>(() => {
    if (isMobile) {
      return [
        { field: "date", headerName: "Date", width: 95 },
        { field: "description", headerName: "Description", flex: 1 },
        { field: "charge", headerName: "Chg", width: 75, type: "numericColumn", valueFormatter: (p: { value: number }) => p.value > 0 ? formatCurrency(p.value) : "" },
        { field: "payment", headerName: "Pay", width: 75, type: "numericColumn", valueFormatter: (p: { value: number }) => p.value > 0 ? formatCurrency(p.value) : "" },
      ];
    }
    return [
      { field: "date", headerName: "Date", width: 110 },
      { field: "description", headerName: "Description", minWidth: 280, flex: 1 },
      { field: "unit", headerName: "Unit", width: 70 },
      { field: "charge", headerName: "Charge", width: 100, type: "numericColumn", valueFormatter: (p: { value: number }) => p.value > 0 ? formatCurrency(p.value) : "" },
      { field: "payment", headerName: "Payment", width: 100, type: "numericColumn", valueFormatter: (p: { value: number }) => p.value > 0 ? formatCurrency(p.value) : "" },
      { field: "balance", headerName: "Balance", width: 100, type: "numericColumn", valueFormatter: (p: { value: number }) => formatCurrency(p.value) },
      { field: "type", headerName: "Type", width: 90 },
    ];
  }, [isMobile]);

  // --- Income columns ---
  const incomeCols = useMemo<ColDef[]>(() => {
    if (isMobile) {
      return [
        { field: "month", headerName: "Month", width: 85 },
        { field: "rent", headerName: "Rent", width: 90, type: "numericColumn", valueFormatter: (p: { value: number }) => formatCurrency(p.value) },
        { field: "total", headerName: "Total", width: 90, type: "numericColumn", valueFormatter: (p: { value: number }) => formatCurrency(p.value) },
        { field: "occupancy", headerName: "Occ%", width: 65, valueFormatter: (p: { value: number }) => `${p.value}%` },
      ];
    }
    return [
      { field: "month", headerName: "Month", width: 100 },
      { field: "rent", headerName: "Base Rent", width: 110, type: "numericColumn", valueFormatter: (p: { value: number }) => formatCurrency(p.value) },
      { field: "cam", headerName: "CAM", width: 90, type: "numericColumn", valueFormatter: (p: { value: number }) => formatCurrency(p.value) },
      { field: "electric", headerName: "Electric", width: 100, type: "numericColumn", valueFormatter: (p: { value: number }) => formatCurrency(p.value) },
      { field: "lateFees", headerName: "Late Fees", width: 100, type: "numericColumn", valueFormatter: (p: { value: number }) => formatCurrency(p.value) },
      { field: "total", headerName: "Total", width: 110, type: "numericColumn", valueFormatter: (p: { value: number }) => formatCurrency(p.value) },
      { field: "occupancy", headerName: "Occupancy", width: 100, valueFormatter: (p: { value: number }) => `${p.value}%` },
    ];
  }, [isMobile]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true, resizable: true, filter: true,
  }), []);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  }, []);

  const tabs: { key: ActiveTab; label: string; count: number; exportFn: () => void }[] = [
    { key: "rent-roll", label: "Rent Roll", count: tenants.length, exportFn: exportRentRoll },
    { key: "ledger", label: "Lease Ledger (A-102)", count: ledgerA102.length, exportFn: exportLeaseLedger },
    { key: "income", label: "Income Statement", count: monthlyRevenue.length, exportFn: exportIncomeStatement },
  ];

  const activeTabInfo = tabs.find(t => t.key === activeTab)!;

  function getRowData() {
    switch (activeTab) {
      case "rent-roll": return tenants;
      case "ledger": return ledgerA102;
      case "income": return monthlyRevenue;
    }
  }

  function getColDefs() {
    switch (activeTab) {
      case "rent-roll": return rentRollCols;
      case "ledger": return ledgerCols;
      case "income": return incomeCols;
    }
  }

  const successCount = fileSyncHistory.filter(f => f.status === "Success").length;
  const failedCount = fileSyncHistory.filter(f => f.status !== "Success").length;

  return (
    <div>
      <PageHeader title="Data Pipeline" subtitle="Single source of truth — raw Yardi data feeds with Excel export">
        <button
          onClick={exportFullPackage}
          className="flex items-center gap-2 bg-[#4f6ef7] hover:bg-[#3b5ce4] text-white text-[12px] font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer shadow-sm"
        >
          <Download size={14} />
          Export All
        </button>
      </PageHeader>

      {/* Data Flow Diagram */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#e8eaef] shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-5">
        <h3 className="text-[13px] font-bold text-[#1e1e2d] mb-3">Data Flow</h3>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px]">
          <span className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg font-semibold">Yardi Voyager</span>
          <ArrowRight size={14} className="text-gray-300 hidden sm:block" />
          <span className="text-gray-300 sm:hidden">→</span>
          <span className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg font-semibold">CSV / Excel</span>
          <ArrowRight size={14} className="text-gray-300 hidden sm:block" />
          <span className="text-gray-300 sm:hidden">→</span>
          <span className="bg-purple-50 border border-purple-200 text-purple-700 px-3 py-1.5 rounded-lg font-semibold">Pipeline</span>
          <ArrowRight size={14} className="text-gray-300 hidden sm:block" />
          <span className="text-gray-300 sm:hidden">→</span>
          <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg font-semibold">Dashboard</span>
        </div>
        <p className="text-[11px] text-[#8b8fa3] mt-3">Last sync: March 12, 2026 · Next: Automated via Python + Playwright (planned)</p>
      </div>

      {/* Last 10 Files — AG Grid */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-[#4f6ef7]" />
          <h3 className="text-[14px] font-bold text-[#1e1e2d]">Last 10 File Syncs</h3>
          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md font-semibold">{successCount} OK</span>
          {failedCount > 0 && <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-md font-semibold">{failedCount} Issues</span>}
        </div>
        <input
          type="text"
          placeholder="Search files..."
          className="px-3 py-1.5 bg-white border border-[#e8eaef] rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#4f6ef7] w-full sm:w-48"
          onChange={(e) => fileGridRef.current?.api?.setGridOption("quickFilterText", e.target.value)}
        />
      </div>
      <div className="ag-theme-alpine w-full rounded-2xl overflow-hidden border border-[#e8eaef] shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6" style={{ height: isMobile ? 320 : 380 }}>
        <AgGridReact
          ref={fileGridRef}
          rowData={fileSyncHistory}
          columnDefs={fileSyncCols}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          animateRows={true}
          pagination={true}
          paginationPageSize={10}
          getRowId={(params) => String(params.data.id)}
        />
      </div>

      {/* Raw Data Feed Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 text-[11px] sm:text-[12px] font-medium px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl border transition-colors cursor-pointer ${
              activeTab === tab.key
                ? "bg-[#4f6ef7] text-white border-[#4f6ef7] shadow-sm"
                : "bg-white text-[#5a5e73] border-[#e8eaef] hover:border-[#4f6ef7] hover:text-[#4f6ef7]"
            }`}
          >
            <Database size={12} />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
              activeTab === tab.key ? "bg-white/20" : "bg-gray-100"
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Active Feed Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={16} className="text-[#4f6ef7]" />
          <h3 className="text-[14px] font-bold text-[#1e1e2d]">{activeTabInfo.label}</h3>
          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md font-semibold">RAW DATA</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search..."
            className="px-3 py-1.5 bg-white border border-[#e8eaef] rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#4f6ef7] w-full sm:w-48"
            onChange={(e) => gridRef.current?.api?.setGridOption("quickFilterText", e.target.value)}
          />
          <button
            onClick={activeTabInfo.exportFn}
            className="flex items-center gap-1.5 bg-white border border-[#e8eaef] hover:border-[#4f6ef7] text-[#5a5e73] hover:text-[#4f6ef7] text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download size={13} />
            <span className="hidden sm:inline">Download .xlsx</span>
            <span className="sm:hidden">.xlsx</span>
          </button>
        </div>
      </div>

      {/* AG Grid — Raw Data */}
      <div className="ag-theme-alpine w-full rounded-2xl overflow-hidden border border-[#e8eaef] shadow-[0_1px_3px_rgba(0,0,0,0.04)]" style={{ height: "min(calc(100vh - 420px), 500px)", minHeight: 280 }}>
        <AgGridReact
          ref={gridRef}
          key={activeTab}
          rowData={getRowData()}
          columnDefs={getColDefs()}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          animateRows={true}
          pagination={true}
          paginationPageSize={500}
        />
      </div>

      {/* Quick Downloads */}
      <div className="mt-5 bg-white rounded-2xl p-4 sm:p-5 border border-[#e8eaef] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="text-[13px] font-bold text-[#1e1e2d] mb-3">Quick Downloads</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Rent Roll", desc: `${tenants.length} units`, fn: exportRentRoll },
            { label: "Lease Ledger", desc: "A-102 transactions", fn: exportLeaseLedger },
            { label: "Income Statement", desc: "9-month P&L", fn: exportIncomeStatement },
            { label: "Full Package", desc: "All sheets", fn: exportFullPackage },
          ].map(dl => (
            <button
              key={dl.label}
              onClick={dl.fn}
              className="flex items-center gap-3 bg-gray-50 hover:bg-[#eef1fe] border border-gray-200 hover:border-[#4f6ef7] rounded-xl p-3 sm:p-4 text-left transition-colors cursor-pointer group"
            >
              <div className="p-2 bg-white rounded-lg shadow-sm group-hover:shadow">
                <FileSpreadsheet size={16} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-[#1e1e2d]">{dl.label}</p>
                <p className="text-[10px] text-[#8b8fa3]">{dl.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

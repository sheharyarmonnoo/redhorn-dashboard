"use client";
import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, GridReadyEvent } from "ag-grid-community";
import { tenants, ledgerA102, monthlyRevenue, formatCurrency } from "@/data/tenants";
import { exportRentRoll, exportLeaseLedger, exportIncomeStatement, exportAlerts, exportFullPackage } from "@/data/export";
import PageHeader from "@/components/PageHeader";
import { Download, Database, FileSpreadsheet, ArrowRight } from "lucide-react";

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

type ActiveTab = "rent-roll" | "ledger" | "income";

export default function DataPipelinePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("rent-roll");
  const gridRef = useRef<AgGridReact>(null);
  const isMobile = useIsMobile();

  // Rent Roll columns — show ALL fields as raw data
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

  // Ledger columns
  const ledgerCols = useMemo<ColDef[]>(() => {
    if (isMobile) {
      return [
        { field: "date", headerName: "Date", width: 95 },
        { field: "description", headerName: "Description", flex: 1 },
        { field: "charge", headerName: "Charge", width: 80, type: "numericColumn", valueFormatter: (p: { value: number }) => p.value > 0 ? formatCurrency(p.value) : "" },
        { field: "payment", headerName: "Pay", width: 80, type: "numericColumn", valueFormatter: (p: { value: number }) => p.value > 0 ? formatCurrency(p.value) : "" },
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

  // Income columns
  const incomeCols = useMemo<ColDef[]>(() => [
    { field: "month", headerName: "Month", width: 100 },
    { field: "rent", headerName: "Base Rent", width: 110, type: "numericColumn", valueFormatter: (p: { value: number }) => formatCurrency(p.value) },
    { field: "cam", headerName: "CAM", width: 90, type: "numericColumn", valueFormatter: (p: { value: number }) => formatCurrency(p.value) },
    { field: "electric", headerName: "Electric", width: 100, type: "numericColumn", valueFormatter: (p: { value: number }) => formatCurrency(p.value) },
    { field: "lateFees", headerName: "Late Fees", width: 100, type: "numericColumn", valueFormatter: (p: { value: number }) => formatCurrency(p.value) },
    { field: "total", headerName: "Total", width: 110, type: "numericColumn", valueFormatter: (p: { value: number }) => formatCurrency(p.value) },
    { field: "occupancy", headerName: "Occupancy", width: 100, valueFormatter: (p: { value: number }) => `${p.value}%` },
  ], []);

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

  return (
    <div>
      <PageHeader title="Data Pipeline" subtitle="Single source of truth — raw Yardi data feeds with Excel export">
        <button
          onClick={exportFullPackage}
          className="flex items-center gap-2 bg-[#4f6ef7] hover:bg-[#3b5ce4] text-white text-[12px] font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer shadow-sm"
        >
          <Download size={14} />
          Export All (.xlsx)
        </button>
      </PageHeader>

      {/* Data Flow Diagram */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-[#e8eaef] shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
        <h3 className="text-[13px] font-bold text-[#1e1e2d] mb-4">Data Flow</h3>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px]">
          <span className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg font-semibold">Yardi Voyager</span>
          <ArrowRight size={14} className="text-gray-300" />
          <span className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg font-semibold">CSV / Excel Export</span>
          <ArrowRight size={14} className="text-gray-300" />
          <span className="bg-purple-50 border border-purple-200 text-purple-700 px-3 py-1.5 rounded-lg font-semibold">Data Pipeline</span>
          <ArrowRight size={14} className="text-gray-300" />
          <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg font-semibold">Dashboard</span>
        </div>
        <p className="text-[11px] text-[#8b8fa3] mt-3">Last sync: March 12, 2026 · Next: Automated via Python + Playwright (planned)</p>
      </div>

      {/* Feed Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 text-[12px] font-medium px-3 py-2 rounded-xl border transition-colors cursor-pointer ${
              activeTab === tab.key
                ? "bg-[#4f6ef7] text-white border-[#4f6ef7] shadow-sm"
                : "bg-white text-[#5a5e73] border-[#e8eaef] hover:border-[#4f6ef7] hover:text-[#4f6ef7]"
            }`}
          >
            <Database size={13} />
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                activeTab === tab.key ? "bg-white/20" : "bg-gray-100"
              }`}>{tab.count}</span>
            )}
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
            Download .xlsx
          </button>
        </div>
      </div>

      {/* AG Grid — Raw Data */}
      <div className="ag-theme-alpine w-full rounded-2xl overflow-hidden border border-[#e8eaef] shadow-[0_1px_3px_rgba(0,0,0,0.04)]" style={{ height: "min(calc(100vh - 420px), 550px)", minHeight: 300 }}>
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
      <div className="mt-6 bg-white rounded-2xl p-4 sm:p-6 border border-[#e8eaef] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="text-[13px] font-bold text-[#1e1e2d] mb-4">Quick Downloads</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Rent Roll", desc: `${tenants.length} units · All buildings`, fn: exportRentRoll },
            { label: "Lease Ledger", desc: "A-102 · Full transaction history", fn: exportLeaseLedger },
            { label: "Income Statement", desc: "9-month P&L by category", fn: exportIncomeStatement },
            { label: "Full Package", desc: "All sheets in one workbook", fn: exportFullPackage },
          ].map(dl => (
            <button
              key={dl.label}
              onClick={dl.fn}
              className="flex items-center gap-3 bg-gray-50 hover:bg-[#eef1fe] border border-gray-200 hover:border-[#4f6ef7] rounded-xl p-4 text-left transition-colors cursor-pointer group"
            >
              <div className="p-2 bg-white rounded-lg shadow-sm group-hover:shadow">
                <FileSpreadsheet size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[#1e1e2d]">{dl.label}</p>
                <p className="text-[10px] text-[#8b8fa3]">{dl.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";
import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, GridReadyEvent } from "ag-grid-community";
import { exportRentRoll, exportLeaseLedger, exportIncomeStatement, exportFullPackage } from "@/data/export";
import PageHeader from "@/components/PageHeader";
import { Download } from "lucide-react";

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

const exportMap: Record<string, () => void> = {
  "Rent Roll": exportRentRoll,
  "Lease Ledger": exportLeaseLedger,
  "Income Statement": exportIncomeStatement,
  "CAM Recon": exportFullPackage,
  "Utility Bill": exportFullPackage,
};

const fileSyncHistory = [
  { id: 1, filename: "RentRoll03_12_2026.xlsx", source: "Yardi", type: "Rent Roll", records: 52, size: "13.3 KB", status: "Success", syncedAt: "2026-03-12 09:15" },
  { id: 2, filename: "LeaseLedger03_12_2026.xlsx", source: "Yardi", type: "Lease Ledger", records: 48, size: "14.0 KB", status: "Success", syncedAt: "2026-03-12 09:15" },
  { id: 3, filename: "IncomeStatement03_12_2026.xlsx", source: "Yardi", type: "Income Statement", records: 9, size: "12.1 KB", status: "Success", syncedAt: "2026-03-12 09:14" },
  { id: 4, filename: "RentRoll03_01_2026.xlsx", source: "Yardi", type: "Rent Roll", records: 52, size: "13.1 KB", status: "Success", syncedAt: "2026-03-01 08:30" },
  { id: 5, filename: "LeaseLedger03_01_2026.xlsx", source: "Yardi", type: "Lease Ledger", records: 45, size: "13.8 KB", status: "Success", syncedAt: "2026-03-01 08:29" },
  { id: 6, filename: "IncomeStatement02_2026.xlsx", source: "Yardi", type: "Income Statement", records: 8, size: "11.9 KB", status: "Success", syncedAt: "2026-02-28 14:22" },
  { id: 7, filename: "ElectricBilling_Feb2026.pdf", source: "CenterPoint", type: "Utility Bill", records: 1, size: "284 KB", status: "Warning", syncedAt: "2026-02-15 10:05" },
  { id: 8, filename: "RentRoll02_01_2026.xlsx", source: "Yardi", type: "Rent Roll", records: 52, size: "13.0 KB", status: "Success", syncedAt: "2026-02-01 08:30" },
  { id: 9, filename: "LeaseLedger02_01_2026.xlsx", source: "Yardi", type: "Lease Ledger", records: 42, size: "13.5 KB", status: "Success", syncedAt: "2026-02-01 08:29" },
  { id: 10, filename: "CAM_Reconciliation_2025.xlsx", source: "Yardi", type: "CAM Recon", records: 35, size: "28.4 KB", status: "Failed", syncedAt: "2026-01-15 11:44" },
];

function StatusCell(props: { value: string }) {
  const v = props.value;
  if (v === "Success") return <span className="text-[11px] font-medium text-[#16a34a]">Success</span>;
  if (v === "Warning") return <span className="text-[11px] font-medium text-[#d97706]">Warning</span>;
  return <span className="text-[11px] font-medium text-[#dc2626]">Failed</span>;
}

function DownloadCell(props: { data: typeof fileSyncHistory[0] }) {
  const fn = exportMap[props.data.type] || exportFullPackage;
  return (
    <button onClick={fn} className="text-[#71717a] hover:text-[#18181b] transition-colors cursor-pointer p-1" title={`Download ${props.data.filename}`}>
      <Download size={14} />
    </button>
  );
}

export default function DataPipelinePage() {
  const gridRef = useRef<AgGridReact>(null);
  const isMobile = useIsMobile();

  const columnDefs = useMemo<ColDef[]>(() => {
    if (isMobile) {
      return [
        { field: "filename", headerName: "File", minWidth: 150, flex: 1,
          cellRenderer: (p: { value: string; data: typeof fileSyncHistory[0] }) => (
            <div className="leading-tight py-1">
              <p className="text-[12px] font-medium text-[#18181b] truncate">{p.value}</p>
              <p className="text-[10px] text-[#a1a1aa]">{p.data.type} · {p.data.size}</p>
            </div>
          )},
        { field: "syncedAt", headerName: "Updated", width: 100,
          valueFormatter: (p: { value: string }) => p.value?.slice(5, 10) || "" },
        { field: "status", headerName: "Status", width: 80, cellRenderer: StatusCell },
        { headerName: "", width: 50, cellRenderer: DownloadCell, sortable: false, filter: false },
      ];
    }
    return [
      { field: "filename", headerName: "Filename", minWidth: 240, flex: 1 },
      { field: "source", headerName: "Source", width: 100 },
      { field: "type", headerName: "Type", width: 140 },
      { field: "records", headerName: "Records", width: 90, type: "numericColumn" },
      { field: "size", headerName: "Size", width: 90 },
      { field: "syncedAt", headerName: "Last Updated", width: 150 },
      { field: "status", headerName: "Status", width: 90, cellRenderer: StatusCell },
      { headerName: "", width: 60, cellRenderer: DownloadCell, sortable: false, filter: false },
    ];
  }, [isMobile]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true, resizable: true, filter: true,
  }), []);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  }, []);

  return (
    <div>
      <PageHeader title="Data Pipeline" subtitle="File sync history — download any report">
        <button onClick={exportFullPackage}
          className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 bg-[#18181b] text-white rounded hover:bg-[#27272a] transition-colors cursor-pointer">
          <Download size={13} /> Export All
        </button>
      </PageHeader>

      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-[#71717a]">{fileSyncHistory.length} files · Last sync Mar 12, 2026</p>
        <input
          type="text"
          placeholder="Search files..."
          className="px-3 py-1.5 bg-white border border-[#e4e4e7] rounded text-[12px] text-[#18181b] placeholder-[#a1a1aa] focus:outline-none focus:border-[#71717a] w-full sm:w-48"
          onChange={(e) => gridRef.current?.api?.setGridOption("quickFilterText", e.target.value)}
        />
      </div>

      <div className="ag-theme-alpine w-full rounded overflow-hidden border border-[#e4e4e7]" style={{ height: isMobile ? 450 : 480 }}>
        <AgGridReact
          ref={gridRef}
          rowData={fileSyncHistory}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          animateRows={true}
          pagination={true}
          paginationPageSize={10}
          getRowId={(params) => String(params.data.id)}
        />
      </div>
    </div>
  );
}

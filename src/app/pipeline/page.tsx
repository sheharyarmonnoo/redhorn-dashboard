"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef } from "ag-grid-community";
import PageHeader from "@/components/PageHeader";
import Drawer from "@/components/Drawer";

ModuleRegistry.registerModules([AllCommunityModule]);

interface SyncRecord {
  id: string;
  fileName: string;
  source: string;
  lastSync: string;
  status: "synced" | "pending" | "error";
  affectedUnits: number;
}

interface ApprovalItem {
  id: string;
  unit: string;
  field: string;
  oldValue: string;
  newValue: string;
  source: string;
  timestamp: string;
  status: "pending" | "approved" | "rejected";
}

interface ScheduledTrigger {
  id: string;
  name: string;
  schedule: string;
  lastRun: string;
  nextRun: string;
  status: "active" | "paused";
}

const WORKFLOW_STEPS = [
  { label: "File Upload", desc: "CSV/XLSX files uploaded or synced" },
  { label: "Format Detection", desc: "Auto-detect Yardi, AppFolio, manual" },
  { label: "Field Mapping", desc: "Map columns to schema fields" },
  { label: "Validation", desc: "Check data types, ranges, duplicates" },
  { label: "Approval Queue", desc: "PM reviews changes before apply" },
  { label: "Apply & Log", desc: "Write to dataset, create audit log" },
];

const MOCK_SYNCS: SyncRecord[] = [
  { id: "s1", fileName: "RentRoll_Mar2026.xlsx", source: "Yardi Export", lastSync: "2026-03-15 09:12", status: "synced", affectedUnits: 52 },
  { id: "s2", fileName: "Ledger_A102_Mar2026.csv", source: "Yardi Export", lastSync: "2026-03-15 09:12", status: "synced", affectedUnits: 1 },
  { id: "s3", fileName: "ElectricBills_Mar2026.pdf", source: "CenterPoint Energy", lastSync: "2026-03-14 14:30", status: "synced", affectedUnits: 12 },
  { id: "s4", fileName: "CAM_Reconciliation_Q1.xlsx", source: "Manual Upload", lastSync: "2026-03-12 16:45", status: "pending", affectedUnits: 8 },
  { id: "s5", fileName: "InsuranceCerts_2026.pdf", source: "Manual Upload", lastSync: "2026-03-10 11:20", status: "error", affectedUnits: 0 },
];

const MOCK_APPROVALS: ApprovalItem[] = [
  { id: "a1", unit: "A-90", field: "pastDueAmount", oldValue: "$12,760", newValue: "$19,140", source: "Yardi Sync", timestamp: "2026-03-15 09:12", status: "pending" },
  { id: "a2", unit: "C-207", field: "delinquencyStage", oldValue: "default_notice", newValue: "lockout_pending", source: "PM Action", timestamp: "2026-03-12 10:30", status: "pending" },
  { id: "a3", unit: "C-212", field: "electricPosted", oldValue: "false", newValue: "true", source: "Manual Update", timestamp: "2026-03-14 15:00", status: "pending" },
];

const MOCK_TRIGGERS: ScheduledTrigger[] = [
  { id: "t1", name: "Yardi Rent Roll Sync", schedule: "Daily 9:00 AM", lastRun: "2026-03-15 09:00", nextRun: "2026-03-17 09:00", status: "active" },
  { id: "t2", name: "Electric Bill Import", schedule: "Monthly 15th", lastRun: "2026-03-15 14:00", nextRun: "2026-04-15 14:00", status: "active" },
  { id: "t3", name: "Delinquency Report", schedule: "Weekly Mon", lastRun: "2026-03-10 08:00", nextRun: "2026-03-17 08:00", status: "active" },
  { id: "t4", name: "Insurance Cert Check", schedule: "Monthly 1st", lastRun: "2026-03-01 06:00", nextRun: "2026-04-01 06:00", status: "paused" },
];

export default function PipelinePage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSync, setSelectedSync] = useState<SyncRecord | null>(null);
  const [approvals, setApprovals] = useState<ApprovalItem[]>(MOCK_APPROVALS);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const syncColumnDefs = useMemo<ColDef<SyncRecord>[]>(
    () => [
      { headerName: "File Name", field: "fileName", flex: 1, minWidth: 200 },
      { headerName: "Source", field: "source", width: 140 },
      { headerName: "Last Sync", field: "lastSync", width: 160 },
      {
        headerName: "Status",
        field: "status",
        width: 100,
        cellRenderer: (params: { value: string }) => {
          const colors: Record<string, string> = {
            synced: "#16a34a",
            pending: "#d97706",
            error: "#dc2626",
          };
          const bg: Record<string, string> = {
            synced: "#f0fdf4",
            pending: "#fffbeb",
            error: "#fef2f2",
          };
          return `<span style="display:inline-block;padding:1px 8px;border-radius:4px;font-size:11px;font-weight:500;color:${colors[params.value]};background:${bg[params.value]}">${params.value.charAt(0).toUpperCase() + params.value.slice(1)}</span>`;
        },
      },
      {
        headerName: "Units",
        field: "affectedUnits",
        width: 80,
      },
    ],
    []
  );

  const onSyncRowClicked = useCallback((event: { data: SyncRecord | undefined }) => {
    if (event.data) {
      setSelectedSync(event.data);
      setDrawerOpen(true);
    }
  }, []);

  const handleApproval = useCallback(
    (id: string, action: "approved" | "rejected") => {
      setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: action } : a)));
    },
    []
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    // In production, this would process the files
  }, []);

  return (
    <>
      <PageHeader title="Data Pipeline" subtitle="File sync, approval queue, and processing workflow" />

      {/* Processing Workflow */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-[#18181b] mb-3">Processing Workflow</h2>
        <div className="flex flex-wrap gap-0">
          {WORKFLOW_STEPS.map((step, i) => (
            <div key={step.label} className="flex items-center">
              <div className="border border-[#e4e4e7] bg-white rounded px-3 py-2 min-w-[130px]">
                <div className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium">Step {i + 1}</div>
                <div className="text-xs font-semibold text-[#18181b] mt-0.5">{step.label}</div>
                <div className="text-[10px] text-[#71717a] mt-0.5">{step.desc}</div>
              </div>
              {i < WORKFLOW_STEPS.length - 1 && (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0 mx-1 text-[#a1a1aa]">
                  <path d="M7 5l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Smart Upload */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-[#18181b] mb-3">Smart Upload</h2>
        <div
          className={`border-2 border-dashed rounded px-6 py-8 text-center transition-colors ${
            dragOver ? "border-[#18181b] bg-[#f4f4f5]" : "border-[#e4e4e7] bg-white"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <input ref={fileInputRef} type="file" className="hidden" accept=".csv,.xlsx,.xls,.pdf" multiple />
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="mx-auto mb-2 text-[#a1a1aa]">
            <path d="M16 4v18M10 10l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 22v4a2 2 0 002 2h20a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-sm text-[#71717a]">Drop files here or click to browse</p>
          <p className="text-xs text-[#a1a1aa] mt-1">Supports CSV, XLSX, PDF — auto-detects Yardi, AppFolio formats</p>
        </div>
      </div>

      {/* File Sync History */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-[#18181b] mb-3">File Sync History</h2>
        <div className="border border-[#e4e4e7] bg-white rounded overflow-auto">
          <div className="ag-theme-alpine" style={{ width: "100%", minWidth: 600 }}>
            <AgGridReact<SyncRecord>
              rowData={MOCK_SYNCS}
              columnDefs={syncColumnDefs}
              domLayout="autoHeight"
              onRowClicked={onSyncRowClicked}
              suppressCellFocus
              getRowId={(params) => params.data.id}
            />
          </div>
        </div>
      </div>

      {/* Approval Queue */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-[#18181b] mb-3">
          Approval Queue{" "}
          <span className="text-xs text-[#71717a] font-normal">
            ({approvals.filter((a) => a.status === "pending").length} pending)
          </span>
        </h2>
        <div className="space-y-2">
          {approvals.map((a) => (
            <div
              key={a.id}
              className={`border rounded px-4 py-3 flex flex-wrap items-center gap-3 ${
                a.status === "pending"
                  ? "border-[#e4e4e7] bg-white"
                  : a.status === "approved"
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <div className="flex-1 min-w-[200px]">
                <div className="text-sm font-medium text-[#18181b]">
                  {a.unit} — {a.field}
                </div>
                <div className="text-xs text-[#71717a] mt-0.5">
                  <span className="line-through">{a.oldValue}</span>
                  <span className="mx-1">&rarr;</span>
                  <span className="font-medium text-[#18181b]">{a.newValue}</span>
                </div>
                <div className="text-[10px] text-[#a1a1aa] mt-0.5">
                  {a.source} &middot; {a.timestamp}
                </div>
              </div>
              {a.status === "pending" ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => handleApproval(a.id, "approved")}
                    className="text-xs px-3 py-1 bg-[#18181b] text-white rounded hover:bg-zinc-800 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleApproval(a.id, "rejected")}
                    className="text-xs px-3 py-1 border border-[#e4e4e7] text-[#71717a] rounded hover:bg-[#f4f4f5] transition-colors"
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <span
                  className={`text-xs font-medium ${
                    a.status === "approved" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Scheduled Triggers */}
      <div>
        <h2 className="text-sm font-semibold text-[#18181b] mb-3">Scheduled Triggers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {MOCK_TRIGGERS.map((trigger) => (
            <div
              key={trigger.id}
              className="border border-[#e4e4e7] bg-white rounded px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#18181b]">{trigger.name}</span>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                    trigger.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {trigger.status === "active" ? "Active" : "Paused"}
                </span>
              </div>
              <div className="text-xs text-[#71717a] mt-1">{trigger.schedule}</div>
              <div className="text-[10px] text-[#a1a1aa] mt-1">
                Last: {trigger.lastRun} &middot; Next: {trigger.nextRun}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sync Detail Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedSync ? selectedSync.fileName : ""}
        subtitle={selectedSync ? `Source: ${selectedSync.source}` : ""}
      >
        {selectedSync && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-[#71717a] text-xs block">Status</span>
                <span className={`font-semibold ${
                  selectedSync.status === "synced" ? "text-green-600" :
                  selectedSync.status === "pending" ? "text-amber-600" : "text-red-600"
                }`}>
                  {selectedSync.status.charAt(0).toUpperCase() + selectedSync.status.slice(1)}
                </span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Last Sync</span>
                <span className="font-medium">{selectedSync.lastSync}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Affected Units</span>
                <span className="font-medium">{selectedSync.affectedUnits}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Source</span>
                <span className="font-medium">{selectedSync.source}</span>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

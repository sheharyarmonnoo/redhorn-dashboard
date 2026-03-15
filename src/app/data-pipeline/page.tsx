"use client";
import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, GridReadyEvent, RowClickedEvent } from "ag-grid-community";
import { exportRentRoll, exportLeaseLedger, exportIncomeStatement, exportFullPackage } from "@/data/export";
import PageHeader from "@/components/PageHeader";
import { Download, X, Plus, Trash2, Save } from "lucide-react";

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

interface FileSyncRow {
  id: number;
  filename: string;
  source: string;
  type: string;
  records: number;
  size: string;
  status: "Success" | "Warning" | "Failed";
  syncedAt: string;
  statusDetail?: string;
  affectedUnits?: string[];
  resolution?: string;
}

const fileSyncHistory: FileSyncRow[] = [
  { id: 1, filename: "RentRoll03_12_2026.xlsx", source: "Yardi", type: "Rent Roll", records: 52, size: "13.3 KB", status: "Success", syncedAt: "2026-03-12 09:15" },
  { id: 2, filename: "LeaseLedger03_12_2026.xlsx", source: "Yardi", type: "Lease Ledger", records: 48, size: "14.0 KB", status: "Success", syncedAt: "2026-03-12 09:15" },
  { id: 3, filename: "IncomeStatement03_12_2026.xlsx", source: "Yardi", type: "Income Statement", records: 9, size: "12.1 KB", status: "Success", syncedAt: "2026-03-12 09:14" },
  { id: 4, filename: "RentRoll03_01_2026.xlsx", source: "Yardi", type: "Rent Roll", records: 52, size: "13.1 KB", status: "Success", syncedAt: "2026-03-01 08:30" },
  { id: 5, filename: "LeaseLedger03_01_2026.xlsx", source: "Yardi", type: "Lease Ledger", records: 45, size: "13.8 KB", status: "Success", syncedAt: "2026-03-01 08:29" },
  { id: 6, filename: "IncomeStatement02_2026.xlsx", source: "Yardi", type: "Income Statement", records: 8, size: "11.9 KB", status: "Success", syncedAt: "2026-02-28 14:22" },
  {
    id: 7,
    filename: "ElectricBilling_Feb2026.pdf",
    source: "CenterPoint",
    type: "Utility Bill",
    records: 1,
    size: "284 KB",
    status: "Warning",
    syncedAt: "2026-02-15 10:05",
    statusDetail: "PDF parsed but 3 line items could not be matched to tenant units. CenterPoint meter IDs for units C-212, C-305, and A-90 did not match Yardi tenant records. Electric charges for these units were NOT auto-posted.",
    affectedUnits: ["C-212", "C-305", "A-90"],
    resolution: "Manually verify CenterPoint meter-to-unit mapping with PM. Update Yardi utility account codes for these 3 units. Re-run sync after correction.",
  },
  { id: 8, filename: "RentRoll02_01_2026.xlsx", source: "Yardi", type: "Rent Roll", records: 52, size: "13.0 KB", status: "Success", syncedAt: "2026-02-01 08:30" },
  { id: 9, filename: "LeaseLedger02_01_2026.xlsx", source: "Yardi", type: "Lease Ledger", records: 42, size: "13.5 KB", status: "Success", syncedAt: "2026-02-01 08:29" },
  {
    id: 10,
    filename: "CAM_Reconciliation_2025.xlsx",
    source: "Yardi",
    type: "CAM Recon",
    records: 35,
    size: "28.4 KB",
    status: "Failed",
    syncedAt: "2026-01-15 11:44",
    statusDetail: "File format mismatch — expected Yardi CAM reconciliation template but received a custom Excel with non-standard column headers. Parser could not map 'Reimb. Amount' and 'Tenant Share %' columns. No data was imported.",
    affectedUnits: [],
    resolution: "Request PM to export using the standard Yardi CAM reconciliation report (Report ID: CAM-RECON-STD). Alternatively, provide column mapping for custom format.",
  },
];

function StatusCell(props: { value: string }) {
  const v = props.value;
  if (v === "Success") return <span className="text-[11px] font-medium text-[#16a34a]">Success</span>;
  if (v === "Warning") return <span className="text-[11px] font-medium text-[#d97706] cursor-pointer underline decoration-dotted">Warning</span>;
  return <span className="text-[11px] font-medium text-[#dc2626] cursor-pointer underline decoration-dotted">Failed</span>;
}

function DownloadCell(props: { data: FileSyncRow }) {
  const fn = exportMap[props.data.type] || exportFullPackage;
  return (
    <button onClick={(e) => { e.stopPropagation(); fn(); }} className="text-[#71717a] hover:text-[#18181b] transition-colors cursor-pointer p-1" title={`Download ${props.data.filename}`}>
      <Download size={14} />
    </button>
  );
}

function DetailPanel({ file, onClose }: { file: FileSyncRow; onClose: () => void }) {
  const isWarning = file.status === "Warning";
  const isFailed = file.status === "Failed";
  const borderColor = isWarning ? "border-[#d97706]" : "border-[#dc2626]";
  const bgColor = isWarning ? "bg-amber-50" : "bg-red-50";
  const textColor = isWarning ? "text-[#d97706]" : "text-[#dc2626]";

  return (
    <div className={`mt-3 ${bgColor} border ${borderColor} rounded p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[12px] font-semibold ${textColor} uppercase tracking-wide`}>{file.status}</span>
            <span className="text-[11px] text-[#71717a]">{file.filename}</span>
          </div>

          <p className="text-[12px] text-[#18181b] leading-relaxed">{file.statusDetail}</p>

          {file.affectedUnits && file.affectedUnits.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-[#71717a] uppercase tracking-wide font-medium mb-1">Affected Units</p>
              <div className="flex flex-wrap gap-1">
                {file.affectedUnits.map(u => (
                  <span key={u} className="text-[11px] font-medium text-[#18181b] bg-white border border-[#e4e4e7] rounded px-2 py-0.5">{u}</span>
                ))}
              </div>
            </div>
          )}

          {file.resolution && (
            <div className="mt-3">
              <p className="text-[10px] text-[#71717a] uppercase tracking-wide font-medium mb-1">Recommended Action</p>
              <p className="text-[12px] text-[#18181b] leading-relaxed">{file.resolution}</p>
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-[#a1a1aa] hover:text-[#18181b] cursor-pointer p-0.5 flex-shrink-0">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

// --- Training Protocol ---
const RULES_KEY = "redhorn_processing_rules";

interface ProcessingRule {
  id: string;
  condition: string;
  action: string;
  enabled: boolean;
}

const defaultRules: ProcessingRule[] = [
  { id: "r1", condition: "Electric charge not posted by 10th of month for Net Lease tenants", action: "Flag as critical alert, create Kanban task, notify via email", enabled: true },
  { id: "r2", condition: "Tenant past due > 5 days with no late fee assessed", action: "Flag as warning, add to PM call prep, create action item", enabled: true },
  { id: "r3", condition: "Lease expiring within 120 days with no renewal activity in notes", action: "Flag as warning, create Kanban task for PM follow-up", enabled: true },
  { id: "r4", condition: "Revenue for any category drops > 15% month-over-month", action: "Flag as anomaly on dashboard, send email alert to owner", enabled: true },
  { id: "r5", condition: "New tenant appears in rent roll not previously tracked", action: "Auto-create unit record, flag for review, request lease docs", enabled: true },
  { id: "r6", condition: "Tenant in lockout_pending stage for > 14 days", action: "Escalate to auction_pending stage, notify legal team", enabled: false },
  { id: "r7", condition: "Utility bill PDF cannot be parsed or meter IDs unmatched", action: "Flag as warning, hold charges for manual review, do NOT auto-post", enabled: true },
  { id: "r8", condition: "User note exists on unit — preserve during all data syncs", action: "Merge note into override layer, never overwrite with Yardi data", enabled: true },
];

function loadRules(): ProcessingRule[] {
  if (typeof window === "undefined") return defaultRules;
  try { const raw = localStorage.getItem(RULES_KEY); return raw ? JSON.parse(raw) : defaultRules; }
  catch { return defaultRules; }
}
function saveRules(rules: ProcessingRule[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(RULES_KEY, JSON.stringify(rules));
}

function TrainingProtocol() {
  const [rules, setRules] = useState<ProcessingRule[]>(defaultRules);
  const [newCondition, setNewCondition] = useState("");
  const [newAction, setNewAction] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { setRules(loadRules()); }, []);

  function toggle(id: string) {
    const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    setRules(updated); saveRules(updated);
  }
  function remove(id: string) {
    const updated = rules.filter(r => r.id !== id);
    setRules(updated); saveRules(updated);
  }
  function add() {
    if (!newCondition.trim() || !newAction.trim()) return;
    const rule: ProcessingRule = { id: Date.now().toString(), condition: newCondition.trim(), action: newAction.trim(), enabled: true };
    const updated = [...rules, rule];
    setRules(updated); saveRules(updated);
    setNewCondition(""); setNewAction(""); setShowAdd(false);
  }

  const enabledCount = rules.filter(r => r.enabled).length;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] text-[#71717a]">Define rules that the system evaluates on every data sync. These train how the pipeline processes, flags, and acts on incoming data.</p>
          <p className="text-[11px] text-[#a1a1aa] mt-1">{enabledCount} of {rules.length} rules active</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-[11px] font-medium text-[#71717a] hover:text-[#18181b] cursor-pointer">
          <Plus size={14} /> Add Rule
        </button>
      </div>

      {showAdd && (
        <div className="bg-white border border-[#e4e4e7] rounded p-3 space-y-2">
          <div>
            <label className="text-[10px] text-[#71717a] uppercase tracking-wide font-medium">If (condition)</label>
            <input type="text" value={newCondition} onChange={e => setNewCondition(e.target.value)}
              placeholder="e.g. Tenant past due > 30 days with no payment plan..."
              className="w-full mt-1 text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
          </div>
          <div>
            <label className="text-[10px] text-[#71717a] uppercase tracking-wide font-medium">Then (action)</label>
            <input type="text" value={newAction} onChange={e => setNewAction(e.target.value)}
              placeholder="e.g. Escalate to locked_out status, create action item, email PM..."
              className="w-full mt-1 text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowAdd(false)} className="text-[11px] text-[#71717a] px-3 py-1 cursor-pointer">Cancel</button>
            <button onClick={add} className="text-[11px] font-medium px-3 py-1.5 bg-[#18181b] text-white rounded hover:bg-[#27272a] cursor-pointer">
              <Save size={12} className="inline mr-1" />Save Rule
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      <div className="space-y-0">
        {rules.map((rule, i) => (
          <div key={rule.id} className={`flex gap-3 py-3 border-b border-[#f4f4f5] last:border-0 ${!rule.enabled ? "opacity-50" : ""}`}>
            <button onClick={() => toggle(rule.id)}
              className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors ${
                rule.enabled ? "bg-[#18181b] border-[#18181b]" : "border-[#d4d4d8]"
              }`}>
              {rule.enabled && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-1">
                <span className="text-[10px] text-[#a1a1aa] font-medium uppercase shrink-0 mt-0.5 w-4">If</span>
                <p className="text-[12px] text-[#18181b] leading-relaxed">{rule.condition}</p>
              </div>
              <div className="flex items-start gap-1 mt-1">
                <span className="text-[10px] text-[#a1a1aa] font-medium uppercase shrink-0 mt-0.5 w-4">→</span>
                <p className="text-[12px] text-[#71717a] leading-relaxed">{rule.action}</p>
              </div>
            </div>
            <button onClick={() => remove(rule.id)}
              className="text-[#d4d4d8] hover:text-[#dc2626] cursor-pointer p-0.5 flex-shrink-0 mt-0.5 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="bg-[#fafafa] border border-[#e4e4e7] rounded p-3 text-[11px] text-[#71717a]">
        These rules are evaluated in order during Step 5 of the processing workflow. Disabled rules are skipped. Rules can reference unit statuses, delinquency stages, financial thresholds, and date-based conditions.
      </div>
    </div>
  );
}

export default function DataPipelinePage() {
  const gridRef = useRef<AgGridReact>(null);
  const isMobile = useIsMobile();
  const [selectedFile, setSelectedFile] = useState<FileSyncRow | null>(null);
  const [activeSection, setActiveSection] = useState<"workflow" | "protocol">("workflow");

  const columnDefs = useMemo<ColDef[]>(() => {
    if (isMobile) {
      return [
        { field: "filename", headerName: "File", minWidth: 150, flex: 1,
          cellRenderer: (p: { value: string; data: FileSyncRow }) => (
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

  const onRowClicked = useCallback((event: RowClickedEvent) => {
    const row = event.data as FileSyncRow;
    if (row.status !== "Success" && row.statusDetail) {
      setSelectedFile(prev => prev?.id === row.id ? null : row);
    }
  }, []);

  return (
    <div>
      <PageHeader title="Data Pipeline" subtitle="File sync history — click Warning/Failed rows for details">
        <button onClick={exportFullPackage}
          className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 bg-[#18181b] text-white rounded hover:bg-[#27272a] transition-colors cursor-pointer">
          <Download size={13} /> Export All
        </button>
      </PageHeader>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
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
          onRowClicked={onRowClicked}
          animateRows={true}
          pagination={true}
          paginationPageSize={10}
          getRowId={(params) => String(params.data.id)}
        />
      </div>

      {selectedFile && (
        <DetailPanel file={selectedFile} onClose={() => setSelectedFile(null)} />
      )}

      {/* Tabs: Workflow / Training Protocol */}
      <div className="mt-8 flex gap-1 border-b border-[#e4e4e7]">
        {(["workflow", "protocol"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveSection(tab)}
            className={`text-[12px] font-medium px-3 py-2 border-b-2 transition-colors cursor-pointer ${
              activeSection === tab ? "border-[#18181b] text-[#18181b]" : "border-transparent text-[#a1a1aa] hover:text-[#71717a]"
            }`}>
            {tab === "workflow" ? "Processing Workflow" : "Training Protocol"}
          </button>
        ))}
      </div>

      {activeSection === "workflow" && (
        <div className="mt-4 space-y-4">
          <p className="text-[12px] text-[#71717a]">How data flows from Yardi to the dashboard while preserving your notes and overrides.</p>

          <div className="space-y-0">
            {[
              { step: "1", label: "Export", desc: "Yardi generates rent roll, lease ledger, income statement, and utility reports. Triggered by cron (auto) or manual upload.", status: "Automated via Playwright" },
              { step: "2", label: "Validate", desc: "Parser checks file format, column headers, and data types. Flags warnings if columns are missing or values are out of range.", status: "Schema validation" },
              { step: "3", label: "Transform", desc: "Raw data is normalized: dates standardized, currency parsed, unit IDs matched to master list, new tenants detected.", status: "ETL pipeline" },
              { step: "4", label: "Merge with Overrides", desc: "User notes, status overrides, delinquency stages, and action items from previous cycles are preserved. New data is merged — never overwrites manual entries.", status: "Note preservation" },
              { step: "5", label: "Alert Evaluation", desc: "Training protocol rules are evaluated against new data. Alerts generated for: missing postings, late fees, lease expirations, threshold breaches.", status: "Rule engine" },
              { step: "6", label: "Push to Dashboard", desc: "Processed data replaces stale data. Charts, KPIs, site plan, and grids update. Kanban items auto-created for critical alerts if protocol says so.", status: "Live update" },
            ].map((s, i) => (
              <div key={i} className="flex gap-3 py-3 border-b border-[#f4f4f5] last:border-0">
                <div className="w-6 h-6 rounded bg-[#18181b] text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">{s.step}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-[13px] font-medium text-[#18181b]">{s.label}</p>
                    <span className="text-[10px] text-[#a1a1aa]">{s.status}</span>
                  </div>
                  <p className="text-[12px] text-[#71717a] mt-0.5 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-[#fafafa] border border-[#e4e4e7] rounded p-3 text-[11px] text-[#71717a]">
            Key guarantee: User notes, manual status changes, and Kanban items are <strong className="text-[#18181b]">never overwritten</strong> by data syncs.
            They live in a separate override layer that merges on top of incoming Yardi data.
          </div>
        </div>
      )}

      {activeSection === "protocol" && (
        <TrainingProtocol />
      )}
    </div>
  );
}

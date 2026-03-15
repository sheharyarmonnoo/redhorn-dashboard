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

// --- Training Protocol (free-text checklist + notes) ---
const PROTOCOL_KEY = "redhorn_protocol";

interface ProtocolItem {
  id: string;
  text: string;
  done: boolean;
}

const defaultProtocol: ProtocolItem[] = [
  { id: "p1", text: "Verify all Net Lease tenants have utility charges posted (electric, water, gas) before updating dashboard", done: false },
  { id: "p2", text: "Check that late fees have been assessed for any tenant past due > 5 days", done: false },
  { id: "p3", text: "Confirm lease expiration list matches PM's renewal pipeline — flag any missing", done: false },
  { id: "p4", text: "Cross-check rent roll tenant count with previous month — flag any new or removed tenants for review", done: false },
  { id: "p5", text: "Validate that CAM reconciliation amounts match the annual budget before posting", done: false },
  { id: "p6", text: "Ensure any user notes or manual status overrides are preserved — never auto-clear", done: true },
  { id: "p7", text: "Review delinquency workflow stages — confirm tenants advanced to correct stage before approving", done: false },
  { id: "p8", text: "Check utility bill PDF meter IDs match Yardi tenant records — hold unmatched charges for manual review", done: false },
];

const PROTOCOL_NOTES_KEY = "redhorn_protocol_notes";
const defaultNotes = `Pre-Update Checklist Notes
─────────────────────────
These notes guide what to verify before any data sync is posted to the dashboard.

• Always check electric, water, gas, and other utility postings — not just electric.
• If a new tenant appears in the rent roll that we don't recognize, do NOT auto-add. Flag for manual review.
• Delinquency stage changes require manual approval — the system suggests but owner confirms.
• PM sometimes posts charges under wrong GL codes — spot-check the top 5 tenants by rent each cycle.
• Any override (notes, status, delinquency stage) set by us takes priority over incoming Yardi data.`;

function loadProtocol(): ProtocolItem[] {
  if (typeof window === "undefined") return defaultProtocol;
  try { const raw = localStorage.getItem(PROTOCOL_KEY); return raw ? JSON.parse(raw) : defaultProtocol; }
  catch { return defaultProtocol; }
}
function saveProtocol(items: ProtocolItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROTOCOL_KEY, JSON.stringify(items));
}
function loadProtocolNotes(): string {
  if (typeof window === "undefined") return defaultNotes;
  try { return localStorage.getItem(PROTOCOL_NOTES_KEY) || defaultNotes; }
  catch { return defaultNotes; }
}
function saveProtocolNotes(notes: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROTOCOL_NOTES_KEY, notes);
}

function TrainingProtocol() {
  const [items, setItems] = useState<ProtocolItem[]>(defaultProtocol);
  const [notes, setNotes] = useState(defaultNotes);
  const [newText, setNewText] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);

  useEffect(() => { setItems(loadProtocol()); setNotes(loadProtocolNotes()); }, []);

  function toggle(id: string) {
    const updated = items.map(i => i.id === id ? { ...i, done: !i.done } : i);
    setItems(updated); saveProtocol(updated);
  }
  function remove(id: string) {
    const updated = items.filter(i => i.id !== id);
    setItems(updated); saveProtocol(updated);
  }
  function add() {
    if (!newText.trim()) return;
    const item: ProtocolItem = { id: Date.now().toString(), text: newText.trim(), done: false };
    const updated = [...items, item];
    setItems(updated); saveProtocol(updated);
    setNewText("");
  }
  function handleNotesChange(val: string) {
    setNotes(val); setNotesSaved(false);
  }
  function saveNotes() {
    saveProtocolNotes(notes); setNotesSaved(true);
  }

  const doneCount = items.filter(i => i.done).length;

  return (
    <div className="mt-4 space-y-5">
      <p className="text-[12px] text-[#71717a]">Checklist and notes to verify before posting any data update to the dashboard. Check items off as you review each sync cycle.</p>

      {/* Checklist */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] font-medium text-[#18181b]">Pre-Update Checklist</p>
          <span className="text-[10px] text-[#a1a1aa]">{doneCount}/{items.length} verified</span>
        </div>
        <div className="space-y-0">
          {items.map(item => (
            <div key={item.id} className="group flex items-start gap-2.5 py-2 border-b border-[#f4f4f5] last:border-0">
              <button onClick={() => toggle(item.id)}
                className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors ${
                  item.done ? "bg-[#16a34a] border-[#16a34a]" : "border-[#d4d4d8] hover:border-[#71717a]"
                }`}>
                {item.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
              </button>
              <p className={`flex-1 text-[12px] leading-relaxed ${item.done ? "text-[#a1a1aa] line-through" : "text-[#18181b]"}`}>{item.text}</p>
              <button onClick={() => remove(item.id)}
                className="opacity-0 group-hover:opacity-100 text-[#d4d4d8] hover:text-[#dc2626] cursor-pointer transition-all">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input type="text" value={newText} onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
            placeholder="Add a check item..."
            className="flex-1 text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
          <button onClick={add} disabled={!newText.trim()}
            className="text-[11px] font-medium px-3 py-1.5 bg-[#18181b] text-white rounded hover:bg-[#27272a] disabled:bg-[#e4e4e7] disabled:text-[#a1a1aa] cursor-pointer transition-colors">
            Add
          </button>
        </div>
      </div>

      {/* Free-text notes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] font-medium text-[#18181b]">Protocol Notes</p>
          <button onClick={saveNotes}
            className={`text-[11px] font-medium px-2.5 py-1 rounded cursor-pointer transition-colors ${
              notesSaved ? "text-[#a1a1aa]" : "bg-[#18181b] text-white hover:bg-[#27272a]"
            }`}>
            {notesSaved ? "Saved" : "Save"}
          </button>
        </div>
        <textarea value={notes} onChange={e => handleNotesChange(e.target.value)}
          className="w-full text-[12px] text-[#18181b] bg-[#fafafa] border border-[#e4e4e7] rounded p-3 leading-relaxed focus:outline-none focus:border-[#71717a] min-h-[200px] resize-y font-mono" />
      </div>
    </div>
  );
}

// --- Sync Approval Queue ---
const PENDING_KEY = "redhorn_pending_syncs";

interface PendingChange {
  id: string;
  unit: string;
  field: string;
  oldValue: string;
  newValue: string;
  source: string;
  detectedAt: string;
  status: "pending" | "approved" | "rejected";
}

const defaultPending: PendingChange[] = [
  { id: "pc1", unit: "C-200", field: "Tenant", oldValue: "(Vacant)", newValue: "New Sign Pro LLC", source: "RentRoll03_12_2026.xlsx", detectedAt: "2026-03-12 09:15", status: "pending" },
  { id: "pc2", unit: "C-200", field: "Monthly Rent", oldValue: "$0", newValue: "$2,960", source: "RentRoll03_12_2026.xlsx", detectedAt: "2026-03-12 09:15", status: "pending" },
  { id: "pc3", unit: "C-200", field: "Lease Start", oldValue: "—", newValue: "2026-04-01", source: "RentRoll03_12_2026.xlsx", detectedAt: "2026-03-12 09:15", status: "pending" },
  { id: "pc4", unit: "A-90", field: "Delinquency Stage", oldValue: "Default Notice", newValue: "Lockout Pending", source: "System Rule", detectedAt: "2026-03-14 08:00", status: "pending" },
  { id: "pc5", unit: "C-305", field: "Electric Charge", oldValue: "NOT POSTED", newValue: "$290 posted", source: "LeaseLedger03_12_2026.xlsx", detectedAt: "2026-03-12 09:15", status: "pending" },
];

function loadPending(): PendingChange[] {
  if (typeof window === "undefined") return defaultPending;
  try { const raw = localStorage.getItem(PENDING_KEY); return raw ? JSON.parse(raw) : defaultPending; }
  catch { return defaultPending; }
}
function savePending(items: PendingChange[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_KEY, JSON.stringify(items));
}

function SyncApprovalQueue() {
  const [items, setItems] = useState<PendingChange[]>(defaultPending);
  useEffect(() => { setItems(loadPending()); }, []);

  function approve(id: string) {
    const updated = items.map(i => i.id === id ? { ...i, status: "approved" as const } : i);
    setItems(updated); savePending(updated);
  }
  function reject(id: string) {
    const updated = items.map(i => i.id === id ? { ...i, status: "rejected" as const } : i);
    setItems(updated); savePending(updated);
  }
  function approveAll() {
    const updated = items.map(i => i.status === "pending" ? { ...i, status: "approved" as const } : i);
    setItems(updated); savePending(updated);
  }

  const pending = items.filter(i => i.status === "pending");
  const resolved = items.filter(i => i.status !== "pending");

  return (
    <div className="mt-4 space-y-4">
      <p className="text-[12px] text-[#71717a]">New data from Yardi is held here until you approve. Nothing updates the dashboard automatically — you review and confirm each change.</p>

      {pending.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-medium text-[#18181b]">{pending.length} pending changes</p>
            <button onClick={approveAll}
              className="text-[11px] font-medium px-2.5 py-1 bg-[#16a34a] text-white rounded hover:bg-[#15803d] cursor-pointer transition-colors">
              Approve All
            </button>
          </div>
          <div className="space-y-0 border border-[#e4e4e7] rounded overflow-hidden">
            {pending.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-[#f4f4f5] last:border-0 bg-white hover:bg-[#fafafa]">
                <span className="text-[12px] font-medium text-[#18181b] w-16 flex-shrink-0">{item.unit}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-[#18181b]">
                    <span className="text-[#71717a]">{item.field}:</span>{" "}
                    <span className="line-through text-[#a1a1aa]">{item.oldValue}</span>{" → "}
                    <span className="font-medium">{item.newValue}</span>
                  </p>
                  <p className="text-[10px] text-[#a1a1aa]">{item.source} · {item.detectedAt}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => approve(item.id)}
                    className="text-[10px] font-medium px-2 py-1 bg-[#16a34a] text-white rounded hover:bg-[#15803d] cursor-pointer transition-colors">
                    Approve
                  </button>
                  <button onClick={() => reject(item.id)}
                    className="text-[10px] font-medium px-2 py-1 border border-[#e4e4e7] text-[#71717a] rounded hover:text-[#dc2626] hover:border-[#dc2626] cursor-pointer transition-colors">
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && (
        <div className="bg-[#fafafa] border border-[#e4e4e7] rounded p-6 text-center">
          <p className="text-[13px] font-medium text-[#18181b]">All clear</p>
          <p className="text-[11px] text-[#a1a1aa] mt-1">No pending changes to review.</p>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-1">{resolved.length} resolved</p>
          <div className="space-y-0">
            {resolved.slice(0, 5).map(item => (
              <div key={item.id} className="flex items-center gap-3 py-1.5 text-[11px]">
                <span className={`font-medium ${item.status === "approved" ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
                  {item.status === "approved" ? "✓" : "✗"}
                </span>
                <span className="text-[#71717a]">{item.unit}</span>
                <span className="text-[#a1a1aa]">{item.field}: {item.oldValue} → {item.newValue}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DataPipelinePage() {
  const gridRef = useRef<AgGridReact>(null);
  const isMobile = useIsMobile();
  const [selectedFile, setSelectedFile] = useState<FileSyncRow | null>(null);
  const [activeSection, setActiveSection] = useState<"approval" | "workflow" | "protocol">("approval");

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

      {/* Tabs */}
      <div className="mt-8 flex gap-1 border-b border-[#e4e4e7]">
        {([
          { key: "approval" as const, label: "Approval Queue" },
          { key: "workflow" as const, label: "Processing Workflow" },
          { key: "protocol" as const, label: "Training Protocol" },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveSection(tab.key)}
            className={`text-[12px] font-medium px-3 py-2 border-b-2 transition-colors cursor-pointer ${
              activeSection === tab.key ? "border-[#18181b] text-[#18181b]" : "border-transparent text-[#a1a1aa] hover:text-[#71717a]"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeSection === "approval" && (
        <SyncApprovalQueue />
      )}

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

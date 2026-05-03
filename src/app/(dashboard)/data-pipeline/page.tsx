"use client";
import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, GridReadyEvent, RowClickedEvent } from "ag-grid-community";
import { useSyncJobs } from "@/hooks/useConvexData";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
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
  { id: 1, filename: "RentRoll03_12_2026.xlsx", source: "Yardi", type: "Rent Roll", records: 52, size: "13.3 KB", status: "Success", syncedAt: "2026-03-12 09:15", statusDetail: "All 52 units parsed. 44 occupied, 8 vacant. Rent totals match previous month. No schema errors." },
  { id: 2, filename: "LeaseLedger03_12_2026.xlsx", source: "Yardi", type: "Lease Ledger", records: 48, size: "14.0 KB", status: "Success", syncedAt: "2026-03-12 09:15", statusDetail: "48 ledger entries processed for A-102. All charges and payments balanced. ACH payment confirmed for March." },
  { id: 3, filename: "IncomeStatement03_12_2026.xlsx", source: "Yardi", type: "Income Statement", records: 9, size: "12.1 KB", status: "Success", syncedAt: "2026-03-12 09:14", statusDetail: "9 months of P&L data imported. Revenue categories: Base Rent, CAM, Electric Recovery, Late Fees. All GL codes matched." },
  { id: 4, filename: "RentRoll03_01_2026.xlsx", source: "Yardi", type: "Rent Roll", records: 52, size: "13.1 KB", status: "Success", syncedAt: "2026-03-01 08:30", statusDetail: "52 units parsed. No changes from previous cycle. All tenant records matched." },
  { id: 5, filename: "LeaseLedger03_01_2026.xlsx", source: "Yardi", type: "Lease Ledger", records: 45, size: "13.8 KB", status: "Success", syncedAt: "2026-03-01 08:29", statusDetail: "45 entries processed. All balances reconciled. 3 fewer entries than current month — Feb shorter cycle." },
  { id: 6, filename: "IncomeStatement02_2026.xlsx", source: "Yardi", type: "Income Statement", records: 8, size: "11.9 KB", status: "Success", syncedAt: "2026-02-28 14:22", statusDetail: "8 months of P&L data. February revenue within expected range. No anomalies detected." },
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
  { id: 8, filename: "RentRoll02_01_2026.xlsx", source: "Yardi", type: "Rent Roll", records: 52, size: "13.0 KB", status: "Success", syncedAt: "2026-02-01 08:30", statusDetail: "52 units parsed. All matched January baseline." },
  { id: 9, filename: "LeaseLedger02_01_2026.xlsx", source: "Yardi", type: "Lease Ledger", records: 42, size: "13.5 KB", status: "Success", syncedAt: "2026-02-01 08:29", statusDetail: "42 entries processed. Balances reconciled to zero." },
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
  const colors: Record<string, string> = { Success: "text-[#16a34a]", Warning: "text-[#d97706]", Failed: "text-[#dc2626]" };
  return <span className={`text-[11px] font-medium ${colors[v] || ""} cursor-pointer underline decoration-dotted`}>{v}</span>;
}

function DownloadCell(props: { data: FileSyncRow }) {
  const storageId = (props.data as any).storageId;
  // Fetch the Convex storage URL for this file. Skip the query if we don't have a storage id.
  const url = useQuery(
    api.files.getUrl,
    storageId ? { storageId: storageId as any } : "skip"
  );
  const handle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (url) window.open(url, "_blank", "noopener");
  };
  return (
    <button
      onClick={handle}
      disabled={!url}
      className="text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] transition-colors cursor-pointer p-1 disabled:opacity-40 disabled:cursor-not-allowed"
      title={url ? `Download ${props.data.filename}` : "Loading…"}
    >
      <Download size={14} />
    </button>
  );
}

function DetailPanel({ file, onClose }: { file: FileSyncRow; onClose: () => void }) {
  const styleMap: Record<string, { border: string; bg: string; text: string }> = {
    Success: { border: "border-[#16a34a]", bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-[#16a34a]" },
    Warning: { border: "border-[#d97706]", bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-[#d97706]" },
    Failed: { border: "border-[#dc2626]", bg: "bg-red-50 dark:bg-red-950/30", text: "text-[#dc2626]" },
  };
  const s = styleMap[file.status] || styleMap.Failed;
  const borderColor = s.border;
  const bgColor = s.bg;
  const textColor = s.text;

  return (
    <div className={`mt-3 ${bgColor} border ${borderColor} rounded p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[12px] font-semibold ${textColor} uppercase tracking-wide`}>{file.status}</span>
            <span className="text-[11px] text-[#71717a]">{file.filename}</span>
          </div>

          <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] leading-relaxed">{file.statusDetail}</p>

          {file.affectedUnits && file.affectedUnits.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide font-medium mb-1">Affected Units</p>
              <div className="flex flex-wrap gap-1">
                {file.affectedUnits.map(u => (
                  <span key={u} className="text-[11px] font-medium text-[#18181b] dark:text-[#fafafa] bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded px-2 py-0.5">{u}</span>
                ))}
              </div>
            </div>
          )}

          {file.resolution && (
            <div className="mt-3">
              <p className="text-[10px] text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide font-medium mb-1">Recommended Action</p>
              <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] leading-relaxed">{file.resolution}</p>
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer p-0.5 flex-shrink-0">
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
      <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa]">Checklist and notes to verify before posting any data update to the dashboard. Check items off as you review each sync cycle.</p>

      {/* Checklist */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] font-medium text-[#18181b] dark:text-[#fafafa]">Pre-Update Checklist</p>
          <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">{doneCount}/{items.length} verified</span>
        </div>
        <div className="space-y-0">
          {items.map(item => (
            <div key={item.id} className="group flex items-start gap-2.5 py-2 border-b border-[#f4f4f5] dark:border-[#27272a] last:border-0">
              <button onClick={() => toggle(item.id)}
                className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors ${
                  item.done ? "bg-[#16a34a] border-[#16a34a]" : "border-[#d4d4d8] dark:border-[#52525b] hover:border-[#71717a]"
                }`}>
                {item.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
              </button>
              <p className={`flex-1 text-[12px] leading-relaxed ${item.done ? "text-[#a1a1aa] dark:text-[#71717a] line-through" : "text-[#18181b] dark:text-[#fafafa]"}`}>{item.text}</p>
              <button onClick={() => remove(item.id)}
                className="opacity-0 group-hover:opacity-100 text-[#d4d4d8] dark:text-[#52525b] hover:text-[#dc2626] cursor-pointer transition-all">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input type="text" value={newText} onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
            placeholder="Add a check item..."
            className="flex-1 text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
          <button onClick={add} disabled={!newText.trim()}
            className="text-[11px] font-medium px-3 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] disabled:bg-[#e4e4e7] dark:disabled:bg-[#3f3f46] disabled:text-[#a1a1aa] dark:disabled:text-[#71717a] cursor-pointer transition-colors">
            Add
          </button>
        </div>
      </div>

      {/* Free-text notes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] font-medium text-[#18181b] dark:text-[#fafafa]">Protocol Notes</p>
          <div className="flex gap-1.5">
            <button onClick={() => { setNotes(defaultNotes); saveProtocolNotes(defaultNotes); setNotesSaved(true); }}
              className="text-[11px] font-medium px-2.5 py-1 rounded cursor-pointer transition-colors text-[#71717a] dark:text-[#a1a1aa] hover:text-[#dc2626] border border-[#e4e4e7] dark:border-[#3f3f46] hover:border-[#dc2626]">
              Clear Notes
            </button>
            <button onClick={saveNotes}
              className={`text-[11px] font-medium px-2.5 py-1 rounded cursor-pointer transition-colors ${
                notesSaved ? "text-[#a1a1aa] dark:text-[#71717a]" : "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] hover:bg-[#27272a] dark:hover:bg-[#e4e4e7]"
              }`}>
              {notesSaved ? "Saved" : "Save"}
            </button>
          </div>
        </div>
        <textarea value={notes} onChange={e => handleNotesChange(e.target.value)}
          className="w-full text-[12px] text-[#18181b] dark:text-[#fafafa] bg-[#fafafa] dark:bg-[#27272a] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 leading-relaxed focus:outline-none focus:border-[#71717a] min-h-[200px] resize-y font-mono" />
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
      <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa]">New data from Yardi is held here until you approve. Nothing updates the dashboard automatically — you review and confirm each change.</p>

      {pending.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-medium text-[#18181b] dark:text-[#fafafa]">{pending.length} pending changes</p>
            <button onClick={approveAll}
              className="text-[11px] font-medium px-2.5 py-1 bg-[#16a34a] text-white rounded hover:bg-[#15803d] cursor-pointer transition-colors">
              Approve All
            </button>
          </div>
          <div className="space-y-0 border border-[#e4e4e7] dark:border-[#3f3f46] rounded overflow-hidden">
            {pending.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-[#f4f4f5] dark:border-[#27272a] last:border-0 bg-white dark:bg-[#18181b] hover:bg-[#fafafa] dark:hover:bg-[#27272a]">
                <span className="text-[12px] font-medium text-[#18181b] dark:text-[#fafafa] w-16 flex-shrink-0">{item.unit}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-[#18181b] dark:text-[#fafafa]">
                    <span className="text-[#71717a] dark:text-[#a1a1aa]">{item.field}:</span>{" "}
                    <span className="line-through text-[#a1a1aa] dark:text-[#71717a]">{item.oldValue}</span>{" → "}
                    <span className="font-medium">{item.newValue}</span>
                  </p>
                  <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">{item.source} · {item.detectedAt}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => approve(item.id)}
                    className="text-[10px] font-medium px-2 py-1 bg-[#16a34a] text-white rounded hover:bg-[#15803d] cursor-pointer transition-colors">
                    Approve
                  </button>
                  <button onClick={() => reject(item.id)}
                    className="text-[10px] font-medium px-2 py-1 border border-[#e4e4e7] dark:border-[#3f3f46] text-[#71717a] dark:text-[#a1a1aa] rounded hover:text-[#dc2626] hover:border-[#dc2626] cursor-pointer transition-colors">
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && (
        <div className="bg-[#fafafa] dark:bg-[#27272a] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-6 text-center">
          <p className="text-[13px] font-medium text-[#18181b] dark:text-[#fafafa]">All clear</p>
          <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a] mt-1">No pending changes to review.</p>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-1">{resolved.length} resolved</p>
          <div className="space-y-0">
            {resolved.slice(0, 5).map(item => (
              <div key={item.id} className="flex items-center gap-3 py-1.5 text-[11px]">
                <span className={`font-medium ${item.status === "approved" ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
                  {item.status === "approved" ? "✓" : "✗"}
                </span>
                <span className="text-[#71717a] dark:text-[#a1a1aa]">{item.unit}</span>
                <span className="text-[#a1a1aa] dark:text-[#71717a]">{item.field}: {item.oldValue} → {item.newValue}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduledTriggers() {
  const triggers = [
    { id: "t1", name: "Daily Rent Roll Sync", schedule: "Every day at 8:00 AM CT", source: "Yardi", status: "Active", lastRun: "2026-03-15 08:00", nextRun: "2026-03-16 08:00" },
    { id: "t2", name: "Daily Lease Ledger Sync", schedule: "Every day at 8:05 AM CT", source: "Yardi", status: "Active", lastRun: "2026-03-15 08:05", nextRun: "2026-03-16 08:05" },
    { id: "t3", name: "Monthly Income Statement", schedule: "1st of month at 9:00 AM CT", source: "Yardi", status: "Active", lastRun: "2026-03-01 09:00", nextRun: "2026-04-01 09:00" },
    { id: "t4", name: "Utility Bill PDF Scan", schedule: "15th of month at 10:00 AM CT", source: "CenterPoint", status: "Paused", lastRun: "2026-02-15 10:05", nextRun: "—" },
    { id: "t5", name: "Alert Evaluation", schedule: "Every 3 hours", source: "System", status: "Active", lastRun: "2026-03-15 14:00", nextRun: "2026-03-15 17:00" },
  ];
  return (
    <div className="mt-4 space-y-3">
      <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa]">Automated sync schedules. Paused triggers will not run until re-enabled.</p>
      <div className="space-y-0 border border-[#e4e4e7] dark:border-[#3f3f46] rounded overflow-hidden">
        {triggers.map(t => (
          <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-[#f4f4f5] dark:border-[#27272a] last:border-0 bg-white dark:bg-[#18181b]">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.status === "Active" ? "bg-[#16a34a]" : "bg-[#a1a1aa]"}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-[#18181b] dark:text-[#fafafa]">{t.name}</p>
              <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">{t.schedule} · Source: {t.source}</p>
            </div>
            <div className="text-right flex-shrink-0 hidden sm:block">
              <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">Last: {t.lastRun}</p>
              <p className="text-[10px] text-[#71717a] dark:text-[#a1a1aa]">Next: {t.nextRun}</p>
            </div>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded flex-shrink-0 ${
              t.status === "Active" ? "text-[#16a34a] bg-emerald-50 dark:bg-emerald-950/30" : "text-[#a1a1aa] dark:text-[#71717a] bg-[#f4f4f5] dark:bg-[#27272a]"
            }`}>{t.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Smart Upload Flow ---
type UploadStep = "idle" | "classify" | "context" | "processing" | "done";
type FileCategory = "rent_roll" | "lease_ledger" | "income_statement" | "utility_bill" | "meeting_recording" | "other";

const fileCategoryLabels: Record<FileCategory, string> = {
  rent_roll: "Rent Roll",
  lease_ledger: "Lease Ledger",
  income_statement: "Income Statement",
  utility_bill: "Utility Bill",
  meeting_recording: "Meeting Recording",
  other: "Other",
};

function detectCategory(filename: string): FileCategory | null {
  const lower = filename.toLowerCase();
  if (lower.includes("rentroll") || lower.includes("rent_roll") || lower.includes("rent roll")) return "rent_roll";
  if (lower.includes("leaseledger") || lower.includes("lease_ledger") || lower.includes("ledger")) return "lease_ledger";
  if (lower.includes("income") || lower.includes("p&l") || lower.includes("financial")) return "income_statement";
  if (lower.includes("electric") || lower.includes("utility") || lower.includes("billing") || lower.includes("centerpoint")) return "utility_bill";
  if (lower.match(/\.(mp3|mp4|m4a|wav|webm|ogg)$/)) return "meeting_recording";
  if (lower.match(/otter|transcript|recording|meeting/)) return "meeting_recording";
  return null;
}

const contextQuestions: Record<FileCategory, string[]> = {
  meeting_recording: [
    "Who was on this call?",
    "What property/units does this pertain to?",
    "Any follow-up actions needed?",
  ],
  utility_bill: [
    "Which utility provider?",
    "Which billing period does this cover?",
  ],
  other: [
    "What type of document is this?",
    "Which property/units does it relate to?",
    "Any special processing instructions?",
  ],
  rent_roll: [],
  lease_ledger: [],
  income_statement: [],
};

function SmartUploadModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<UploadStep>("classify");
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<FileCategory | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState("");

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const detected = detectCategory(f.name);
    if (detected) {
      setCategory(detected);
      const qs = contextQuestions[detected];
      if (qs.length > 0) {
        setStep("context");
      } else {
        setStep("processing");
        setTimeout(() => setStep("done"), 2000);
      }
    } else {
      setStep("classify");
    }
  }

  function handleCategorySelect(cat: FileCategory) {
    setCategory(cat);
    const qs = contextQuestions[cat];
    if (qs.length > 0) {
      setStep("context");
    } else {
      setStep("processing");
      setTimeout(() => setStep("done"), 2000);
    }
  }

  function handleSubmitContext() {
    setStep("processing");
    setTimeout(() => setStep("done"), 2000);
  }

  const questions = category ? contextQuestions[category] : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded w-full max-w-[480px] mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e4e4e7] dark:border-[#3f3f46]">
          <p className="text-[14px] font-semibold text-[#18181b] dark:text-[#fafafa]">Upload File</p>
          <button onClick={onClose} className="text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* File picker */}
          {!file && (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#e4e4e7] dark:border-[#3f3f46] rounded p-8 cursor-pointer hover:border-[#a1a1aa] dark:hover:border-[#52525b] transition-colors">
              <p className="text-[13px] font-medium text-[#18181b] dark:text-[#fafafa]">Drop a file or click to browse</p>
              <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a] mt-1">.xlsx, .csv, .pdf, .mp3, .mp4, .m4a</p>
              <input type="file" className="hidden" accept=".xlsx,.csv,.pdf,.mp3,.mp4,.m4a,.wav,.webm,.ogg,.txt" onChange={handleFileSelect} />
            </label>
          )}

          {/* File selected — show name */}
          {file && (
            <div className="flex items-center gap-2 bg-[#fafafa] dark:bg-[#27272a] border border-[#e4e4e7] dark:border-[#3f3f46] rounded px-3 py-2">
              <p className="text-[12px] font-medium text-[#18181b] dark:text-[#fafafa] flex-1 truncate">{file.name}</p>
              <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
          )}

          {/* Classify — if auto-detect failed */}
          {step === "classify" && file && !category && (
            <div>
              <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] mb-2">What type of file is this?</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(fileCategoryLabels) as FileCategory[]).map(cat => (
                  <button key={cat} onClick={() => handleCategorySelect(cat)}
                    className="text-left text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] text-[#18181b] dark:text-[#fafafa] rounded hover:border-[#71717a] hover:bg-[#fafafa] dark:hover:bg-[#27272a] cursor-pointer transition-colors">
                    {fileCategoryLabels[cat]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Context questions */}
          {step === "context" && category && (() => {
            const allAnswered = questions.every((_, i) => (answers[i] || "").trim().length > 0);
            const unansweredCount = questions.filter((_, i) => !(answers[i] || "").trim()).length;
            return (
              <div className="space-y-3">
                <p className="text-[12px] font-medium text-[#18181b] dark:text-[#fafafa]">{fileCategoryLabels[category]} — Additional Context</p>
                <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">All fields are required before processing.</p>
                {questions.map((q, i) => {
                  const isEmpty = !(answers[i] || "").trim();
                  return (
                    <div key={i}>
                      <label className={`text-[11px] font-medium ${isEmpty ? "text-[#18181b] dark:text-[#fafafa]" : "text-[#71717a] dark:text-[#a1a1aa]"}`}>
                        {q} {isEmpty && <span className="text-[#dc2626]">*</span>}
                      </label>
                      <input type="text" value={answers[i] || ""} onChange={e => setAnswers({ ...answers, [i]: e.target.value })}
                        className={`w-full mt-1 text-[12px] px-2.5 py-1.5 border rounded bg-[#fafafa] dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa] ${
                          isEmpty ? "border-[#d4d4d8] dark:border-[#52525b]" : "border-[#16a34a]/30"
                        }`} />
                    </div>
                  );
                })}
                <div>
                  <label className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] font-medium">Additional notes (optional)</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Any other context for processing this file..."
                    rows={2}
                    className="w-full mt-1 text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa] resize-none" />
                </div>
                <div className="flex items-center justify-between">
                  {!allAnswered && (
                    <p className="text-[10px] text-[#dc2626]">{unansweredCount} required field{unansweredCount > 1 ? "s" : ""} remaining</p>
                  )}
                  {allAnswered && <span />}
                  <button onClick={handleSubmitContext} disabled={!allAnswered}
                    className={`text-[11px] font-medium px-4 py-1.5 rounded cursor-pointer transition-colors ${
                      allAnswered ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] hover:bg-[#27272a] dark:hover:bg-[#e4e4e7]" : "bg-[#e4e4e7] dark:bg-[#3f3f46] text-[#a1a1aa] dark:text-[#71717a] cursor-not-allowed"
                    }`}>
                    Process File
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Processing */}
          {step === "processing" && (
            <div className="text-center py-6">
              <div className="w-5 h-5 border-2 border-[#18181b] dark:border-[#fafafa] border-t-transparent dark:border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] mt-3">Processing {file?.name}...</p>
            </div>
          )}

          {/* Done */}
          {step === "done" && (
            <div className="text-center py-6">
              <p className="text-[14px] font-medium text-[#18181b] dark:text-[#fafafa]">File processed</p>
              <p className="text-[12px] text-[#a1a1aa] dark:text-[#71717a] mt-1">
                {file?.name} uploaded as {category ? fileCategoryLabels[category] : "file"}. Check the approval queue for any pending changes.
              </p>
              <button onClick={onClose}
                className="mt-4 text-[11px] font-medium px-4 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] cursor-pointer transition-colors">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DataPipelinePage() {
  const gridRef = useRef<AgGridReact>(null);
  const isMobile = useIsMobile();
  const syncJobs = useSyncJobs();
  const [selectedFile, setSelectedFile] = useState<FileSyncRow | null>(null);
  const [activeSection, setActiveSection] = useState<"workflow" | "protocol">("workflow");
  const [showUpload, setShowUpload] = useState(false);
  const [insightsRunning, setInsightsRunning] = useState(false);
  const [insightsResult, setInsightsResult] = useState<string | null>(null);
  const runInsights = useAction(api.insights.extractForProperty);
  const propertiesAvailable = useQuery(api.properties.list) ?? [];

  // Flatten sync_jobs into one row per attached file. Each sync_jobs row contains
  // a `files: [{storageId, fileName, reportType}]` array — show each file as its
  // own grid row, with download links via the storageId.
  const syncData = useMemo(() => {
    const friendlyType: Record<string, string> = {
      income_statement: "Income Statement",
      rent_roll: "Rent Roll",
      aging: "Aging",
      receivable: "Receivable Detail",
    };
    const friendlySource: Record<string, string> = {
      yardi_playwright: "Yardi Sync",
      yardi_sync: "Yardi Sync",
      yardi_auto: "Yardi Sync",
      n8n: "Scheduled Sync",
      manual_upload: "Manual Upload",
    };
    const labelSource = (s: string) => friendlySource[s] || s || "—";
    const rows: any[] = [];
    for (const job of syncJobs as any[]) {
      const completedAt = job.completedAt || job.startedAt || "";
      const statusLabel =
        job.status === "completed" ? "Success" :
        job.status === "partial"   ? "Warning" :
        job.status === "failed"    ? "Failed"  : (job.status || "");
      const baseDetail = job.errorMessage
        ? job.errorMessage
        : `${job.recordsCreated ?? 0} records ingested · source ${job.source ?? "—"}`;

      const files = Array.isArray(job.files) ? job.files : [];
      if (files.length === 0) {
        rows.push({
          id: job._id,
          jobId: job._id,
          storageId: undefined,
          filename: "(no files attached)",
          source: job.source ?? "",
          type: (job.reportTypes || []).map((t: string) => friendlyType[t] || t).join(", "),
          records: job.recordsCreated ?? 0,
          size: "",
          status: statusLabel,
          syncedAt: completedAt,
          statusDetail: baseDetail,
        });
        continue;
      }
      for (const f of files) {
        rows.push({
          id: `${job._id}-${f.storageId}`,
          jobId: job._id,
          storageId: f.storageId,
          filename: f.fileName,
          source: job.source ?? "",
          type: friendlyType[f.reportType] || f.reportType || "",
          records: job.recordsCreated ?? 0,
          size: "",
          status: statusLabel,
          syncedAt: completedAt,
          statusDetail: baseDetail,
        });
      }
    }
    return rows;
  }, [syncJobs]);

  const lastSyncLabel = useMemo(() => {
    if (syncData.length === 0) return "No syncs yet";
    const latest = [...syncData].sort((a: any, b: any) =>
      (b.syncedAt || "").localeCompare(a.syncedAt || "")
    )[0];
    if (!latest?.syncedAt) return "";
    // ISO → "Apr 30, 2026 2:51 PM"
    try {
      const d = new Date(latest.syncedAt);
      return `Last sync ${d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}`;
    } catch {
      return `Last sync ${latest.syncedAt}`;
    }
  }, [syncData]);

  const columnDefs = useMemo<ColDef[]>(() => {
    if (isMobile) {
      return [
        { field: "filename", headerName: "File", minWidth: 150, flex: 1,
          cellRenderer: (p: { value: string; data: FileSyncRow }) => (
            <div className="leading-tight py-1">
              <p className="text-[12px] font-medium text-[#18181b] dark:text-[#fafafa] truncate">{p.value}</p>
              <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">{p.data.type} · {p.data.size}</p>
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
      { field: "type", headerName: "Type", width: 160 },
      { field: "source", headerName: "Source", width: 130 },
      { field: "records", headerName: "Records", width: 95, type: "numericColumn" },
      { field: "syncedAt", headerName: "Last Updated", width: 180,
        valueFormatter: (p: { value: string }) => {
          if (!p.value) return "";
          try { return new Date(p.value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
          catch { return p.value; }
        }
      },
      { field: "status", headerName: "Status", width: 95, cellRenderer: StatusCell },
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
    if (row.statusDetail) {
      setSelectedFile(prev => prev?.id === row.id ? null : row);
    }
  }, []);

  return (
    <div>
      <PageHeader title="Data Pipeline" subtitle="File sync history — click any row for details">
        <button
          onClick={async () => {
            setInsightsRunning(true);
            setInsightsResult(null);
            try {
              const summaries: string[] = [];
              for (const p of propertiesAvailable as any[]) {
                if (!p.hasData) continue;
                const r: any = await runInsights({ propertyCode: p.code });
                summaries.push(`• ${p.name}: ${r.alertsCreated} insight${r.alertsCreated === 1 ? "" : "s"} — ${r.analysis}`);
              }
              setInsightsResult(summaries.join("\n\n") || "No properties with data yet.");
            } catch (err: any) {
              setInsightsResult(`Error: ${err?.message || err}`);
            } finally {
              setInsightsRunning(false);
            }
          }}
          disabled={insightsRunning || syncData.length === 0}
          className="text-[11px] font-medium px-3 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {insightsRunning ? "Running insights…" : "Run insights"}
        </button>
      </PageHeader>

      {insightsResult && (
        <div className="mt-2 mb-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 rounded p-3 text-[12px] text-[#18181b] dark:text-[#fafafa] whitespace-pre-wrap">
          <p className="text-[10px] font-semibold text-[#2563eb] dark:text-[#60a5fa] uppercase tracking-wide mb-1">Latest run</p>
          {insightsResult}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-3">
          <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa]">
            {syncData.length} file{syncData.length === 1 ? "" : "s"} · {lastSyncLabel}
          </p>
        </div>
        <input
          type="text"
          placeholder="Search files..."
          className="px-3 py-1.5 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded text-[12px] text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] focus:outline-none focus:border-[#71717a] w-full sm:w-48"
          onChange={(e) => gridRef.current?.api?.setGridOption("quickFilterText", e.target.value)}
        />
      </div>

      {syncData.length === 0 && (
        <div className="w-full border border-dashed border-[#e4e4e7] dark:border-[#3f3f46] rounded p-8 text-center mb-3 bg-white dark:bg-[#18181b]">
          <p className="text-[13px] text-[#71717a] dark:text-[#a1a1aa] mb-1">No syncs yet</p>
          <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a]">
            Sync history will appear here automatically once the Yardi integration runs.
            You can also use the <span className="font-medium">Upload</span> button above to ingest a file manually.
          </p>
        </div>
      )}
      <div className="ag-theme-alpine w-full rounded overflow-hidden border border-[#e4e4e7] dark:border-[#3f3f46]" style={{ height: isMobile ? 450 : 480, display: syncData.length === 0 ? "none" : "block" }}>
        <AgGridReact
          ref={gridRef}
          rowData={syncData}
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
      <div className="mt-8 flex gap-1 border-b border-[#e4e4e7] dark:border-[#3f3f46]">
        {([
          { key: "workflow" as const, label: "Processing Workflow" },
          { key: "protocol" as const, label: "Training Protocol" },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveSection(tab.key)}
            className={`text-[12px] font-medium px-3 py-2 border-b-2 transition-colors cursor-pointer ${
              activeSection === tab.key ? "border-[#18181b] dark:border-[#fafafa] text-[#18181b] dark:text-[#fafafa]" : "border-transparent text-[#a1a1aa] dark:text-[#71717a] hover:text-[#71717a] dark:hover:text-[#a1a1aa]"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeSection === "workflow" && (
        <div className="mt-4 space-y-4">
          <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa]">How data flows from Yardi to the dashboard while preserving your notes and overrides.</p>

          <div className="space-y-0">
            {[
              { step: "1", label: "Export", desc: "Yardi generates rent roll, lease ledger, income statement, and utility reports. Triggered by cron (auto) or manual upload.", status: "Automated sync" },
              { step: "2", label: "Validate", desc: "Parser checks file format, column headers, and data types. Flags warnings if columns are missing or values are out of range.", status: "Schema validation" },
              { step: "3", label: "Transform", desc: "Raw data is normalized: dates standardized, currency parsed, unit IDs matched to master list, new tenants detected.", status: "ETL pipeline" },
              { step: "4", label: "Merge with Overrides", desc: "User notes, status overrides, delinquency stages, and action items from previous cycles are preserved. New data is merged — never overwrites manual entries.", status: "Note preservation" },
              { step: "5", label: "Alert Evaluation", desc: "Training protocol rules are evaluated against new data. Alerts generated for: missing postings, late fees, lease expirations, threshold breaches.", status: "Rule engine" },
              { step: "6", label: "Push to Dashboard", desc: "Processed data replaces stale data. Charts, KPIs, site plan, and grids update. Kanban items auto-created for critical alerts if protocol says so.", status: "Live update" },
            ].map((s, i) => (
              <div key={i} className="flex gap-3 py-3 border-b border-[#f4f4f5] dark:border-[#27272a] last:border-0">
                <div className="w-6 h-6 rounded bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] text-[11px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">{s.step}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-[13px] font-medium text-[#18181b] dark:text-[#fafafa]">{s.label}</p>
                    <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">{s.status}</span>
                  </div>
                  <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] mt-0.5 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-[#fafafa] dark:bg-[#27272a] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 text-[11px] text-[#71717a] dark:text-[#a1a1aa]">
            Key guarantee: User notes, manual status changes, and Kanban items are <strong className="text-[#18181b] dark:text-[#fafafa]">never overwritten</strong> by data syncs.
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

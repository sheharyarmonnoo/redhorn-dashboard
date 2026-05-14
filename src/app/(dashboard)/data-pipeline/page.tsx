"use client";
import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, RowClickedEvent } from "ag-grid-community";
import { useSyncJobsWithLoading, useRvCommittedBundles } from "@/hooks/useConvexData";
import { useAgGridPersistence } from "@/hooks/useAgGridPersistence";
import { useTheme } from "@/components/ThemeProvider";
import PageHeader from "@/components/PageHeader";
import { Download, X, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

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

function StatusCell(props: { value: string }) {
  const v = props.value;
  const colors: Record<string, string> = { Success: "text-[#16a34a]", Warning: "text-[#d97706]", Failed: "text-[#dc2626]" };
  return <span className={`text-[11px] font-medium ${colors[v] || ""} cursor-pointer underline decoration-dotted`}>{v}</span>;
}

function DownloadCell(props: { data: FileSyncRow }) {
  const storageId = (props.data as any).storageId;
  const handle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!storageId) return;
    const proxyUrl = `/api/files/${storageId}?name=${encodeURIComponent(props.data.filename)}`;
    window.open(proxyUrl, "_blank", "noopener");
  };
  return (
    <button
      onClick={handle}
      disabled={!storageId}
      className="text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] transition-colors cursor-pointer p-1 disabled:opacity-40 disabled:cursor-not-allowed"
      title={storageId ? `Download ${props.data.filename}` : "Unavailable"}
    >
      <Download size={14} />
    </button>
  );
}

function DetailPanel({ file, onClose }: { file: FileSyncRow; onClose: () => void }) {
  const statusColor: Record<string, string> = {
    Success: "text-[#16a34a]",
    Warning: "text-[#d97706]",
    Failed: "text-[#dc2626]",
  };
  const sevText = statusColor[file.status] || statusColor.Failed;
  const storageId = (file as any).storageId as string | undefined;

  function downloadFile() {
    if (!storageId) return;
    const proxyUrl = `/api/files/${storageId}?name=${encodeURIComponent(file.filename)}`;
    window.open(proxyUrl, "_blank", "noopener");
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 dark:bg-black/60 rh-backdrop" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#18181b] border-l border-[#e4e4e7] dark:border-[#3f3f46] shadow-xl w-full max-w-md h-full overflow-y-auto rh-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4e4e7] dark:border-[#3f3f46] sticky top-0 bg-white dark:bg-[#18181b] z-10">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] truncate">{file.filename}</p>
            <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] mt-0.5">
              <span className={`font-medium uppercase ${sevText}`}>{file.status}</span>
              {file.type && <> · {file.type}</>}
            </p>
          </div>
          <button onClick={onClose} className="text-[16px] text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Source">{file.source || "—"}</Field>
          <Field label="Records ingested">{file.records.toLocaleString()}</Field>
          <Field label="Last synced">{formatSyncedAt(file.syncedAt)}</Field>
          {file.statusDetail && <Field label="Status detail">{file.statusDetail}</Field>}
          {file.affectedUnits && file.affectedUnits.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide mb-1">Affected units</p>
              <div className="flex flex-wrap gap-1">
                {file.affectedUnits.map(u => (
                  <span key={u} className="text-[11px] font-medium text-[#18181b] dark:text-[#fafafa] bg-[#fafafa] dark:bg-[#27272a] border border-[#e4e4e7] dark:border-[#3f3f46] rounded px-2 py-0.5">{u}</span>
                ))}
              </div>
            </div>
          )}
          {file.resolution && <Field label="Recommended action">{file.resolution}</Field>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#e4e4e7] dark:border-[#3f3f46] sticky bottom-0 bg-white dark:bg-[#18181b]">
          <button
            onClick={onClose}
            className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] px-3 py-1.5 rounded cursor-pointer"
          >
            Close
          </button>
          {storageId && (
            <button
              onClick={downloadFile}
              className="flex items-center gap-1.5 text-[12px] font-medium bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] px-3 py-1.5 rounded cursor-pointer"
            >
              <Download size={13} /> Download .xlsx
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide mb-1">{label}</p>
      <div className="text-[12px] text-[#18181b] dark:text-[#fafafa] leading-relaxed">{children}</div>
    </div>
  );
}

function formatSyncedAt(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return iso; }
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
      <div className="absolute inset-0 bg-black/30 dark:bg-black/60 rh-backdrop" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded w-full max-w-[480px] mx-4 overflow-hidden rh-modal">
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
  const { jobs: syncJobs, loading: syncJobsLoading } = useSyncJobsWithLoading();
  const { bundles: rvBundles } = useRvCommittedBundles();
  const [selectedFile, setSelectedFile] = useState<FileSyncRow | null>(null);
  const [activeSection, setActiveSection] = useState<"workflow" | "protocol">("workflow");
  const [showUpload, setShowUpload] = useState(false);
  // Insights run from the daily sync wrapper now — no in-dashboard trigger.

  // Flatten sync_jobs into one row per attached file. Each sync_jobs row contains
  // a `files: [{storageId, fileName, reportType}]` array — show each file as its
  // own grid row, with download links via the storageId.
  const syncData = useMemo(() => {
    const friendlyType: Record<string, string> = {
      income_statement: "Income Statement",
      rent_roll: "Rent Roll",
      rent_roll_full: "Rent Roll (Full)",
      total_units: "Total Units",
      past_due: "Past Due",
      gl_detail: "GL Detail",
      receivable_detail: "Receivable Detail",
      aging: "Aging",
      receivable: "Receivable Detail",
    };
    const friendlySource: Record<string, string> = {
      yardi_playwright: "Yardi Sync",
      yardi_sync: "Yardi Sync",
      yardi_sync_historical: "Yardi (Historical)",
      yardi_auto: "Yardi Sync",
      n8n: "Scheduled Sync",
      manual_upload: "Manual Upload",
    };
    const labelSource = (s: string) => friendlySource[s] || s || "—";
    const propertyByCode: Record<string, string> = {
      hol: "Hollister",
      hollister: "Hollister",
      bel: "Belgold",
      belgold: "Belgold",
    };
    const propertyFromCode = (code?: string) =>
      code ? (propertyByCode[code.toLowerCase()] || code) : "";
    const propertyFromFilename = (name: string) => {
      const m = (name || "").toLowerCase().match(/^([a-z]+)[-_]/);
      return m ? (propertyByCode[m[1]] || "") : "";
    };
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
          property: propertyFromCode(job.propertyCode) || propertyFromFilename(""),
          source: labelSource(job.source),
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
          property: propertyFromFilename(f.fileName) || propertyFromCode(job.propertyCode) || "—",
          source: labelSource(job.source),
          type: friendlyType[f.reportType] || f.reportType || "",
          records: typeof f.rowsIngested === "number" ? f.rowsIngested : (job.recordsCreated ?? 0),
          size: "",
          status: statusLabel,
          syncedAt: completedAt,
          statusDetail: baseDetail,
        });
      }
    }
    // Merge in committed RV monthly bundles — same row shape as Yardi
    // sync_jobs so the grid renders them in lock-step. fileType strings from
    // the RV pipeline get the same "friendly type" treatment Yardi reports do.
    const friendlyRvType: Record<string, string> = {
      rentRoll: "Rent Roll",
      balances: "Guests with Balance",
      pos: "POS Sales",
      payments: "Total Payment",
      financial: "Financial Package",
      labor: "Labor / Payroll",
    };
    for (const b of (rvBundles || []) as any[]) {
      const committedAtIso = b.committedAt ? new Date(b.committedAt).toISOString() : "";
      const baseDetail = `Bundle ${b.period} · ${b.files.length} file${b.files.length === 1 ? "" : "s"} committed${b.committedBy ? ` by ${b.committedBy}` : ""}`;
      for (const f of b.files || []) {
        rows.push({
          id: `${b._id}-${f.id}`,
          jobId: b._id,
          storageId: f.storageId,
          filename: f.name,
          property: b.propertyName || "RV Park",
          source: "Manual Upload",
          type: friendlyRvType[f.fileType] || f.fileType || "",
          records: typeof f.rowsParsed === "number" ? f.rowsParsed : 0,
          size: "",
          status: f.parseError ? "Failed" : "Success",
          syncedAt: committedAtIso,
          statusDetail: f.parseError || baseDetail,
        });
      }
    }
    return rows;
  }, [syncJobs, rvBundles]);

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
      { field: "property", headerName: "Property", width: 120, filter: true },
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

  const persistence = useAgGridPersistence({ storageKey: "redhorn_grid_data_pipeline" });

  const onRowClicked = useCallback((event: RowClickedEvent) => {
    const row = event.data as FileSyncRow;
    if (row.statusDetail) {
      setSelectedFile(prev => prev?.id === row.id ? null : row);
    }
  }, []);

  return (
    <div>
      <PageHeader title="Data Pipeline" subtitle="File sync history — click any row for details" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-3">
          <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa]">
            {syncData.length} file{syncData.length === 1 ? "" : "s"} · {lastSyncLabel}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            className="px-3 py-1.5 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded text-[12px] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a]"
            onChange={(e) => {
              const val = e.target.value;
              const api = gridRef.current?.api;
              if (!api) return;
              if (val === "all") {
                api.setColumnFilterModel("property", null).then(() => api.onFilterChanged());
              } else {
                api.setColumnFilterModel("property", { type: "equals", filter: val }).then(() => api.onFilterChanged());
              }
            }}
            defaultValue="all"
          >
            <option value="all">All properties</option>
            {Array.from(new Set(syncData.map((r: any) => r.property).filter((p: string) => p && p !== "—"))).sort().map((p: any) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search files..."
            className="px-3 py-1.5 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded text-[12px] text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] focus:outline-none focus:border-[#71717a] w-full sm:w-48"
            onChange={(e) => gridRef.current?.api?.setGridOption("quickFilterText", e.target.value)}
          />
        </div>
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
      <div className="ag-theme-alpine w-full rounded overflow-hidden border border-[#e4e4e7] dark:border-[#3f3f46]" style={{ height: isMobile ? 520 : "calc(100vh - 320px)", minHeight: 520, display: syncData.length === 0 ? "none" : "block" }}>
        <AgGridReact
          ref={gridRef}
          rowData={syncData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={persistence.onGridReady}
          onColumnResized={persistence.onColumnResized}
          onColumnMoved={persistence.onColumnMoved}
          onColumnVisible={persistence.onColumnVisible}
          onColumnPinned={persistence.onColumnPinned}
          onSortChanged={persistence.onSortChanged}
          onRowClicked={onRowClicked}
          animateRows={true}
          pagination={true}
          paginationPageSize={20}
          paginationPageSizeSelector={[10, 20, 50, 100]}
          getRowId={(params) => String(params.data.id)}
        />
      </div>

      <FileVolumeChart syncJobs={syncJobs} rvBundles={rvBundles} loading={syncJobsLoading} />

      {selectedFile && (
        <DetailPanel file={selectedFile} onClose={() => setSelectedFile(null)} />
      )}
    </div>
  );
}

// File-volume chart — counts files per property per bucket (day or week).
// Sources from sync_jobs.files[].fileName ("hol-...", "bel-...") for commercial
// + rv_upload_bundles.files for RV park, since RV files come in via the
// monthly Manual Upload pipeline rather than Yardi sync.
function FileVolumeChart({ syncJobs, rvBundles, loading }: { syncJobs: any[]; rvBundles: any[]; loading?: boolean }) {
  const [bucket, setBucket] = useState<"day" | "week">("day");
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const { categories, series } = useMemo(() => {
    const hasSync = syncJobs && syncJobs.length > 0;
    const hasRv = rvBundles && rvBundles.length > 0;
    if (!hasSync && !hasRv) return { categories: [] as string[], series: [] as any[] };
    // Bucket key → display name. Includes both the legacy "brad" filename
    // prefix path and the actual rv_upload_bundles propertyCode ("rv-ohio")
    // so the chart legend reads cleanly regardless of which RV property
    // committed the bundle. Anything else falls back to a humanized form
    // of the code below.
    const propNames: Record<string, string> = {
      hol: "Hollister",
      bel: "Belgold",
      brad: "RV Park",
      "rv-ohio": "RV Ohio",
    };
    const buckets: Record<string, Record<string, number>> = {}; // propCode -> bucketKey -> count

    for (const job of syncJobs ?? []) {
      const date = new Date(job._creationTime ?? Date.now());
      const key = bucket === "day" ? toDayKey(date) : toWeekKey(date);
      for (const f of (job.files ?? []) as Array<{ fileName?: string }>) {
        const prefix = (f.fileName || "").split("-")[0];
        if (!prefix) continue;
        if (!buckets[prefix]) buckets[prefix] = {};
        buckets[prefix][key] = (buckets[prefix][key] || 0) + 1;
      }
    }

    // RV bundles bucket against committedAt so the chart reflects when Max
    // actually loaded the month, not when the bundle was first staged. Each
    // bundle's files[] is the user-attached payload (rent roll, balances,
    // POS, payments, financial package).
    for (const b of rvBundles ?? []) {
      const ts = b.committedAt ? new Date(b.committedAt) : new Date(b._creationTime ?? Date.now());
      const key = bucket === "day" ? toDayKey(ts) : toWeekKey(ts);
      const code = (b.propertyCode || "brad").toLowerCase();
      const fileCount = Array.isArray(b.files) ? b.files.length : 0;
      if (fileCount === 0) continue;
      if (!buckets[code]) buckets[code] = {};
      buckets[code][key] = (buckets[code][key] || 0) + fileCount;
    }

    const allKeys = new Set<string>();
    for (const m of Object.values(buckets)) for (const k of Object.keys(m)) allKeys.add(k);
    const categories = Array.from(allKeys).sort();
    // Generic humanizer — any propertyCode like "rv-foo" or "rv_bar" that
    // isn't in the static map renders as "RV Foo" / "RV Bar" so a new RV
    // property doesn't ship as a raw code in the chart legend.
    const humanize = (code: string) => {
      const known = propNames[code];
      if (known) return known;
      const m = code.match(/^rv[-_]([a-z]+)$/i);
      if (m) return `RV ${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()}`;
      return code;
    };
    const series = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, counts]) => ({
        name: humanize(code),
        data: categories.map(c => counts[c] || 0),
      }));
    return { categories, series };
  }, [syncJobs, rvBundles, bucket]);

  const axisColor = isDark ? "#71717a" : "#a1a1aa";
  const gridColor = isDark ? "#27272a" : "#f4f4f5";

  const options: ApexCharts.ApexOptions = {
    chart: { type: "line", toolbar: { show: false }, fontFamily: "'Inter', -apple-system, system-ui, sans-serif", background: "transparent" },
    theme: { mode: isDark ? "dark" : "light" },
    colors: isDark ? ["#fafafa", "#a1a1aa", "#71717a"] : ["#18181b", "#71717a", "#a1a1aa"],
    stroke: { curve: "smooth", width: 2 },
    markers: { size: 4, strokeWidth: 2, hover: { sizeOffset: 2 } },
    xaxis: {
      categories,
      labels: { style: { colors: axisColor, fontSize: "11px" }, formatter: (v: string) => formatBucketLabel(v, bucket) },
    },
    yaxis: { labels: { style: { colors: axisColor, fontSize: "11px" }, formatter: (v: number) => String(Math.round(v)) }, min: 0 },
    grid: { borderColor: gridColor, strokeDashArray: 0 },
    legend: { position: "top", horizontalAlign: "right", fontSize: "11px", markers: { size: 6, shape: "square" as const }, labels: { colors: axisColor } },
    tooltip: { theme: isDark ? "dark" : "light", y: { formatter: (v: number) => `${v} file${v === 1 ? "" : "s"}` } },
    dataLabels: { enabled: false },
  };

  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-4 mt-6">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Files Loaded</p>
        <div className="inline-flex border border-[#e4e4e7] dark:border-[#3f3f46] rounded overflow-hidden text-[11px] font-medium">
          {(["day", "week"] as const).map(b => (
            <button
              key={b}
              onClick={() => setBucket(b)}
              className={`px-2.5 py-1 cursor-pointer transition-colors ${
                bucket === b
                  ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b]"
                  : "text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a]"
              }`}
            >
              {b === "day" ? "Daily" : "Weekly"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a] mb-3">
        {bucket === "day" ? "Per-day file count by property" : "Per-week file count by property (week starts Monday)"}
      </p>
      {loading ? (
        <div className="h-60 flex items-end gap-2 animate-pulse" aria-hidden>
          {[55, 70, 45, 80, 60, 75, 50].map((h, i) => (
            <div key={i} className="flex-1 bg-[#f4f4f5] dark:bg-[#27272a] rounded-t" style={{ height: `${h}%` }} />
          ))}
        </div>
      ) : categories.length > 0 ? (
        <Chart options={options} series={series} type="line" height={240} />
      ) : (
        <p className="text-[12px] text-[#a1a1aa] dark:text-[#71717a] text-center py-12">No sync history yet.</p>
      )}
    </div>
  );
}

function toDayKey(d: Date): string {
  // YYYY-MM-DD in local time so a sync at 23:55 doesn't bleed into "next day"
  // for users in negative-UTC zones. Most syncs happen overnight so this matters.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toWeekKey(d: Date): string {
  // Monday-anchored ISO-style week: returns YYYY-MM-DD of that week's Monday.
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = date.getDay(); // 0 Sun, 1 Mon, ... 6 Sat
  const diff = (dow + 6) % 7; // distance back to Monday
  date.setDate(date.getDate() - diff);
  return toDayKey(date);
}

function formatBucketLabel(key: string, bucket: "day" | "week"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (bucket === "day") {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  // week — show "May 5" for the Monday
  return `Wk ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

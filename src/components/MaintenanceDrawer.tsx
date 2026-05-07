"use client";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { X, Pencil, Trash2, MessageSquare, Check, RotateCcw } from "lucide-react";
import { formatCurrency } from "@/hooks/useConvexData";

const CATEGORIES = ["repair", "inspection", "routine", "emergency", "preventative"] as const;
const FREQUENCIES = ["monthly", "quarterly", "biannually", "annually"] as const;
const STATUSES = ["scheduled", "in_progress", "completed", "open"] as const;

interface MaintenanceItem {
  _id: string;
  date?: string;
  category?: string;
  type?: string;
  description?: string;
  status?: string;
  unit?: string;
  vendor?: string;
  cost?: number;
  isRecurring?: boolean;
  recurFrequency?: string;
  nextDueDate?: string;
  meetingNotes?: Array<{ id: string; text: string; author: string; createdAt: number }>;
  updatedAt?: number;
  _creationTime?: number;
}

interface FormState {
  date: string;
  category: string;
  type: string;
  description: string;
  unit: string;
  vendor: string;
  cost: string;
  status: string;
  isRecurring: boolean;
  recurFrequency: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function categoryDot(cat?: string): string {
  switch (cat) {
    case "emergency": return "bg-[#dc2626]";
    case "repair": return "bg-[#d97706]";
    case "inspection": return "bg-[#2563eb]";
    case "routine": return "bg-[#16a34a]";
    case "preventative": return "bg-[#0891b2]";
    default: return "bg-[#a1a1aa]";
  }
}

function statusBadge(status?: string): { label: string; className: string } {
  const s = (status || "").toLowerCase();
  if (s === "completed") return { label: "Completed", className: "bg-[#16a34a]/10 text-[#16a34a]" };
  if (s === "in_progress") return { label: "In Progress", className: "bg-[#d97706]/10 text-[#d97706]" };
  if (s === "scheduled") return { label: "Scheduled", className: "bg-[#2563eb]/10 text-[#2563eb]" };
  if (s === "open") return { label: "Open", className: "bg-[#dc2626]/10 text-[#dc2626]" };
  return { label: status || "—", className: "bg-[#71717a]/10 text-[#71717a]" };
}

function formatShortDate(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatDateTime(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface Props {
  open: boolean;
  item: MaintenanceItem | null;
  unitOptions: string[];
  onClose: () => void;
  onSave: (patch: Partial<MaintenanceItem>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onComplete: (id: string) => Promise<void>;
  onAddNote: (text: string) => Promise<void>;
  onRemoveNote: (noteId: string) => Promise<void>;
}

export default function MaintenanceDrawer({
  open,
  item,
  unitOptions,
  onClose,
  onSave,
  onDelete,
  onComplete,
  onAddNote,
  onRemoveNote,
}: Props) {
  const { user } = useUser();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [postingNote, setPostingNote] = useState(false);

  useEffect(() => {
    if (item) {
      setForm({
        date: item.date || todayISO(),
        category: item.category || "repair",
        type: item.type || "",
        description: item.description || "",
        unit: item.unit || "",
        vendor: item.vendor || "",
        cost: item.cost != null ? String(item.cost) : "",
        status: item.status || "open",
        isRecurring: !!item.isRecurring,
        recurFrequency: item.recurFrequency || "annually",
      });
      setEditing(false);
      setNoteDraft("");
    }
  }, [item?._id]);

  if (!open || !item || !form) return null;

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    try {
      const cost = form.cost.trim() ? Number(form.cost) : undefined;
      await onSave({
        date: form.date,
        category: form.category,
        type: form.type.trim(),
        description: form.description.trim(),
        unit: form.unit.trim() || undefined,
        vendor: form.vendor.trim() || undefined,
        cost: cost != null && Number.isFinite(cost) ? cost : undefined,
        status: form.status,
        isRecurring: form.isRecurring,
        recurFrequency: form.isRecurring ? form.recurFrequency : undefined,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    if (!item) return;
    setForm({
      date: item.date || todayISO(),
      category: item.category || "repair",
      type: item.type || "",
      description: item.description || "",
      unit: item.unit || "",
      vendor: item.vendor || "",
      cost: item.cost != null ? String(item.cost) : "",
      status: item.status || "open",
      isRecurring: !!item.isRecurring,
      recurFrequency: item.recurFrequency || "annually",
    });
    setEditing(false);
  }

  async function handleAddNote() {
    const text = noteDraft.trim();
    if (!text) return;
    setPostingNote(true);
    try {
      await onAddNote(text);
      setNoteDraft("");
    } finally {
      setPostingNote(false);
    }
  }

  const badge = statusBadge(item.status);
  const sortedNotes = [...(item.meetingNotes || [])].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" />
      <div
        className="relative bg-white dark:bg-[#18181b] border-l border-[#e4e4e7] dark:border-[#3f3f46] shadow-2xl w-full max-w-[560px] h-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#e4e4e7] dark:border-[#3f3f46]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-1.5 h-1.5 rounded-full ${categoryDot(item.category)}`} />
              <span className="text-[10px] uppercase tracking-wide text-[#a1a1aa] dark:text-[#71717a]">
                {item.category || "—"}
              </span>
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${badge.className}`}>
                {badge.label}
              </span>
              {item.isRecurring && item.recurFrequency && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-[#0891b2]">
                  <RotateCcw className="w-2.5 h-2.5" />
                  {item.recurFrequency}
                </span>
              )}
            </div>
            <p className="text-[16px] font-semibold text-[#18181b] dark:text-[#fafafa] truncate">
              {item.type || "(untitled)"}
            </p>
            <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-0.5">
              Last updated {formatDateTime(item.updatedAt || item._creationTime)}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-3 shrink-0">
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                title="Edit"
                className="p-1.5 rounded hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            {!editing && item.status !== "completed" && (
              <button
                onClick={() => onComplete(item._id)}
                title={item.isRecurring ? "Mark this cycle complete + advance next due date" : "Mark complete"}
                className="p-1.5 rounded hover:bg-[#16a34a]/10 text-[#16a34a] cursor-pointer"
              >
                <Check className="w-4 h-4" />
              </button>
            )}
            {!editing && (
              <button
                onClick={async () => {
                  if (!window.confirm("Delete this maintenance item? This cannot be undone.")) return;
                  await onDelete(item._id);
                  onClose();
                }}
                title="Delete"
                className="p-1.5 rounded hover:bg-[#dc2626]/10 text-[#dc2626] cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] cursor-pointer"
            >
              <X className="w-4 h-4 text-[#71717a]" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!editing ? (
            <ViewMode item={item} />
          ) : (
            <EditMode form={form} setForm={setForm} unitOptions={unitOptions} />
          )}

          {/* Meeting Notes — always visible */}
          <div className="pt-3 border-t border-[#e4e4e7] dark:border-[#3f3f46]">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-[#a1a1aa] dark:text-[#71717a] mb-2 flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" />
              Meeting Notes {sortedNotes.length > 0 && (
                <span className="text-[#71717a]">({sortedNotes.length})</span>
              )}
            </p>

            {sortedNotes.length > 0 && (
              <div className="space-y-2 mb-3 max-h-[260px] overflow-y-auto">
                {sortedNotes.map((n) => (
                  <div
                    key={n.id}
                    className="bg-[#fafafa] dark:bg-[#27272a] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-2.5"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-[11px] font-medium text-[#18181b] dark:text-[#fafafa]">
                        {n.author}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] tabular-nums">
                          {formatDateTime(n.createdAt)}
                        </span>
                        <button
                          onClick={() => onRemoveNote(n.id)}
                          title="Delete note"
                          className="text-[#a1a1aa] hover:text-[#dc2626] cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] whitespace-pre-wrap leading-relaxed">
                      {n.text}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <textarea
              rows={2}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleAddNote();
                }
              }}
              placeholder="Add a meeting note… (Cmd/Ctrl + Enter to post)"
              className="w-full bg-white dark:bg-[#0a0a0a] border border-[#e4e4e7] dark:border-[#3f3f46] rounded px-2.5 py-1.5 text-[12px] text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] focus:outline-none focus:border-[#71717a]"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleAddNote}
                disabled={postingNote || !noteDraft.trim()}
                className="text-[11px] font-medium px-2.5 py-1 rounded bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] hover:opacity-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {postingNote ? "Posting…" : "Post Note"}
              </button>
            </div>
          </div>
        </div>

        {/* Edit footer */}
        {editing && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#e4e4e7] dark:border-[#3f3f46]">
            <button
              onClick={handleCancelEdit}
              disabled={saving}
              className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] px-3 py-1.5 rounded cursor-pointer disabled:opacity-30"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.type.trim()}
              className="text-[12px] font-medium bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] hover:opacity-90 px-4 py-1.5 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ViewMode({ item }: { item: MaintenanceItem }) {
  return (
    <>
      {item.description && (
        <DetailBlock label="Description">
          <p className="text-[13px] text-[#18181b] dark:text-[#fafafa] whitespace-pre-wrap leading-relaxed">
            {item.description}
          </p>
        </DetailBlock>
      )}
      <div className="grid grid-cols-2 gap-4">
        <DetailBlock label="Date">
          <p className="text-[13px] text-[#18181b] dark:text-[#fafafa]">{formatShortDate(item.date)}</p>
        </DetailBlock>
        <DetailBlock label="Unit">
          <p className="text-[13px] text-[#18181b] dark:text-[#fafafa]">{item.unit || "Property-wide"}</p>
        </DetailBlock>
        <DetailBlock label="Vendor">
          <p className="text-[13px] text-[#18181b] dark:text-[#fafafa]">{item.vendor || "—"}</p>
        </DetailBlock>
        <DetailBlock label="Cost">
          <p className="text-[13px] text-[#18181b] dark:text-[#fafafa]">
            {item.cost ? formatCurrency(item.cost) : "—"}
          </p>
        </DetailBlock>
        {item.isRecurring && item.nextDueDate && (
          <DetailBlock label="Next Due">
            <p className="text-[13px] text-[#18181b] dark:text-[#fafafa]">{formatShortDate(item.nextDueDate)}</p>
          </DetailBlock>
        )}
      </div>
    </>
  );
}

function EditMode({
  form,
  setForm,
  unitOptions,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  unitOptions: string[];
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Category">
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className={inputCls}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Type">
        <input
          type="text"
          placeholder="e.g. Roof leak, HVAC service, Plumbing repair"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          className={inputCls}
        />
      </Field>
      <Field label="Description">
        <textarea
          rows={2}
          placeholder="Details, scope, vendor notes…"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit (optional)">
          <select
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            className={inputCls}
          >
            <option value="">— Property-wide —</option>
            {unitOptions.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            className={inputCls}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vendor">
          <input
            type="text"
            placeholder="e.g. Acme HVAC"
            value={form.vendor}
            onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Cost ($)">
          <input
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={form.cost}
            onChange={(e) => setForm({ ...form, cost: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-[#18181b] dark:text-[#fafafa] cursor-pointer">
        <input
          type="checkbox"
          checked={form.isRecurring}
          onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
          className="cursor-pointer"
        />
        Recurring task — reschedule automatically when completed
      </label>
      {form.isRecurring && (
        <Field label="Frequency">
          <select
            value={form.recurFrequency}
            onChange={(e) => setForm({ ...form, recurFrequency: e.target.value })}
            className={inputCls}
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>
            ))}
          </select>
        </Field>
      )}
    </>
  );
}

const inputCls =
  "w-full bg-white dark:bg-[#0a0a0a] border border-[#e4e4e7] dark:border-[#3f3f46] rounded px-2.5 py-1.5 text-[12px] text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] focus:outline-none focus:border-[#71717a]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide font-semibold text-[#a1a1aa] dark:text-[#71717a] mb-1">
        {label}
      </p>
      {children}
    </div>
  );
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide font-semibold text-[#a1a1aa] dark:text-[#71717a] mb-1">
        {label}
      </p>
      {children}
    </div>
  );
}

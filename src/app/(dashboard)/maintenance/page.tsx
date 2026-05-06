"use client";
import { useMemo, useState } from "react";
import { Plus, X, Check, Trash2, RotateCcw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useActiveProperty, useUnits, useMaintenance, formatCurrency } from "@/hooks/useConvexData";

type Tab = "active" | "completed" | "routine";

const CATEGORIES = ["repair", "inspection", "routine", "emergency", "preventative"] as const;
const FREQUENCIES = ["monthly", "quarterly", "biannually", "annually"] as const;
const STATUSES = ["scheduled", "in_progress", "completed", "open"] as const;

// Pre-built recurring maintenance templates the client called out:
// gutter cleaning, drainage inspection, HVAC service. Clicking one of
// these opens the modal pre-filled so the user only has to confirm.
const QUICK_ADD_TEMPLATES: Array<{
  label: string;
  type: string;
  description: string;
  category: string;
  frequency: typeof FREQUENCIES[number];
}> = [
  { label: "Gutter Cleaning", type: "Gutter Cleaning", description: "Clear gutters and downspouts of debris", category: "routine", frequency: "quarterly" },
  { label: "Drainage Inspection", type: "Drainage Inspection", description: "Inspect site drainage and catch basins", category: "inspection", frequency: "biannually" },
  { label: "HVAC Service", type: "HVAC Service", description: "Annual HVAC tune-up and filter replacement", category: "preventative", frequency: "annually" },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
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

function statusBadge(status: string): { label: string; className: string } {
  const s = (status || "").toLowerCase();
  if (s === "completed") return { label: "Completed", className: "bg-[#16a34a]/10 text-[#16a34a]" };
  if (s === "in_progress") return { label: "In Progress", className: "bg-[#d97706]/10 text-[#d97706]" };
  if (s === "scheduled") return { label: "Scheduled", className: "bg-[#2563eb]/10 text-[#2563eb]" };
  if (s === "open") return { label: "Open", className: "bg-[#dc2626]/10 text-[#dc2626]" };
  return { label: status || "—", className: "bg-[#71717a]/10 text-[#71717a]" };
}

function formatShortDate(iso?: string): string {
  if (!iso) return "—";
  // Parse as UTC so the day matches the stored ISO regardless of TZ.
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
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

function blankForm(): FormState {
  return {
    date: todayISO(),
    category: "repair",
    type: "",
    description: "",
    unit: "",
    vendor: "",
    cost: "",
    status: "open",
    isRecurring: false,
    recurFrequency: "annually",
  };
}

export default function MaintenancePage() {
  const property = useActiveProperty();
  const { items, loading, create, update, remove, markCompleted } = useMaintenance(property?._id);
  const units = useUnits(property?._id);

  const [tab, setTab] = useState<Tab>("active");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());
  const [saving, setSaving] = useState(false);

  // Stats — computed off the full unfiltered list so they don't change as
  // the user toggles tabs.
  const stats = useMemo(() => {
    const total = items.length;
    const open = items.filter((i: any) => i.status !== "completed").length;
    const startMonth = startOfMonthISO();
    const today = todayISO();
    const thisMonth = items.filter((i: any) => i.date && i.date >= startMonth && i.date <= today).length;
    // Overdue = recurring item whose nextDueDate is past, OR open non-recurring
    // item dated more than 14 days ago without completion.
    const overdue = items.filter((i: any) => {
      if (i.status === "completed") return false;
      if (i.isRecurring && i.nextDueDate && i.nextDueDate < today) return true;
      if (!i.isRecurring && i.date && diffDays(today, i.date) > 14) return true;
      return false;
    }).length;
    return { total, open, thisMonth, overdue };
  }, [items]);

  const filtered = useMemo(() => {
    if (tab === "completed") return items.filter((i: any) => i.status === "completed");
    if (tab === "routine") return items.filter((i: any) => i.isRecurring);
    return items.filter((i: any) => i.status !== "completed");
  }, [items, tab]);

  function openAddModal() {
    setEditingId(null);
    setForm(blankForm());
    setModalOpen(true);
  }

  function openTemplate(idx: number) {
    const t = QUICK_ADD_TEMPLATES[idx];
    setEditingId(null);
    setForm({
      ...blankForm(),
      type: t.type,
      description: t.description,
      category: t.category,
      isRecurring: true,
      recurFrequency: t.frequency,
      status: "scheduled",
    });
    setModalOpen(true);
  }

  function openEdit(row: any) {
    setEditingId(row._id);
    setForm({
      date: row.date || todayISO(),
      category: row.category || "repair",
      type: row.type || "",
      description: row.description || "",
      unit: row.unit || "",
      vendor: row.vendor || "",
      cost: row.cost != null ? String(row.cost) : "",
      status: row.status || "open",
      isRecurring: !!row.isRecurring,
      recurFrequency: row.recurFrequency || "annually",
    });
    setModalOpen(true);
  }

  async function onSave() {
    if (!property?._id) return;
    if (!form.type.trim()) return;
    setSaving(true);
    try {
      const cost = form.cost.trim() ? Number(form.cost) : undefined;
      const payload = {
        date: form.date,
        category: form.category || undefined,
        type: form.type.trim(),
        description: form.description.trim(),
        unit: form.unit.trim() || undefined,
        vendor: form.vendor.trim() || undefined,
        cost: cost != null && Number.isFinite(cost) ? cost : undefined,
        status: form.status,
        isRecurring: form.isRecurring,
        recurFrequency: form.isRecurring ? form.recurFrequency : undefined,
      };
      if (editingId) {
        await update({ id: editingId as any, ...payload });
      } else {
        await create({ propertyId: property._id as any, ...payload });
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function onComplete(id: string) {
    await markCompleted({ id: id as any });
  }

  async function onDelete(id: string) {
    if (!window.confirm("Delete this maintenance item? This cannot be undone.")) return;
    await remove({ id: id as any });
  }

  if (!property) return null;

  return (
    <div>
      <PageHeader
        title="Maintenance"
        subtitle="Track repairs, inspections, and routine tasks"
      >
        <button
          onClick={openAddModal}
          className="flex items-center gap-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] text-[12px] font-medium px-3 py-1.5 rounded hover:opacity-90 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Item
        </button>
      </PageHeader>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        <StatBox label="Total Items" value={stats.total} />
        <StatBox label="Open" value={stats.open} color={stats.open > 0 ? "text-[#d97706]" : undefined} />
        <StatBox label="Overdue" value={stats.overdue} color={stats.overdue > 0 ? "text-[#dc2626]" : undefined} />
        <StatBox label="This Month" value={stats.thisMonth} />
      </div>

      {/* Quick-add templates */}
      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-wide font-semibold text-[#a1a1aa] dark:text-[#71717a] mb-1.5">Quick-Add Routine Tasks</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_ADD_TEMPLATES.map((t, i) => (
            <button
              key={t.label}
              onClick={() => openTemplate(i)}
              className="flex items-center gap-2 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] text-[12px] font-medium px-3 py-1.5 rounded text-[#18181b] dark:text-[#fafafa] hover:border-[#a1a1aa] dark:hover:border-[#52525b] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#71717a]" />
              {t.label}
              <span className="text-[10px] uppercase tracking-wide text-[#a1a1aa] dark:text-[#71717a]">
                {t.frequency}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-[#f4f4f5] dark:bg-[#27272a] rounded-md p-0.5 w-fit">
        {(["active", "completed", "routine"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-[12px] font-medium px-3 py-1.5 rounded cursor-pointer transition-colors capitalize ${
              tab === t
                ? "bg-white dark:bg-[#18181b] text-[#18181b] dark:text-[#fafafa] shadow-sm"
                : "text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
            }`}
          >
            {t === "active" ? "Active" : t === "completed" ? "Completed" : "Routine"}
            <span className="ml-1.5 text-[10px] text-[#a1a1aa] dark:text-[#71717a]">
              {t === "active"
                ? items.filter((i: any) => i.status !== "completed").length
                : t === "completed"
                ? items.filter((i: any) => i.status === "completed").length
                : items.filter((i: any) => i.isRecurring).length}
            </span>
          </button>
        ))}
      </div>

      {/* Item list */}
      <ItemList
        rows={filtered}
        loading={loading}
        onEdit={openEdit}
        onComplete={onComplete}
        onDelete={onDelete}
      />

      {modalOpen && (
        <ItemModal
          form={form}
          setForm={setForm}
          onClose={() => setModalOpen(false)}
          onSave={onSave}
          saving={saving}
          editing={!!editingId}
          unitOptions={units.map((u: any) => u.unit).filter(Boolean)}
        />
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3">
      <p className={`text-[20px] sm:text-[22px] font-semibold tracking-tight ${color || "text-[#18181b] dark:text-[#fafafa]"}`}>
        {value}
      </p>
      <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] font-medium uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

function ItemList({
  rows,
  loading,
  onEdit,
  onComplete,
  onDelete,
}: {
  rows: any[];
  loading: boolean;
  onEdit: (row: any) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-8 text-center">
        <p className="text-[13px] text-[#71717a] dark:text-[#a1a1aa]">Loading maintenance items…</p>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-8 text-center">
        <p className="text-[13px] text-[#71717a] dark:text-[#a1a1aa]">
          No maintenance items yet. Click <span className="font-medium text-[#18181b] dark:text-[#fafafa]">Add Item</span> or use a quick-add template above to get started.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
      <div className="grid grid-cols-[110px_1fr_100px_100px_120px_120px] sm:grid-cols-[110px_120px_1fr_100px_120px_120px_140px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
        <span>Date</span>
        <span className="hidden sm:block">Category</span>
        <span>Description</span>
        <span>Unit</span>
        <span>Cost</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>
      {rows.map((r) => {
        const badge = statusBadge(r.status);
        return (
          <div
            key={r._id}
            className="grid grid-cols-[110px_1fr_100px_100px_120px_120px] sm:grid-cols-[110px_120px_1fr_100px_120px_120px_140px] px-4 py-2.5 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] text-[#18181b] dark:text-[#fafafa] items-center"
          >
            <span className="text-[#71717a] dark:text-[#a1a1aa] tabular-nums">{formatShortDate(r.date)}</span>
            <span className="hidden sm:flex items-center gap-1.5 text-[11px] capitalize">
              <span className={`w-1.5 h-1.5 rounded-full ${categoryDot(r.category)}`} />
              {r.category || "—"}
            </span>
            <button
              onClick={() => onEdit(r)}
              className="text-left truncate cursor-pointer hover:underline decoration-dotted"
              title={r.description || r.type}
            >
              <span className="font-medium">{r.type || "(untitled)"}</span>
              {r.description && <span className="text-[#71717a] dark:text-[#a1a1aa]"> · {r.description}</span>}
              {r.isRecurring && r.recurFrequency && (
                <span className="ml-1 text-[10px] uppercase tracking-wide text-[#0891b2]">
                  {r.recurFrequency}
                </span>
              )}
              {r.isRecurring && r.nextDueDate && (
                <span className="block text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-0.5">
                  Next due: {formatShortDate(r.nextDueDate)}
                </span>
              )}
            </button>
            <span className="text-[#71717a] dark:text-[#a1a1aa]">{r.unit || "—"}</span>
            <span className="text-[#71717a] dark:text-[#a1a1aa]">{r.cost ? formatCurrency(r.cost) : "—"}</span>
            <span>
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${badge.className}`}>
                {badge.label}
              </span>
            </span>
            <span className="flex items-center justify-end gap-1">
              {r.status !== "completed" && (
                <button
                  onClick={() => onComplete(r._id)}
                  title={r.isRecurring ? "Mark this cycle complete + advance next due date" : "Mark complete"}
                  className="p-1 rounded hover:bg-[#16a34a]/10 text-[#16a34a] cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => onDelete(r._id)}
                title="Delete"
                className="p-1 rounded hover:bg-[#dc2626]/10 text-[#dc2626] cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ItemModal({
  form,
  setForm,
  onClose,
  onSave,
  saving,
  editing,
  unitOptions,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  editing: boolean;
  unitOptions: string[];
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg w-full max-w-lg max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e4e4e7] dark:border-[#3f3f46]">
          <p className="text-[14px] font-semibold text-[#18181b] dark:text-[#fafafa]">
            {editing ? "Edit Maintenance Item" : "Add Maintenance Item"}
          </p>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] cursor-pointer">
            <X className="w-4 h-4 text-[#71717a]" />
          </button>
        </div>

        <div className="p-4 space-y-3">
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
                  <option key={c} value={c}>
                    {c[0].toUpperCase() + c.slice(1)}
                  </option>
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
                  <option key={u} value={u}>
                    {u}
                  </option>
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
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
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
                  <option key={f} value={f}>
                    {f[0].toUpperCase() + f.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#e4e4e7] dark:border-[#3f3f46]">
          <button
            onClick={onClose}
            className="text-[12px] font-medium px-3 py-1.5 rounded text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !form.type.trim()}
            className="bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] text-[12px] font-medium px-3 py-1.5 rounded hover:opacity-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : editing ? "Save" : "Add Item"}
          </button>
        </div>
      </div>
    </div>
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

// Simple yyyy-mm-dd diff in days; returns positive if a > b. Used for the
// overdue heuristic so we don't pull in date-fns just for one calc.
function diffDays(a: string, b: string): number {
  const da = parseISO(a);
  const db = parseISO(b);
  if (!da || !db) return 0;
  return Math.round((da.getTime() - db.getTime()) / 86400000);
}

function parseISO(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

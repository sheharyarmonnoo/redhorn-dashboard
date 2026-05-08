"use client";
import { useMemo, useState } from "react";
import { Plus, Check, Trash2, RotateCcw, Pencil } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import PageHeader from "@/components/PageHeader";
import ComingSoonBanner from "@/components/ComingSoonBanner";
import MaintenanceDrawer from "@/components/MaintenanceDrawer";
import { useActiveProperty, useUnits, useMaintenance, formatCurrency } from "@/hooks/useConvexData";

type Tab = "active" | "completed" | "routine";

const FREQUENCIES = ["monthly", "quarterly", "biannually", "annually"] as const;

// Pre-built recurring maintenance templates the client called out:
// gutter cleaning, drainage inspection, HVAC service. Clicking one of
// these creates a new task pre-filled and opens the drawer in edit mode
// so the user only has to confirm.
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
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatRelativeTime(ts?: number): string {
  if (!ts) return "";
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function MaintenancePage() {
  const property = useActiveProperty();
  const { items, loading, create, update, remove, markCompleted, addMeetingNote, removeMeetingNote } = useMaintenance(property?._id);
  const units = useUnits(property?._id);
  const { user } = useUser();
  const currentUser = user?.fullName || user?.primaryEmailAddress?.emailAddress || "User";

  const [tab, setTab] = useState<Tab>("active");
  const [openId, setOpenId] = useState<string | null>(null);

  const openItem = openId ? items.find((i: any) => i._id === openId) : null;

  const stats = useMemo(() => {
    const total = items.length;
    const open = items.filter((i: any) => i.status !== "completed").length;
    const startMonth = startOfMonthISO();
    const today = todayISO();
    const thisMonth = items.filter((i: any) => i.date && i.date >= startMonth && i.date <= today).length;
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

  // "Add Item" — create a stub row immediately, then open the drawer so
  // the user can fill it out. This keeps the drawer's edit/view distinction
  // clean (no special "new vs existing" mode in the drawer itself) at the
  // cost of one extra DB write that the user could abandon. That tradeoff
  // is fine for low-volume manual entry.
  async function onAddItem() {
    if (!property?._id) return;
    // createdBy is wired but not yet sent — Convex schema deploy is queued
    // (pending CLI auth refresh). Once deployed, swap the (any) cast and
    // include it in the args.
    void currentUser;
    const id = await create({
      propertyId: property._id as any,
      date: todayISO(),
      category: "repair",
      type: "New Maintenance Item",
      description: "",
      status: "open",
    });
    setOpenId(id as any);
  }

  async function onAddTemplate(idx: number) {
    if (!property?._id) return;
    const t = QUICK_ADD_TEMPLATES[idx];
    const id = await create({
      propertyId: property._id as any,
      date: todayISO(),
      category: t.category,
      type: t.type,
      description: t.description,
      status: "scheduled",
      isRecurring: true,
      recurFrequency: t.frequency,
    });
    setOpenId(id as any);
  }

  if (!property) return null;

  if (property.propertyType === "rv_park") {
    return <ComingSoonBanner propertyName={property.name} />;
  }

  return (
    <div>
      <PageHeader
        title="Maintenance"
        subtitle="Track repairs, inspections, and routine tasks"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        <StatBox label="Total Items" value={stats.total} />
        <StatBox label="Open" value={stats.open} color={stats.open > 0 ? "text-[#d97706]" : undefined} />
        <StatBox label="Overdue" value={stats.overdue} color={stats.overdue > 0 ? "text-[#dc2626]" : undefined} />
        <StatBox label="This Month" value={stats.thisMonth} />
      </div>

      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-wide font-semibold text-[#a1a1aa] dark:text-[#71717a] mb-1.5">Quick-Add Routine Tasks</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_ADD_TEMPLATES.map((t, i) => (
            <button
              key={t.label}
              onClick={() => onAddTemplate(i)}
              className="flex items-center gap-2 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] text-[12px] font-medium px-3 py-1.5 rounded text-[#18181b] dark:text-[#fafafa] hover:border-[#a1a1aa] dark:hover:border-[#52525b] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#71717a]" />
              {t.label}
              <span className="text-[10px] uppercase tracking-wide text-[#a1a1aa] dark:text-[#71717a]">
                {t.frequency}
              </span>
            </button>
          ))}
          {/* Add Item button sits inline at the end of the quick-add row.
              Same pill shape, dark fill so it reads as the primary action. */}
          <button
            onClick={onAddItem}
            className="flex items-center gap-2 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] text-[12px] font-medium px-3 py-1.5 rounded hover:opacity-90 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Item
          </button>
        </div>
      </div>

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

      <ItemList
        rows={filtered}
        loading={loading}
        onOpen={(row) => setOpenId(row._id)}
        onComplete={async (id) => { await markCompleted({ id: id as any }); }}
        onDelete={async (id) => {
          if (!window.confirm("Delete this maintenance item? This cannot be undone.")) return;
          await remove({ id: id as any });
        }}
      />

      <MaintenanceDrawer
        open={!!openItem}
        item={(openItem as any) || null}
        unitOptions={units.map((u: any) => u.unit).filter(Boolean)}
        onClose={() => setOpenId(null)}
        onSave={async (patch) => {
          if (!openId) return;
          await update({ id: openId as any, ...(patch as any) });
        }}
        onDelete={async (id) => {
          await remove({ id: id as any });
          setOpenId(null);
        }}
        onComplete={async (id) => {
          await markCompleted({ id: id as any });
        }}
        onAddNote={async (text) => {
          if (!openId) return;
          await addMeetingNote({ id: openId as any, text, author: currentUser });
        }}
        onRemoveNote={async (noteId) => {
          if (!openId) return;
          await removeMeetingNote({ id: openId as any, noteId });
        }}
      />
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
  onOpen,
  onComplete,
  onDelete,
}: {
  rows: any[];
  loading: boolean;
  onOpen: (row: any) => void;
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
  // Desktop columns: Date | Category | Description | Unit | Vendor | Cost | Status | Latest Note | Actions
  // Mobile columns: Date | Description | Unit | Cost | Status | Actions
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
      <div className="grid grid-cols-[110px_1fr_100px_100px_120px_120px] sm:grid-cols-[110px_120px_1fr_100px_140px_120px_120px_220px_120px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
        <span>Date</span>
        <span className="hidden sm:block">Category</span>
        <span>Description</span>
        <span>Unit</span>
        <span className="hidden sm:block">Vendor</span>
        <span>Cost</span>
        <span>Status</span>
        <span className="hidden sm:block">Latest Note</span>
        <span className="text-right">Actions</span>
      </div>
      {rows.map((r) => {
        const badge = statusBadge(r.status);
        const sortedNotes = [...(r.meetingNotes || [])].sort((a: any, b: any) => b.createdAt - a.createdAt);
        const latestNote = sortedNotes[0];
        const lastUpdated = r.updatedAt || r._creationTime;
        return (
          <div
            key={r._id}
            onClick={() => onOpen(r)}
            className="grid grid-cols-[110px_1fr_100px_100px_120px_120px] sm:grid-cols-[110px_120px_1fr_100px_140px_120px_120px_220px_120px] px-4 py-2.5 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] text-[#18181b] dark:text-[#fafafa] items-center cursor-pointer hover:bg-[#fafafa] dark:hover:bg-[#27272a]/50"
          >
            <span className="text-[#71717a] dark:text-[#a1a1aa] tabular-nums">{formatShortDate(r.date)}</span>
            <span className="hidden sm:flex items-center gap-1.5 text-[11px] capitalize">
              <span className={`w-1.5 h-1.5 rounded-full ${categoryDot(r.category)}`} />
              {r.category || "—"}
            </span>
            <div className="text-left truncate" title={r.description || r.type}>
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
            </div>
            <span className="text-[#71717a] dark:text-[#a1a1aa] truncate" title={r.unit || ""}>{r.unit || "—"}</span>
            <span className="hidden sm:block text-[#71717a] dark:text-[#a1a1aa] truncate" title={r.vendor || ""}>{r.vendor || "—"}</span>
            <span className="text-[#71717a] dark:text-[#a1a1aa]">{r.cost ? formatCurrency(r.cost) : "—"}</span>
            <span>
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${badge.className}`}>
                {badge.label}
              </span>
            </span>
            <div
              className="hidden sm:block min-w-0 pr-2"
              title={latestNote ? `${latestNote.author}: ${latestNote.text}` : ""}
            >
              {latestNote ? (
                <>
                  <p className="truncate text-[11px] text-[#18181b] dark:text-[#fafafa] leading-tight">
                    {latestNote.text}
                  </p>
                  <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] tabular-nums mt-0.5">
                    {formatRelativeTime(latestNote.createdAt)} · {sortedNotes.length} {sortedNotes.length === 1 ? "note" : "notes"}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a] italic">
                  No notes
                </p>
              )}
            </div>
            <span
              className="flex items-center justify-end gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => onOpen(r)}
                title="Open / edit"
                className="p-1 rounded hover:bg-[#71717a]/10 text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
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
              {lastUpdated && (
                <span
                  className="hidden sm:inline-block text-[9px] text-[#a1a1aa] dark:text-[#71717a] tabular-nums ml-1 whitespace-nowrap"
                  title={new Date(lastUpdated).toLocaleString()}
                >
                  {formatRelativeTime(lastUpdated)}
                </span>
              )}
            </span>
          </div>
        );
      })}
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

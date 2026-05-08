"use client";
import { useMemo, useState, useRef } from "react";
import { Plus, X, Trash2, Pencil, Square, CheckSquare, Users, Paperclip, Download } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import PageHeader from "@/components/PageHeader";
import ComingSoonBanner from "@/components/ComingSoonBanner";
import { useActiveProperty, useMeetings } from "@/hooks/useConvexData";

const FILE_CATEGORIES = ["general", "marketing", "finance", "maintenance", "legal", "other"] as const;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatShortDate(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatRelative(ts?: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function MeetingsPage() {
  const property = useActiveProperty();
  const { user } = useUser();
  const currentUser = user?.fullName || user?.primaryEmailAddress?.emailAddress || "User";
  const { items, loading, create, update, remove, addActionItem, toggleActionItem, removeActionItem, generateFileUploadUrl, addFile, removeFile } = useMeetings(property?._id);

  const [openId, setOpenId] = useState<string | null>(null);
  const openMeeting = openId ? items.find((m: any) => m._id === openId) : null;

  const stats = useMemo(() => {
    const total = items.length;
    let openItems = 0;
    let allItems = 0;
    for (const m of items as any[]) {
      const ais = m.actionItems || [];
      allItems += ais.length;
      openItems += ais.filter((i: any) => !i.done).length;
    }
    return { total, openItems, allItems };
  }, [items]);

  async function onCreateMeeting() {
    if (!property?._id) return;
    const id = await create({
      propertyId: property._id as any,
      date: todayISO(),
      title: "New Meeting",
      attendees: [],
      discussion: "",
      createdBy: currentUser,
    });
    setOpenId(id as any);
  }

  if (!property) return null;
  if (property.propertyType === "rv_park") {
    return <ComingSoonBanner propertyName={property.name} />;
  }

  return (
    <div>
      <PageHeader title="Meetings" subtitle="PM meeting log + action items">
        <button
          onClick={onCreateMeeting}
          className="flex items-center gap-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] text-[12px] font-medium px-3 py-1.5 rounded hover:opacity-90 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          New Meeting
        </button>
      </PageHeader>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        <StatBox label="Meetings" value={stats.total} />
        <StatBox label="Open Action Items" value={stats.openItems} color={stats.openItems > 0 ? "text-[#d97706]" : undefined} />
        <StatBox label="Total Action Items" value={stats.allItems} />
      </div>

      <MeetingList
        rows={items}
        loading={loading}
        onOpen={(m) => setOpenId(m._id)}
        onDelete={async (id) => {
          if (!window.confirm("Delete this meeting?")) return;
          await remove({ id: id as any });
        }}
      />

      {openMeeting && (
        <MeetingDrawer
          key={openMeeting._id}
          meeting={openMeeting as any}
          currentUser={currentUser}
          onClose={() => setOpenId(null)}
          onSave={async (patch) => {
            if (!openId) return;
            await update({ id: openId as any, ...(patch as any) });
          }}
          onAddItem={async (text, assignee) => {
            if (!openId) return;
            await addActionItem({ id: openId as any, text, assignee });
          }}
          onToggleItem={async (itemId) => {
            if (!openId) return;
            await toggleActionItem({ id: openId as any, itemId });
          }}
          onRemoveItem={async (itemId) => {
            if (!openId) return;
            await removeActionItem({ id: openId as any, itemId });
          }}
          onUploadFile={async (file, category) => {
            if (!openId) return;
            const uploadUrl = await generateFileUploadUrl();
            const res = await fetch(uploadUrl, {
              method: "POST",
              headers: { "Content-Type": file.type || "application/octet-stream" },
              body: file,
            });
            if (!res.ok) throw new Error("Upload failed");
            const { storageId } = await res.json();
            await addFile({
              id: openId as any,
              storageId,
              name: file.name,
              size: file.size,
              mimeType: file.type || undefined,
              category,
              uploadedBy: currentUser,
            });
          }}
          onRemoveFile={async (fileId) => {
            if (!openId) return;
            await removeFile({ id: openId as any, fileId });
          }}
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

function MeetingList({
  rows,
  loading,
  onOpen,
  onDelete,
}: {
  rows: any[];
  loading: boolean;
  onOpen: (m: any) => void;
  onDelete: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-8 text-center">
        <p className="text-[13px] text-[#71717a] dark:text-[#a1a1aa]">Loading meetings…</p>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-8 text-center">
        <p className="text-[13px] text-[#71717a] dark:text-[#a1a1aa]">
          No meetings yet. Click <span className="font-medium text-[#18181b] dark:text-[#fafafa]">New Meeting</span> to log one.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
      <div className="grid grid-cols-[140px_1fr_120px_120px_140px_80px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
        <span>Date</span>
        <span>Title</span>
        <span>Attendees</span>
        <span>Action Items</span>
        <span>Updated</span>
        <span className="text-right">Actions</span>
      </div>
      {rows.map((r) => {
        const ais = r.actionItems || [];
        const open = ais.filter((i: any) => !i.done).length;
        const total = ais.length;
        const lastUpdated = r.updatedAt || r._creationTime;
        return (
          <div
            key={r._id}
            onClick={() => onOpen(r)}
            className="grid grid-cols-[140px_1fr_120px_120px_140px_80px] px-4 py-2.5 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] text-[#18181b] dark:text-[#fafafa] items-center cursor-pointer hover:bg-[#fafafa] dark:hover:bg-[#27272a]/50"
          >
            <span className="text-[#71717a] dark:text-[#a1a1aa] tabular-nums">{formatShortDate(r.date)}</span>
            <span className="font-medium truncate" title={r.title}>{r.title}</span>
            <span className="text-[#71717a] dark:text-[#a1a1aa] truncate" title={(r.attendees || []).join(", ")}>
              {(r.attendees || []).length > 0 ? `${(r.attendees as string[]).length} ppl` : "—"}
            </span>
            <span className="text-[#71717a] dark:text-[#a1a1aa] tabular-nums">
              {total === 0 ? "—" : `${open}/${total} open`}
            </span>
            <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] tabular-nums">{formatRelative(lastUpdated)}</span>
            <span
              className="flex items-center justify-end gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => onOpen(r)}
                title="Open"
                className="p-1 rounded hover:bg-[#71717a]/10 text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
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

function MeetingDrawer({
  meeting,
  currentUser,
  onClose,
  onSave,
  onAddItem,
  onToggleItem,
  onRemoveItem,
  onUploadFile,
  onRemoveFile,
}: {
  meeting: any;
  currentUser: string;
  onClose: () => void;
  onSave: (patch: { date?: string; title?: string; attendees?: string[]; discussion?: string }) => Promise<void>;
  onAddItem: (text: string, assignee?: string) => Promise<void>;
  onToggleItem: (itemId: string) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onUploadFile: (file: File, category?: string) => Promise<void>;
  onRemoveFile: (fileId: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(meeting.title || "");
  const [date, setDate] = useState(meeting.date || todayISO());
  const [attendees, setAttendees] = useState((meeting.attendees || []).join(", "));
  const [discussion, setDiscussion] = useState(meeting.discussion || "");
  const [aiText, setAiText] = useState("");
  const [aiAssignee, setAiAssignee] = useState("");
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<typeof FILE_CATEGORIES[number]>("general");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function saveBasic() {
    await onSave({
      title: title.trim(),
      date,
      attendees: attendees.split(",").map((s: string) => s.trim()).filter(Boolean),
      discussion,
    });
  }

  async function postItem() {
    const text = aiText.trim();
    if (!text) return;
    setPosting(true);
    try {
      await onAddItem(text, aiAssignee.trim() || undefined);
      setAiText("");
      setAiAssignee("");
    } finally {
      setPosting(false);
    }
  }

  const items = (meeting.actionItems || []) as any[];
  const sorted = [...items].sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt);
  const files = (meeting.files || []) as any[];
  const sortedFiles = [...files].sort((a, b) => b.uploadedAt - a.uploadedAt);

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      await onUploadFile(f, pendingCategory);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" />
      <div
        className="relative bg-white dark:bg-[#18181b] border-l border-[#e4e4e7] dark:border-[#3f3f46] shadow-2xl w-full max-w-[640px] h-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#e4e4e7] dark:border-[#3f3f46]">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveBasic}
              className="w-full text-[16px] font-semibold text-[#18181b] dark:text-[#fafafa] bg-transparent border-none focus:outline-none"
              placeholder="Meeting title"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onBlur={saveBasic}
              className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] bg-transparent border-none focus:outline-none mt-0.5"
            />
            {meeting.createdBy && (
              <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-0.5">
                Created by {meeting.createdBy}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] cursor-pointer"
          >
            <X className="w-4 h-4 text-[#71717a]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-wide font-semibold text-[#a1a1aa] dark:text-[#71717a] mb-1 flex items-center gap-1.5">
              <Users className="w-3 h-3" />
              Attendees
            </p>
            <input
              type="text"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              onBlur={saveBasic}
              placeholder="Comma-separated names (e.g. Max, Property Manager)"
              className="w-full text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#0a0a0a] text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] focus:outline-none focus:border-[#71717a]"
            />
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide font-semibold text-[#a1a1aa] dark:text-[#71717a] mb-1">Discussion</p>
            <textarea
              rows={6}
              value={discussion}
              onChange={(e) => setDiscussion(e.target.value)}
              onBlur={saveBasic}
              placeholder="What was discussed…"
              className="w-full text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#0a0a0a] text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] focus:outline-none focus:border-[#71717a] leading-relaxed"
            />
          </div>

          <div className="pt-3 border-t border-[#e4e4e7] dark:border-[#3f3f46]">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-[#a1a1aa] dark:text-[#71717a] mb-2">
              Action Items {items.length > 0 && <span className="text-[#71717a]">({items.filter((i) => !i.done).length} open / {items.length} total)</span>}
            </p>

            {sorted.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {sorted.map((it) => (
                  <div
                    key={it.id}
                    className={`flex items-start gap-2 p-2 rounded border ${
                      it.done
                        ? "bg-[#fafafa] dark:bg-[#27272a]/50 border-[#f4f4f5] dark:border-[#27272a]"
                        : "bg-white dark:bg-[#0a0a0a] border-[#e4e4e7] dark:border-[#3f3f46]"
                    }`}
                  >
                    <button
                      onClick={() => onToggleItem(it.id)}
                      className="mt-0.5 cursor-pointer"
                      title={it.done ? "Mark open" : "Mark done"}
                    >
                      {it.done ? (
                        <CheckSquare className="w-4 h-4 text-[#16a34a]" />
                      ) : (
                        <Square className="w-4 h-4 text-[#a1a1aa]" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] leading-tight ${it.done ? "line-through text-[#a1a1aa] dark:text-[#71717a]" : "text-[#18181b] dark:text-[#fafafa]"}`}>
                        {it.text}
                      </p>
                      {it.assignee && (
                        <p className="text-[10px] text-[#71717a] dark:text-[#a1a1aa] mt-0.5">
                          → {it.assignee}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => onRemoveItem(it.id)}
                      title="Remove"
                      className="text-[#a1a1aa] hover:text-[#dc2626] cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-[1fr_140px_auto] gap-2">
              <input
                type="text"
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    postItem();
                  }
                }}
                placeholder="Add action item…"
                className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#0a0a0a] text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] focus:outline-none focus:border-[#71717a]"
              />
              <input
                type="text"
                value={aiAssignee}
                onChange={(e) => setAiAssignee(e.target.value)}
                placeholder="Assignee (opt)"
                className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#0a0a0a] text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] focus:outline-none focus:border-[#71717a]"
              />
              <button
                onClick={postItem}
                disabled={posting || !aiText.trim()}
                className="text-[11px] font-medium px-3 py-1 rounded bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] hover:opacity-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {posting ? "Adding…" : "Add"}
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-[#e4e4e7] dark:border-[#3f3f46]">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-[#a1a1aa] dark:text-[#71717a] mb-2 flex items-center gap-1.5">
              <Paperclip className="w-3 h-3" />
              Files {files.length > 0 && <span className="text-[#71717a]">({files.length})</span>}
            </p>

            {sortedFiles.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {sortedFiles.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-2 p-2 rounded border border-[#e4e4e7] dark:border-[#3f3f46] bg-white dark:bg-[#0a0a0a]"
                  >
                    {f.category && (
                      <span className="text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#f4f4f5] dark:bg-[#27272a] text-[#71717a] dark:text-[#a1a1aa] flex-shrink-0">
                        {f.category}
                      </span>
                    )}
                    <a
                      href={`/api/files/${f.storageId}?name=${encodeURIComponent(f.name)}`}
                      className="flex-1 min-w-0 truncate text-[12px] text-[#18181b] dark:text-[#fafafa] hover:underline"
                      title={f.name}
                    >
                      {f.name}
                    </a>
                    <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] tabular-nums flex-shrink-0">
                      {formatFileSize(f.size)}
                    </span>
                    <a
                      href={`/api/files/${f.storageId}?name=${encodeURIComponent(f.name)}`}
                      title="Download"
                      className="text-[#71717a] hover:text-[#18181b] dark:text-[#a1a1aa] dark:hover:text-[#fafafa] cursor-pointer flex-shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => onRemoveFile(f.id)}
                      title="Remove"
                      className="text-[#a1a1aa] hover:text-[#dc2626] cursor-pointer flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
              <select
                value={pendingCategory}
                onChange={(e) => setPendingCategory(e.target.value as any)}
                className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#0a0a0a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] capitalize"
              >
                {FILE_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">{c}</option>
                ))}
              </select>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFilePick}
                disabled={uploading}
                className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] file:mr-2 file:rounded file:border-0 file:bg-[#18181b] dark:file:bg-[#fafafa] file:text-white dark:file:text-[#18181b] file:px-3 file:py-1 file:text-[11px] file:font-medium file:cursor-pointer disabled:opacity-50"
              />
            </div>
            {uploading && (
              <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a] italic mt-1.5">
                Uploading…
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

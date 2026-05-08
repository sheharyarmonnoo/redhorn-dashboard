"use client";
import { useState, useRef } from "react";
import { Plus, X, Trash2, Pencil, Paperclip, Download } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import PageHeader from "@/components/PageHeader";
import ComingSoonBanner from "@/components/ComingSoonBanner";
import { useActiveProperty, useMeetings } from "@/hooks/useConvexData";

const FILE_CATEGORIES = ["general", "marketing", "finance", "maintenance", "legal", "other"] as const;

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MeetingsPage() {
  const property = useActiveProperty();
  const { user } = useUser();
  const currentUser = user?.fullName || user?.primaryEmailAddress?.emailAddress || "User";
  const { items, loading, create, update, remove, generateFileUploadUrl, addFile, removeFile } = useMeetings(property?._id);

  const [openId, setOpenId] = useState<string | null>(null);
  const openMeeting = openId ? items.find((m: any) => m._id === openId) : null;

  async function onCreateMeeting() {
    if (!property?._id) return;
    const id = await create({
      propertyId: property._id as any,
      date: todayISO(),
      title: "New Meeting",
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
      <PageHeader title="Meetings" subtitle="Log meetings and attach files">
        <button
          onClick={onCreateMeeting}
          className="flex items-center gap-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] text-[12px] font-medium px-3 py-1.5 rounded hover:opacity-90 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          New Meeting
        </button>
      </PageHeader>

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
      <div className="grid grid-cols-[140px_1fr_100px_140px_80px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
        <span>Date</span>
        <span>Subject</span>
        <span>Files</span>
        <span>Updated</span>
        <span className="text-right">Actions</span>
      </div>
      {rows.map((r) => {
        const lastUpdated = r.updatedAt || r._creationTime;
        const fileCount = (r.files || []).length;
        return (
          <div
            key={r._id}
            onClick={() => onOpen(r)}
            className="grid grid-cols-[140px_1fr_100px_140px_80px] px-4 py-2.5 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] text-[#18181b] dark:text-[#fafafa] items-center cursor-pointer hover:bg-[#fafafa] dark:hover:bg-[#27272a]/50"
          >
            <span className="text-[#71717a] dark:text-[#a1a1aa] tabular-nums">{formatShortDate(r.date)}</span>
            <span className="font-medium truncate" title={r.title}>{r.title}</span>
            <span className="text-[#71717a] dark:text-[#a1a1aa] tabular-nums">
              {fileCount === 0 ? "—" : `${fileCount} file${fileCount === 1 ? "" : "s"}`}
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
  onUploadFile,
  onRemoveFile,
}: {
  meeting: any;
  currentUser: string;
  onClose: () => void;
  onSave: (patch: { date?: string; title?: string; discussion?: string }) => Promise<void>;
  onUploadFile: (file: File, category?: string) => Promise<void>;
  onRemoveFile: (fileId: string) => Promise<void>;
}) {
  void currentUser;
  const [title, setTitle] = useState(meeting.title || "");
  const [date, setDate] = useState(meeting.date || todayISO());
  const [discussion, setDiscussion] = useState(meeting.discussion || "");
  const [uploading, setUploading] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<typeof FILE_CATEGORIES[number]>("general");
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; current: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function saveBasic() {
    await onSave({
      title: title.trim(),
      date,
      discussion,
    });
  }

  async function uploadFiles(fileList: File[]) {
    if (fileList.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        setUploadProgress({ name: f.name, current: i + 1, total: fileList.length });
        try {
          await onUploadFile(f, pendingCategory);
        } catch (err: any) {
          setUploadError(`Failed to upload ${f.name}: ${err?.message || "unknown error"}`);
          break;
        }
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    await uploadFiles(files);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) void uploadFiles(files);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragActive) setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragActive(false);
  }

  const files = (meeting.files || []) as any[];
  const sortedFiles = [...files].sort((a, b) => b.uploadedAt - a.uploadedAt);

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
              placeholder="Meeting subject"
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
            <p className="text-[10px] uppercase tracking-wide font-semibold text-[#a1a1aa] dark:text-[#71717a] mb-1">Notes</p>
            <textarea
              rows={10}
              value={discussion}
              onChange={(e) => setDiscussion(e.target.value)}
              onBlur={saveBasic}
              placeholder="Meeting notes…"
              className="w-full text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#0a0a0a] text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] focus:outline-none focus:border-[#71717a] leading-relaxed"
            />
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

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-[#a1a1aa] dark:text-[#71717a] font-medium">Category</span>
                <select
                  value={pendingCategory}
                  onChange={(e) => setPendingCategory(e.target.value as any)}
                  className="text-[12px] px-2.5 py-1 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#0a0a0a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] capitalize"
                >
                  {FILE_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="capitalize">{c}</option>
                  ))}
                </select>
                <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">applied to next upload</span>
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-md py-6 px-4 text-center transition-colors cursor-pointer select-none ${
                  dragActive
                    ? "border-[#18181b] dark:border-[#fafafa] bg-[#f4f4f5] dark:bg-[#27272a]"
                    : "border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa]/50 dark:bg-[#0a0a0a] hover:border-[#a1a1aa] dark:hover:border-[#52525b]"
                } ${uploading ? "pointer-events-none opacity-60" : ""}`}
              >
                <Paperclip className={`w-5 h-5 mx-auto mb-1.5 ${dragActive ? "text-[#18181b] dark:text-[#fafafa]" : "text-[#a1a1aa] dark:text-[#71717a]"}`} />
                <p className={`text-[12px] font-medium ${dragActive ? "text-[#18181b] dark:text-[#fafafa]" : "text-[#52525b] dark:text-[#a1a1aa]"}`}>
                  {dragActive ? "Drop to upload" : "Drag files here or click to browse"}
                </p>
                <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-0.5">
                  Multiple files OK · tagged as <span className="font-medium">{pendingCategory}</span>
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFilePick}
                  disabled={uploading}
                  className="hidden"
                />
              </div>

              {uploadProgress && (
                <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa]">
                  Uploading {uploadProgress.current}/{uploadProgress.total} — <span className="font-medium">{uploadProgress.name}</span>
                </p>
              )}
              {uploadError && (
                <p className="text-[11px] text-[#dc2626]">{uploadError}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

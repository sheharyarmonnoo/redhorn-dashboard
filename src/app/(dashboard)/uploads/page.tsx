"use client";
import { useState, useRef } from "react";
import { Upload, X, CheckCircle2, AlertCircle, FileText, FileSpreadsheet, Loader2, Lock, Trash2 } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import PageHeader from "@/components/PageHeader";
import { useActiveProperty, useRvUploads } from "@/hooks/useConvexData";

const FILE_TYPE_LABELS: Record<string, string> = {
  rentRoll: "Rent Roll",
  balances: "Guests with Balance",
  pos: "POS Sales",
  payments: "Payment Summary",
  financial: "Financial Package",
  unknown: "Unknown",
};

const FILE_TYPE_OPTIONS = ["rentRoll", "balances", "pos", "payments", "financial", "unknown"] as const;

function isoNow(): string {
  return new Date().toISOString().slice(0, 7);
}

function previousMonth(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatPeriod(period: string | undefined | null): string {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return "—";
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
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
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function UploadsPage() {
  const property = useActiveProperty();
  const { user } = useUser();
  const currentUser = user?.fullName || user?.primaryEmailAddress?.emailAddress || "User";
  const {
    window: uploadWindow,
    bundles,
    loading,
    generateUploadUrl,
    stageFile,
    removeStagedFile,
    updateDraftFileType,
    updateDraftPeriod,
    cancelDraft,
  } = useRvUploads(property?._id);

  const detectPeriod = useAction(api.rvParsers.detectBundlePeriod);
  const commitBundle = useAction(api.rvParsers.commitBundle);

  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<string | null>(null);
  const [showFutureConfirm, setShowFutureConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!property) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[13px] text-[#a1a1aa] dark:text-[#71717a]">Loading…</p>
      </div>
    );
  }

  const isRvPark = property.propertyType === "rv_park";

  if (!isRvPark) {
    return (
      <div>
        <PageHeader title="Pipeline Uploads" subtitle={property.name} />
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-10 text-center">
          <Lock className="w-6 h-6 text-[#a1a1aa] mx-auto mb-3" />
          <p className="text-[14px] font-medium text-[#18181b] dark:text-[#fafafa]">No upload bundle for this property</p>
          <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] mt-1.5">
            Monthly bundle uploads are configured for the RV park only. Other properties sync via Yardi.
          </p>
        </div>
      </div>
    );
  }

  const draft = uploadWindow?.draft || null;
  const lastCommitted = uploadWindow?.lastCommitted || null;
  const currentMonth = uploadWindow?.currentMonth || isoNow();
  const draftPeriod = draft?.period || previousMonth();
  const periodValid = draft?.isPeriodValid ?? (draftPeriod < currentMonth);
  const allFilesParsed = draft?.files?.every((f: any) => f.fileType !== "unknown") ?? false;

  async function uploadFiles(files: File[]) {
    if (!property?._id) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const f of files) {
        try {
          const uploadUrl = await generateUploadUrl();
          const res = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": f.type || "application/octet-stream" },
            body: f,
          });
          if (!res.ok) throw new Error(`Upload failed (${res.status})`);
          const { storageId } = await res.json();
          await stageFile({
            propertyId: property._id as any,
            storageId,
            name: f.name,
            size: f.size,
            uploadedBy: currentUser,
          });
        } catch (err: any) {
          setUploadError(`${f.name}: ${err?.message || "upload failed"}`);
          break;
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) void uploadFiles(files);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragActive) setDragActive(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragActive(false);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) await uploadFiles(files);
  }

  async function onAutoDetect() {
    if (!draft) return;
    setUploadError(null);
    try {
      const result = await detectPeriod({ bundleId: draft.id as any });
      if (!result.detected) {
        setUploadError("Couldn't auto-detect period from file contents. Set it manually below.");
      }
    } catch (err: any) {
      setUploadError(err?.message || "Period detection failed");
    }
  }

  // Click handler for the Commit button. If the period is still in the
  // future (or current month), surface a confirmation modal instead of
  // committing immediately. The actual commit runs through commitBundle()
  // either way — the modal just decides whether bypassLock=true is needed.
  function onCommitClick() {
    if (!draft) return;
    if (!periodValid) {
      setShowFutureConfirm(true);
      return;
    }
    void commitBundle_({ bypass: false });
  }

  async function commitBundle_({ bypass }: { bypass: boolean }) {
    if (!draft) return;
    setCommitting(true);
    setUploadError(null);
    setCommitResult(null);
    try {
      const result: any = await commitBundle({
        bundleId: draft.id as any,
        committedBy: currentUser,
        bypassLock: bypass,
      });
      const total =
        (result.reservations || 0) +
        (result.balances || 0) +
        (result.pos || 0) +
        (result.payments || 0) +
        (result.financials || 0);
      setCommitResult(`Committed ${total} rows across ${draft.files.length} files.`);
    } catch (err: any) {
      setUploadError(err?.message || "Commit failed");
    } finally {
      setCommitting(false);
      setShowFutureConfirm(false);
    }
  }

  async function onCancel() {
    if (!draft) return;
    if (!window.confirm("Discard staged files? They'll be removed from storage.")) return;
    await cancelDraft({ bundleId: draft.id as any });
    setCommitResult(null);
    setUploadError(null);
  }

  return (
    <div>
      <PageHeader
        title="Pipeline Uploads"
        subtitle={`${property.name} — drop the 5-file Campspot + Northgate bundle`}
      />

      {/* Status strip — Last committed + Current month. Dropped the
          "Next uploadable" card per the user's request: the rule is "any
          prior month is fair game", and the window-opens-on-the-1st copy
          read as a hard gate even though the bypass-via-confirm flow now
          allows future-period uploads. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <StatusCard
          label="Last committed"
          value={lastCommitted ? formatPeriod(lastCommitted.period) : "—"}
          sub={lastCommitted ? formatRelative(lastCommitted.committedAt) : "No bundles yet"}
        />
        <StatusCard
          label="Current month"
          value={formatPeriod(currentMonth)}
          sub="Uploads available for prior months"
        />
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`bg-white dark:bg-[#18181b] border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? "border-[#18181b] dark:border-[#fafafa] bg-[#fafafa] dark:bg-[#27272a]"
            : "border-[#e4e4e7] dark:border-[#3f3f46]"
        }`}
      >
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 rounded-full bg-[#f4f4f5] dark:bg-[#27272a] flex items-center justify-center">
            <Upload className="w-5 h-5 text-[#52525b] dark:text-[#a1a1aa]" strokeWidth={1.75} />
          </div>
        </div>
        <p className="text-[14px] font-semibold text-[#18181b] dark:text-[#fafafa]">
          Drop the monthly bundle here
        </p>
        <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] mt-1.5">
          Rent Roll, Guests with Balance, POS Category Sales, Total Payment, Financial Package
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls"
          onChange={onPick}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 mt-4 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] text-[12px] font-medium px-4 py-2 rounded hover:opacity-90 cursor-pointer disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? "Uploading…" : "Choose files"}
        </button>
      </div>

      {uploadError && (
        <div className="mt-3 bg-[#fef2f2] dark:bg-[#7f1d1d]/20 border border-[#fecaca] dark:border-[#7f1d1d] rounded p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-[#dc2626] flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-[#7f1d1d] dark:text-[#fca5a5]">{uploadError}</p>
        </div>
      )}

      {commitResult && (
        <div className="mt-3 bg-[#f0fdf4] dark:bg-[#14532d]/20 border border-[#bbf7d0] dark:border-[#14532d] rounded p-3 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#16a34a] flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-[#14532d] dark:text-[#bbf7d0]">{commitResult}</p>
        </div>
      )}

      {/* Draft staging area */}
      {draft && draft.files.length > 0 && (
        <div className="mt-4 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#e4e4e7] dark:border-[#3f3f46]">
            <div>
              <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Staged bundle</p>
              <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] mt-0.5">
                {draft.files.length} file{draft.files.length === 1 ? "" : "s"} · period {formatPeriod(draftPeriod)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onAutoDetect}
                className="text-[11px] font-medium text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"
              >
                Auto-detect period
              </button>
              <button
                onClick={onCancel}
                className="flex items-center gap-1 text-[11px] font-medium text-[#dc2626] hover:opacity-80 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                Discard
              </button>
            </div>
          </div>

          <div className="px-5 py-3 border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a]/50 flex items-center gap-3">
            <label className="text-[11px] font-medium text-[#71717a] dark:text-[#a1a1aa]">Period:</label>
            <input
              type="month"
              value={draftPeriod}
              onChange={(e) => updateDraftPeriod({ bundleId: draft.id as any, period: e.target.value })}
              className="text-[12px] bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded px-2 py-1 text-[#18181b] dark:text-[#fafafa]"
            />
            {!periodValid && (
              <span className="flex items-center gap-1 text-[11px] text-[#dc2626]">
                <AlertCircle className="w-3 h-3" />
                Period hasn't ended yet — wait until the 1st of the following month
              </span>
            )}
          </div>

          <div>
            {draft.files.map((f: any) => (
              <div
                key={f.id}
                className="grid grid-cols-[24px_1fr_180px_100px_32px] gap-3 px-5 py-2.5 border-t border-[#f4f4f5] dark:border-[#27272a] items-center"
              >
                {f.name.toLowerCase().endsWith(".xlsx") || f.name.toLowerCase().endsWith(".xls") ? (
                  <FileSpreadsheet className="w-4 h-4 text-[#71717a]" />
                ) : (
                  <FileText className="w-4 h-4 text-[#71717a]" />
                )}
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-[#18181b] dark:text-[#fafafa] truncate" title={f.name}>
                    {f.name}
                  </p>
                  <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">{formatFileSize(f.size)}</p>
                </div>
                <select
                  value={f.fileType}
                  onChange={(e) =>
                    updateDraftFileType({
                      bundleId: draft.id as any,
                      fileId: f.id,
                      fileType: e.target.value,
                    })
                  }
                  className={`text-[11px] bg-white dark:bg-[#18181b] border rounded px-2 py-1 cursor-pointer ${
                    f.fileType === "unknown"
                      ? "border-[#dc2626] text-[#dc2626]"
                      : "border-[#e4e4e7] dark:border-[#3f3f46] text-[#18181b] dark:text-[#fafafa]"
                  }`}
                >
                  {FILE_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {FILE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">{formatRelative(f.uploadedAt)}</span>
                <button
                  onClick={() => removeStagedFile({ bundleId: draft.id as any, fileId: f.id })}
                  className="p-1 rounded hover:bg-[#dc2626]/10 text-[#dc2626] cursor-pointer"
                  title="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-[#e4e4e7] dark:border-[#3f3f46] flex items-center justify-end gap-3">
            <button
              onClick={onCommitClick}
              disabled={committing || !allFilesParsed}
              className="inline-flex items-center gap-2 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] text-[12px] font-medium px-4 py-2 rounded hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {committing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {committing ? "Committing…" : "Commit bundle"}
            </button>
          </div>
        </div>
      )}

      {/* Future-period confirm modal — replaces the old "Admin bypass"
          checkbox. Triggers when the user tries to commit a period that
          hasn't ended yet (or is in the current month). They see the
          period explicitly and can confirm or cancel. */}
      {showFutureConfirm && draft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4"
          onClick={() => !committing && setShowFutureConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg shadow-xl max-w-md w-full p-5"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-[#fef3c7] dark:bg-[#78350f]/40 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-[#d97706]" />
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-semibold text-[#18181b] dark:text-[#fafafa]">
                  Commit a period that hasn't ended?
                </p>
                <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] mt-1">
                  You're about to commit <span className="font-medium text-[#18181b] dark:text-[#fafafa]">{formatPeriod(draftPeriod)}</span>, which is the current month or in the future ({formatPeriod(currentMonth)}). Bundle data may be incomplete.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setShowFutureConfirm(false)}
                disabled={committing}
                className="text-[12px] font-medium text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] px-3 py-2 rounded cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => commitBundle_({ bypass: true })}
                disabled={committing}
                className="inline-flex items-center gap-2 text-[12px] font-medium bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] hover:opacity-90 px-3 py-2 rounded cursor-pointer disabled:opacity-50"
              >
                {committing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {committing ? "Committing…" : "Commit anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      <div className="mt-6">
        <p className="text-[11px] font-semibold text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide mb-2">
          History
        </p>
        {loading ? (
          <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-6 text-center">
            <p className="text-[12px] text-[#a1a1aa]">Loading…</p>
          </div>
        ) : bundles.filter((b: any) => b.status === "committed").length === 0 ? (
          <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-6 text-center">
            <p className="text-[12px] text-[#a1a1aa]">No committed bundles yet.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
            <div className="grid grid-cols-[140px_1fr_120px_140px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
              <span>Period</span>
              <span>Files</span>
              <span>Committed by</span>
              <span>Committed</span>
            </div>
            {bundles
              .filter((b: any) => b.status === "committed")
              .sort((a: any, b: any) => (b.period || "").localeCompare(a.period || ""))
              .map((b: any) => (
                <div
                  key={b._id}
                  className="grid grid-cols-[140px_1fr_120px_140px] px-4 py-2.5 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] text-[#18181b] dark:text-[#fafafa] items-center"
                >
                  <span className="font-medium">{formatPeriod(b.period)}</span>
                  <span className="text-[#71717a] dark:text-[#a1a1aa] truncate">
                    {b.files.length} file{b.files.length === 1 ? "" : "s"} ·{" "}
                    {b.files.reduce((sum: number, f: any) => sum + (f.rowsParsed || 0), 0)} rows
                  </span>
                  <span className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] truncate">{b.committedBy || "—"}</span>
                  <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] tabular-nums">
                    {formatRelative(b.committedAt)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3">
      <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] font-medium uppercase tracking-wide">{label}</p>
      <p className="text-[15px] font-semibold text-[#18181b] dark:text-[#fafafa] mt-1">{value}</p>
      {sub && <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-0.5">{sub}</p>}
    </div>
  );
}

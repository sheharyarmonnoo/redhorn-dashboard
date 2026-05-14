"use client";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AlertTriangle } from "lucide-react";

// Surface a banner on commercial dashboards when the most recent yardi_sync
// for the active property finished with status "partial" or "failed", or
// when ANY file in the run carries zero rows ingested (typical mode: SSRS
// Lease Ledger retries both fail, sync continues with a half-blank set and
// the AR / electric-posting columns silently read yesterday's data).
//
// RV park properties have no Yardi feed; skip rendering by passing
// `propertyCode === null`.
export default function SyncStatusBanner({ propertyCode }: { propertyCode: string | null | undefined }) {
  const job = useQuery(
    api.syncJobs.latestForPropertyCode,
    propertyCode ? { propertyCode } : "skip",
  );
  if (!job) return null;

  const status = String((job as any).status || "");
  const isFresh = status === "completed";
  const files = ((job as any).files || []) as Array<{ fileName: string; reportType: string; rowsIngested?: number }>;
  const emptyFiles = files.filter((f) => !f.rowsIngested || f.rowsIngested === 0);
  const ok = isFresh && emptyFiles.length === 0;
  if (ok) return null;

  const startedAt = (job as any).startedAt as string | undefined;
  const ago = startedAt ? relativeAgo(startedAt) : "";
  const headline =
    status === "failed"
      ? "Yardi sync failed"
      : status === "partial"
      ? "Yardi sync finished partial"
      : status === "pending"
      ? "Yardi sync still running"
      : emptyFiles.length > 0
      ? "Yardi sync skipped some reports"
      : `Yardi sync status: ${status}`;
  const missingNames = emptyFiles.map((f) => prettyReport(f.reportType)).join(", ");
  return (
    <div className="mb-4 bg-[#fef3c7] dark:bg-[#451a03]/40 border border-[#fcd34d] dark:border-[#854d0e] rounded p-3 flex gap-2.5 items-start">
      <AlertTriangle className="w-4 h-4 text-[#d97706] flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-[#713f12] dark:text-[#fde68a]">
          {headline}
          {ago ? ` · ${ago}` : ""}
        </p>
        <p className="text-[11px] text-[#854d0e] dark:text-[#fcd34d] mt-0.5">
          {missingNames
            ? `Showing prior snapshot data for ${missingNames}. Numbers below may be stale until the next clean run.`
            : "Numbers below may be stale until the next clean run. Check the Data Pipeline page for details."}
        </p>
      </div>
    </div>
  );
}

function relativeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function prettyReport(reportType: string): string {
  const map: Record<string, string> = {
    rent_roll_full: "Rent Roll",
    rent_roll: "Rent Roll",
    income_statement: "Income Statement",
    is_cftem: "Income Statement",
    total_units: "Total Units",
    receivable_detail: "Receivable Detail",
    lease_ledger: "Lease Ledger",
    aging: "Aging",
  };
  return map[reportType] || reportType;
}

"use client";

// Single source of truth for tenant status badge styling. Used in the
// rent roll grid, the RentRollDrawer header, and the KPI drawers so the
// color semantics stay aligned everywhere a status surfaces.
//
// Color map (per Wapuson product spec):
//   green   → Current (paying as agreed)
//   yellow  → Past Due (owes money, pre-enforcement)
//   orange  → Locked Out / Auction Posted (enforcement underway)
//   red     → In Eviction (active legal action)
//   blue    → Expiring Soon / Needs Review (informational)
//   gray    → Vacant / unknown
//
// Status values not yet in the synced data (auction_posted, in_eviction,
// needs_review, etc.) are pre-wired here so Slice 2 can ship the editable
// dropdown without revisiting the color map. Today they only render if
// a manual override sets the value.

export type TenantStatusKey =
  | "current"
  | "past_due"
  | "locked_out"
  | "auction_posted"
  | "in_eviction"
  | "expiring_soon"
  | "needs_review"
  | "vacant"
  | "auction_completed"
  // RV park vocabulary (Campspot bundle) — mapped to the same color
  // semantics so an Occupied site reads as Current, etc.
  | "occupied"
  | "departing"
  | "unknown";

const STATUS_META: Record<TenantStatusKey, { label: string; cls: string; dot: string }> = {
  current: {
    label: "Current",
    cls: "bg-green-100 dark:bg-green-950/40 text-[#16a34a] border-green-200 dark:border-green-900/50",
    dot: "bg-[#16a34a]",
  },
  past_due: {
    label: "Past Due",
    cls: "bg-yellow-100 dark:bg-yellow-950/40 text-[#a16207] border-yellow-200 dark:border-yellow-900/50",
    dot: "bg-[#ca8a04]",
  },
  locked_out: {
    label: "Locked Out",
    cls: "bg-orange-100 dark:bg-orange-950/40 text-[#c2410c] border-orange-200 dark:border-orange-900/50",
    dot: "bg-[#ea580c]",
  },
  auction_posted: {
    label: "Auction Posted",
    cls: "bg-orange-100 dark:bg-orange-950/40 text-[#c2410c] border-orange-200 dark:border-orange-900/50",
    dot: "bg-[#ea580c]",
  },
  in_eviction: {
    label: "In Eviction",
    cls: "bg-red-100 dark:bg-red-950/40 text-[#dc2626] border-red-200 dark:border-red-900/50",
    dot: "bg-[#dc2626]",
  },
  expiring_soon: {
    label: "Expiring Soon",
    cls: "bg-blue-100 dark:bg-blue-950/40 text-[#2563eb] border-blue-200 dark:border-blue-900/50",
    dot: "bg-[#2563eb]",
  },
  needs_review: {
    label: "Needs Review",
    cls: "bg-blue-100 dark:bg-blue-950/40 text-[#2563eb] border-blue-200 dark:border-blue-900/50",
    dot: "bg-[#2563eb]",
  },
  vacant: {
    label: "Vacant",
    cls: "bg-[#f4f4f5] dark:bg-[#27272a] text-[#71717a] border-[#e4e4e7] dark:border-[#3f3f46]",
    dot: "bg-[#a1a1aa]",
  },
  auction_completed: {
    label: "Auction Completed",
    cls: "bg-[#f4f4f5] dark:bg-[#27272a] text-[#52525b] dark:text-[#a1a1aa] border-[#e4e4e7] dark:border-[#3f3f46]",
    dot: "bg-[#71717a]",
  },
  occupied: {
    label: "Occupied",
    cls: "bg-green-100 dark:bg-green-950/40 text-[#16a34a] border-green-200 dark:border-green-900/50",
    dot: "bg-[#16a34a]",
  },
  departing: {
    label: "Departing",
    cls: "bg-blue-100 dark:bg-blue-950/40 text-[#2563eb] border-blue-200 dark:border-blue-900/50",
    dot: "bg-[#2563eb]",
  },
  unknown: {
    label: "—",
    cls: "bg-[#f4f4f5] dark:bg-[#27272a] text-[#71717a] border-[#e4e4e7] dark:border-[#3f3f46]",
    dot: "bg-[#a1a1aa]",
  },
};

function normalize(status: string | undefined | null): TenantStatusKey {
  if (!status) return "unknown";
  const k = String(status).toLowerCase().trim() as TenantStatusKey;
  if (k in STATUS_META) return k;
  return "unknown";
}

export function getStatusLabel(status: string | undefined | null): string {
  return STATUS_META[normalize(status)].label;
}

// Compact pill suitable for AG Grid cells. Uses border + tint so it
// reads cleanly on both light and dark themes at the small row height.
export default function StatusPill({
  status,
  size = "sm",
}: {
  status: string | undefined | null;
  size?: "xs" | "sm";
}) {
  const meta = STATUS_META[normalize(status)];
  const sizeCls =
    size === "xs"
      ? "text-[10px] px-1.5 py-0.5"
      : "text-[11px] px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${sizeCls} ${meta.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

// Override badge shown next to (or below) the status pill when a row
// has been touched by a Red Horn team member. Purple/gray per the spec.
export function ManualOverrideBadge({
  by,
  at,
  size = "sm",
}: {
  by?: string;
  at?: string;
  size?: "xs" | "sm";
}) {
  const sizeCls =
    size === "xs"
      ? "text-[10px] px-1.5 py-0.5"
      : "text-[11px] px-2 py-0.5";
  const tail = [by ? `by ${by}` : null, at ? formatRelative(at) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium bg-purple-50 dark:bg-purple-950/30 text-[#7c3aed] dark:text-[#a78bfa] border-purple-200 dark:border-purple-900/50 ${sizeCls}`}
      title={`Manual override${tail ? ` ${tail}` : ""}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#7c3aed]" />
      Manual{tail ? ` · ${tail}` : ""}
    </span>
  );
}

function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

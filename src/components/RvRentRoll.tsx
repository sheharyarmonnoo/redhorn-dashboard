"use client";
import { useMemo, useState } from "react";
import { Search, ExternalLink } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useRvData, formatCurrency } from "@/hooks/useConvexData";

// Site-rolled-up rent roll for the RV park. The user's directive: lead with
// unit (site) info, treat guests as ephemeral context — RV stays churn fast
// (transient bookings of 2-5 nights), so a per-reservation table would be
// noise. We aggregate every reservation per site into one row showing the
// current/next reservation, total revenue YTD-in-snapshot, paid %, and
// outstanding balance.

type Reservation = any;
type Balance = any;
type Site = any;

type SiteRow = {
  siteCode: string;
  displayName: string;
  siteType: string;
  siteClass?: string;
  reservationCount: number;
  currentRes: Reservation | null;
  nextRes: Reservation | null;
  status: "occupied" | "arriving" | "vacant" | "departing";
  totalCharges: number;
  totalPayments: number;
  totalBalance: number;
  percentPaid: number;
  hasOpenBalance: boolean;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatShortDate(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function dateBetween(target: string, from: string, to: string): boolean {
  return target >= from && target <= to;
}

function rollupBySite(
  reservations: Reservation[],
  sites: Site[],
): SiteRow[] {
  const today = todayIso();
  // Index sites first so we always include vacant ones.
  const siteByCode = new Map<string, Site>();
  for (const s of sites) siteByCode.set(s.siteCode, s);

  // Group reservations by siteCode.
  const byCode = new Map<string, Reservation[]>();
  for (const r of reservations) {
    const code = r.siteCode;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code)!.push(r);
    // Also surface sites only present in reservations (in case the
    // sites table missed an upsert).
    if (!siteByCode.has(code)) {
      siteByCode.set(code, {
        siteCode: code,
        displayName: r.siteName || code,
        siteType: r.siteType,
        siteClass: r.siteClass,
      });
    }
  }

  const rows: SiteRow[] = [];
  for (const [code, site] of Array.from(siteByCode.entries())) {
    const rs = (byCode.get(code) || [])
      .slice()
      .sort((a, b) => (a.arrivalDate || "").localeCompare(b.arrivalDate || ""));

    let currentRes: Reservation | null = null;
    let nextRes: Reservation | null = null;
    for (const r of rs) {
      if (dateBetween(today, r.arrivalDate, r.departureDate)) {
        currentRes = r;
        break;
      }
      if (r.arrivalDate > today) {
        if (!nextRes || r.arrivalDate < nextRes.arrivalDate) nextRes = r;
      }
    }

    let status: SiteRow["status"] = "vacant";
    if (currentRes) {
      // Departing today / tomorrow — give an early warning so PM knows.
      const departInDays =
        (Date.UTC(
          ...(currentRes.departureDate.split("-").map(Number) as [number, number, number]),
        ) -
          Date.UTC(
            ...(today.split("-").map(Number) as [number, number, number]),
          )) /
        86400000;
      status = departInDays <= 1 ? "departing" : "occupied";
    } else if (nextRes) {
      const arriveInDays =
        (Date.UTC(
          ...(nextRes.arrivalDate.split("-").map(Number) as [number, number, number]),
        ) -
          Date.UTC(
            ...(today.split("-").map(Number) as [number, number, number]),
          )) /
        86400000;
      if (arriveInDays <= 7) status = "arriving";
    }

    const totalCharges = rs.reduce((s, r) => s + (r.totalChargesOnInvoice || 0), 0);
    const totalPayments = rs.reduce((s, r) => s + (r.totalPaymentsOnInvoice || 0), 0);
    const totalBalance = rs.reduce((s, r) => s + (r.balanceOnInvoice || 0), 0);
    const percentPaid = totalCharges > 0 ? totalPayments / totalCharges : 1;

    rows.push({
      siteCode: code,
      displayName: site.displayName || code,
      siteType: site.siteType || "",
      siteClass: site.siteClass,
      reservationCount: rs.length,
      currentRes,
      nextRes,
      status,
      totalCharges,
      totalPayments,
      totalBalance,
      percentPaid,
      hasOpenBalance: totalBalance > 0.5,
    });
  }

  // Sort: occupied first, then arriving, then vacant. Within each, by code.
  const order: Record<SiteRow["status"], number> = {
    occupied: 0,
    departing: 1,
    arriving: 2,
    vacant: 3,
  };
  rows.sort((a, b) => {
    const o = order[a.status] - order[b.status];
    if (o !== 0) return o;
    return a.siteCode.localeCompare(b.siteCode, undefined, { numeric: true });
  });
  return rows;
}

const STATUS_COLORS: Record<SiteRow["status"], string> = {
  occupied: "bg-[#16a34a]",
  departing: "bg-[#d97706]",
  arriving: "bg-[#2563eb]",
  vacant: "bg-[#a1a1aa]",
};

const STATUS_LABEL: Record<SiteRow["status"], string> = {
  occupied: "Occupied",
  departing: "Departing",
  arriving: "Arriving",
  vacant: "Vacant",
};

export default function RvRentRoll({
  propertyName,
  propertyId,
  diamondMapsUrl,
}: {
  propertyName: string;
  propertyId: string | undefined;
  diamondMapsUrl?: string;
}) {
  const { reservations, balances, sites, loading } = useRvData(propertyId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "occupied" | "arriving" | "vacant" | "past_due">("all");

  const allRows = useMemo(() => rollupBySite(reservations, sites), [reservations, sites]);

  // Past-due flag combines reservation balances + standalone balance report
  // entries (some guests may show in balances but not in active reservations).
  const balanceByConfirmation = useMemo(() => {
    const m = new Map<string, Balance>();
    for (const b of balances) {
      if (b.confirmation) m.set(b.confirmation, b);
    }
    return m;
  }, [balances]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (statusFilter === "past_due" && !r.hasOpenBalance) return false;
      if (statusFilter !== "all" && statusFilter !== "past_due" && r.status !== statusFilter) return false;
      if (!q) return true;
      const hay =
        `${r.siteCode} ${r.displayName} ${r.siteType} ` +
        `${r.currentRes?.firstName || ""} ${r.currentRes?.lastName || ""} ` +
        `${r.nextRes?.firstName || ""} ${r.nextRes?.lastName || ""}`;
      return hay.toLowerCase().includes(q);
    });
  }, [allRows, search, statusFilter]);

  const stats = useMemo(() => {
    const occupied = allRows.filter((r) => r.status === "occupied" || r.status === "departing").length;
    const arriving = allRows.filter((r) => r.status === "arriving").length;
    const vacant = allRows.filter((r) => r.status === "vacant").length;
    const pastDueRows = allRows.filter((r) => r.hasOpenBalance);
    const totalAr = pastDueRows.reduce((s, r) => s + r.totalBalance, 0);
    return {
      total: allRows.length,
      occupied,
      arriving,
      vacant,
      pastDueCount: pastDueRows.length,
      totalAr,
    };
  }, [allRows]);

  if (!propertyId) return null;

  if (loading) {
    return (
      <div>
        <PageHeader title="Rent Roll" subtitle={`${propertyName} — loading…`} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 animate-pulse h-[68px]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (allRows.length === 0) {
    return (
      <div>
        <PageHeader title="Rent Roll" subtitle={propertyName} />
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-10 text-center">
          <p className="text-[14px] font-semibold text-[#18181b] dark:text-[#fafafa]">
            No data yet
          </p>
          <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] mt-1.5">
            Drop the monthly bundle in <span className="font-medium">Monthly Uploads</span> to populate the rent roll.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Rent Roll" subtitle={`${propertyName} — ${stats.total} sites`}>
        {diamondMapsUrl && (
          <a
            href={diamondMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"
          >
            Site map
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 mb-4">
        <StatCard label="Total Sites" value={stats.total} />
        <StatCard label="Occupied" value={stats.occupied} valueClass="text-[#16a34a]" />
        <StatCard label="Arriving" value={stats.arriving} valueClass="text-[#2563eb]" />
        <StatCard label="Vacant" value={stats.vacant} valueClass="text-[#71717a] dark:text-[#a1a1aa]" />
        <StatCard
          label="Past Due"
          value={stats.pastDueCount}
          valueClass="text-[#dc2626]"
          sub={stats.totalAr > 0 ? `${formatCurrency(stats.totalAr)} A/R` : undefined}
        />
      </div>

      {/* Filters + search */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "occupied", "arriving", "vacant", "past_due"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
                statusFilter === f
                  ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b]"
                  : "bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
              }`}
            >
              {f === "all" ? "All" : f === "past_due" ? "Past Due" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="sm:ml-auto relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a1a1aa]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search site, type, guest…"
            className="text-[12px] bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded pl-7 pr-3 py-1.5 text-[#18181b] dark:text-[#fafafa] w-full sm:w-64"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
        <div className="grid grid-cols-[100px_1fr_110px_140px_140px_120px_100px_80px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
          <span>Site</span>
          <span>Type</span>
          <span>Status</span>
          <span>Current/Next</span>
          <span>Arr → Dep</span>
          <span className="text-right">Balance</span>
          <span className="text-right">Paid %</span>
          <span className="text-right">Stays</span>
        </div>
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-[12px] text-[#a1a1aa]">
            No sites match the current filters.
          </div>
        ) : (
          filtered.map((r) => {
            const focusRes = r.currentRes || r.nextRes;
            const guestName = focusRes
              ? `${focusRes.firstName || ""} ${focusRes.lastName || ""}`.trim()
              : "";
            return (
              <div
                key={r.siteCode}
                className="grid grid-cols-[100px_1fr_110px_140px_140px_120px_100px_80px] px-4 py-2.5 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] text-[#18181b] dark:text-[#fafafa] items-center"
              >
                <span className="font-medium tabular-nums">{r.siteCode}</span>
                <span className="text-[#71717a] dark:text-[#a1a1aa] truncate" title={r.siteType}>
                  {r.siteType}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px]">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[r.status]}`} />
                  {STATUS_LABEL[r.status]}
                </span>
                <span className="truncate text-[11px]" title={guestName}>
                  {guestName || <span className="text-[#a1a1aa]">—</span>}
                </span>
                <span className="text-[10px] text-[#71717a] dark:text-[#a1a1aa] tabular-nums">
                  {focusRes
                    ? `${formatShortDate(focusRes.arrivalDate)} → ${formatShortDate(focusRes.departureDate)}`
                    : "—"}
                </span>
                <span
                  className={`text-right tabular-nums ${
                    r.hasOpenBalance ? "text-[#dc2626] font-medium" : "text-[#71717a] dark:text-[#a1a1aa]"
                  }`}
                >
                  {r.totalBalance > 0.5 ? formatCurrency(r.totalBalance) : "—"}
                </span>
                <span className="text-right tabular-nums text-[#71717a] dark:text-[#a1a1aa]">
                  {r.totalCharges > 0 ? `${(r.percentPaid * 100).toFixed(0)}%` : "—"}
                </span>
                <span className="text-right tabular-nums text-[#a1a1aa] dark:text-[#71717a]">
                  {r.reservationCount}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClass = "text-[#18181b] dark:text-[#fafafa]",
  sub,
}: {
  label: string;
  value: number | string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 text-center">
      <p className={`text-[20px] sm:text-[24px] font-semibold ${valueClass}`}>{value}</p>
      <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] font-medium uppercase tracking-wide mt-0.5">
        {label}
      </p>
      {sub && <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-0.5">{sub}</p>}
    </div>
  );
}

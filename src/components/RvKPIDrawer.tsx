"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRvData, formatCurrency } from "@/hooks/useConvexData";

// RV-park-specific KPI drawer. Mirrors the commercial KPIDrawer shape
// (slide-from-right panel, sticky header, Field rows) but reads rv_*
// tables instead of tenants/units/monthlyRevenue. One drawer body per
// KPI: income, noi, occupancy, pastdue, vacant, sites.

interface Props {
  open: boolean;
  onClose: () => void;
  kpiKey: string | null;
  propertyId: string | undefined;
}

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#f4f4f5] dark:border-[#27272a] last:border-0">
      <span className="text-[12px] text-[#71717a] dark:text-[#a1a1aa]">{label}</span>
      <span className={`text-[12px] font-medium ${color || "text-[#18181b] dark:text-[#fafafa]"}`}>{value}</span>
    </div>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function cleanRvLabel(li: string | undefined): string {
  const raw = String(li || "").trim();
  let s = raw.replace(/^Total\s*-\s*\d{4}-\d{3}\s*-\s*/i, "Total ");
  s = s.replace(/^\d{4}-\d{3}\s*-\s*/, "");
  return s;
}

function IncomeDetail({ propertyId }: { propertyId: string | undefined }) {
  const { financials } = useRvData(propertyId);
  const isLines = (financials || []).filter((r: any) => r.kind === "isBudget");
  const period = isLines[0]?.snapshotPeriod || "—";
  let income = 0;
  let incomeYtd = 0;
  let incomeBudget = 0;
  const leaves: { label: string; mtd: number; ytd: number }[] = [];
  for (const r of isLines) {
    const li = String(r.lineItem || "");
    if (/^Total\s*-/i.test(li)) continue;
    if (/^4\d{3}-/.test(li)) {
      income += r.amountMtd || 0;
      incomeYtd += r.amountYtd || 0;
      incomeBudget += r.budgetMtd || 0;
      if (Math.abs(r.amountMtd || 0) > 0.5 || Math.abs(r.amountYtd || 0) > 0.5) {
        leaves.push({
          label: cleanRvLabel(li),
          mtd: r.amountMtd || 0,
          ytd: r.amountYtd || 0,
        });
      }
    }
  }
  const top = [...leaves].sort((a, b) => b.mtd - a.mtd).slice(0, 8);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
          Income Summary · {period}
        </p>
        <Field label="Total Income (period)" value={formatCurrency(income)} />
        <Field label="Budget" value={formatCurrency(incomeBudget)} />
        <Field
          label="Variance"
          value={formatCurrency(income - incomeBudget)}
          color={income - incomeBudget >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}
        />
        <Field label="YTD Income" value={formatCurrency(incomeYtd)} />
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
          Top Income Lines (period)
        </p>
        {top.length === 0 ? (
          <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a]">No income posted yet for this period.</p>
        ) : (
          top.map((l) => <Field key={l.label} label={l.label} value={formatCurrency(l.mtd)} />)
        )}
      </div>
    </div>
  );
}

function NoiDetail({ propertyId }: { propertyId: string | undefined }) {
  const { financials } = useRvData(propertyId);
  const isLines = (financials || []).filter((r: any) => r.kind === "isBudget");
  const period = isLines[0]?.snapshotPeriod || "—";
  let income = 0;
  let expense = 0;
  let incomeYtd = 0;
  let expenseYtd = 0;
  for (const r of isLines) {
    const li = String(r.lineItem || "");
    if (/^Total\s*-/i.test(li)) continue;
    if (/^4\d{3}-/.test(li)) {
      income += r.amountMtd || 0;
      incomeYtd += r.amountYtd || 0;
    } else if (/^[5-9]\d{3}-/.test(li)) {
      expense += r.amountMtd || 0;
      expenseYtd += r.amountYtd || 0;
    }
  }
  const noi = income - expense;
  const noiYtd = incomeYtd - expenseYtd;
  const margin = income > 0 ? (noi / income) * 100 : 0;
  const ytdMargin = incomeYtd > 0 ? (noiYtd / incomeYtd) * 100 : 0;
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
          NOI · {period}
        </p>
        <Field label="Income" value={formatCurrency(income)} />
        <Field label="Operating Expense" value={formatCurrency(expense)} color="text-[#dc2626]" />
        <Field
          label="NOI (period)"
          value={formatCurrency(noi)}
          color={noi >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}
        />
        <Field label="NOI Margin" value={`${margin.toFixed(1)}%`} />
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
          Year to Date
        </p>
        <Field label="YTD Income" value={formatCurrency(incomeYtd)} />
        <Field label="YTD Expense" value={formatCurrency(expenseYtd)} color="text-[#dc2626]" />
        <Field
          label="YTD NOI"
          value={formatCurrency(noiYtd)}
          color={noiYtd >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}
        />
        <Field label="YTD Margin" value={`${ytdMargin.toFixed(1)}%`} />
      </div>
    </div>
  );
}

function OccupancyDetail({ propertyId }: { propertyId: string | undefined }) {
  const { reservations, sites } = useRvData(propertyId);
  const today = todayIso();
  const bySite = new Map<string, any[]>();
  for (const r of reservations as any[]) {
    if (!bySite.has(r.siteCode)) bySite.set(r.siteCode, []);
    bySite.get(r.siteCode)!.push(r);
  }
  let occupied = 0;
  let upcomingWeek = 0;
  const byType = new Map<string, { occ: number; total: number }>();
  for (const s of sites as any[]) {
    const t = s.siteType || "—";
    if (!byType.has(t)) byType.set(t, { occ: 0, total: 0 });
    byType.get(t)!.total += 1;
    const rs = bySite.get(s.siteCode) || [];
    const current = rs.find((x: any) => x.arrivalDate <= today && today <= x.departureDate);
    if (current) {
      occupied += 1;
      byType.get(t)!.occ += 1;
    }
    const next = rs
      .filter((x: any) => x.arrivalDate > today)
      .sort((a: any, b: any) => a.arrivalDate.localeCompare(b.arrivalDate))[0];
    if (next) {
      const days = (Date.parse(next.arrivalDate) - Date.parse(today)) / 86400000;
      if (days <= 7) upcomingWeek += 1;
    }
  }
  const total = (sites as any[]).length;
  const vacant = Math.max(0, total - occupied);
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
          Occupancy Snapshot
        </p>
        <Field label="Occupied" value={`${occupied} of ${total} sites`} />
        <Field label="Vacant" value={`${vacant} sites`} />
        <Field label="Arriving (7 days)" value={`${upcomingWeek} sites`} />
        <Field label="Occupancy Rate" value={`${pct}%`} color="text-[#16a34a]" />
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
          By Site Type
        </p>
        {Array.from(byType.entries())
          .sort((a, b) => b[1].total - a[1].total)
          .map(([t, v]) => (
            <Field key={t} label={t} value={`${v.occ}/${v.total} occupied`} />
          ))}
      </div>
    </div>
  );
}

function PastDueDetail({
  onClose,
  propertyId,
}: {
  onClose: () => void;
  propertyId: string | undefined;
}) {
  const { balances } = useRvData(propertyId);
  const router = useRouter();
  const open = (balances as any[])
    .filter((b) => (b.balance || 0) > 0.5)
    .sort((a, b) => (b.balance || 0) - (a.balance || 0));
  const total = open.reduce((s, b) => s + (b.balance || 0), 0);
  function openRentRoll() {
    onClose();
    router.push("/rent-roll");
  }
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
          Past Due Summary
        </p>
        <Field label="Total A/R" value={formatCurrency(total)} color="text-[#dc2626]" />
        <Field label="Guests with Balance" value={`${open.length}`} />
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
          Top Balances
        </p>
        {open.length === 0 ? (
          <p className="text-[11px] text-[#16a34a]">No open balances.</p>
        ) : (
          open.slice(0, 12).map((b: any) => {
            const name = `${b.firstName || ""} ${b.lastName || ""}`.trim() || "(unknown)";
            return (
              <button
                key={`${b._id}`}
                onClick={openRentRoll}
                className="w-full text-left py-2 border-b border-[#f4f4f5] dark:border-[#27272a] last:border-0 hover:bg-[#fafafa] dark:hover:bg-[#27272a]/40 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[12px] font-medium text-[#18181b] dark:text-[#fafafa] truncate min-w-0 flex-1">
                    {name}
                  </span>
                  <span className="text-[12px] font-medium text-[#dc2626] whitespace-nowrap flex-shrink-0">
                    {formatCurrency(b.balance)}
                  </span>
                </div>
                <p className="text-[10px] text-[#a1a1aa] mt-0.5">
                  Charges {formatCurrency(b.totalCharges)} · Paid {formatCurrency(b.totalPayments)}
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function VacantDetail({ propertyId }: { propertyId: string | undefined }) {
  const { reservations, sites } = useRvData(propertyId);
  const today = todayIso();
  const bySite = new Map<string, any[]>();
  for (const r of reservations as any[]) {
    if (!bySite.has(r.siteCode)) bySite.set(r.siteCode, []);
    bySite.get(r.siteCode)!.push(r);
  }
  const vacantSites = (sites as any[]).filter((s) => {
    const rs = bySite.get(s.siteCode) || [];
    return !rs.some((x: any) => x.arrivalDate <= today && today <= x.departureDate);
  });
  const byType = new Map<string, number>();
  for (const s of vacantSites) {
    byType.set(s.siteType || "—", (byType.get(s.siteType || "—") || 0) + 1);
  }
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
          Vacant Sites
        </p>
        <Field label="Total Vacant" value={`${vacantSites.length} sites`} />
      </div>
      {byType.size > 0 && (
        <div>
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
            By Site Type
          </p>
          {Array.from(byType.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([t, count]) => (
              <Field key={t} label={t} value={`${count} sites`} />
            ))}
        </div>
      )}
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
          Site Codes
        </p>
        {vacantSites.length === 0 ? (
          <p className="text-[11px] text-[#16a34a]">All sites occupied.</p>
        ) : (
          vacantSites
            .sort((a, b) => (a.siteCode || "").localeCompare(b.siteCode || "", undefined, { numeric: true }))
            .map((s: any) => (
              <Field key={s.siteCode} label={`Site ${s.siteCode}`} value={s.siteType || "—"} />
            ))
        )}
      </div>
    </div>
  );
}

function SitesDetail({ propertyId }: { propertyId: string | undefined }) {
  const { sites } = useRvData(propertyId);
  const byType = new Map<string, number>();
  for (const s of sites as any[]) {
    byType.set(s.siteType || "—", (byType.get(s.siteType || "—") || 0) + 1);
  }
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
          Total Sites
        </p>
        <Field label="All Sites" value={`${(sites as any[]).length}`} />
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
          By Site Type
        </p>
        {Array.from(byType.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([t, count]) => (
            <Field key={t} label={t} value={`${count} sites`} />
          ))}
      </div>
    </div>
  );
}

const titles: Record<string, string> = {
  income: "Total Income",
  noi: "NOI",
  occupancy: "Occupancy",
  pastdue: "Past Due",
  vacant: "Vacant Sites",
  sites: "Total Sites",
};

export default function RvKPIDrawer({ open, kpiKey, onClose, propertyId }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted || !kpiKey) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className={`absolute inset-0 bg-black transition-opacity duration-200 ${
          visible ? "opacity-20" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`relative w-full sm:w-[440px] bg-white dark:bg-[#18181b] h-full overflow-y-auto border-l border-[#e4e4e7] dark:border-[#3f3f46] transition-transform duration-200 ease-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="sticky top-0 bg-white dark:bg-[#18181b] border-b border-[#e4e4e7] dark:border-[#3f3f46] px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-[16px] font-semibold text-[#18181b] dark:text-[#fafafa]">
            {titles[kpiKey] || kpiKey}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] rounded cursor-pointer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#a1a1aa"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-5">
          {kpiKey === "income" && <IncomeDetail propertyId={propertyId} />}
          {kpiKey === "noi" && <NoiDetail propertyId={propertyId} />}
          {kpiKey === "occupancy" && <OccupancyDetail propertyId={propertyId} />}
          {kpiKey === "pastdue" && <PastDueDetail onClose={onClose} propertyId={propertyId} />}
          {kpiKey === "vacant" && <VacantDetail propertyId={propertyId} />}
          {kpiKey === "sites" && <SitesDetail propertyId={propertyId} />}
        </div>
      </div>
    </div>
  );
}

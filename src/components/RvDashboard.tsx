"use client";
import { useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Wrench } from "lucide-react";
import KPICard from "@/components/KPICard";
import PageHeader from "@/components/PageHeader";
import { useRvData, useMaintenance, useRvLastUpdated, formatCurrency, formatLastUpdated } from "@/hooks/useConvexData";
import LatestInsights from "@/components/LatestInsights";
import { useTheme } from "@/components/ThemeProvider";

// RV park dashboard — same KPI strip + revenue chart shape Hollister/Belgold
// use, just sourced from rv_* tables (latest monthly bundle) instead of
// Yardi tenants / income_lines / monthly_revenue.

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatPeriodLabel(period: string | null) {
  if (!period) return "—";
  return new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function RvDashboard({
  propertyName,
  propertyId,
}: {
  propertyName: string;
  propertyId: string;
}) {
  const { reservations, balances, sites, pos, financials, loading } = useRvData(propertyId);
  const { committedAt, period: lastBundlePeriod } = useRvLastUpdated(propertyId);
  const lastUpdated = formatLastUpdated(committedAt, lastBundlePeriod);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Income statement period — drives the subtitle + the IS-derived KPIs.
  const isLines = useMemo(
    () => (financials || []).filter((r: any) => r.kind === "isBudget"),
    [financials],
  );
  const period = isLines[0]?.snapshotPeriod || null;
  const periodLabel = formatPeriodLabel(period);

  // Site / occupancy / past-due rollup from the latest reservations + balances.
  const stats = useMemo(() => {
    const today = todayIso();
    const bySite = new Map<string, any[]>();
    for (const r of reservations as any[]) {
      const code = r.siteCode;
      if (!bySite.has(code)) bySite.set(code, []);
      bySite.get(code)!.push(r);
    }
    let occupied = 0;
    for (const s of sites as any[]) {
      const rs = bySite.get(s.siteCode) || [];
      const current = rs.find(
        (r: any) => r.arrivalDate <= today && today <= r.departureDate,
      );
      if (current) occupied += 1;
    }
    const pastDueRows = (balances as any[]).filter((b: any) => (b.balance || 0) > 0.5);
    const totalAr = pastDueRows.reduce((s: number, b: any) => s + (b.balance || 0), 0);
    const totalSites = (sites as any[]).length;
    const vacant = Math.max(0, totalSites - occupied);
    return {
      total: totalSites,
      occupied,
      vacant,
      pastDueCount: pastDueRows.length,
      totalAr,
    };
  }, [reservations, balances, sites]);

  // IS-derived KPIs — sum leaf income / expense lines so we don't double-count
  // subtotals. Mirrors the same logic the /financials KPI strip uses.
  const ipKpis = useMemo(() => {
    let income = 0;
    let expense = 0;
    let incomeYtd = 0;
    let expenseYtd = 0;
    for (const r of isLines) {
      const li = String(r.lineItem || "");
      if (/^Total\s*-/i.test(li)) continue;
      if (/^Net\s+(Income|Operating|Ordinary|Other)/i.test(li)) continue;
      if (!/^\d/.test(li)) continue; // skip pure section headers
      if (/^4\d{3}-/.test(li)) {
        income += r.amountMtd || 0;
        incomeYtd += r.amountYtd || 0;
      } else if (/^[5-9]\d{3}-/.test(li)) {
        expense += r.amountMtd || 0;
        expenseYtd += r.amountYtd || 0;
      }
    }
    return {
      income,
      expense,
      noi: income - expense,
      incomeYtd,
      noiYtd: incomeYtd - expenseYtd,
    };
  }, [isLines]);

  // POS revenue rollup — last 5 months × monthly $ totals for the chart.
  const posSeries = useMemo(() => {
    const monthTotals = new Map<string, number>();
    for (const p of pos as any[]) {
      monthTotals.set(p.saleMonth, (monthTotals.get(p.saleMonth) || 0) + (p.total || 0));
    }
    const sorted = Array.from(monthTotals.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    return sorted.slice(-5);
  }, [pos]);

  const occupancyPct = stats.total > 0 ? (stats.occupied / stats.total) * 100 : 0;

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle={`${propertyName} — Loading…`} />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 animate-pulse h-[80px]"
            />
          ))}
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-6 h-72 animate-pulse" />
      </div>
    );
  }

  if (stats.total === 0 && isLines.length === 0) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle={propertyName} />
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-10 text-center">
          <p className="text-[14px] font-semibold text-[#18181b] dark:text-[#fafafa]">No data yet</p>
          <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] mt-1.5">
            Drop the monthly Campspot + Northgate bundle in <span className="font-medium">Pipeline Uploads</span> to populate the dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${propertyName}${period ? ` — ${periodLabel}` : ""}${
          lastUpdated ? ` · ${lastUpdated}` : ""
        }`}
      />

      {/* KPI strip — six cards, same shape as the commercial dashboard. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-4">
        <KPICard
          title="Income"
          value={formatCurrency(ipKpis.income)}
          subtitle={period ? `${periodLabel} actual` : "Latest period"}
        />
        <KPICard
          title="NOI"
          value={formatCurrency(ipKpis.noi)}
          color={ipKpis.noi >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}
          subtitle={`YTD ${formatCurrency(ipKpis.noiYtd)}`}
        />
        <KPICard
          title="Occupancy"
          value={`${occupancyPct.toFixed(0)}%`}
          subtitle={`${stats.occupied} of ${stats.total} sites`}
        />
        <KPICard
          title="Past Due"
          value={`${stats.pastDueCount}`}
          color="text-[#dc2626]"
          subtitle={stats.totalAr > 0 ? `${formatCurrency(stats.totalAr)} owed` : undefined}
        />
        <KPICard title="Vacant" value={`${stats.vacant}`} subtitle={`${stats.total} total sites`} />
        <KPICard
          title="Total Sites"
          value={`${stats.total}`}
          subtitle="Across all site types"
        />
      </div>

      {/* POS revenue chart — last 5 months, parallels the commercial Revenue
          Breakdown bar chart. Single series since RV POS rolls up monthly. */}
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-5">
        <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">
          POS Revenue
        </p>
        <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] mt-0.5">
          Camp-store sales · last {posSeries.length} month{posSeries.length === 1 ? "" : "s"}
        </p>
        {posSeries.length === 0 ? (
          <div className="mt-6 text-center text-[12px] text-[#a1a1aa]">
            No POS data yet for this property.
          </div>
        ) : (
          <div className="mt-3">
            <Chart
              type="bar"
              height={260}
              series={[
                {
                  name: "POS",
                  data: posSeries.map(([_, total]) => Number(total.toFixed(2))),
                },
              ]}
              options={{
                chart: { toolbar: { show: false }, fontFamily: "inherit", background: "transparent" },
                theme: { mode: isDark ? "dark" : "light" },
                grid: { borderColor: isDark ? "#27272a" : "#f4f4f5" },
                // Theme-aware bar color — was hard-coded #18181b which is
                // the dark-mode page background, so bars rendered invisible
                // in dark mode. Match the commercial Revenue Breakdown
                // which inverts for dark.
                colors: [isDark ? "#fafafa" : "#18181b"],
                xaxis: {
                  categories: posSeries.map(([month]) => month),
                  labels: { style: { colors: isDark ? "#a1a1aa" : "#71717a", fontSize: "11px" } },
                  axisBorder: { color: isDark ? "#27272a" : "#e4e4e7" },
                  axisTicks: { color: isDark ? "#27272a" : "#e4e4e7" },
                },
                yaxis: {
                  labels: {
                    style: { colors: isDark ? "#a1a1aa" : "#71717a", fontSize: "11px" },
                    formatter: (val: number) => `$${(val / 1000).toFixed(0)}k`,
                  },
                },
                dataLabels: { enabled: false },
                tooltip: {
                  theme: isDark ? "dark" : "light",
                  y: { formatter: (val: number) => formatCurrency(val) },
                },
                plotOptions: {
                  bar: {
                    borderRadius: 3,
                    // Narrow column so a single-month chart doesn't render as
                    // one comically wide block. Capped at 60px so multi-month
                    // bars stay visually grouped.
                    columnWidth: posSeries.length === 1 ? "12%" : "32%",
                  },
                },
              }}
            />
          </div>
        )}
      </div>

      {/* AI insights — surfaces the income_insight alerts that the
          rvInsights action generates after every monthly bundle commit.
          Shares the same SummaryCard + expandable InsightRow component the
          commercial dashboard uses, so the visual shape is identical. */}
      <LatestInsights
        propertyId={propertyId}
        sourceLabel="From most recent monthly bundle · click to expand"
      />

      {/* Maintenance widget — same shape commercial dashboards render under
          the chart. Pulls open / overdue / routine counts from
          maintenance_log and lists the next 5 actionable items. */}
      <MaintenanceSummary propertyId={propertyId} />
    </div>
  );
}

function MaintenanceSummary({ propertyId }: { propertyId: string }) {
  const { items } = useMaintenance(propertyId);
  const today = new Date().toISOString().slice(0, 10);
  const open = items.filter((i: any) => i.status !== "completed");
  const overdue = open.filter((i: any) =>
    i.isRecurring ? (i.nextDueDate && i.nextDueDate < today) : (i.date && i.date < today),
  );
  const recurring = items.filter((i: any) => i.isRecurring);
  const upcoming = [...overdue, ...open.filter((i: any) => !overdue.includes(i))].slice(0, 5);

  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wrench size={14} className="text-[#71717a] dark:text-[#a1a1aa]" />
          <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Maintenance</p>
          {overdue.length > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/40 text-[#dc2626]">
              {overdue.length} overdue
            </span>
          )}
        </div>
        <Link
          href="/maintenance"
          className="text-[11px] font-medium text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
        >
          View all →
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <MaintStat label="Open" value={open.length} />
        <MaintStat label="Overdue" value={overdue.length} color="text-[#dc2626]" />
        <MaintStat label="Routine" value={recurring.length} color="text-[#2563eb]" />
      </div>
      {upcoming.length === 0 ? (
        <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a] italic py-2">
          No open maintenance items.
        </p>
      ) : (
        <div className="space-y-1.5">
          {upcoming.map((it: any) => {
            const dueDate = it.isRecurring ? it.nextDueDate : it.date;
            const isOverdue = dueDate && dueDate < today;
            return (
              <div
                key={it._id}
                className="flex items-center justify-between gap-3 text-[12px] py-1.5 border-t border-[#f4f4f5] dark:border-[#27272a] first:border-0"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {it.isRecurring && (
                    <span className="text-[9px] font-medium text-[#2563eb] dark:text-[#60a5fa] uppercase tracking-wide flex-shrink-0">
                      Routine
                    </span>
                  )}
                  <span className="truncate text-[#18181b] dark:text-[#fafafa]">
                    {it.type || it.description || "—"}
                  </span>
                  {it.unit && (
                    <span className="text-[10px] text-[#a1a1aa] flex-shrink-0">· {it.unit}</span>
                  )}
                </div>
                <span
                  className={`text-[11px] flex-shrink-0 ${
                    isOverdue ? "text-[#dc2626] font-medium" : "text-[#71717a] dark:text-[#a1a1aa]"
                  }`}
                >
                  {dueDate || "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MaintStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="bg-[#fafafa] dark:bg-[#27272a] rounded p-2">
      <p className={`text-[18px] font-semibold ${color || "text-[#18181b] dark:text-[#fafafa]"}`}>
        {value}
      </p>
      <p className="text-[9px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">{label}</p>
    </div>
  );
}

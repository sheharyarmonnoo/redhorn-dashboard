"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import KPICard from "@/components/KPICard";
import KPIDrawer from "@/components/KPIDrawer";
import PageHeader from "@/components/PageHeader";
import RevenueFilter from "@/components/RevenueFilter";
import Link from "next/link";
import { Wrench } from "lucide-react";
import { useActiveProperty, useTenants, useUnits, useMonthlyRevenue, useAlerts, useMaintenance, formatCurrency, useDashboardLoading, isExpiringWithin, leasedUnitKeys } from "@/hooks/useConvexData";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { Filter } from "lucide-react";
import dynamic from "next/dynamic";
import { useTheme } from "@/components/ThemeProvider";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function DashboardPage() {
  const property = useActiveProperty();
  const tenants = useTenants(property?._id);
  const units = useUnits(property?._id);
  const monthlyRevenueRaw = useMonthlyRevenue(property?._id);
  // Drop phantom rows for the current calendar month and beyond. Older
  // sync runs that fell back to snapshotDate (today) before the
  // period-from-IS-header logic landed left dupes; the chart shouldn't
  // show "May" as the same value as April just because the sync ran in
  // May. Once next month's IS comes in, those months populate naturally.
  const monthlyRevenue = useMemo(() => {
    const today = new Date();
    const cutoff = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    return monthlyRevenueRaw.filter((m: any) => m.month && m.month >= "2026-01" && m.month <= cutoff);
  }, [monthlyRevenueRaw]);
  const loading = useDashboardLoading(property?._id);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [kpiDrawer, setKpiDrawer] = useState<string | null>(null);

  if (!property || loading) {
    return <DashboardSkeleton />;
  }

  const occupied = tenants.filter(t => t.status !== "vacant");
  // Vacancy = units in the Total Units feed that aren't covered by any
  // active lease. Multi-unit leases (e.g. tenant.unit = "A-103, A-112, A-85")
  // must be expanded — otherwise A-112 and A-85 get miscounted as vacant.
  const tenantUnitKeys = leasedUnitKeys(tenants);
  const vacantUnits = units.filter((u: any) => !tenantUnitKeys.has((u.unit || "").trim().toLowerCase()));
  const totalUnits = units.length > 0 ? units.length : tenants.length;
  // Occupancy is unit-level, not lease-level: count distinct leased units
  // (with multi-unit leases expanded). Using occupied.length (tenant rows)
  // would under-count by the number of multi-unit leases.
  const occupiedCount = tenantUnitKeys.size;
  const occupancyPct = totalUnits > 0 ? Math.round((occupiedCount / totalUnits) * 100) : 0;
  const totalVacantSqft = vacantUnits.reduce((s: number, u: any) => s + (u.sqft || 0), 0);
  // Prefer the monthly_revenue rollup (derived from the income statement) when
  // present — Yardi's dashboard rent-roll panel doesn't carry rent figures, so
  // summing tenant.monthlyRent yields $0 on real data. Fall back to the tenant
  // sum only when no rollup row exists yet.
  const tenantRentSum = occupied.reduce((sum, t) => sum + t.monthlyRent, 0);
  const latestRollup = monthlyRevenue.length > 0 ? monthlyRevenue[monthlyRevenue.length - 1] : null;
  const totalMonthlyRent = latestRollup && latestRollup.total > 0 ? latestRollup.total : tenantRentSum;
  // Past-due is now driven by the tenant status field (overrides flow from
  // the site plan drawer's status toggle through tenantOverrides). Count
  // matches the Vacant card pattern — number of units in that state.
  const pastDueTenants = tenants.filter(t => t.status === "past_due");
  const pastDueCount = pastDueTenants.length;
  const pastDueAmount = pastDueTenants.reduce((sum, t) => sum + (t.pastDueAmount || 0), 0);
  // Date-based filter — don't trust tenant.status alone since the synced
  // status field can lag behind reality (it's only refreshed at ingest, and
  // the rent-roll panel doesn't always set "expiring_soon" even when the
  // lease term we now pull from the Lease Ledger crosses the 90-day window).
  const expiringCount = tenants.filter(t => t.status !== "vacant" && isExpiringWithin(t.leaseTo, 90)).length;

  // Generate alerts from tenant data
  const today = new Date().toISOString().slice(0, 10);
  const urgentLeaseCutoff = new Date();
  urgentLeaseCutoff.setDate(urgentLeaseCutoff.getDate() + 30);
  const urgentLeaseCutoffISO = urgentLeaseCutoff.toISOString().slice(0, 10);

  const alerts: { type: string; message: string; unit: string; date: string }[] = [];
  for (const t of tenants) {
    if (t.status === "vacant") continue;
    if (t.pastDueAmount > 0) {
      alerts.push({ type: "critical", message: `Past due: ${formatCurrency(t.pastDueAmount)}`, unit: t.unit, date: today });
    }
    if (t.status === "expiring_soon") {
      const isUrgent = t.leaseTo <= urgentLeaseCutoffISO;
      alerts.push({ type: isUrgent ? "critical" : "warning", message: `Lease expires ${t.leaseTo}`, unit: t.unit, date: t.leaseTo });
    }
  }

  const chartFont = "'Inter', -apple-system, system-ui, sans-serif";

  const axisColor = isDark ? "#71717a" : "#a1a1aa";
  const gridColor = isDark ? "#27272a" : "#f4f4f5";

  const revenueChartOptions: ApexCharts.ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: chartFont, background: "transparent" },
    theme: { mode: isDark ? "dark" : "light" },
    plotOptions: { bar: { borderRadius: 2, columnWidth: "55%" } },
    // M1: warmer accent for dark mode so bars don't look like snow on white; clear hierarchy between series
    colors: isDark ? ["#e4e4e7", "#a1a1aa", "#52525b"] : ["#18181b", "#71717a", "#d4d4d8"],
    xaxis: { categories: monthlyRevenue.map(m => m.month), labels: { style: { colors: axisColor, fontSize: "11px" } } },
    yaxis: { labels: { style: { colors: axisColor, fontSize: "11px" }, formatter: (v: number) => `$${(v / 1000).toFixed(0)}k` } },
    grid: { borderColor: gridColor, strokeDashArray: 0 },
    legend: { position: "top", horizontalAlign: "right", fontSize: "11px", markers: { size: 6, shape: "square" as const }, labels: { colors: axisColor } },
    tooltip: { y: { formatter: (v: number) => formatCurrency(v) }, theme: isDark ? "dark" : "light" },
    dataLabels: { enabled: false },
  };

  const revenueSeries = [
    { name: "Rent", data: monthlyRevenue.map(m => Math.round(m.rent)) },
    { name: "Electric", data: monthlyRevenue.map(m => Math.round(m.electric)) },
    { name: "CAM", data: monthlyRevenue.map(m => Math.round(m.cam)) },
  ];

  const occupancyChartOptions: ApexCharts.ApexOptions = {
    chart: { type: "area", toolbar: { show: false }, fontFamily: chartFont, background: "transparent" },
    theme: { mode: isDark ? "dark" : "light" },
    colors: [isDark ? "#fafafa" : "#18181b"],
    fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.12, opacityTo: 0, stops: [0, 100] } },
    stroke: { curve: "smooth", width: 2 },
    xaxis: { categories: monthlyRevenue.map(m => m.month), labels: { style: { colors: axisColor, fontSize: "11px" } } },
    yaxis: { min: 70, max: 100, labels: { style: { colors: axisColor, fontSize: "11px" }, formatter: (v: number) => `${v}%` } },
    grid: { borderColor: gridColor, strokeDashArray: 0 },
    markers: { size: 3, colors: [isDark ? "#fafafa" : "#18181b"], strokeColors: isDark ? "#18181b" : "#fff", strokeWidth: 2 },
    tooltip: { y: { formatter: (v: number) => `${v}%` }, theme: isDark ? "dark" : "light" },
    dataLabels: { enabled: false },
  };

  const occupancySeries = [{ name: "Occupancy", data: monthlyRevenue.map(m => m.occupancy) }];

  // No Yardi feed yet for this property — every numeric is going to read $0
  // / 0%. Show a banner above the KPI strip instead of letting the user think
  // the property has zero rent and zero occupancy. Driven by the `hasData`
  // flag on the properties row + the absence of monthly_revenue rollups.
  const noYardiData = !property.hasData && tenants.length === 0 && monthlyRevenue.length === 0;

  return (
    <div>
      <PageHeader
        title="Monthly KPI Dashboard"
        subtitle={(() => {
          const latestMonth = monthlyRevenue.length > 0 ? monthlyRevenue[monthlyRevenue.length - 1].month : "";
          // "2026-03" → "March 2026"; leaves anything that isn't a YYYY-MM alone
          let pretty = latestMonth;
          if (/^\d{4}-\d{2}$/.test(latestMonth)) {
            const [y, m] = latestMonth.split("-");
            pretty = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
          }
          return pretty ? `${property.name} — ${pretty}` : property.name;
        })()}
      />

      {noYardiData && (
        <div className="mb-4 bg-[#fef9c3] dark:bg-[#422006]/40 border border-[#fde68a] dark:border-[#854d0e] rounded p-3">
          <p className="text-[12px] font-semibold text-[#713f12] dark:text-[#fde68a]">No Yardi data yet for {property.name}</p>
          <p className="text-[11px] text-[#854d0e] dark:text-[#fcd34d] mt-0.5">
            The KPIs below will show zeros until a Yardi sync runs — or this property may not have a Yardi feed at all. Check the Data Pipeline page to import data.
          </p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 mb-6">
        <KPICard title="Monthly Revenue" value={formatCurrency(totalMonthlyRent)} trend="1.5%" trendUp={true} sparkline={monthlyRevenue.map(m => m.total)} onClick={() => setKpiDrawer("revenue")} />
        <KPICard title="Occupancy" value={`${occupancyPct}%`} subtitle={`${occupiedCount} of ${totalUnits} units`} sparkline={monthlyRevenue.map(m => m.occupancy)} trendUp={true} onClick={() => setKpiDrawer("occupancy")} />
        <KPICard title="Past Due" value={String(pastDueCount)} subtitle={pastDueAmount > 0 ? `${formatCurrency(pastDueAmount)} owed` : `${pastDueCount === 1 ? "unit" : "units"} past due`} color={pastDueCount > 0 ? "text-[#dc2626]" : "text-[#16a34a]"} onClick={() => setKpiDrawer("pastdue")} />
        <KPICard title="Vacant" value={String(vacantUnits.length)} subtitle={`${totalVacantSqft.toLocaleString()} SF`} onClick={() => setKpiDrawer("vacant")} />
        <KPICard title="Expiring Leases" value={String(expiringCount)} subtitle="Within 90 days" onClick={() => setKpiDrawer("expiring")} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-3 mb-6">
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-4">
          <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-1">Revenue Breakdown</p>
          <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a] mb-3">Last {monthlyRevenue.length} months by category</p>
          {monthlyRevenue.length > 0 && <Chart options={revenueChartOptions} series={revenueSeries} type="bar" height={260} />}
        </div>
      </div>

      <LatestInsights propertyId={property._id} />

      <MaintenanceSummary propertyId={property._id} />

      <KPIDrawer open={!!kpiDrawer} kpiKey={kpiDrawer} onClose={() => setKpiDrawer(null)} />
    </div>
  );
}

function InsightRow({ insight, dotClass, onFlag, onComplete, leaving, index = 0 }: {
  insight: any;
  dotClass: string;
  onFlag: () => void;
  onComplete: () => void | Promise<void>;
  leaving?: boolean;
  index?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [localLeaving, setLocalLeaving] = useState(false);
  const isLeaving = leaving || localLeaving;
  const handleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (completing) return;
    setCompleting(true);
    setLocalLeaving(true);
    // Let the leave animation play before the Convex mutation removes the row;
    // this prevents the jarring snap when the data refresh fires immediately.
    await new Promise(r => setTimeout(r, 280));
    try { await onComplete(); } finally { setCompleting(false); }
  };
  return (
    <div
      className={`${isLeaving ? "rh-row-leave" : "rh-row-in"}`}
      style={!isLeaving ? { animationDelay: `${index * 40}ms` } : undefined}
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#fafafa] dark:hover:bg-[#27272a] cursor-pointer text-left transition-colors"
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
        <span className="flex-1 text-[12px] font-medium text-[#18181b] dark:text-[#fafafa] truncate">{insight.title}</span>
        {insight.dataContext?.mom && (
          <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] hidden sm:inline">{insight.dataContext.mom}</span>
        )}
        <span className="text-[9px] uppercase tracking-wide font-medium text-[#a1a1aa] dark:text-[#71717a] flex-shrink-0">{insight.severity}</span>
        <span className={`text-[10px] text-[#a1a1aa] dark:text-[#71717a] transition-transform flex-shrink-0 ${expanded ? "rotate-90" : ""}`}>›</span>
      </button>
      <div className={`rh-collapse ${expanded ? "is-open" : ""}`}>
        <div className="rh-collapse-inner">
          <div className="px-3 pb-3 pl-[1.625rem]">
            <div className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] leading-relaxed space-y-1.5">
              {renderMarkdown(insight.body || "")}
            </div>
            {insight.dataContext?.lineItem && (
              <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-1.5">
                <span className="uppercase tracking-wide font-medium">Line item:</span> {insight.dataContext.lineItem}
              </p>
            )}
            {insight.dataContext?.mom && (
              <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] sm:hidden mt-0.5">
                <span className="uppercase tracking-wide font-medium">MoM:</span> {insight.dataContext.mom}
              </p>
            )}
            <div className="mt-2 flex items-center justify-end gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); onFlag(); }}
                className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] hover:text-[#d97706] cursor-pointer"
                title="Not actually an issue — Claude won't re-flag this pattern next sync"
              >
                Mark as False Flag
              </button>
              <button
                onClick={handleComplete}
                disabled={completing}
                className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] hover:text-[#16a34a] cursor-pointer disabled:opacity-50"
                title="Resolved — this finding has been addressed"
              >
                {completing ? "Marking…" : "Mark as Completed"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FalseFlagCard({ insight, onUnflag, onAddComment }: {
  insight: any;
  onUnflag: () => void | Promise<void>;
  onAddComment: (text: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const comments = Array.isArray(insight.dataContext?.comments) ? insight.dataContext.comments : [];

  function fmtTime(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch { return ""; }
  }

  async function submit() {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    try {
      await onAddComment(text);
      setDraft("");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="border border-dashed border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 bg-[#fafafa] dark:bg-[#27272a]">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-[12px] font-medium text-[#71717a] dark:text-[#a1a1aa] line-through">{insight.title}</p>
        <span className="text-[9px] uppercase tracking-wide font-medium text-[#16a34a]">false flag</span>
      </div>
      {insight.dataContext?.falseFlagReason && (
        <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] leading-relaxed italic">"{insight.dataContext.falseFlagReason}"</p>
      )}
      <p className="text-[9px] text-[#a1a1aa] dark:text-[#71717a] mt-1.5">marked by {insight.resolvedBy || "User"}</p>

      {comments.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[#e4e4e7] dark:border-[#3f3f46]/60 space-y-1.5">
          {comments.map((c: any, i: number) => (
            <div key={i} className="text-[11px] leading-relaxed">
              <span className="font-medium text-[#52525b] dark:text-[#d4d4d8]">{c.author}</span>
              <span className="text-[9px] text-[#a1a1aa] dark:text-[#71717a] ml-1.5">{fmtTime(c.createdAt)}</span>
              <p className="text-[#71717a] dark:text-[#a1a1aa]">{c.text}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-[#e4e4e7] dark:border-[#3f3f46]/60">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder="Add a comment for next sync's context…"
            className="flex-1 text-[11px] px-2 py-1 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#18181b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
          />
          <button
            onClick={submit}
            disabled={!draft.trim() || posting}
            className="text-[10px] font-medium px-2 py-1 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {posting ? "…" : "Add"}
          </button>
        </div>
        <button
          onClick={onUnflag}
          className="mt-1.5 text-[10px] text-[#a1a1aa] dark:text-[#71717a] hover:text-[#2563eb] cursor-pointer"
          title="Reopen — this finding will be re-evaluated next sync"
        >
          Reopen
        </button>
      </div>
    </div>
  );
}

function LatestInsights({ propertyId }: { propertyId: string }) {
  const { alerts, loading } = useAlerts();
  const { user } = useUser();
  const markFalseFlag = useMutation(api.alerts.markFalseFlag);
  const undoFalseFlag = useMutation(api.alerts.undoFalseFlag);
  const addComment = useMutation(api.alerts.addComment);
  const updateStatus = useMutation(api.alerts.updateStatus);
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [flagging, setFlagging] = useState<{ id: any; title: string } | null>(null);
  // Track which rows are mid-removal so the leave animation plays before the
  // Convex subscription removes them. Avoids the jarring snap on action.
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());
  // Persist the summary card's expand state per property in localStorage so the
  // user lands back where they left off across page reloads / property switches.
  const summaryKey = `redhorn_summary_expanded_${propertyId}`;
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem(summaryKey);
      setSummaryExpanded(v === "1");
    } catch {}
  }, [summaryKey]);
  const toggleSummary = () => {
    setSummaryExpanded(prev => {
      const next = !prev;
      try { localStorage.setItem(summaryKey, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const { active, suppressed, latestSummary, latestSummaryAt, hasAnyHistory } = useMemo(() => {
    const all = (alerts as any[])
      .filter(a => a.alertType === "income_insight" && a.propertyId === propertyId)
      .sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0));
    const active = all.filter(a => a.status !== "false_flag" && a.status !== "resolved" && a.status !== "dismissed").slice(0, 6);
    const suppressed = all.filter(a => a.status === "false_flag");
    const top = active[0] ?? all[0];
    return {
      active,
      suppressed,
      latestSummary: top?.aiAnalysis,
      latestSummaryAt: top?._creationTime,
      hasAnyHistory: all.length > 0,
    };
  }, [alerts, propertyId]);

  // While alerts are still streaming in from Convex, show a skeleton so the
  // section doesn't pop in late after the rest of the dashboard renders.
  if (loading) {
    return (
      <div className="mb-6 mt-6">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Latest AI Insights</p>
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">Loading…</p>
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 mb-3 animate-pulse">
          <div className="h-3 w-20 bg-[#f4f4f5] dark:bg-[#27272a] rounded mb-3" />
          <div className="space-y-1.5">
            <div className="h-3 w-full bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
            <div className="h-3 w-11/12 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
            <div className="h-3 w-10/12 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
          </div>
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded divide-y divide-[#e4e4e7] dark:divide-[#3f3f46]">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e4e4e7] dark:bg-[#3f3f46]" />
              <span className="flex-1 h-3 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
              <span className="h-3 w-12 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // No insights ever generated for this property — hide entirely so the
  // empty state doesn't dominate before the first sync runs.
  if (!hasAnyHistory) return null;

  const sevDot: Record<string, string> = {
    critical: "bg-[#dc2626]",
    warning: "bg-[#d97706]",
    info: "bg-[#2563eb]",
  };

  function openFlag(insight: any) {
    setFlagging({ id: insight._id, title: insight.title || "this finding" });
  }

  async function submitFlag(reason: string) {
    if (!flagging) return;
    const id = flagging.id;
    // Animate the row out first, THEN mutate. Mirrors the smoothness of the
    // Mark-as-Completed flow.
    setLeavingIds(prev => new Set(prev).add(String(id)));
    setFlagging(null);
    await new Promise(r => setTimeout(r, 280));
    await markFalseFlag({ id, reason: reason.trim(), markedBy: user?.fullName || user?.firstName || "User" });
  }

  async function unflag(id: any) {
    if (!window.confirm("Reopen this insight? It will appear again on the next sync.")) return;
    await undoFalseFlag({ id });
  }

  return (
    <div className="mb-6 mt-6">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Latest AI Insights</p>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">From most recent Yardi sync · click to expand</p>
      </div>
      {latestSummary && (
        <SummaryCard
          summary={latestSummary}
          updatedAt={latestSummaryAt}
          expanded={summaryExpanded}
          onToggle={toggleSummary}
        />
      )}
      {active.length > 0 ? (
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded divide-y divide-[#e4e4e7] dark:divide-[#3f3f46] max-h-[360px] overflow-y-auto">
          {active.map((ins, i) => (
            <InsightRow
              key={ins._id}
              insight={ins}
              dotClass={sevDot[ins.severity] || sevDot.info}
              onFlag={() => openFlag(ins)}
              onComplete={async () => { await updateStatus({ id: ins._id, status: "resolved", resolvedBy: user?.fullName || user?.firstName || "User" }); }}
              leaving={leavingIds.has(String(ins._id))}
              index={i}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-4 text-center">
          <p className="text-[12px] text-[#16a34a] font-medium">All clear · no active findings this run</p>
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-1">Past insights are kept for continuity. Next sync will flag anything new.</p>
        </div>
      )}

      {suppressed.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowSuppressed(s => !s)}
            className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] hover:text-[#71717a] dark:hover:text-[#a1a1aa] cursor-pointer underline decoration-dotted"
          >
            {showSuppressed ? "Hide" : "Show"} {suppressed.length} suppressed false flag{suppressed.length === 1 ? "" : "s"}
          </button>
          {showSuppressed && (
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              {suppressed.map(ins => (
                <FalseFlagCard
                  key={ins._id}
                  insight={ins}
                  onUnflag={() => unflag(ins._id)}
                  onAddComment={async (text) => { await addComment({ id: ins._id, text, author: user?.fullName || user?.firstName || "User" }); }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {flagging && (
        <FalseFlagModal
          title={flagging.title}
          onCancel={() => setFlagging(null)}
          onSubmit={submitFlag}
        />
      )}
    </div>
  );
}

function FalseFlagModal({ title, onCancel, onSubmit }: {
  title: string;
  onCancel: () => void;
  onSubmit: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!reason.trim() || submitting) return;
    setSubmitting(true);
    try { await onSubmit(reason); } finally { setSubmitting(false); }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4 rh-backdrop"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg shadow-xl w-full max-w-md p-5 rh-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-1">Mark as Handled</p>
        <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] mb-3 truncate">"{title}"</p>
        <p className="text-[12px] text-[#52525b] dark:text-[#a1a1aa] mb-2 leading-relaxed">
          Why isn't this an issue? Your explanation gets saved so the next sync won't re-flag the same finding.
        </p>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="e.g. Annual real-estate tax accrual is recorded as a lump sum in Q1 — this is expected."
          className="w-full text-[12px] bg-white dark:bg-[#09090b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-2 text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] dark:placeholder-[#52525b] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa] resize-none"
        />
        <div className="flex items-center justify-end gap-2 mt-3">
          <button
            onClick={onCancel}
            className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] px-3 py-1.5 rounded cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason.trim() || submitting}
            className="text-[12px] font-medium bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] px-3 py-1.5 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Saving…" : "Mark as Handled"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ summary, updatedAt, expanded, onToggle }: {
  summary: string;
  updatedAt?: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isLong = summary.length > 280;
  const ts = updatedAt ? formatRelativeTime(updatedAt) : "";

  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 mb-3 rh-card-mount">
      <p className="text-[11px] font-semibold text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide mb-2">Summary</p>
      <div
        className={`rh-summary-collapse text-[12px] text-[#18181b] dark:text-[#fafafa] leading-relaxed space-y-2 ${!expanded && isLong ? "is-clamped" : ""}`}
      >
        {renderMarkdown(summary)}
      </div>
      <div className="flex items-center gap-3 mt-2">
        {isLong && (
          <button
            onClick={onToggle}
            className="text-[11px] text-[#2563eb] dark:text-[#60a5fa] hover:underline cursor-pointer"
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
        {ts && <span className="text-[9px] text-[#d4d4d8] dark:text-[#52525b]">· updated {ts}</span>}
      </div>
    </div>
  );
}

// Lightweight markdown renderer — handles **bold**, single-newline line breaks,
// "- " bullet lists, and \n\n section breaks. Avoids a markdown library; the
// prompt is constrained to this small grammar.
function renderMarkdown(text: string): React.ReactNode {
  const sections = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  return sections.map((section, i) => {
    const lines = section.split("\n").map(l => l.trimEnd());
    // Group consecutive "- " lines into a single <ul>; everything else is <p>.
    const blocks: React.ReactNode[] = [];
    let bulletBuffer: string[] = [];
    const flushBullets = () => {
      if (bulletBuffer.length > 0) {
        blocks.push(
          <ul key={`ul-${blocks.length}`} className="space-y-1 ml-4 list-disc marker:text-[#a1a1aa] dark:marker:text-[#52525b]">
            {bulletBuffer.map((b, bi) => (
              <li key={bi}>{renderInline(b)}</li>
            ))}
          </ul>
        );
        bulletBuffer = [];
      }
    };
    for (const line of lines) {
      const m = line.match(/^[-*]\s+(.*)$/);
      if (m) {
        bulletBuffer.push(m[1]);
      } else {
        flushBullets();
        if (line.trim().length > 0) {
          blocks.push(<p key={`p-${blocks.length}`}>{renderInline(line)}</p>);
        }
      }
    }
    flushBullets();
    return (
      <div key={i} className="space-y-1.5">
        {blocks}
      </div>
    );
  });
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={key++} className="font-semibold text-[#18181b] dark:text-[#fafafa]">{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function DashboardSkeleton() {
  return (
    <div>
      <div className="rh-progress-bar" aria-hidden="true">
        <div className="rh-progress-bar-inner" />
      </div>
      <div className="space-y-3 animate-pulse">
        <div className="h-7 w-48 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
        <div className="h-4 w-64 bg-[#f4f4f5] dark:bg-[#27272a] rounded mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 mb-6">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-4">
              <div className="h-3 w-20 bg-[#f4f4f5] dark:bg-[#27272a] rounded mb-3" />
              <div className="h-7 w-24 bg-[#f4f4f5] dark:bg-[#27272a] rounded mb-2" />
              <div className="h-2 w-full bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
            </div>
          ))}
        </div>
        <div className="h-72 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded mb-6 p-4">
          <div className="h-3 w-36 bg-[#f4f4f5] dark:bg-[#27272a] rounded mb-2" />
          <div className="h-3 w-48 bg-[#f4f4f5] dark:bg-[#27272a] rounded mb-6" />
          <div className="flex items-end gap-2 h-40">
            {[40, 65, 50, 80, 70, 90, 55].map((h, i) => (
              <div key={i} className="flex-1 bg-[#f4f4f5] dark:bg-[#27272a] rounded-t" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 mb-3">
          <div className="h-3 w-20 bg-[#f4f4f5] dark:bg-[#27272a] rounded mb-3" />
          <div className="space-y-2">
            <div className="h-3 w-full bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
            <div className="h-3 w-11/12 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
            <div className="h-3 w-10/12 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MaintenanceSummary({ propertyId }: { propertyId: string }) {
  const { items } = useMaintenance(propertyId);
  const today = new Date().toISOString().slice(0, 10);
  const open = items.filter((i: any) => i.status !== "completed");
  const overdue = open.filter((i: any) =>
    i.isRecurring ? (i.nextDueDate && i.nextDueDate < today) : (i.date && i.date < today)
  );
  const recurring = items.filter((i: any) => i.isRecurring);
  // Take the next 5 actionable items to show: overdue first, then upcoming.
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
        <Link href="/maintenance" className="text-[11px] font-medium text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]">
          View all →
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <Stat label="Open" value={open.length} />
        <Stat label="Overdue" value={overdue.length} color="text-[#dc2626]" />
        <Stat label="Routine" value={recurring.length} color="text-[#2563eb]" />
      </div>
      {upcoming.length === 0 ? (
        <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a] italic py-2">No open maintenance items.</p>
      ) : (
        <div className="space-y-1.5">
          {upcoming.map((it: any) => {
            const dueDate = it.isRecurring ? it.nextDueDate : it.date;
            const isOverdue = dueDate && dueDate < today;
            return (
              <div key={it._id} className="flex items-center justify-between gap-3 text-[12px] py-1.5 border-t border-[#f4f4f5] dark:border-[#27272a] first:border-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {it.isRecurring && <span className="text-[9px] font-medium text-[#2563eb] dark:text-[#60a5fa] uppercase tracking-wide flex-shrink-0">Routine</span>}
                  <span className="truncate text-[#18181b] dark:text-[#fafafa]">{it.type || it.description || "—"}</span>
                  {it.unit && <span className="text-[10px] text-[#a1a1aa] flex-shrink-0">· {it.unit}</span>}
                </div>
                <span className={`text-[11px] flex-shrink-0 ${isOverdue ? "text-[#dc2626] font-medium" : "text-[#71717a] dark:text-[#a1a1aa]"}`}>
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

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-[#fafafa] dark:bg-[#27272a] rounded p-2">
      <p className={`text-[18px] font-semibold ${color || "text-[#18181b] dark:text-[#fafafa]"}`}>{value}</p>
      <p className="text-[9px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">{label}</p>
    </div>
  );
}

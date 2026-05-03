"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import KPICard from "@/components/KPICard";
import KPIDrawer from "@/components/KPIDrawer";
import PageHeader from "@/components/PageHeader";
import ActionItems from "@/components/ActionItems";
import RevenueFilter from "@/components/RevenueFilter";
import { useActiveProperty, useTenants, useMonthlyRevenue, useAlerts, formatCurrency } from "@/hooks/useConvexData";
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
  const monthlyRevenue = useMonthlyRevenue(property?._id);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const allOccupiedUnits = useMemo(() =>
    new Set(tenants.filter(t => t.status !== "vacant" && t.monthlyRent > 0 && !t.tenant.includes("Owner")).map(t => t.unit)),
  [tenants]);
  const [kpiDrawer, setKpiDrawer] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filteredUnits, setFilteredUnits] = useState<Set<string>>(new Set());
  const [filterInitialized, setFilterInitialized] = useState(false);

  // Initialize filter from localStorage after tenants load
  useEffect(() => {
    if (allOccupiedUnits.size > 0 && !filterInitialized) {
      try {
        const saved = localStorage.getItem("redhorn_revenue_filter");
        if (saved) {
          const arr = JSON.parse(saved) as string[];
          if (arr.length > 0) { setFilteredUnits(new Set(arr)); setFilterInitialized(true); return; }
        }
      } catch {}
      setFilteredUnits(allOccupiedUnits);
      setFilterInitialized(true);
    }
  }, [allOccupiedUnits, filterInitialized]);

  const isFiltered = filterInitialized && filteredUnits.size !== allOccupiedUnits.size;

  const handleFilterApply = useCallback((units: Set<string>) => {
    setFilteredUnits(units);
    localStorage.setItem("redhorn_revenue_filter", JSON.stringify(Array.from(units)));
  }, []);

  if (!property || tenants.length === 0) {
    return <div className="text-[13px] text-[#a1a1aa] dark:text-[#71717a] py-12 text-center">Loading dashboard data...</div>;
  }

  const occupied = tenants.filter(t => t.status !== "vacant");
  const vacant = tenants.filter(t => t.status === "vacant");
  const totalSqft = tenants.reduce((sum, t) => sum + t.sqft, 0);
  const occupiedSqft = occupied.reduce((sum, t) => sum + t.sqft, 0);
  const occupancyPct = totalSqft > 0 ? Math.round((occupiedSqft / totalSqft) * 100) : 0;
  const totalMonthlyRent = occupied.reduce((sum, t) => sum + t.monthlyRent, 0);
  const totalPastDue = tenants.reduce((sum, t) => sum + t.pastDueAmount, 0);
  const electricMissing = tenants.filter(t => !t.electricPosted && t.leaseType === "Office Net Lease" && t.tenant && !t.tenant.includes("Owner"));
  const expiringCount = tenants.filter(t => t.status === "expiring_soon").length;

  // Generate alerts from tenant data
  const today = new Date().toISOString().slice(0, 10);
  const urgentLeaseCutoff = new Date();
  urgentLeaseCutoff.setDate(urgentLeaseCutoff.getDate() + 30);
  const urgentLeaseCutoffISO = urgentLeaseCutoff.toISOString().slice(0, 10);

  const alerts: { type: string; message: string; unit: string; date: string }[] = [];
  for (const t of tenants) {
    if (t.status === "vacant") continue;
    if (t.leaseType === "Office Net Lease" && !t.electricPosted && t.tenant) {
      alerts.push({ type: "critical", message: "Electric not posted", unit: t.unit, date: today });
    }
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

  // Scale chart data based on filtered units
  const activeFilterUnits = filterInitialized ? filteredUnits : allOccupiedUnits;
  const filteredRent = tenants.filter(t => activeFilterUnits.has(t.unit)).reduce((s, t) => s + t.monthlyRent, 0);
  const filteredElectric = tenants.filter(t => activeFilterUnits.has(t.unit)).reduce((s, t) => s + t.monthlyElectric, 0);
  const totalRentAll = tenants.filter(t => t.status !== "vacant" && t.monthlyRent > 0 && !t.tenant.includes("Owner")).reduce((s, t) => s + t.monthlyRent, 0);
  const totalElectricAll = tenants.filter(t => t.status !== "vacant" && t.monthlyElectric > 0 && !t.tenant.includes("Owner")).reduce((s, t) => s + t.monthlyElectric, 0);
  const rentRatio = totalRentAll > 0 ? filteredRent / totalRentAll : 1;
  const electricRatio = totalElectricAll > 0 ? filteredElectric / totalElectricAll : 1;

  const revenueSeries = [
    { name: "Rent", data: monthlyRevenue.map(m => Math.round(m.rent * rentRatio)) },
    { name: "Electric", data: monthlyRevenue.map(m => Math.round(m.electric * electricRatio)) },
    { name: "CAM", data: monthlyRevenue.map(m => Math.round(m.cam * rentRatio)) },
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3 mb-6">
        <KPICard title="Monthly Revenue" value={formatCurrency(totalMonthlyRent)} trend="1.5%" trendUp={true} sparkline={monthlyRevenue.map(m => m.total)} onClick={() => setKpiDrawer("revenue")} />
        <KPICard title="Occupancy" value={`${occupancyPct}%`} subtitle={`${occupied.length} of ${tenants.length} units`} sparkline={monthlyRevenue.map(m => m.occupancy)} trendUp={true} onClick={() => setKpiDrawer("occupancy")} />
        <KPICard title="Past Due" value={formatCurrency(totalPastDue)} color={totalPastDue > 0 ? "text-[#dc2626]" : "text-[#16a34a]"} onClick={() => setKpiDrawer("pastdue")} />
        <KPICard title="Vacant" value={String(vacant.length)} subtitle={`${vacant.reduce((s, t) => s + t.sqft, 0).toLocaleString()} SF`} onClick={() => setKpiDrawer("vacant")} />
        <KPICard title="Electric Posting" value={electricMissing.length > 0 ? `${electricMissing.length} Missing` : "All Posted"} color={electricMissing.length > 0 ? "text-[#d97706]" : "text-[#16a34a]"} onClick={() => setKpiDrawer("electric")} />
        <KPICard title="Expiring Leases" value={String(expiringCount)} subtitle="Within 90 days" onClick={() => setKpiDrawer("expiring")} />
      </div>

      <ActionItems />

      <LatestInsights propertyId={property._id} />

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-6">
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Revenue Breakdown</p>
            <div className="flex items-center gap-1.5">
              {isFiltered && (
                <button
                  onClick={() => { setFilteredUnits(allOccupiedUnits); localStorage.removeItem("redhorn_revenue_filter"); }}
                  className="text-[11px] font-medium px-2.5 py-1 rounded cursor-pointer transition-colors text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] border border-[#e4e4e7] dark:border-[#3f3f46] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a]"
                >
                  Clear Filter
                </button>
              )}
              <button
                onClick={() => setFilterOpen(true)}
                className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded cursor-pointer transition-colors ${
                  isFiltered ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b]" : "text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a]"
                }`}
              >
                <Filter size={12} />
                {isFiltered ? `${filteredUnits.size} units` : "Filter"}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a] mb-3">
            {isFiltered
              ? `Showing ${filteredUnits.size} of ${allOccupiedUnits.size} units — ${formatCurrency(tenants.filter(t => filteredUnits.has(t.unit)).reduce((s, t) => s + t.monthlyRent, 0))}/mo`
              : `Last ${monthlyRevenue.length} months by category`}
          </p>
          {monthlyRevenue.length > 0 && <Chart options={revenueChartOptions} series={revenueSeries} type="bar" height={260} />}
        </div>

        <RevenueFilter
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          selectedUnits={activeFilterUnits}
          onApply={handleFilterApply}
        />
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-4">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Occupancy Trend</p>
              <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a] mt-0.5">Portfolio-wide rate</p>
            </div>
            <p className="text-[12px] font-medium text-[#16a34a]">{occupancyPct}%</p>
          </div>
          {monthlyRevenue.length > 0 && <Chart options={occupancyChartOptions} series={occupancySeries} type="area" height={260} />}
        </div>
      </div>

      {/* PM Call Prep */}
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-4">
        <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-4">Weekly PM Call Prep</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-[11px] font-medium text-[#dc2626] uppercase tracking-wide mb-2">Past Due</p>
            <div className="space-y-2">
              {tenants.filter(t => t.pastDueAmount > 0).map(t => (
                <div key={t._id} className="text-[12px]">
                  <p className="font-medium text-[#18181b] dark:text-[#fafafa]">{t.unit} — {t.tenant}</p>
                  <p className="text-[#dc2626]">{formatCurrency(t.pastDueAmount)}</p>
                </div>
              ))}
              {tenants.filter(t => t.pastDueAmount > 0).length === 0 && (
                <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a]">No past due tenants</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[#d97706] uppercase tracking-wide mb-2">Electric Not Posted</p>
            <div className="space-y-2">
              {electricMissing.map(t => (
                <div key={t._id} className="text-[12px]">
                  <p className="font-medium text-[#18181b] dark:text-[#fafafa]">{t.unit} — {t.tenant}</p>
                  <p className="text-[#71717a] dark:text-[#a1a1aa]">~{formatCurrency(t.monthlyElectric)}/mo expected</p>
                </div>
              ))}
              {electricMissing.length === 0 && (
                <p className="text-[11px] text-[#16a34a]">All electric charges posted</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[#2563eb] uppercase tracking-wide mb-2">Expiring Soon</p>
            <div className="space-y-2">
              {tenants.filter(t => t.status === "expiring_soon").slice(0, 5).map(t => (
                <div key={t._id} className="text-[12px]">
                  <p className="font-medium text-[#18181b] dark:text-[#fafafa]">{t.unit} — {t.tenant}</p>
                  <p className="text-[#71717a] dark:text-[#a1a1aa]">Expires {t.leaseTo}</p>
                </div>
              ))}
              {tenants.filter(t => t.status === "expiring_soon").length === 0 && (
                <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a]">No leases expiring within 90 days</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <KPIDrawer open={!!kpiDrawer} kpiKey={kpiDrawer} onClose={() => setKpiDrawer(null)} />
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
          title="Reopen — Claude will see this finding again next sync"
        >
          Reopen
        </button>
      </div>
    </div>
  );
}

function LatestInsights({ propertyId }: { propertyId: string }) {
  const { alerts } = useAlerts();
  const { user } = useUser();
  const markFalseFlag = useMutation(api.alerts.markFalseFlag);
  const undoFalseFlag = useMutation(api.alerts.undoFalseFlag);
  const addComment = useMutation(api.alerts.addComment);
  const [showSuppressed, setShowSuppressed] = useState(false);

  const { active, suppressed, latestSummary } = useMemo(() => {
    const all = (alerts as any[])
      .filter(a => a.alertType === "income_insight" && a.propertyId === propertyId)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const active = all.filter(a => a.status !== "false_flag" && a.status !== "resolved" && a.status !== "dismissed").slice(0, 6);
    const suppressed = all.filter(a => a.status === "false_flag");
    return { active, suppressed, latestSummary: active[0]?.aiAnalysis ?? all[0]?.aiAnalysis };
  }, [alerts, propertyId]);

  if (active.length === 0 && suppressed.length === 0) return null;

  const sevColor: Record<string, string> = {
    critical: "text-[#dc2626] border-[#dc2626]/20 bg-[#dc2626]/[0.04]",
    warning: "text-[#d97706] border-[#d97706]/25 bg-[#d97706]/[0.05]",
    info: "text-[#2563eb] border-[#2563eb]/25 bg-[#2563eb]/[0.04]",
  };

  async function flag(id: any) {
    const reason = window.prompt("Why is this a false flag? This explanation gets saved and the next sync will reference it so the same issue isn't re-flagged.");
    if (!reason || !reason.trim()) return;
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
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">From most recent Yardi sync</p>
      </div>
      {latestSummary && (
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 mb-3">
          <p className="text-[11px] font-semibold text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide mb-1">Summary</p>
          <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] leading-relaxed">{latestSummary}</p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {active.map(ins => {
          const cls = sevColor[ins.severity] || sevColor.info;
          return (
            <div key={ins._id} className={`border rounded p-3 ${cls.split(" ")[2]} dark:bg-[#18181b] ${cls.split(" ")[1]} group relative`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className={`text-[12px] font-semibold ${cls.split(" ")[0]}`}>{ins.title}</p>
                <span className="text-[9px] uppercase tracking-wide font-medium text-[#a1a1aa] dark:text-[#71717a]">{ins.severity}</span>
              </div>
              <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] leading-relaxed">{ins.body}</p>
              {ins.dataContext?.mom && (
                <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-1.5">{ins.dataContext.mom}</p>
              )}
              <div className="mt-2 pt-2 border-t border-[#e4e4e7] dark:border-[#3f3f46]/60 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => flag(ins._id)}
                  className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] hover:text-[#dc2626] cursor-pointer"
                  title="Mark this as a false flag — Claude won't re-flag it next sync"
                >
                  Mark as false flag
                </button>
              </div>
            </div>
          );
        })}
      </div>

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
    </div>
  );
}

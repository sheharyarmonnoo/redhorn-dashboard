"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import KPICard from "@/components/KPICard";
import KPIDrawer from "@/components/KPIDrawer";
import PageHeader from "@/components/PageHeader";
import ActionItems from "@/components/ActionItems";
import RevenueFilter from "@/components/RevenueFilter";
import { useActiveProperty, useTenants, useMonthlyRevenue, formatCurrency } from "@/hooks/useConvexData";
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
  const alerts: { type: string; message: string; unit: string; date: string }[] = [];
  for (const t of tenants) {
    if (t.status === "vacant") continue;
    if (t.leaseType === "Office Net Lease" && !t.electricPosted && t.tenant) {
      alerts.push({ type: "critical", message: "Electric not posted", unit: t.unit, date: "2026-03-01" });
    }
    if (t.pastDueAmount > 0) {
      alerts.push({ type: "critical", message: `Past due: ${formatCurrency(t.pastDueAmount)}`, unit: t.unit, date: "2026-03-01" });
    }
    if (t.status === "expiring_soon") {
      const isUrgent = t.leaseTo <= "2026-03-31";
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
    colors: isDark ? ["#fafafa", "#a1a1aa", "#52525b"] : ["#18181b", "#71717a", "#d4d4d8"],
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
      <PageHeader title="Monthly KPI Dashboard" subtitle={`${property.name} — ${monthlyRevenue.length > 0 ? monthlyRevenue[monthlyRevenue.length - 1].month : ""}`} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3 mb-6">
        <KPICard title="Monthly Revenue" value={formatCurrency(totalMonthlyRent)} trend="1.5%" trendUp={true} sparkline={monthlyRevenue.map(m => m.total)} onClick={() => setKpiDrawer("revenue")} />
        <KPICard title="Occupancy" value={`${occupancyPct}%`} subtitle={`${occupied.length} of ${tenants.length} units`} sparkline={monthlyRevenue.map(m => m.occupancy)} trendUp={true} onClick={() => setKpiDrawer("occupancy")} />
        <KPICard title="Past Due" value={formatCurrency(totalPastDue)} color="text-[#dc2626]" onClick={() => setKpiDrawer("pastdue")} />
        <KPICard title="Vacant" value={String(vacant.length)} subtitle={`${vacant.reduce((s, t) => s + t.sqft, 0).toLocaleString()} SF`} onClick={() => setKpiDrawer("vacant")} />
        <KPICard title="Electric Posting" value={electricMissing.length > 0 ? `${electricMissing.length} Missing` : "All Posted"} color={electricMissing.length > 0 ? "text-[#d97706]" : "text-[#16a34a]"} onClick={() => setKpiDrawer("electric")} />
        <KPICard title="Expiring Leases" value={String(expiringCount)} subtitle="Within 90 days" onClick={() => setKpiDrawer("expiring")} />
      </div>

      <ActionItems />

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
      <div className="bg-white border border-[#e4e4e7] rounded p-4">
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

"use client";
import { useState, useMemo } from "react";
import KPICard from "@/components/KPICard";
import PageHeader from "@/components/PageHeader";
import ActionItems from "@/components/ActionItems";
import RevenueFilter from "@/components/RevenueFilter";
import { tenants, monthlyRevenue, formatCurrency, getAlerts } from "@/data/tenants";
import { Filter } from "lucide-react";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function DashboardPage() {
  const allOccupiedUnits = useMemo(() =>
    new Set(tenants.filter(t => t.status !== "vacant" && t.monthlyRent > 0 && !t.tenant.includes("Owner")).map(t => t.unit)),
  []);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filteredUnits, setFilteredUnits] = useState<Set<string>>(allOccupiedUnits);
  const isFiltered = filteredUnits.size !== allOccupiedUnits.size;
  const occupied = tenants.filter(t => t.status !== "vacant");
  const vacant = tenants.filter(t => t.status === "vacant");
  const totalSqft = tenants.reduce((sum, t) => sum + t.sqft, 0);
  const occupiedSqft = occupied.reduce((sum, t) => sum + t.sqft, 0);
  const occupancyPct = Math.round((occupiedSqft / totalSqft) * 100);
  const totalMonthlyRent = occupied.reduce((sum, t) => sum + t.monthlyRent, 0);
  const totalPastDue = tenants.reduce((sum, t) => sum + t.pastDueAmount, 0);
  const electricMissing = tenants.filter(t => !t.electricPosted && t.leaseType === "Office Net Lease" && t.tenant && !t.tenant.includes("Owner"));
  const alerts = getAlerts();
  const expiringCount = tenants.filter(t => t.status === "expiring_soon").length;

  const chartFont = "'Inter', -apple-system, system-ui, sans-serif";

  const revenueChartOptions: ApexCharts.ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: chartFont },
    plotOptions: { bar: { borderRadius: 2, columnWidth: "55%" } },
    colors: ["#18181b", "#71717a", "#d4d4d8"],
    xaxis: { categories: monthlyRevenue.map(m => m.month), labels: { style: { colors: "#a1a1aa", fontSize: "11px" } } },
    yaxis: { labels: { style: { colors: "#a1a1aa", fontSize: "11px" }, formatter: (v: number) => `$${(v / 1000).toFixed(0)}k` } },
    grid: { borderColor: "#f4f4f5", strokeDashArray: 0 },
    legend: { position: "top", horizontalAlign: "right", fontSize: "11px", markers: { size: 6, shape: "square" as const } },
    tooltip: { y: { formatter: (v: number) => formatCurrency(v) } },
    dataLabels: { enabled: false },
  };

  // Scale chart data based on filtered units
  const filteredRent = tenants.filter(t => filteredUnits.has(t.unit)).reduce((s, t) => s + t.monthlyRent, 0);
  const filteredElectric = tenants.filter(t => filteredUnits.has(t.unit)).reduce((s, t) => s + t.monthlyElectric, 0);
  const totalRentAll = tenants.filter(t => t.status !== "vacant" && t.monthlyRent > 0 && !t.tenant.includes("Owner")).reduce((s, t) => s + t.monthlyRent, 0);
  const totalElectricAll = tenants.filter(t => t.status !== "vacant" && t.monthlyElectric > 0 && !t.tenant.includes("Owner")).reduce((s, t) => s + t.monthlyElectric, 0);
  const rentRatio = totalRentAll > 0 ? filteredRent / totalRentAll : 1;
  const electricRatio = totalElectricAll > 0 ? filteredElectric / totalElectricAll : 1;

  const revenueSeries = useMemo(() => [
    { name: "Rent", data: monthlyRevenue.map(m => Math.round(m.rent * rentRatio)) },
    { name: "Electric", data: monthlyRevenue.map(m => Math.round(m.electric * electricRatio)) },
    { name: "CAM", data: monthlyRevenue.map(m => Math.round(m.cam * rentRatio)) },
  ], [rentRatio, electricRatio]);

  const occupancyChartOptions: ApexCharts.ApexOptions = {
    chart: { type: "area", toolbar: { show: false }, fontFamily: chartFont },
    colors: ["#18181b"],
    fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.12, opacityTo: 0, stops: [0, 100] } },
    stroke: { curve: "smooth", width: 2 },
    xaxis: { categories: monthlyRevenue.map(m => m.month), labels: { style: { colors: "#a1a1aa", fontSize: "11px" } } },
    yaxis: { min: 70, max: 100, labels: { style: { colors: "#a1a1aa", fontSize: "11px" }, formatter: (v: number) => `${v}%` } },
    grid: { borderColor: "#f4f4f5", strokeDashArray: 0 },
    markers: { size: 3, colors: ["#18181b"], strokeColors: "#fff", strokeWidth: 2 },
    tooltip: { y: { formatter: (v: number) => `${v}%` } },
    dataLabels: { enabled: false },
  };

  const occupancySeries = [{ name: "Occupancy", data: monthlyRevenue.map(m => m.occupancy) }];

  return (
    <div>
      <PageHeader title="Monthly KPI Dashboard" subtitle="Hollister Business Park — March 2026" />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3 mb-6">
        <KPICard title="Monthly Revenue" value={formatCurrency(totalMonthlyRent)} trend="1.5%" trendUp={true} sparkline={monthlyRevenue.map(m => m.total)} />
        <KPICard title="Occupancy" value={`${occupancyPct}%`} subtitle={`${occupied.length} of ${tenants.length} units`} sparkline={monthlyRevenue.map(m => m.occupancy)} trendUp={true} />
        <KPICard title="Past Due" value={formatCurrency(totalPastDue)} color="text-[#dc2626]" />
        <KPICard title="Vacant" value={String(vacant.length)} subtitle={`${vacant.reduce((s, t) => s + t.sqft, 0).toLocaleString()} SF`} />
        <KPICard title="Electric Posting" value={electricMissing.length > 0 ? `${electricMissing.length} Missing` : "All Posted"} color={electricMissing.length > 0 ? "text-[#d97706]" : "text-[#16a34a]"} />
        <KPICard title="Expiring Leases" value={String(expiringCount)} subtitle="Within 90 days" />
      </div>

      {/* Notion-style Action Items */}
      <ActionItems />

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-6">
        <div className="bg-white border border-[#e4e4e7] rounded p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[13px] font-semibold text-[#18181b]">Revenue Breakdown</p>
            <button
              onClick={() => setFilterOpen(true)}
              className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded cursor-pointer transition-colors ${
                isFiltered ? "bg-[#18181b] text-white" : "text-[#71717a] hover:text-[#18181b] hover:bg-[#f4f4f5]"
              }`}
            >
              <Filter size={12} />
              {isFiltered ? `${filteredUnits.size} units` : "Filter"}
            </button>
          </div>
          <p className="text-[11px] text-[#a1a1aa] mb-3">
            {isFiltered
              ? `Showing ${filteredUnits.size} of ${allOccupiedUnits.size} units — ${formatCurrency(tenants.filter(t => filteredUnits.has(t.unit)).reduce((s, t) => s + t.monthlyRent, 0))}/mo`
              : "Last 9 months by category"}
          </p>
          <Chart options={revenueChartOptions} series={revenueSeries} type="bar" height={260} />
        </div>

      <RevenueFilter
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        selectedUnits={filteredUnits}
        onApply={setFilteredUnits}
      />
        <div className="bg-white border border-[#e4e4e7] rounded p-4">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <p className="text-[13px] font-semibold text-[#18181b]">Occupancy Trend</p>
              <p className="text-[11px] text-[#a1a1aa] mt-0.5">Portfolio-wide rate</p>
            </div>
            <p className="text-[12px] font-medium text-[#16a34a]">{occupancyPct}%</p>
          </div>
          <Chart options={occupancyChartOptions} series={occupancySeries} type="area" height={260} />
        </div>
      </div>

      {/* PM Call Prep */}
      <div className="bg-white border border-[#e4e4e7] rounded p-4">
        <p className="text-[13px] font-semibold text-[#18181b] mb-4">Weekly PM Call Prep</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-[11px] font-medium text-[#dc2626] uppercase tracking-wide mb-2">Past Due</p>
            <div className="space-y-2">
              {tenants.filter(t => t.pastDueAmount > 0).map(t => (
                <div key={t.unit} className="text-[12px]">
                  <p className="font-medium text-[#18181b]">{t.unit} — {t.tenant}</p>
                  <p className="text-[#dc2626]">{formatCurrency(t.pastDueAmount)}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[#d97706] uppercase tracking-wide mb-2">Electric Not Posted</p>
            <div className="space-y-2">
              {electricMissing.map(t => (
                <div key={t.unit} className="text-[12px]">
                  <p className="font-medium text-[#18181b]">{t.unit} — {t.tenant}</p>
                  <p className="text-[#71717a]">~{formatCurrency(t.monthlyElectric)}/mo expected</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[#2563eb] uppercase tracking-wide mb-2">Expiring Soon</p>
            <div className="space-y-2">
              {tenants.filter(t => t.status === "expiring_soon").slice(0, 5).map(t => (
                <div key={t.unit} className="text-[12px]">
                  <p className="font-medium text-[#18181b]">{t.unit} — {t.tenant}</p>
                  <p className="text-[#71717a]">Expires {t.leaseTo}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

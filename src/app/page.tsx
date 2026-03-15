"use client";
import KPICard from "@/components/KPICard";
import PageHeader from "@/components/PageHeader";
import ActionItems from "@/components/ActionItems";
import { tenants, monthlyRevenue, formatCurrency, getAlerts } from "@/data/tenants";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function DashboardPage() {
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

  const revenueSeries = [
    { name: "Rent", data: monthlyRevenue.map(m => m.rent) },
    { name: "Electric", data: monthlyRevenue.map(m => m.electric) },
    { name: "CAM", data: monthlyRevenue.map(m => m.cam) },
  ];

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
        <KPICard title="Monthly Revenue" value={formatCurrency(totalMonthlyRent)} trend="1.5%" trendUp={true} />
        <KPICard title="Occupancy" value={`${occupancyPct}%`} subtitle={`${occupied.length} of ${tenants.length} units`} />
        <KPICard title="Past Due" value={formatCurrency(totalPastDue)} color="text-[#dc2626]" />
        <KPICard title="Vacant" value={String(vacant.length)} subtitle={`${vacant.reduce((s, t) => s + t.sqft, 0).toLocaleString()} SF`} />
        <KPICard title="Electric Posting" value={electricMissing.length > 0 ? `${electricMissing.length} Missing` : "All Posted"} color={electricMissing.length > 0 ? "text-[#d97706]" : "text-[#16a34a]"} />
        <KPICard title="Expiring Leases" value={String(expiringCount)} subtitle="Within 90 days" />
      </div>

      {/* Action Items */}
      {alerts.filter(a => a.type === "critical").length > 0 && (
        <div className="bg-white border border-[#e4e4e7] rounded p-4 mb-6">
          <p className="text-[12px] font-semibold text-[#dc2626] mb-3">Action Required — {alerts.filter(a => a.type === "critical").length} items</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {alerts.filter(a => a.type === "critical").map((alert, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px] text-[#18181b]">
                <span className="w-1 h-1 rounded-full bg-[#dc2626] flex-shrink-0" />
                <span><span className="font-medium">{alert.unit}</span> — {alert.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-6">
        <div className="bg-white border border-[#e4e4e7] rounded p-4">
          <p className="text-[13px] font-semibold text-[#18181b] mb-1">Revenue Breakdown</p>
          <p className="text-[11px] text-[#a1a1aa] mb-3">Last 9 months by category</p>
          <Chart options={revenueChartOptions} series={revenueSeries} type="bar" height={260} />
        </div>
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

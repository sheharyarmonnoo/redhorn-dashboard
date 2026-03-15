"use client";
import { DollarSign, Building2, AlertTriangle, Zap, Users, CalendarClock } from "lucide-react";
import KPICard from "@/components/KPICard";
import PageHeader from "@/components/PageHeader";
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

  const revenueChartOptions: ApexCharts.ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit", stacked: false },
    plotOptions: { bar: { borderRadius: 4, columnWidth: "60%" } },
    colors: ["#4f6ef7", "#f59e0b", "#7c5cfc"],
    xaxis: { categories: monthlyRevenue.map(m => m.month), labels: { style: { colors: "#8b8fa3", fontSize: "11px" } } },
    yaxis: { labels: { style: { colors: "#8b8fa3", fontSize: "11px" }, formatter: (v: number) => `$${(v / 1000).toFixed(0)}k` } },
    grid: { borderColor: "#f0f0f5", strokeDashArray: 3 },
    legend: { position: "top", horizontalAlign: "right", fontSize: "11px", markers: { size: 8, shape: "square" as const } },
    tooltip: { y: { formatter: (v: number) => formatCurrency(v) } },
    dataLabels: { enabled: false },
  };

  const revenueSeries = [
    { name: "Rent", data: monthlyRevenue.map(m => m.rent) },
    { name: "Electric", data: monthlyRevenue.map(m => m.electric) },
    { name: "CAM", data: monthlyRevenue.map(m => m.cam) },
  ];

  const occupancyChartOptions: ApexCharts.ApexOptions = {
    chart: { type: "area", toolbar: { show: false }, fontFamily: "inherit", sparkline: { enabled: false } },
    colors: ["#10b981"],
    fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.25, opacityTo: 0, stops: [0, 100] } },
    stroke: { curve: "smooth", width: 2.5 },
    xaxis: { categories: monthlyRevenue.map(m => m.month), labels: { style: { colors: "#8b8fa3", fontSize: "11px" } } },
    yaxis: { min: 70, max: 100, labels: { style: { colors: "#8b8fa3", fontSize: "11px" }, formatter: (v: number) => `${v}%` } },
    grid: { borderColor: "#f0f0f5", strokeDashArray: 3 },
    markers: { size: 4, colors: ["#10b981"], strokeColors: "#fff", strokeWidth: 2 },
    tooltip: { y: { formatter: (v: number) => `${v}%` } },
    dataLabels: { enabled: false },
  };

  const occupancySeries = [{ name: "Occupancy", data: monthlyRevenue.map(m => m.occupancy) }];

  return (
    <div>
      <PageHeader title="Monthly KPI Dashboard" subtitle="Hollister Business Park — March 2026 Overview" badge="Live" />

      {/* KPI Cards — responsive grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-7">
        <KPICard title="Monthly Revenue" value={formatCurrency(totalMonthlyRent)} icon={DollarSign} trend="1.5%" trendUp={true} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
        <KPICard title="Occupancy Rate" value={`${occupancyPct}%`} subtitle={`${occupied.length} of ${tenants.length} units`} icon={Building2} />
        <KPICard title="Total Past Due" value={formatCurrency(totalPastDue)} icon={AlertTriangle} color="text-red-500" iconBg="bg-red-50" iconColor="text-red-500" />
        <KPICard title="Vacant Units" value={String(vacant.length)} subtitle={`${vacant.reduce((s, t) => s + t.sqft, 0).toLocaleString()} sq ft`} icon={Users} iconBg="bg-gray-100" iconColor="text-gray-500" />
        <KPICard title="Electric Posting" value={electricMissing.length > 0 ? `${electricMissing.length} Missing` : "All Posted"} icon={Zap} color={electricMissing.length > 0 ? "text-amber-500" : "text-emerald-600"} iconBg={electricMissing.length > 0 ? "bg-amber-50" : "bg-emerald-50"} iconColor={electricMissing.length > 0 ? "text-amber-500" : "text-emerald-600"} />
        <KPICard title="Expiring Leases" value={String(expiringCount)} subtitle="Within 90 days" icon={CalendarClock} color={expiringCount > 3 ? "text-amber-500" : "text-[#1e1e2d]"} iconBg="bg-blue-50" iconColor="text-blue-500" />
      </div>

      {/* Alerts Banner */}
      {alerts.filter(a => a.type === "critical").length > 0 && (
        <div className="bg-white rounded-2xl border border-red-200 p-4 sm:p-5 mb-7 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-red-50 rounded-lg">
              <AlertTriangle size={14} className="text-red-500" />
            </div>
            <h3 className="text-[13px] font-bold text-red-600">Action Required — {alerts.filter(a => a.type === "critical").length} Items</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {alerts.filter(a => a.type === "critical").map((alert, i) => (
              <div key={i} className="flex items-center gap-2 bg-red-50/60 rounded-xl px-3 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                <p className="text-[12px] text-[#1e1e2d]">
                  <span className="font-semibold">{alert.unit}</span>
                  <span className="text-[#8b8fa3] mx-1">·</span>
                  {alert.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts — ApexCharts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-7">
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e8eaef]">
          <h3 className="text-[14px] font-bold text-[#1e1e2d] mb-1">Revenue Breakdown</h3>
          <p className="text-[11px] text-[#8b8fa3] mb-4">Last 9 months by category</p>
          <Chart options={revenueChartOptions} series={revenueSeries} type="bar" height={280} />
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e8eaef]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[14px] font-bold text-[#1e1e2d]">Occupancy Trend</h3>
              <p className="text-[11px] text-[#8b8fa3] mt-0.5">Portfolio-wide occupancy rate</p>
            </div>
            <span className="text-[12px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">{occupancyPct}% Current</span>
          </div>
          <Chart options={occupancyChartOptions} series={occupancySeries} type="area" height={280} />
        </div>
      </div>

      {/* PM Call Prep */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e8eaef]">
        <div className="flex items-center gap-2 mb-5">
          <h3 className="text-[14px] font-bold text-[#1e1e2d]">Weekly PM Call Prep</h3>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#eef1fe] text-[#4f6ef7]">Meeting Ready</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-6 rounded-full bg-red-400" />
              <p className="text-[12px] font-semibold text-[#1e1e2d]">Past Due Tenants</p>
            </div>
            <div className="space-y-2">
              {tenants.filter(t => t.pastDueAmount > 0).map(t => (
                <div key={t.unit} className="bg-red-50/60 rounded-xl px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-[#1e1e2d]">{t.unit} · {t.tenant}</p>
                  <p className="text-[11px] text-red-500 font-medium mt-0.5">{formatCurrency(t.pastDueAmount)} past due</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-6 rounded-full bg-amber-400" />
              <p className="text-[12px] font-semibold text-[#1e1e2d]">Electric Not Posted</p>
            </div>
            <div className="space-y-2">
              {electricMissing.map(t => (
                <div key={t.unit} className="bg-amber-50/60 rounded-xl px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-[#1e1e2d]">{t.unit} · {t.tenant}</p>
                  <p className="text-[11px] text-amber-600 font-medium mt-0.5">~{formatCurrency(t.monthlyElectric)}/mo expected</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-6 rounded-full bg-[#4f6ef7]" />
              <p className="text-[12px] font-semibold text-[#1e1e2d]">Upcoming Expirations</p>
            </div>
            <div className="space-y-2">
              {tenants.filter(t => t.status === "expiring_soon").slice(0, 5).map(t => (
                <div key={t.unit} className="bg-blue-50/60 rounded-xl px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-[#1e1e2d]">{t.unit} · {t.tenant}</p>
                  <p className="text-[11px] text-[#4f6ef7] font-medium mt-0.5">Expires {t.leaseTo}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

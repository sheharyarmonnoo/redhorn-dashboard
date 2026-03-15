"use client";
import { DollarSign, Building2, AlertTriangle, Zap, Users, CalendarClock } from "lucide-react";
import KPICard from "@/components/KPICard";
import PageHeader from "@/components/PageHeader";
import { tenants, monthlyRevenue, formatCurrency, getAlerts } from "@/data/tenants";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Area, AreaChart } from "recharts";

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

  return (
    <div>
      <PageHeader title="Monthly KPI Dashboard" subtitle="Hollister Business Park — March 2026 Overview" badge="Live" />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-7">
        <KPICard title="Monthly Revenue" value={formatCurrency(totalMonthlyRent)} icon={DollarSign} trend="1.5%" trendUp={true} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
        <KPICard title="Occupancy Rate" value={`${occupancyPct}%`} subtitle={`${occupied.length} of ${tenants.length} units`} icon={Building2} />
        <KPICard title="Total Past Due" value={formatCurrency(totalPastDue)} icon={AlertTriangle} color="text-red-500" iconBg="bg-red-50" iconColor="text-red-500" />
        <KPICard title="Vacant Units" value={String(vacant.length)} subtitle={`${vacant.reduce((s, t) => s + t.sqft, 0).toLocaleString()} sq ft available`} icon={Users} iconBg="bg-gray-100" iconColor="text-gray-500" />
        <KPICard title="Electric Posting" value={electricMissing.length > 0 ? `${electricMissing.length} Missing` : "All Posted"} icon={Zap} color={electricMissing.length > 0 ? "text-amber-500" : "text-emerald-600"} iconBg={electricMissing.length > 0 ? "bg-amber-50" : "bg-emerald-50"} iconColor={electricMissing.length > 0 ? "text-amber-500" : "text-emerald-600"} />
        <KPICard title="Expiring Leases" value={String(expiringCount)} subtitle="Within 90 days" icon={CalendarClock} color={expiringCount > 3 ? "text-amber-500" : "text-[#1e1e2d]"} iconBg="bg-blue-50" iconColor="text-blue-500" />
      </div>

      {/* Alerts Banner */}
      {alerts.filter(a => a.type === "critical").length > 0 && (
        <div className="bg-white rounded-2xl border border-red-200 p-5 mb-7 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-red-50 rounded-lg">
              <AlertTriangle size={14} className="text-red-500" />
            </div>
            <h3 className="text-[13px] font-bold text-red-600">Action Required — {alerts.filter(a => a.type === "critical").length} Items</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
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

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-7">
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e8eaef]">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-[14px] font-bold text-[#1e1e2d]">Revenue Breakdown</h3>
              <p className="text-[11px] text-[#8b8fa3] mt-0.5">Last 9 months by category</p>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#4f6ef7]" /> Rent</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#f59e0b]" /> Electric</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#7c5cfc]" /> CAM</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyRevenue} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#8b8fa3", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#8b8fa3", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "#fff", border: "1px solid #e8eaef", borderRadius: 12, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                labelStyle={{ color: "#1e1e2d", fontWeight: 600, marginBottom: 4 }}
                formatter={(value) => [formatCurrency(Number(value)), undefined]}
                cursor={{ fill: "rgba(79,110,247,0.04)" }}
              />
              <Bar dataKey="rent" name="Rent" fill="#4f6ef7" radius={[6, 6, 0, 0]} />
              <Bar dataKey="electric" name="Electric" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              <Bar dataKey="cam" name="CAM" fill="#7c5cfc" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e8eaef]">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-[14px] font-bold text-[#1e1e2d]">Occupancy Trend</h3>
              <p className="text-[11px] text-[#8b8fa3] mt-0.5">Portfolio-wide occupancy rate</p>
            </div>
            <span className="text-[12px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">{occupancyPct}% Current</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthlyRevenue}>
              <defs>
                <linearGradient id="occupancyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#8b8fa3", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[70, 100]} tick={{ fill: "#8b8fa3", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: "#fff", border: "1px solid #e8eaef", borderRadius: 12, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                formatter={(value) => [`${value}%`, "Occupancy"]}
              />
              <Area type="monotone" dataKey="occupancy" stroke="#10b981" strokeWidth={2.5} fill="url(#occupancyGradient)" dot={{ fill: "#10b981", r: 4, strokeWidth: 2, stroke: "#fff" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* PM Call Prep */}
      <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e8eaef]">
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

"use client";
import { DollarSign, Building2, AlertTriangle, Zap, Users, TrendingUp } from "lucide-react";
import KPICard from "@/components/KPICard";
import { tenants, monthlyRevenue, formatCurrency, getAlerts } from "@/data/tenants";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";

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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Monthly KPI Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Hollister Business Park — March 2026 Overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <KPICard title="Monthly Revenue" value={formatCurrency(totalMonthlyRent)} icon={DollarSign} trend="1.5% vs last month" trendUp={true} />
        <KPICard title="Occupancy" value={`${occupancyPct}%`} subtitle={`${occupied.length} of ${tenants.length} units`} icon={Building2} />
        <KPICard title="Past Due" value={formatCurrency(totalPastDue)} icon={AlertTriangle} color={totalPastDue > 0 ? "text-red-500" : "text-emerald-600"} />
        <KPICard title="Vacant Units" value={String(vacant.length)} subtitle={`${vacant.reduce((s, t) => s + t.sqft, 0).toLocaleString()} sq ft`} icon={Users} />
        <KPICard title="Electric Posting" value={electricMissing.length > 0 ? `${electricMissing.length} MISSING` : "All Posted"} icon={Zap} color={electricMissing.length > 0 ? "text-red-500" : "text-emerald-600"} />
        <KPICard title="Expiring Leases" value={String(expiringCount)} subtitle="Within 90 days" icon={TrendingUp} color={expiringCount > 3 ? "text-amber-500" : "text-gray-900"} />
      </div>

      {alerts.filter(a => a.type === "critical").length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8">
          <h3 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-2">
            <AlertTriangle size={16} /> Action Required
          </h3>
          <div className="space-y-1">
            {alerts.filter(a => a.type === "critical").map((alert, i) => (
              <p key={i} className="text-sm text-red-700">
                <span className="text-red-600 font-medium">{alert.unit}:</span> {alert.message}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue Trend (Last 9 Months)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#374151" }}
                formatter={(value) => [formatCurrency(Number(value)), undefined]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="rent" name="Rent" fill="#4f6ef7" radius={[4, 4, 0, 0]} />
              <Bar dataKey="electric" name="Electric" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cam" name="CAM" fill="#7c5cfc" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Occupancy Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis domain={[70, 100]} tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
                formatter={(value) => [`${value}%`, "Occupancy"]}
              />
              <Line type="monotone" dataKey="occupancy" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Weekly PM Call Prep</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500 mb-2">Past Due Tenants</p>
            {tenants.filter(t => t.pastDueAmount > 0).map(t => (
              <p key={t.unit} className="text-red-600">{t.unit} — {t.tenant}: {formatCurrency(t.pastDueAmount)}</p>
            ))}
          </div>
          <div>
            <p className="text-gray-500 mb-2">Electric Not Posted (Net Leases)</p>
            {electricMissing.map(t => (
              <p key={t.unit} className="text-amber-600">{t.unit} — {t.tenant}</p>
            ))}
          </div>
          <div>
            <p className="text-gray-500 mb-2">Upcoming Lease Expirations</p>
            {tenants.filter(t => t.status === "expiring_soon").slice(0, 5).map(t => (
              <p key={t.unit} className="text-[#4f6ef7]">{t.unit} — expires {t.leaseTo}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

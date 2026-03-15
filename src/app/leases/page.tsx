"use client";
import { tenants, formatCurrency } from "@/data/tenants";
import { CalendarClock, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function LeasesPage() {
  const leasedTenants = tenants.filter(t => t.leaseTo && t.tenant && !t.tenant.includes("Owner"));
  const sorted = [...leasedTenants].sort((a, b) => a.leaseTo.localeCompare(b.leaseTo));

  const now = new Date("2026-03-15");
  const in90 = new Date("2026-06-13");
  const in180 = new Date("2026-09-11");

  function getUrgency(leaseTo: string) {
    const end = new Date(leaseTo);
    if (end <= now) return "expired";
    if (end <= in90) return "critical";
    if (end <= in180) return "warning";
    return "ok";
  }

  const expired = sorted.filter(t => getUrgency(t.leaseTo) === "expired");
  const critical = sorted.filter(t => getUrgency(t.leaseTo) === "critical");
  const warning = sorted.filter(t => getUrgency(t.leaseTo) === "warning");
  const ok = sorted.filter(t => getUrgency(t.leaseTo) === "ok");

  function daysUntil(date: string) {
    return Math.ceil((new Date(date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  function LeaseRow({ t, urgency }: { t: typeof sorted[0]; urgency: string }) {
    const days = daysUntil(t.leaseTo);
    const colors: Record<string, string> = {
      expired: "border-red-200 bg-red-50",
      critical: "border-red-200 bg-red-50/50",
      warning: "border-amber-200 bg-amber-50/50",
      ok: "border-gray-200 bg-white",
    };
    return (
      <div className={`border rounded-lg p-4 shadow-sm ${colors[urgency]}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">{t.unit}</span>
            <span className="text-xs text-gray-400">Bldg {t.building}</span>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            urgency === "expired" ? "bg-red-100 text-red-600" :
            urgency === "critical" ? "bg-red-100 text-red-600" :
            urgency === "warning" ? "bg-amber-100 text-amber-600" :
            "bg-emerald-100 text-emerald-600"
          }`}>
            {urgency === "expired" ? "EXPIRED" : `${days} days`}
          </span>
        </div>
        <p className="text-sm text-gray-700">{t.tenant}</p>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
          <span>{t.leaseFrom} → {t.leaseTo}</span>
          <span>{formatCurrency(t.monthlyRent)}/mo</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lease Expiration Timeline</h1>
        <p className="text-gray-500 text-sm mt-1">Renewal pipeline — as of March 15, 2026</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-red-500">{expired.length}</p>
          <p className="text-xs text-red-400">Expired / Holdover</p>
        </div>
        <div className="bg-red-50/50 border border-red-200 rounded-xl p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-red-400">{critical.length}</p>
          <p className="text-xs text-red-300">Within 90 Days</p>
        </div>
        <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-amber-500">{warning.length}</p>
          <p className="text-xs text-amber-400">90–180 Days</p>
        </div>
        <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-emerald-600">{ok.length}</p>
          <p className="text-xs text-emerald-400">180+ Days</p>
        </div>
      </div>

      <div className="space-y-6">
        {expired.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-red-600 mb-3 flex items-center gap-2">
              <AlertTriangle size={16} /> Expired / Holdover
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {expired.map(t => <LeaseRow key={t.unit} t={t} urgency="expired" />)}
            </div>
          </div>
        )}
        {critical.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-red-500 mb-3 flex items-center gap-2">
              <CalendarClock size={16} /> Expiring Within 90 Days
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {critical.map(t => <LeaseRow key={t.unit} t={t} urgency="critical" />)}
            </div>
          </div>
        )}
        {warning.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-amber-600 mb-3 flex items-center gap-2">
              <CalendarClock size={16} /> Expiring in 90–180 Days
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {warning.map(t => <LeaseRow key={t.unit} t={t} urgency="warning" />)}
            </div>
          </div>
        )}
        {ok.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-emerald-600 mb-3 flex items-center gap-2">
              <CheckCircle2 size={16} /> 180+ Days Remaining
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {ok.map(t => <LeaseRow key={t.unit} t={t} urgency="ok" />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
import { tenants, formatCurrency } from "@/data/tenants";
import { CalendarClock, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function LeasesPage() {
  const leasedTenants = tenants.filter(t => t.leaseTo && t.tenant && !t.tenant.includes("Owner"));

  // Sort by lease end date
  const sorted = [...leasedTenants].sort((a, b) => a.leaseTo.localeCompare(b.leaseTo));

  const now = new Date("2026-03-15");
  const in90 = new Date("2026-06-13");
  const in180 = new Date("2026-09-11");

  function getUrgency(leaseTo: string) {
    const end = new Date(leaseTo);
    if (end <= now) return "expired";
    if (end <= in90) return "critical"; // within 90 days
    if (end <= in180) return "warning"; // within 180 days
    return "ok";
  }

  const expired = sorted.filter(t => getUrgency(t.leaseTo) === "expired");
  const critical = sorted.filter(t => getUrgency(t.leaseTo) === "critical");
  const warning = sorted.filter(t => getUrgency(t.leaseTo) === "warning");
  const ok = sorted.filter(t => getUrgency(t.leaseTo) === "ok");

  function daysUntil(date: string) {
    const diff = Math.ceil((new Date(date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }

  function LeaseRow({ t, urgency }: { t: typeof sorted[0]; urgency: string }) {
    const days = daysUntil(t.leaseTo);
    const colors: Record<string, string> = {
      expired: "border-red-500/40 bg-red-500/10",
      critical: "border-red-500/30 bg-red-500/5",
      warning: "border-yellow-500/30 bg-yellow-500/5",
      ok: "border-[#262626] bg-[#141414]",
    };

    return (
      <div className={`border rounded-lg p-4 ${colors[urgency]}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{t.unit}</span>
            <span className="text-xs text-gray-500">Bldg {t.building}</span>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            urgency === "expired" ? "bg-red-500/20 text-red-400" :
            urgency === "critical" ? "bg-red-500/20 text-red-400" :
            urgency === "warning" ? "bg-yellow-500/20 text-yellow-400" :
            "bg-emerald-500/20 text-emerald-400"
          }`}>
            {urgency === "expired" ? "EXPIRED" : `${days} days`}
          </span>
        </div>
        <p className="text-sm text-gray-300">{t.tenant}</p>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span>{t.leaseFrom} → {t.leaseTo}</span>
          <span>{formatCurrency(t.monthlyRent)}/mo</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Lease Expiration Timeline</h1>
        <p className="text-gray-500 text-sm mt-1">Renewal pipeline — as of March 15, 2026</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-red-400">{expired.length}</p>
          <p className="text-xs text-red-400/70">Expired / Holdover</p>
        </div>
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-red-300">{critical.length}</p>
          <p className="text-xs text-red-300/70">Within 90 Days</p>
        </div>
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-yellow-400">{warning.length}</p>
          <p className="text-xs text-yellow-400/70">90–180 Days</p>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-emerald-400">{ok.length}</p>
          <p className="text-xs text-emerald-400/70">180+ Days</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-6">
        {expired.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
              <AlertTriangle size={16} /> Expired / Holdover
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {expired.map(t => <LeaseRow key={t.unit} t={t} urgency="expired" />)}
            </div>
          </div>
        )}

        {critical.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-red-300 mb-3 flex items-center gap-2">
              <CalendarClock size={16} /> Expiring Within 90 Days
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {critical.map(t => <LeaseRow key={t.unit} t={t} urgency="critical" />)}
            </div>
          </div>
        )}

        {warning.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-2">
              <CalendarClock size={16} /> Expiring in 90–180 Days
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {warning.map(t => <LeaseRow key={t.unit} t={t} urgency="warning" />)}
            </div>
          </div>
        )}

        {ok.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
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

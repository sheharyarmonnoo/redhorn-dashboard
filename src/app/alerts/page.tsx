"use client";
import { tenants, formatCurrency } from "@/data/tenants";
import { AlertTriangle, Zap, CalendarClock, DollarSign, Clock } from "lucide-react";

export default function AlertsPage() {
  const electricAlerts = tenants.filter(t =>
    t.leaseType === "Office Net Lease" && !t.electricPosted && t.tenant && !t.tenant.includes("Owner")
  );
  const pastDueTenants = tenants.filter(t => t.pastDueAmount > 0);
  const expiringTenants = tenants.filter(t => t.status === "expiring_soon");
  const holdoverTenants = tenants.filter(t => {
    if (!t.leaseTo) return false;
    return new Date(t.leaseTo) < new Date("2026-03-15") && t.status !== "vacant";
  });

  const alertHistory = [
    { date: "2026-03-12", message: "Default letter sent to C-207 (Brazos Valley Imports)", type: "action" },
    { date: "2026-03-10", message: "A-90 lease expired — holdover status triggered", type: "system" },
    { date: "2026-03-05", message: "February late fees assessed: A-120 ($99), C-207 ($84)", type: "system" },
    { date: "2026-03-01", message: "Monthly charges posted for March 2026", type: "system" },
    { date: "2026-02-15", message: "Electric posting missed for C-212, C-305 — flagged for PM", type: "alert" },
    { date: "2026-02-12", message: "A-120 (Clear Lake IT) — first late notice sent", type: "action" },
    { date: "2026-02-01", message: "Monthly charges posted for February 2026", type: "system" },
    { date: "2026-01-20", message: "Lease renewal discussion initiated for A-111/C-216 (SouthWest Coatings)", type: "action" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Alerts & Oversight</h1>
        <p className="text-gray-500 text-sm mt-1">Rule-based PM accountability tracking</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-amber-600 mb-4 flex items-center gap-2">
            <Zap size={16} /> Electric Not Posted by 10th
          </h3>
          <p className="text-xs text-gray-500 mb-3">Rule: All Net Lease tenants must have electric charges posted by the 10th of each month.</p>
          {electricAlerts.length > 0 ? (
            <div className="space-y-2">
              {electricAlerts.map(t => (
                <div key={t.unit} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div>
                    <p className="text-sm text-gray-900 font-medium">{t.unit} — {t.tenant}</p>
                    <p className="text-xs text-gray-500">Expected charge: ~{formatCurrency(t.monthlyElectric)}/mo</p>
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-medium">NOT POSTED</span>
                </div>
              ))}
            </div>
          ) : <p className="text-emerald-600 text-sm">All electric charges posted.</p>}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-red-600 mb-4 flex items-center gap-2">
            <DollarSign size={16} /> Past Due — Late Fees Check
          </h3>
          <p className="text-xs text-gray-500 mb-3">Rule: Any tenant 5+ days past due should have late fee assessed.</p>
          {pastDueTenants.length > 0 ? (
            <div className="space-y-2">
              {pastDueTenants.map(t => (
                <div key={t.unit} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3">
                  <div>
                    <p className="text-sm text-gray-900 font-medium">{t.unit} — {t.tenant}</p>
                    <p className="text-xs text-gray-500">Amount due: {formatCurrency(t.pastDueAmount)} · Last paid: {t.lastPaymentDate}</p>
                  </div>
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-medium">{formatCurrency(t.pastDueAmount)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-emerald-600 text-sm">No past-due tenants.</p>}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-[#4f6ef7] mb-4 flex items-center gap-2">
            <CalendarClock size={16} /> Leases Expiring &lt;90 Days — No Renewal
          </h3>
          <p className="text-xs text-gray-500 mb-3">Rule: PM should initiate renewal discussions 120+ days before expiry.</p>
          {expiringTenants.length > 0 ? (
            <div className="space-y-2">
              {expiringTenants.map(t => (
                <div key={t.unit} className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div>
                    <p className="text-sm text-gray-900 font-medium">{t.unit} — {t.tenant}</p>
                    <p className="text-xs text-gray-500">Expires: {t.leaseTo} · Rent: {formatCurrency(t.monthlyRent)}/mo</p>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">NO RENEWAL</span>
                </div>
              ))}
            </div>
          ) : <p className="text-emerald-600 text-sm">All upcoming expirations have renewal activity.</p>}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-orange-600 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} /> Holdover Tenants (Expired Leases)
          </h3>
          <p className="text-xs text-gray-500 mb-3">Tenants whose lease has expired but are still occupying space.</p>
          {holdoverTenants.length > 0 ? (
            <div className="space-y-2">
              {holdoverTenants.map(t => (
                <div key={t.unit} className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <div>
                    <p className="text-sm text-gray-900 font-medium">{t.unit} — {t.tenant}</p>
                    <p className="text-xs text-gray-500">Lease ended: {t.leaseTo}</p>
                  </div>
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded font-medium">HOLDOVER</span>
                </div>
              ))}
            </div>
          ) : <p className="text-emerald-600 text-sm">No holdover tenants.</p>}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Clock size={16} /> Alert History Log
        </h3>
        <div className="space-y-3">
          {alertHistory.map((entry, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <span className="text-xs text-gray-400 min-w-[80px] mt-0.5">{entry.date}</span>
              <span className={`inline-block w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                entry.type === "alert" ? "bg-amber-400" :
                entry.type === "action" ? "bg-[#4f6ef7]" :
                "bg-gray-300"
              }`} />
              <p className="text-gray-700">{entry.message}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

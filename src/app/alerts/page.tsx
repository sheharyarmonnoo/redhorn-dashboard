"use client";
import { getAlerts, tenants, formatCurrency } from "@/data/tenants";
import { AlertTriangle, Zap, CalendarClock, DollarSign, Clock } from "lucide-react";

export default function AlertsPage() {
  const alerts = getAlerts();

  // Additional rule-based alerts
  const electricAlerts = tenants.filter(t =>
    t.leaseType === "Office Net Lease" && !t.electricPosted && t.tenant && !t.tenant.includes("Owner")
  );
  const pastDueTenants = tenants.filter(t => t.pastDueAmount > 0);
  const expiringTenants = tenants.filter(t => t.status === "expiring_soon");
  const holdoverTenants = tenants.filter(t => {
    if (!t.leaseTo) return false;
    return new Date(t.leaseTo) < new Date("2026-03-15") && t.status !== "vacant";
  });

  // Alert history log (simulated)
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
        <h1 className="text-2xl font-bold text-white">Alerts & Oversight</h1>
        <p className="text-gray-500 text-sm mt-1">Rule-based PM accountability tracking</p>
      </div>

      {/* Alert Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Electric Not Posted */}
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-yellow-400 mb-4 flex items-center gap-2">
            <Zap size={16} /> Electric Not Posted by 10th
          </h3>
          <p className="text-xs text-gray-500 mb-3">Rule: All Net Lease tenants must have electric charges posted by the 10th of each month.</p>
          {electricAlerts.length > 0 ? (
            <div className="space-y-2">
              {electricAlerts.map(t => (
                <div key={t.unit} className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <div>
                    <p className="text-sm text-white font-medium">{t.unit} — {t.tenant}</p>
                    <p className="text-xs text-gray-500">Expected charge: ~{formatCurrency(t.monthlyElectric)}/mo</p>
                  </div>
                  <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">NOT POSTED</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-emerald-400 text-sm">All electric charges posted.</p>
          )}
        </div>

        {/* Late Fees Missing */}
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-red-400 mb-4 flex items-center gap-2">
            <DollarSign size={16} /> Past Due — Late Fees Check
          </h3>
          <p className="text-xs text-gray-500 mb-3">Rule: Any tenant 5+ days past due should have late fee assessed.</p>
          {pastDueTenants.length > 0 ? (
            <div className="space-y-2">
              {pastDueTenants.map(t => (
                <div key={t.unit} className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <div>
                    <p className="text-sm text-white font-medium">{t.unit} — {t.tenant}</p>
                    <p className="text-xs text-gray-500">Amount due: {formatCurrency(t.pastDueAmount)} · Last paid: {t.lastPaymentDate}</p>
                  </div>
                  <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">{formatCurrency(t.pastDueAmount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-emerald-400 text-sm">No past-due tenants.</p>
          )}
        </div>

        {/* Lease Expirations */}
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-blue-400 mb-4 flex items-center gap-2">
            <CalendarClock size={16} /> Leases Expiring &lt;90 Days — No Renewal
          </h3>
          <p className="text-xs text-gray-500 mb-3">Rule: PM should initiate renewal discussions 120+ days before expiry.</p>
          {expiringTenants.length > 0 ? (
            <div className="space-y-2">
              {expiringTenants.map(t => (
                <div key={t.unit} className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <div>
                    <p className="text-sm text-white font-medium">{t.unit} — {t.tenant}</p>
                    <p className="text-xs text-gray-500">Expires: {t.leaseTo} · Rent: {formatCurrency(t.monthlyRent)}/mo</p>
                  </div>
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">NO RENEWAL</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-emerald-400 text-sm">All upcoming expirations have renewal activity.</p>
          )}
        </div>

        {/* Holdover Tenants */}
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-orange-400 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} /> Holdover Tenants (Expired Leases)
          </h3>
          <p className="text-xs text-gray-500 mb-3">Tenants whose lease has expired but are still occupying space.</p>
          {holdoverTenants.length > 0 ? (
            <div className="space-y-2">
              {holdoverTenants.map(t => (
                <div key={t.unit} className="flex items-center justify-between bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                  <div>
                    <p className="text-sm text-white font-medium">{t.unit} — {t.tenant}</p>
                    <p className="text-xs text-gray-500">Lease ended: {t.leaseTo}</p>
                  </div>
                  <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded">HOLDOVER</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-emerald-400 text-sm">No holdover tenants.</p>
          )}
        </div>
      </div>

      {/* Alert History Log */}
      <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <Clock size={16} /> Alert History Log
        </h3>
        <div className="space-y-3">
          {alertHistory.map((entry, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <span className="text-xs text-gray-600 min-w-[80px] mt-0.5">{entry.date}</span>
              <span className={`inline-block w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                entry.type === "alert" ? "bg-yellow-400" :
                entry.type === "action" ? "bg-blue-400" :
                "bg-gray-500"
              }`} />
              <p className="text-gray-300">{entry.message}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

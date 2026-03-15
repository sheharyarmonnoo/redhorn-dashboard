"use client";
import { X } from "lucide-react";
import { Tenant, ledgerA102, formatCurrency, getStatusColor, getStatusLabel } from "@/data/tenants";

interface Props {
  tenant: Tenant | null;
  onClose: () => void;
}

export default function UnitDetailPanel({ tenant, onClose }: Props) {
  if (!tenant) return null;

  const ledger = tenant.unit === "A-102" ? ledgerA102 : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-[520px] bg-[#111] border-l border-[#262626] h-full overflow-y-auto">
        <div className="sticky top-0 bg-[#111] border-b border-[#262626] p-5 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-white">Unit {tenant.unit}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-block w-2 h-2 rounded-full ${getStatusColor(tenant.status)}`} />
              <span className="text-sm text-gray-400">{getStatusLabel(tenant.status)}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#1a1a1a] rounded-lg">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {tenant.status === "vacant" ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">Vacant Unit</p>
              <p className="text-gray-600 text-sm mt-2">{tenant.sqft.toLocaleString()} sq ft available</p>
              {tenant.notes && <p className="text-gray-600 text-xs mt-1">{tenant.notes}</p>}
            </div>
          ) : (
            <>
              {/* Tenant Info */}
              <section>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Tenant Information</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500">Tenant</p>
                    <p className="text-white font-medium">{tenant.tenant}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Lease Type</p>
                    <p className="text-white">{tenant.leaseType}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Square Feet</p>
                    <p className="text-white">{tenant.sqft.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Building</p>
                    <p className="text-white">Building {tenant.building}</p>
                  </div>
                </div>
              </section>

              {/* Lease Details */}
              <section>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Lease Details</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500">Lease Start</p>
                    <p className="text-white">{tenant.leaseFrom}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Lease End</p>
                    <p className="text-white">{tenant.leaseTo}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Monthly Rent</p>
                    <p className="text-white font-medium">{formatCurrency(tenant.monthlyRent)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Monthly Electric</p>
                    <p className="text-white">{tenant.monthlyElectric > 0 ? formatCurrency(tenant.monthlyElectric) : "Included"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Security Deposit</p>
                    <p className="text-white">{formatCurrency(tenant.securityDeposit)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Electric Posted</p>
                    <p className={tenant.electricPosted ? "text-emerald-400" : "text-red-400"}>
                      {tenant.electricPosted ? "Yes" : "NOT POSTED"}
                    </p>
                  </div>
                </div>
              </section>

              {/* Financials */}
              {tenant.pastDueAmount > 0 && (
                <section className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-red-400 mb-2">Past Due</h3>
                  <p className="text-2xl font-bold text-red-400">{formatCurrency(tenant.pastDueAmount)}</p>
                  <p className="text-xs text-red-400/70 mt-1">Last payment: {tenant.lastPaymentDate}</p>
                </section>
              )}

              {tenant.notes && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-300 mb-2">Notes</h3>
                  <p className="text-sm text-gray-400 bg-[#1a1a1a] p-3 rounded-lg">{tenant.notes}</p>
                </section>
              )}

              {/* Ledger (only for A-102 in demo) */}
              {ledger.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">Payment History</h3>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[#111]">
                        <tr className="text-gray-500 border-b border-[#262626]">
                          <th className="text-left py-2 pr-2">Date</th>
                          <th className="text-left py-2 pr-2">Description</th>
                          <th className="text-right py-2 pr-2">Charge</th>
                          <th className="text-right py-2">Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.slice(-12).map((entry, i) => (
                          <tr key={i} className="border-b border-[#1a1a1a]">
                            <td className="py-1.5 pr-2 text-gray-400">{entry.date}</td>
                            <td className="py-1.5 pr-2 text-gray-300 truncate max-w-[180px]">{entry.description}</td>
                            <td className="py-1.5 pr-2 text-right text-red-400">{entry.charge > 0 ? formatCurrency(entry.charge) : ""}</td>
                            <td className="py-1.5 text-right text-emerald-400">{entry.payment > 0 ? formatCurrency(entry.payment) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

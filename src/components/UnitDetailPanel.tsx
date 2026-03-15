"use client";
import { useState, useEffect } from "react";
import { X, Building2, Calendar, DollarSign, Zap, FileText, CreditCard, Save, Edit3 } from "lucide-react";
import { Tenant, ledgerA102, formatCurrency, getStatusLabel } from "@/data/tenants";
import { updateTenantNote, getOverrideForUnit } from "@/data/store";

interface Props {
  tenant: Tenant | null;
  onClose: () => void;
  onUpdated?: () => void;
}

export default function UnitDetailPanel({ tenant, onClose, onUpdated }: Props) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    if (tenant) {
      const override = getOverrideForUnit(tenant.unit);
      const currentNote = override?.notes !== undefined ? override.notes : tenant.notes;
      setNotesDraft(currentNote);
      setSavedNote(override?.notes !== undefined ? override.notes : null);
      setEditingNotes(false);
    }
  }, [tenant]);

  if (!tenant) return null;

  const displayNotes = savedNote !== null ? savedNote : tenant.notes;
  const ledger = tenant.unit === "A-102" ? ledgerA102 : [];

  const statusStyles: Record<string, string> = {
    current: "bg-emerald-50 text-emerald-700 border-emerald-200",
    past_due: "bg-red-50 text-red-700 border-red-200",
    locked_out: "bg-amber-50 text-amber-700 border-amber-200",
    vacant: "bg-gray-50 text-gray-500 border-gray-200",
    expiring_soon: "bg-blue-50 text-blue-700 border-blue-200",
  };

  function handleSaveNotes() {
    updateTenantNote(tenant!.unit, notesDraft);
    setSavedNote(notesDraft);
    setEditingNotes(false);
    onUpdated?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-[#1e1e2d]/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:w-[540px] bg-white h-full overflow-y-auto shadow-2xl animate-[slideIn_0.25s_ease-out]">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-[#e8eaef] px-6 py-5 flex items-center justify-between z-10">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-[18px] font-bold text-[#1e1e2d]">Unit {tenant.unit}</h2>
              <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border ${statusStyles[tenant.status]}`}>
                {getStatusLabel(tenant.status)}
              </span>
            </div>
            <p className="text-[12px] text-[#8b8fa3] mt-1">Building {tenant.building} · {tenant.sqft.toLocaleString()} sq ft</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer">
            <X size={18} className="text-[#8b8fa3]" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {tenant.status === "vacant" ? (
            <div className="py-6">
              <p className="text-[#71717a] text-[14px] font-medium">Vacant Unit</p>
              <p className="text-[#a1a1aa] text-[12px] mt-1">{tenant.sqft.toLocaleString()} sq ft available for lease</p>
              {(tenant.makeReady || tenant.splittable || tenant.amps) && (
                <div className="mt-4 space-y-2">
                  {tenant.makeReady && (
                    <div className="text-[12px] text-[#d97706] bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      Make-ready required before leasing
                    </div>
                  )}
                  {tenant.splittable && (
                    <div className="text-[12px] text-[#2563eb] bg-blue-50 border border-blue-200 rounded px-3 py-2">
                      Splittable: {tenant.splitDetail || "Can be divided into smaller units"}
                    </div>
                  )}
                  {tenant.amps && (
                    <div className="text-[12px] text-[#71717a]">Electrical: {tenant.amps} AMP</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Tenant Card */}
              <div className="bg-[#f5f6fa] rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-white rounded-xl shadow-sm">
                    <Building2 size={18} className="text-[#4f6ef7]" />
                  </div>
                  <div>
                    <p className="text-[15px] font-bold text-[#1e1e2d]">{tenant.tenant}</p>
                    <p className="text-[12px] text-[#8b8fa3]">{tenant.leaseType}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <InfoItem icon={Calendar} label="Lease Start" value={tenant.leaseFrom} />
                  <InfoItem icon={Calendar} label="Lease End" value={tenant.leaseTo} />
                  <InfoItem icon={DollarSign} label="Monthly Rent" value={formatCurrency(tenant.monthlyRent)} bold />
                  <InfoItem icon={Zap} label="Monthly Electric" value={tenant.monthlyElectric > 0 ? formatCurrency(tenant.monthlyElectric) : "Included"} />
                  <InfoItem icon={CreditCard} label="Security Deposit" value={formatCurrency(tenant.securityDeposit)} />
                  <InfoItem icon={Zap} label="Electric Posted" value={tenant.electricPosted ? "Yes" : "NOT POSTED"} valueColor={tenant.electricPosted ? "text-emerald-600" : "text-red-500"} />
                  {tenant.amps && <InfoItem icon={Zap} label="Electrical" value={`${tenant.amps} AMP`} />}
                </div>

                {/* Delinquency Workflow */}
                {tenant.delinquencyStage && tenant.delinquencyStage !== "none" && (
                  <div className="mt-4 pt-4 border-t border-[#e4e4e7]">
                    <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-2">Delinquency Workflow</p>
                    <div className="flex items-center gap-1">
                      {(["past_due", "default_notice", "lockout_pending", "locked_out", "auction_pending", "auction"] as const).map((stage, i) => {
                        const stageLabels: Record<string, string> = { past_due: "Past Due", default_notice: "Default Notice", lockout_pending: "Lockout Pending", locked_out: "Locked Out", auction_pending: "Auction Pending", auction: "Auction" };
                        const stages = ["past_due", "default_notice", "lockout_pending", "locked_out", "auction_pending", "auction"];
                        const currentIdx = stages.indexOf(tenant.delinquencyStage || "");
                        const isActive = i <= currentIdx;
                        const isCurrent = stages[i] === tenant.delinquencyStage;
                        return (
                          <div key={stage} className="flex items-center gap-1">
                            {i > 0 && <div className={`w-3 h-px ${isActive ? "bg-[#dc2626]" : "bg-[#e4e4e7]"}`} />}
                            <div className={`text-[8px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${
                              isCurrent ? "bg-[#dc2626] text-white" : isActive ? "bg-red-100 text-[#dc2626]" : "bg-[#f4f4f5] text-[#a1a1aa]"
                            }`}>
                              {stageLabels[stage]}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {tenant.delinquencyDate && <p className="text-[10px] text-[#a1a1aa] mt-1.5">Since {tenant.delinquencyDate}</p>}
                  </div>
                )}
              </div>

              {/* Past Due Alert */}
              {tenant.pastDueAmount > 0 && (
                <div className="bg-gradient-to-r from-red-50 to-red-50/50 border border-red-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-red-100 rounded-lg">
                      <DollarSign size={14} className="text-red-500" />
                    </div>
                    <p className="text-[13px] font-bold text-red-600">Past Due Balance</p>
                  </div>
                  <p className="text-[28px] font-bold text-red-500 tracking-tight">{formatCurrency(tenant.pastDueAmount)}</p>
                  <p className="text-[11px] text-red-400 mt-1">Last payment received: {tenant.lastPaymentDate}</p>
                </div>
              )}
            </>
          )}

          {/* Editable Notes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-[#8b8fa3]" />
                <p className="text-[12px] font-semibold text-[#1e1e2d]">Notes</p>
              </div>
              {!editingNotes ? (
                <button
                  onClick={() => { setNotesDraft(displayNotes); setEditingNotes(true); }}
                  className="flex items-center gap-1 text-[11px] text-[#4f6ef7] font-medium hover:underline cursor-pointer"
                >
                  <Edit3 size={12} />
                  {displayNotes ? "Edit" : "Add Note"}
                </button>
              ) : (
                <button
                  onClick={handleSaveNotes}
                  className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold hover:underline cursor-pointer"
                >
                  <Save size={12} />
                  Save
                </button>
              )}
            </div>

            {editingNotes ? (
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Add notes about this unit (PM issues, tenant requests, maintenance, etc.)"
                className="w-full text-[12px] text-[#1e1e2d] bg-white border border-[#4f6ef7] rounded-xl p-4 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#4f6ef7]/20 min-h-[100px] resize-y"
                autoFocus
              />
            ) : displayNotes ? (
              <p className="text-[12px] text-[#5a5e73] bg-[#f5f6fa] p-4 rounded-xl leading-relaxed whitespace-pre-wrap">{displayNotes}</p>
            ) : (
              <p className="text-[12px] text-[#b0b4c5] italic bg-[#f5f6fa] p-4 rounded-xl">No notes yet. Click &quot;Add Note&quot; to add one.</p>
            )}
          </div>

          {/* Ledger */}
          {ledger.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CreditCard size={14} className="text-[#8b8fa3]" />
                  <p className="text-[12px] font-semibold text-[#1e1e2d]">Payment History</p>
                </div>
                <span className="text-[10px] text-[#8b8fa3] font-medium">{ledger.length} transactions</span>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-[#e8eaef]">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-[#f5f6fa]">
                    <tr className="text-[#8b8fa3] font-semibold uppercase tracking-wider">
                      <th className="text-left px-3 py-2.5">Date</th>
                      <th className="text-left px-3 py-2.5">Description</th>
                      <th className="text-right px-3 py-2.5">Charge</th>
                      <th className="text-right px-3 py-2.5">Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.slice(-12).map((entry, i) => (
                      <tr key={i} className="border-t border-[#f0f0f5] hover:bg-[#f8f9fb]">
                        <td className="px-3 py-2 text-[#8b8fa3]">{entry.date}</td>
                        <td className="px-3 py-2 text-[#1e1e2d] truncate max-w-[180px]">{entry.description}</td>
                        <td className="px-3 py-2 text-right text-red-500 font-medium">{entry.charge > 0 ? formatCurrency(entry.charge) : ""}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 font-medium">{entry.payment > 0 ? formatCurrency(entry.payment) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value, bold, valueColor }: {
  icon: any; label: string; value: string; bold?: boolean; valueColor?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={13} className="text-[#b0b4c5] mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-[10px] text-[#8b8fa3] uppercase tracking-wider font-medium">{label}</p>
        <p className={`text-[13px] mt-0.5 ${bold ? "font-bold text-[#1e1e2d]" : ""} ${valueColor || "text-[#1e1e2d]"}`}>{value}</p>
      </div>
    </div>
  );
}

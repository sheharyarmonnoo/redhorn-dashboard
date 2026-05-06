"use client";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useUnitNotes, useTenantMutations, formatCurrency } from "@/hooks/useConvexData";

interface Props {
  tenant: any | null;
  onClose: () => void;
  onUpdated?: () => void;
}

export default function UnitDetailPanel({ tenant: tenantProp, onClose, onUpdated }: Props) {
  const [cached, setCached] = useState<any>(tenantProp);
  const [closing, setClosing] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const tenant = tenantProp ?? cached;

  const { notes: notesLog, createNote, updateNote, removeNote } = useUnitNotes(
    tenant?.propertyId,
    tenant?.unit
  );
  const { updateElectricPosted } = useTenantMutations();

  useEffect(() => {
    if (tenantProp) {
      setCached(tenantProp);
      setClosing(false);
    } else if (cached) {
      setClosing(true);
      const t = setTimeout(() => {
        setCached(null);
        setClosing(false);
      }, 220);
      return () => clearTimeout(t);
    }
  }, [tenantProp, cached]);

  useEffect(() => {
    if (tenantProp) {
      setNotesDraft("");
      setEditingNoteId(null);
    }
  }, [tenantProp?._id]);

  if (!tenant) return null;

  // M4: ledger hidden until real ledger entries are wired to Convex
  const ledger: any[] = [];

  // Seed note from tenant data if no log entries exist
  const seedNote = tenant.notes && notesLog.length === 0 ? tenant.notes : null;

  async function handleAddNote() {
    if (!notesDraft.trim() || !tenant) return;
    await createNote({ propertyId: tenant.propertyId, unit: tenant.unit, text: notesDraft.trim() });
    setNotesDraft("");
    onUpdated?.();
  }

  async function handleEditNote(id: string) {
    if (!editDraft.trim()) return;
    await updateNote({ id: id as any, text: editDraft.trim() });
    setEditingNoteId(null);
    setEditDraft("");
  }

  async function handleDeleteNote(id: string) {
    await removeNote({ id: id as any });
  }

  function formatTimestamp(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  async function toggleElectric() {
    if (!tenant) return;
    await updateElectricPosted({ id: tenant._id as any, electricPosted: !tenant.electricPosted });
    onUpdated?.();
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className={`absolute inset-0 bg-black/20 dark:bg-black/60 rh-backdrop${closing ? " is-closing" : ""}`} onClick={onClose} />
      <div className={`relative w-full sm:w-[520px] bg-white dark:bg-[#18181b] h-full overflow-y-auto border-l border-[#e4e4e7] dark:border-[#3f3f46] rh-drawer${closing ? " is-closing" : ""}`}>
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-[#18181b] border-b border-[#e4e4e7] dark:border-[#3f3f46] px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[16px] font-semibold text-[#18181b] dark:text-[#fafafa]">Unit {tenant.unit}</h2>
              {tenant.urgency && (() => {
                const u = tenant.urgency as string;
                const styles: Record<string, string> = {
                  "Expired": "bg-[#7f1d1d] text-white",
                  "Critical (<90d)": "bg-[#dc2626] text-white",
                  "Warning (90-180d)": "bg-[#d97706] text-white",
                  "OK (180d+)": "bg-[#16a34a] text-white",
                };
                const label = u === "Expired" ? `Expired${typeof tenant.daysLeft === "number" ? ` ${Math.abs(tenant.daysLeft)}d ago` : ""}` :
                  typeof tenant.daysLeft === "number" ? `${u} · ${tenant.daysLeft}d left` : u;
                return (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${styles[u] || "bg-[#71717a] text-white"}`}>
                    {label}
                  </span>
                );
              })()}
            </div>
            <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a] mt-0.5">
              {[
                tenant.building ? `Building ${tenant.building}` : null,
                tenant.sqft ? `${tenant.sqft.toLocaleString()} SF` : null,
                tenant.leaseType ? tenant.leaseType.replace("Office ", "") : null,
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] rounded cursor-pointer flex-shrink-0">
            <X size={16} className="text-[#a1a1aa]" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">

          {tenant.status === "vacant" ? (
            <div>
              <p className="text-[14px] font-medium text-[#71717a] dark:text-[#a1a1aa]">Vacant Unit</p>
              <p className="text-[12px] text-[#a1a1aa] dark:text-[#71717a] mt-1">{tenant.sqft.toLocaleString()} SF available</p>
              {(tenant.makeReady || tenant.splittable || tenant.amps) && (
                <div className="mt-3 space-y-1.5">
                  {tenant.makeReady && <p className="text-[11px] text-[#d97706]">Make-ready required</p>}
                  {tenant.splittable && <p className="text-[11px] text-[#2563eb] dark:text-[#60a5fa]">Splittable: {tenant.splitDetail}</p>}
                  {tenant.amps && <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa]">{tenant.amps} AMP</p>}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Tenant Info */}
              <div>
                <p className="text-[15px] font-semibold text-[#18181b] dark:text-[#fafafa]">{tenant.tenant}</p>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div><p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">Lease</p><p className="text-[12px] text-[#18181b] dark:text-[#fafafa] mt-0.5">{tenant.leaseFrom} → {tenant.leaseTo}</p></div>
                  <div><p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">Rent</p><p className="text-[12px] font-semibold text-[#18181b] dark:text-[#fafafa] mt-0.5">{formatCurrency(tenant.monthlyRent)}/mo</p></div>
                  <div><p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">Electric</p><p className="text-[12px] text-[#18181b] dark:text-[#fafafa] mt-0.5">{tenant.monthlyElectric > 0 ? formatCurrency(tenant.monthlyElectric) + "/mo" : "Included"}</p></div>
                  <div><p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">Deposit</p><p className="text-[12px] text-[#18181b] dark:text-[#fafafa] mt-0.5">{formatCurrency(tenant.securityDeposit)}</p></div>
                  {tenant.amps && <div><p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">Electrical</p><p className="text-[12px] text-[#18181b] dark:text-[#fafafa] mt-0.5">{tenant.amps} AMP</p></div>}
                </div>
              </div>

              {/* Payment History — shown first */}
              {ledger.length > 0 && (
                <div>
                  <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">Payment History ({ledger.length})</p>
                  <div className="max-h-56 overflow-y-auto rounded border border-[#e4e4e7] dark:border-[#3f3f46]">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-[#fafafa] dark:bg-[#27272a]">
                        <tr className="text-[#a1a1aa] dark:text-[#71717a] font-medium uppercase tracking-wider text-[9px]">
                          <th className="text-left px-2.5 py-2">Date</th>
                          <th className="text-left px-2.5 py-2">Description</th>
                          <th className="text-right px-2.5 py-2">Charge</th>
                          <th className="text-right px-2.5 py-2">Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...ledger].reverse().slice(0, 10).map((entry, i) => (
                          <tr key={i} className="border-t border-[#f4f4f5] dark:border-[#27272a]">
                            <td className="px-2.5 py-1.5 text-[#a1a1aa] dark:text-[#71717a]">{entry.date}</td>
                            <td className="px-2.5 py-1.5 text-[#18181b] dark:text-[#fafafa] truncate max-w-[160px]">{entry.description}</td>
                            <td className="px-2.5 py-1.5 text-right text-[#dc2626] font-medium">{entry.charge > 0 ? formatCurrency(entry.charge) : ""}</td>
                            <td className="px-2.5 py-1.5 text-right text-[#16a34a] font-medium">{entry.payment > 0 ? formatCurrency(entry.payment) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Status — auto-derived from Yardi data */}
              <StatusBadge status={tenant.status} />

              {/* Past Due */}
              {tenant.pastDueAmount > 0 && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded p-3">
                  <p className="text-[10px] text-[#dc2626] uppercase tracking-wide font-medium">Past Due</p>
                  <p className="text-[22px] font-semibold text-[#dc2626] tracking-tight mt-0.5">{formatCurrency(tenant.pastDueAmount)}</p>
                  <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-1">Last paid: {tenant.lastPaymentDate}</p>
                </div>
              )}

              {/* Posting Status — electric is the only toggle backed by Convex today */}
              {tenant.leaseType === "Office Net Lease" && (
                <div>
                  <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
                    Electric Posting ({new Date().toLocaleString("en-US", { month: "long", year: "numeric" })})
                  </p>
                  <div className="flex items-center justify-between py-1.5">
                    <p className="text-[12px] text-[#18181b] dark:text-[#fafafa]">Electric / Utility charge posted</p>
                    <button
                      onClick={toggleElectric}
                      className={`text-[10px] font-medium px-2.5 py-0.5 rounded cursor-pointer transition-colors ${
                        tenant.electricPosted ? "bg-[#16a34a] text-white" : "bg-red-100 dark:bg-red-950/50 text-[#dc2626]"
                      }`}
                    >
                      {tenant.electricPosted ? "Posted" : "Not Posted"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Notes — timestamped, stackable (newest first) */}
          <div>
            <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
              Notes {notesLog.length > 0 && `(${notesLog.length})`}
            </p>

            {/* Add new note */}
            <div className="flex gap-2 mb-3">
              <textarea
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddNote(); } }}
                placeholder="Add a note..."
                rows={2}
                className="flex-1 text-[12px] text-[#18181b] dark:text-[#fafafa] bg-[#fafafa] dark:bg-[#27272a] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-2.5 leading-relaxed focus:outline-none focus:border-[#71717a] resize-none"
              />
              <button
                onClick={handleAddNote}
                disabled={!notesDraft.trim()}
                className="self-end text-[10px] font-medium px-3 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] disabled:bg-[#e4e4e7] dark:disabled:bg-[#3f3f46] disabled:text-[#a1a1aa] dark:disabled:text-[#71717a] cursor-pointer transition-colors"
              >
                Add
              </button>
            </div>

            {/* Seed note (from original data, before any user notes) */}
            {seedNote && (
              <div className="bg-[#fafafa] dark:bg-[#27272a] rounded p-2.5 mb-2 border border-[#f4f4f5] dark:border-[#3f3f46]">
                <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] leading-relaxed whitespace-pre-wrap">{seedNote}</p>
                <p className="text-[9px] text-[#d4d4d8] dark:text-[#52525b] mt-1.5">From Yardi import</p>
              </div>
            )}

            {/* Notes log — newest first */}
            {notesLog.length > 0 ? (
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {notesLog.map(entry => (
                  <div key={entry._id} className="group bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-2.5">
                    {editingNoteId === entry._id ? (
                      <div className="space-y-1.5">
                        <textarea value={editDraft} onChange={e => setEditDraft(e.target.value)}
                          className="w-full text-[12px] text-[#18181b] dark:text-[#fafafa] bg-[#fafafa] dark:bg-[#27272a] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-2 leading-relaxed focus:outline-none focus:border-[#71717a] resize-none min-h-[40px]"
                          autoFocus />
                        <div className="flex gap-1.5">
                          <button onClick={() => handleEditNote(entry._id)}
                            className="text-[10px] font-medium px-2 py-0.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded cursor-pointer">Save</button>
                          <button onClick={() => setEditingNoteId(null)}
                            className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] cursor-pointer">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] leading-relaxed whitespace-pre-wrap">{entry.text}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <div className="text-[9px] text-[#a1a1aa] dark:text-[#71717a]">
                            <span>{formatTimestamp(entry.createdAt)}</span>
                            {entry.updatedAt && (
                              <span className="ml-1.5 text-[#d4d4d8] dark:text-[#52525b]">· edited {formatTimestamp(entry.updatedAt)}</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { setEditingNoteId(entry._id); setEditDraft(entry.text); }}
                              className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer">Edit</button>
                            <button onClick={() => {
                              if (window.confirm("Delete this note? This cannot be undone.")) handleDeleteNote(entry._id);
                            }}
                              className="text-[10px] font-medium text-[#a1a1aa] dark:text-[#71717a] hover:text-[#dc2626] cursor-pointer">Delete</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : !seedNote && (
              <p className="text-[12px] text-[#d4d4d8] dark:text-[#52525b] italic bg-[#fafafa] dark:bg-[#27272a] p-3 rounded">No notes yet</p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status || "current";
  const configs: Record<string, { label: string; cls: string }> = {
    current:       { label: "Current",       cls: "bg-green-100 dark:bg-green-950/40 text-[#16a34a] border-green-200 dark:border-green-900" },
    past_due:      { label: "Past Due",      cls: "bg-red-100 dark:bg-red-950/40 text-[#dc2626] border-red-200 dark:border-red-900" },
    expiring_soon: { label: "Expiring Soon", cls: "bg-blue-100 dark:bg-blue-950/40 text-[#2563eb] border-blue-200 dark:border-blue-900" },
    locked_out:    { label: "Locked Out",    cls: "bg-orange-100 dark:bg-orange-950/40 text-[#d97706] border-orange-200 dark:border-orange-900" },
  };
  const cfg = configs[s] || { label: s, cls: "bg-[#f4f4f5] dark:bg-[#27272a] text-[#71717a] border-[#e4e4e7] dark:border-[#3f3f46]" };
  return (
    <div>
      <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">Status</p>
      <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded border ${cfg.cls}`}>
        {cfg.label}
      </span>
      <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-1.5">Auto-derived from Yardi sync data.</p>
    </div>
  );
}

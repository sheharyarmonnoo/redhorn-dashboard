"use client";
import { useState, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { useUnitNotes, useReceivableDetails, normalizeTenantName, formatCurrency, useTenantMutations } from "@/hooks/useConvexData";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  tenant: any | null;
  onClose: () => void;
  onUpdated?: () => void;
}

type TabValue = "details" | "ledger" | "electric" | "recoveries" | "payments";

export default function UnitDetailPanel({ tenant: tenantProp, onClose, onUpdated }: Props) {
  const [cached, setCached] = useState<any>(tenantProp);
  const [closing, setClosing] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [tab, setTab] = useState<TabValue>("details");
  const [pendingDelete, setPendingDelete] = useState<{ kind: "log"; id: string } | { kind: "seed" } | null>(null);

  const tenant = tenantProp ?? cached;

  // Per-tenant transaction history from receivable_details
  const allRows = useReceivableDetails(tenant?.propertyId);
  const tenantTx = useMemo(() => {
    if (!tenant?.tenant) return [];
    const key = normalizeTenantName(tenant.tenant);
    return allRows
      .filter((r: any) => normalizeTenantName(r.tenantName || "") === key)
      .filter((r: any) => r.transactionDate || r.description || r.charges !== 0 || r.receipts !== 0)
      .sort((a: any, b: any) => (a.transactionDate || "").localeCompare(b.transactionDate || ""));
  }, [allRows, tenant?.tenant]);

  const electricTx = useMemo(() => tenantTx.filter((r: any) => /electric|electricity|cam-elec/i.test(r.description || "") || /electric|cam-elec/i.test(r.chargeCode || "")), [tenantTx]);
  const recoveriesTx = useMemo(() => tenantTx.filter((r: any) => {
    const d = (r.description || "").toLowerCase();
    const c = (r.chargeCode || "").toLowerCase();
    if (/electric|electricity|cam-elec/.test(d) || /electric|cam-elec/.test(c)) return true;
    if (/cam-ins|insurance/.test(d) || /cam-ins|insurance/.test(c)) return true;
    if (/^cam\b|cam-cy|cam-py|common\s*area/.test(d) || /^cam/.test(c)) return true;
    if (/late\s*fee/.test(d) || /late/.test(c)) return true;
    if (/escalation/.test(d)) return true;
    return false;
  }), [tenantTx]);
  const paymentsTx = useMemo(() => tenantTx.filter((r: any) => (r.receipts || 0) > 0), [tenantTx]);

  const { notes: notesLog, createNote, updateNote, removeNote } = useUnitNotes(
    tenant?.propertyId,
    tenant?.unit
  );
  const { updateNotes: updateTenantNotes } = useTenantMutations();

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
      setTab("details");
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

  async function handleDeleteSeedNote() {
    if (!tenant?._id) {
      console.warn("[UnitDetailPanel] cannot clear seed note: tenant._id missing");
      return;
    }
    try {
      await updateTenantNotes({ id: tenant._id, notes: "" });
      onUpdated?.();
    } catch (err) {
      console.error("[UnitDetailPanel] failed to clear seed note:", err);
    }
  }

  async function confirmPendingDelete() {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "log") {
      await handleDeleteNote(pendingDelete.id);
    } else {
      await handleDeleteSeedNote();
    }
    setPendingDelete(null);
  }

  function formatTimestamp(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className={`absolute inset-0 bg-black/20 dark:bg-black/60 rh-backdrop${closing ? " is-closing" : ""}`} onClick={onClose} />
      <div className={`relative bg-white dark:bg-[#18181b] h-full overflow-y-auto border-l border-[#e4e4e7] dark:border-[#3f3f46] rh-drawer transition-[width] duration-200 ${tab === "details" ? "w-full sm:w-[520px]" : "w-full sm:w-[760px]"}${closing ? " is-closing" : ""}`}>
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

        {/* Tab switcher — only show when there's tenant data to filter against */}
        {tenant.status !== "vacant" && tenant.tenant && (
          <div className="px-5 pt-3 border-b border-[#e4e4e7] dark:border-[#3f3f46] flex items-center gap-4 sticky top-[73px] bg-white dark:bg-[#18181b] z-10 overflow-x-auto">
            {([
              { value: "details", label: "Details" },
              { value: "ledger", label: `Ledger${tenantTx.length ? ` (${tenantTx.length})` : ""}` },
              { value: "electric", label: `Electric${electricTx.length ? ` (${electricTx.length})` : ""}` },
              { value: "recoveries", label: `Recoveries${recoveriesTx.length ? ` (${recoveriesTx.length})` : ""}` },
              { value: "payments", label: `Payments${paymentsTx.length ? ` (${paymentsTx.length})` : ""}` },
            ] as const).map(t => (
              <button
                key={t.value}
                onClick={() => setTab(t.value as TabValue)}
                className={`text-[12px] font-medium pb-2 -mb-px border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  tab === t.value
                    ? "border-[#18181b] dark:border-[#fafafa] text-[#18181b] dark:text-[#fafafa]"
                    : "border-transparent text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {tab === "ledger" && (
          <LedgerTable rows={tenantTx} emptyLabel={tenant.tenant ? "No transactions in receivable detail." : "Vacant unit."} />
        )}
        {tab === "electric" && (
          <LedgerTable rows={electricTx} emptyLabel="No electric charges or payments for this tenant." />
        )}
        {tab === "recoveries" && (
          <LedgerTable rows={recoveriesTx} emptyLabel="No recovery charges or payments for this tenant." />
        )}
        {tab === "payments" && (
          <LedgerTable rows={paymentsTx} emptyLabel="No payments recorded for this tenant." hideCharges />
        )}

        {tab === "details" && (
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



              {/* Posting Status — auto-derived from receivable detail charges during sync */}
              {tenant.leaseType === "Office Net Lease" && (
                <div>
                  <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">
                    Electric Posting ({new Date().toLocaleString("en-US", { month: "long", year: "numeric" })})
                  </p>
                  <div className="flex items-center justify-between py-1.5">
                    <p className="text-[12px] text-[#18181b] dark:text-[#fafafa]">Electric / Utility charge posted</p>
                    <span
                      className={`text-[10px] font-medium px-2.5 py-0.5 rounded ${
                        tenant.electricPosted ? "bg-[#16a34a] text-white" : "bg-red-100 dark:bg-red-950/50 text-[#dc2626]"
                      }`}
                    >
                      {tenant.electricPosted ? "Posted" : "Not Posted"}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-1.5">Auto-derived from receivable detail.</p>
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

            {/* Legacy seed note — lives on tenant.notes rather than the
                unit_notes table. Rendered when there are no log entries yet. */}
            {seedNote && (
              <div className="group bg-[#fafafa] dark:bg-[#27272a] rounded p-2.5 mb-2 border border-[#f4f4f5] dark:border-[#3f3f46]">
                <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] leading-relaxed whitespace-pre-wrap">{seedNote}</p>
                <div className="flex items-center justify-end mt-1.5">
                  <button
                    onClick={() => setPendingDelete({ kind: "seed" })}
                    className="text-[10px] font-medium text-[#a1a1aa] dark:text-[#71717a] hover:text-[#dc2626] cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
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
                            <button onClick={() => setPendingDelete({ kind: "log", id: entry._id })}
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
        )}
      </div>
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this note?"
        message="This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmPendingDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function LedgerTable({ rows, emptyLabel, hideCharges }: { rows: any[]; emptyLabel: string; hideCharges?: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-[12px] text-[#a1a1aa] dark:text-[#71717a]">{emptyLabel}</p>
      </div>
    );
  }
  const grouped: Record<string, any[]> = {};
  for (const r of rows) {
    const k = r.postMonth || (r.transactionDate ? r.transactionDate.slice(0, 7) : "—");
    (grouped[k] = grouped[k] || []).push(r);
  }
  const monthKeys = Object.keys(grouped).sort().reverse();
  return (
    <div className="px-5 py-4 space-y-4">
      {monthKeys.map(mk => {
        const items = grouped[mk];
        const monthCharges = items.reduce((s, r) => s + (r.charges || 0), 0);
        const monthReceipts = items.reduce((s, r) => s + (r.receipts || 0), 0);
        return (
          <div key={mk} className="border border-[#e4e4e7] dark:border-[#3f3f46] rounded overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-[#fafafa] dark:bg-[#27272a] border-b border-[#e4e4e7] dark:border-[#3f3f46]">
              <p className="text-[11px] font-semibold text-[#18181b] dark:text-[#fafafa]">{formatMonth(mk)}</p>
              <p className="text-[10px] text-[#71717a] dark:text-[#a1a1aa]">
                {!hideCharges && (
                  <>
                    Charged <span className="font-medium text-[#dc2626]">{formatCurrency(monthCharges)}</span>
                    <span className="mx-1.5">·</span>
                  </>
                )}
                Paid <span className="font-medium text-[#16a34a]">{formatCurrency(monthReceipts)}</span>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] min-w-[640px]">
                <thead>
                  <tr className="text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider text-[9px] border-b border-[#e4e4e7] dark:border-[#3f3f46]">
                    <th className="text-left px-3 py-1.5 whitespace-nowrap">Date</th>
                    <th className="text-left px-3 py-1.5">Description</th>
                    <th className="text-right px-3 py-1.5 whitespace-nowrap">Charge</th>
                    <th className="text-right px-3 py-1.5 whitespace-nowrap">Payment</th>
                    <th className="text-right px-3 py-1.5 whitespace-nowrap">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r, i) => (
                    <tr key={i} className="border-t border-[#f4f4f5] dark:border-[#27272a]">
                      <td className="px-3 py-1.5 text-[#71717a] dark:text-[#a1a1aa] whitespace-nowrap">{r.transactionDate || "—"}</td>
                      <td className="px-3 py-1.5 text-[#18181b] dark:text-[#fafafa]">{r.description || ""}</td>
                      <td className="px-3 py-1.5 text-right text-[#dc2626] font-medium whitespace-nowrap">{r.charges > 0 ? formatCurrency(r.charges) : ""}</td>
                      <td className="px-3 py-1.5 text-right text-[#16a34a] font-medium whitespace-nowrap">{r.receipts > 0 ? formatCurrency(r.receipts) : ""}</td>
                      <td className="px-3 py-1.5 text-right text-[#71717a] dark:text-[#a1a1aa] whitespace-nowrap">{formatCurrency(r.balance || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatMonth(m: string): string {
  if (!m || m === "—") return "Undated";
  const [y, mo] = m.split("-");
  if (!y || !mo) return m;
  const date = new Date(Number(y), Number(mo) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const s = status || "current";
  const configs: Record<string, { label: string; cls: string }> = {
    current:       { label: "Current",       cls: "bg-green-100 dark:bg-green-950/40 text-[#16a34a] border-green-200 dark:border-green-900" },
    past_due:      { label: "Past Due",      cls: "bg-red-100 dark:bg-red-950/40 text-[#dc2626] border-red-200 dark:border-red-900" },
    expiring_soon: { label: "Expiring Soon", cls: "bg-blue-100 dark:bg-blue-950/40 text-[#2563eb] border-blue-200 dark:border-blue-900" },
    locked_out:    { label: "Locked Out",    cls: "bg-orange-100 dark:bg-orange-950/40 text-[#d97706] border-orange-200 dark:border-orange-900" },
    vacant:        { label: "Vacant",        cls: "bg-[#f4f4f5] dark:bg-[#27272a] text-[#71717a] border-[#e4e4e7] dark:border-[#3f3f46]" },
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

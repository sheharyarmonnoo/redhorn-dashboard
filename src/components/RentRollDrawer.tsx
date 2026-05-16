"use client";
import { useState, useEffect, useMemo } from "react";
import { Mail, Phone, Pencil, Check, X } from "lucide-react";
import { formatCurrency, normalizeTenantName, useReceivableDetails, useProperties, useUnitNotes, useTenantMutations } from "@/hooks/useConvexData";
import EmailComposer, { type EmailContext } from "./EmailComposer";
import ConfirmDialog from "./ConfirmDialog";
import StatusPill, { ManualOverrideBadge } from "./StatusPill";
import StatusEditor from "./StatusEditor";
import { useUser } from "@clerk/nextjs";

type Tenant = any;

interface Props {
  tenant: Tenant | null;
  onClose: () => void;
}


export default function RentRollDrawer({ tenant, onClose }: Props) {
  const [notesDraft, setNotesDraft] = useState<string>("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>("");
  // Pending-delete state. `kind: "log"` deletes a unit_notes row by id;
  // `kind: "seed"` clears the tenant.notes field. `null` = nothing pending.
  const [pendingDelete, setPendingDelete] = useState<{ kind: "log"; id: string } | { kind: "seed" } | null>(null);
  // Optimistic local dismissal — once the user confirms a seed-note delete
  // we hide it immediately, even if Convex hasn't echoed the patch back yet
  // (or the mutation silently failed). Reset whenever the drawer points to
  // a different tenant.
  const [seedDismissed, setSeedDismissed] = useState(false);
  useEffect(() => { setSeedDismissed(false); }, [tenant?._id]);
  const [tab, setTab] = useState<"details" | "ledger" | "electric" | "recoveries" | "payments">("details");
  const [emailCtx, setEmailCtx] = useState<EmailContext | null>(null);
  const { properties } = useProperties();
  const property = useMemo(() => properties.find((p: any) => p._id === tenant?.propertyId) || null, [properties, tenant?.propertyId]);

  const { notes: notesLog, createNote, updateNote, removeNote } = useUnitNotes(
    tenant?.propertyId,
    tenant?.unit
  );
  const { updateNotes: updateTenantNotes, setContactOverride } = useTenantMutations();
  const { user: drawerUser } = useUser();
  const drawerCurrentUser =
    drawerUser?.fullName || drawerUser?.firstName || drawerUser?.username || "User";
  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState<{ tenantContactName: string; tenantEmail: string; tenantPhone: string }>({ tenantContactName: "", tenantEmail: "", tenantPhone: "" });

  useEffect(() => {
    setNotesDraft("");
    setEditingNoteId(null);
    setEditDraft("");
    setEditingContact(false);
    setContactDraft({
      tenantContactName: tenant?.tenantContactName || "",
      tenantEmail: tenant?.tenantEmail || "",
      tenantPhone: tenant?.tenantPhone || "",
    });
  }, [tenant?.unit, tenant?.propertyId, tenant?.tenantEmail, tenant?.tenantPhone, tenant?.tenantContactName]);
  useEffect(() => { setTab("details"); }, [tenant?.unit, tenant?.propertyId]);

  // Pull all receivable_details for this property; filter to this tenant.
  // Match by UNIT instead of name. Names diverge between rent-roll and
  // ledger (Yardi truncates, adds DBAs, splits lessor/operator names) so
  // unit is the only stable join key. Multi-unit leases store
  // comma-separated units identically on both sides — exact match works.
  // Fallback to name normalization when unit is missing on the tenant row.
  const allRows = useReceivableDetails(tenant?.propertyId);
  const tenantTx = useMemo(() => {
    if (!tenant) return [];
    const tenantUnit = (tenant.unit || "").trim().toLowerCase();
    const tenantUnitTokens = tenantUnit.split(",").map((s: string) => s.trim()).filter(Boolean);
    const nameKey = tenant.tenant ? normalizeTenantName(tenant.tenant) : "";
    return allRows
      .filter((r: any) => {
        const rowUnit = (r.unit || "").trim().toLowerCase();
        if (rowUnit && tenantUnitTokens.length > 0) {
          // Direct match (multi-unit on both sides) OR any token overlap.
          if (rowUnit === tenantUnit) return true;
          const rowTokens = rowUnit.split(",").map((s: string) => s.trim()).filter(Boolean);
          return rowTokens.some((t: string) => tenantUnitTokens.includes(t));
        }
        // Fallback: name match for ledger rows that didn't get a unit.
        return nameKey && normalizeTenantName(r.tenantName || "") === nameKey;
      })
      .filter((r: any) => r.transactionDate || r.description || r.charges !== 0 || r.receipts !== 0)
      .sort((a: any, b: any) => (a.transactionDate || "").localeCompare(b.transactionDate || ""));
  }, [allRows, tenant?.tenant, tenant?.unit]);

  const electricTx = useMemo(() => tenantTx.filter((r: any) => /electric|electricity|cam-elec/i.test(r.description || "") || /electric|cam-elec/i.test(r.chargeCode || "")), [tenantTx]);
  const recoveriesTx = useMemo(() => tenantTx.filter((r: any) => {
    const d = (r.description || "").toLowerCase();
    const c = (r.chargeCode || "").toLowerCase();
    // Recovery charges = CAM + Electric + Insurance + late fees + escalation.
    // Anything the landlord bills back to the tenant beyond base rent.
    if (/electric|electricity|cam-elec/.test(d) || /electric|cam-elec/.test(c)) return true;
    if (/cam-ins|insurance/.test(d) || /cam-ins|insurance/.test(c)) return true;
    if (/^cam\b|cam-cy|cam-py|common\s*area/.test(d) || /^cam/.test(c)) return true;
    if (/late\s*fee/.test(d) || /late/.test(c)) return true;
    if (/escalation/.test(d)) return true;
    return false;
  }), [tenantTx]);
  const paymentsTx = useMemo(() => tenantTx.filter((r: any) => (r.receipts || 0) > 0), [tenantTx]);

  if (!tenant) return null;

  // Seed note from tenant data if no log entries exist (matches UnitDetailPanel)
  // Yardi-imported notes are no longer surfaced — only user-authored notes
  // (unit_notes table) render. The tenant.notes field stays in the schema
  // for now but is intentionally hidden across the UI.
  const seedNote: string | null = null;

  async function handleAddNote() {
    if (!notesDraft.trim() || !tenant?.propertyId || !tenant?.unit) return;
    await createNote({ propertyId: tenant.propertyId, unit: tenant.unit, text: notesDraft.trim() });
    setNotesDraft("");
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

  // The "seed" note lives on the tenant document itself (`tenant.notes`)
  // rather than the unit_notes table — could be from Yardi import OR a
  // legacy direct write. Clearing the field hides the card. We dismiss
  // locally first (optimistic) so the user gets immediate feedback even
  // if the Convex round-trip is slow; if the patch fails we surface the
  // error and roll the dismissal back so they can retry.
  async function handleDeleteSeedNote() {
    if (!tenant?._id) {
      console.warn("[RentRollDrawer] cannot clear seed note: tenant._id missing");
      return;
    }
    setSeedDismissed(true);
    try {
      await updateTenantNotes({ id: tenant._id, notes: "" });
    } catch (err: any) {
      console.error("[RentRollDrawer] failed to clear seed note:", err);
      setSeedDismissed(false);
      alert(`Couldn't delete the note: ${err?.message || err}`);
    }
  }

  async function handleSaveContact() {
    if (!tenant?.propertyId || !tenant?.unit) return;
    try {
      await setContactOverride({
        propertyId: tenant.propertyId,
        unit: tenant.unit,
        fields: {
          tenantContactName: contactDraft.tenantContactName.trim() || undefined,
          tenantEmail: contactDraft.tenantEmail.trim() || undefined,
          tenantPhone: contactDraft.tenantPhone.trim() || undefined,
        },
      });
      setEditingContact(false);
    } catch (err: any) {
      alert(`Couldn't save contact: ${err?.message || err}`);
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 dark:bg-black/60 rh-backdrop" onClick={onClose}>
      <div
        className={`bg-white dark:bg-[#18181b] border-l border-[#e4e4e7] dark:border-[#3f3f46] shadow-xl w-full ${tab === "details" ? "max-w-md" : "max-w-3xl"} h-full overflow-y-auto rh-drawer transition-[max-width] duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4e4e7] dark:border-[#3f3f46] sticky top-0 bg-white dark:bg-[#18181b] z-10">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] truncate">{tenant.unit}</p>
            <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] truncate">{tenant.tenant || "— Vacant —"}</p>
          </div>
          <div className="flex items-center gap-2">
            {tenant.tenantEmail && (
              <button
                onClick={() => setEmailCtx(buildTenantEmail(tenant, property))}
                className="flex items-center gap-1 text-[10px] font-medium text-[#2563eb] dark:text-[#60a5fa] hover:bg-blue-50 dark:hover:bg-blue-950/30 px-2 py-1 rounded cursor-pointer"
                title={`Email ${tenant.tenantEmail}`}
              >
                <Mail size={11} />
                Tenant
              </button>
            )}
            {tenant.tenantPhone && (
              <a
                href={`tel:${tenant.tenantPhone.replace(/[^\d+]/g, "")}`}
                className="flex items-center gap-1 text-[10px] font-medium text-[#16a34a] hover:bg-green-50 dark:hover:bg-green-950/30 px-2 py-1 rounded cursor-pointer"
                title={`Call ${tenant.tenantPhone}`}
              >
                <Phone size={11} />
                Call
              </a>
            )}
            {property?.pmEmail && (
              <button
                onClick={() => setEmailCtx(buildPmEmail(tenant, property))}
                className="flex items-center gap-1 text-[10px] font-medium text-[#2563eb] dark:text-[#60a5fa] hover:bg-blue-50 dark:hover:bg-blue-950/30 px-2 py-1 rounded cursor-pointer"
                title={`Email PM (${property.pmEmail})`}
              >
                <Mail size={11} />
                PM
              </button>
            )}
            {tenant.hasOverride && (
              <span className="text-[10px] font-medium text-[#d97706] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 px-2 py-0.5 rounded">Modified</span>
            )}
            <button onClick={onClose} className="text-[16px] text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer leading-none">×</button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="px-5 pt-3 border-b border-[#e4e4e7] dark:border-[#3f3f46] flex items-center gap-4 sticky top-[57px] bg-white dark:bg-[#18181b] z-10">
          {([
            { value: "details", label: "Details" },
            { value: "ledger", label: `Ledger${tenantTx.length ? ` (${tenantTx.length})` : ""}` },
            { value: "electric", label: `Electric${electricTx.length ? ` (${electricTx.length})` : ""}` },
            { value: "recoveries", label: `Recoveries${recoveriesTx.length ? ` (${recoveriesTx.length})` : ""}` },
            { value: "payments", label: `Payments${paymentsTx.length ? ` (${paymentsTx.length})` : ""}` },
          ] as const).map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value as any)}
              className={`text-[12px] font-medium pb-2 -mb-px border-b-2 transition-colors cursor-pointer ${
                tab === t.value
                  ? "border-[#18181b] dark:border-[#fafafa] text-[#18181b] dark:text-[#fafafa]"
                  : "border-transparent text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

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
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                <StatusEditor
                  status={tenant.status}
                  isOverridden={!!tenant.statusOverridden}
                  onSelect={async (next) => {
                    await setContactOverride({
                      propertyId: tenant.propertyId,
                      unit: tenant.unit,
                      fields: { status: next },
                      updatedBy: drawerCurrentUser,
                    });
                  }}
                  onClear={async () => {
                    await setContactOverride({
                      propertyId: tenant.propertyId,
                      unit: tenant.unit,
                      fields: { status: "" },
                      updatedBy: drawerCurrentUser,
                    });
                  }}
                />
                {tenant.statusOverridden && (
                  <ManualOverrideBadge by={tenant.overrideUpdatedBy} at={tenant.overrideUpdatedAt} size="xs" />
                )}
              </div>
              <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-1.5">
                {tenant.statusOverridden
                  ? `Manual override active. System status was ${tenant.systemStatus || "unknown"}.`
                  : "System status. Calculated from rent roll and ledger data. Click pill to override."}
              </p>
            </Field>
            <Field label="Lease Type">
              <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">{tenant.leaseType || "—"}</p>
            </Field>

            <Field label="Lease Start">
              <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">{formatDate(tenant.leaseFrom)}</p>
            </Field>
            <Field label="Lease End">
              <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">{formatDate(tenant.leaseTo)}</p>
            </Field>

            <Field label="Monthly Rent">
              <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">{formatCurrency(tenant.monthlyRent ?? 0)}</p>
            </Field>
            <Field label="Security Deposit">
              <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">{formatCurrency(tenant.securityDeposit ?? 0)}</p>
            </Field>

            <Field label="Next Rent Increase Date">
              <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">{formatDate(tenant.nextRentIncrease)}</p>
            </Field>
            <Field label="New Monthly Rent">
              <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">{tenant.nextRentIncreaseAmount ? formatCurrency(tenant.nextRentIncreaseAmount) : "—"}</p>
            </Field>

            {/* Monthly Electric + Past Due intentionally hidden — billback
                values aren't stable; the synced data still flows through
                Convex but isn't surfaced here. */}

            <Field label="Sqft">
              <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">{(tenant.sqft || 0).toLocaleString()}</p>
            </Field>
            <Field label="Building">
              <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">{tenant.building || "—"}</p>
            </Field>
          </div>

          {/* Tenant Contact — editable email/phone/contact name override.
              Persists to tenant_overrides so it survives the next Yardi sync. */}
          <div className="border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3">
            <div className="flex items-center justify-between mb-2 gap-3">
              <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium">Tenant Contact</p>
              {editingContact ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleSaveContact}
                    className="flex items-center gap-1 text-[10px] font-medium text-[#16a34a] hover:bg-green-50 dark:hover:bg-green-950/30 px-1.5 py-0.5 rounded cursor-pointer"
                    title="Save"
                  >
                    <Check size={11} /> Save
                  </button>
                  <button
                    onClick={() => {
                      setEditingContact(false);
                      setContactDraft({
                        tenantContactName: tenant?.tenantContactName || "",
                        tenantEmail: tenant?.tenantEmail || "",
                        tenantPhone: tenant?.tenantPhone || "",
                      });
                    }}
                    className="flex items-center gap-1 text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] hover:text-[#dc2626] px-1.5 py-0.5 rounded cursor-pointer"
                    title="Cancel"
                  >
                    <X size={11} /> Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingContact(true)}
                  className="flex items-center gap-1 text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"
                  title="Edit contact"
                >
                  <Pencil size={11} /> Edit
                </button>
              )}
            </div>
            {editingContact ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={contactDraft.tenantContactName}
                  onChange={e => setContactDraft({ ...contactDraft, tenantContactName: e.target.value })}
                  placeholder="Contact name (e.g. John Smith)"
                  className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a]"
                />
                <input
                  type="email"
                  value={contactDraft.tenantEmail}
                  onChange={e => setContactDraft({ ...contactDraft, tenantEmail: e.target.value })}
                  placeholder="email@example.com"
                  className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a]"
                />
                <input
                  type="tel"
                  value={contactDraft.tenantPhone}
                  onChange={e => setContactDraft({ ...contactDraft, tenantPhone: e.target.value })}
                  placeholder="(555) 123-4567"
                  className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a]"
                />
              </div>
            ) : (
              <div className="space-y-1.5 text-[12px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[#71717a] dark:text-[#a1a1aa]">Name</span>
                  <span className="text-[#18181b] dark:text-[#fafafa]">{tenant.tenantContactName || <span className="text-[#a1a1aa] italic">—</span>}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[#71717a] dark:text-[#a1a1aa]">Email</span>
                  {tenant.tenantEmail ? (
                    <a href={`mailto:${tenant.tenantEmail}`} className="text-[#2563eb] dark:text-[#60a5fa] hover:underline truncate max-w-[60%]">{tenant.tenantEmail}</a>
                  ) : (
                    <span className="text-[#a1a1aa] italic">—</span>
                  )}
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[#71717a] dark:text-[#a1a1aa]">Phone</span>
                  {tenant.tenantPhone ? (
                    <a href={`tel:${tenant.tenantPhone.replace(/[^\d+]/g, "")}`} className="text-[#2563eb] dark:text-[#60a5fa] hover:underline">{tenant.tenantPhone}</a>
                  ) : (
                    <span className="text-[#a1a1aa] italic">—</span>
                  )}
                </div>
              </div>
            )}
          </div>

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

            {/* Legacy seed note — lives on tenant.notes rather than the
                unit_notes table. Rendered when there are no log entries yet. */}
            {seedNote && (
              <div className="group bg-[#fafafa] dark:bg-[#27272a] rounded p-2.5 mt-2 border border-[#f4f4f5] dark:border-[#3f3f46]">
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
          </div>
        </div>
        )}
      </div>
      <EmailComposer open={!!emailCtx} context={emailCtx} onClose={() => setEmailCtx(null)} />
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

function buildTenantEmail(tenant: any, property: any): EmailContext {
  const subject = `Regarding ${property?.name || "your lease"} — Unit ${tenant.unit}`;
  const greeting = tenant.tenantContactName ? `Hi ${tenant.tenantContactName},` : "Hello,";
  const balanceLine = tenant.pastDueAmount > 0
    ? `\n\nOur records show a balance of ${formatCurrency(tenant.pastDueAmount)} on this account.`
    : "";
  const body =
`${greeting}

I'm reaching out about your lease at ${property?.name || ""} — Unit ${tenant.unit}.${balanceLine}

Please let me know if you have any questions.

Best regards,`;
  return {
    propertyId: tenant.propertyId,
    relatedType: "tenant",
    relatedId: tenant.unit,
    toEmail: tenant.tenantEmail || "",
    toName: tenant.tenantContactName || tenant.tenant,
    subject,
    body,
  };
}

function buildPmEmail(tenant: any, property: any): EmailContext {
  const subject = `${property?.name || "Property"} — Unit ${tenant.unit} (${tenant.tenant})`;
  const balanceLine = tenant.pastDueAmount > 0
    ? `\n\nThis tenant has a current balance of ${formatCurrency(tenant.pastDueAmount)}.`
    : "";
  const body =
`Hi ${property?.pmName || "team"},

Following up on Unit ${tenant.unit} — ${tenant.tenant} at ${property?.name || ""}.${balanceLine}

${property?.pmCompany ? `\n— ${property.pmCompany}` : ""}

Best regards,`;
  return {
    propertyId: tenant.propertyId,
    relatedType: "tenant",
    relatedId: tenant.unit,
    toEmail: property?.pmEmail || "",
    toName: property?.pmName,
    subject,
    body,
  };
}

function LedgerTable({ rows, emptyLabel, hideCharges }: { rows: any[]; emptyLabel: string; hideCharges?: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-[12px] text-[#a1a1aa] dark:text-[#71717a]">{emptyLabel}</p>
      </div>
    );
  }
  // Group rows by post month so the timeline reads top-down by period.
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

function formatDate(d: any): string {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
  const [y, m, day] = s.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(day));
  if (isNaN(date.getTime())) return s;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Field({ label, overridden, children }: { label: string; overridden?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide flex items-center gap-1.5 mb-1">
        {label}
        {overridden && <span className="w-1.5 h-1.5 rounded-full bg-[#d97706]" title="Manually overridden" />}
      </label>
      {children}
    </div>
  );
}

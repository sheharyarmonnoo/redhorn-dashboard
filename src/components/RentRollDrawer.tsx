"use client";
import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../convex/_generated/api";
import { formatCurrency } from "@/hooks/useConvexData";

type Tenant = any;

interface Props {
  tenant: Tenant | null;
  onClose: () => void;
}

const STATUS_OPTIONS = [
  { value: "current", label: "Current" },
  { value: "past_due", label: "Past Due" },
  { value: "expiring_soon", label: "Expiring Soon" },
  { value: "locked_out", label: "Locked Out" },
  { value: "vacant", label: "Vacant" },
];

export default function RentRollDrawer({ tenant, onClose }: Props) {
  const setOverride = useMutation(api.tenantOverrides.setOverride);
  const clearOverride = useMutation(api.tenantOverrides.clearOverride);
  const { user } = useUser();
  const [draft, setDraft] = useState<any | null>(tenant);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(tenant); }, [tenant?.unit, tenant?.propertyId]);

  if (!tenant || !draft) return null;

  const dirty = draft.monthlyRent !== tenant.monthlyRent
    || draft.monthlyElectric !== tenant.monthlyElectric
    || draft.securityDeposit !== tenant.securityDeposit
    || draft.leaseFrom !== tenant.leaseFrom
    || draft.leaseTo !== tenant.leaseTo
    || draft.status !== tenant.status
    || (draft.notes || "") !== (tenant.notes || "")
    || draft.pastDueAmount !== tenant.pastDueAmount;

  async function handleSave() {
    if (!draft || !tenant.propertyId || !tenant.unit) return;
    setSaving(true);
    try {
      await setOverride({
        propertyId: tenant.propertyId as any,
        unit: tenant.unit,
        fields: {
          monthlyRent: numOrUndef(draft.monthlyRent),
          monthlyElectric: numOrUndef(draft.monthlyElectric),
          securityDeposit: numOrUndef(draft.securityDeposit),
          leaseFrom: strOrUndef(draft.leaseFrom),
          leaseTo: strOrUndef(draft.leaseTo),
          status: strOrUndef(draft.status),
          notes: strOrUndef(draft.notes),
          pastDueAmount: numOrUndef(draft.pastDueAmount),
        },
        updatedBy: user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "User",
      });
    } finally { setSaving(false); }
  }

  async function handleRevert() {
    if (!tenant.propertyId || !tenant.unit) return;
    if (!window.confirm(`Revert ${tenant.unit} to pipeline values? Your manual edits will be discarded; the next sync's data will show.`)) return;
    setSaving(true);
    try {
      await clearOverride({ propertyId: tenant.propertyId as any, unit: tenant.unit });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 dark:bg-black/60 rh-backdrop" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#18181b] border-l border-[#e4e4e7] dark:border-[#3f3f46] shadow-xl w-full max-w-md h-full overflow-y-auto rh-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4e4e7] dark:border-[#3f3f46] sticky top-0 bg-white dark:bg-[#18181b] z-10">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] truncate">{tenant.unit}</p>
            <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] truncate">{tenant.tenant || "— Vacant —"}</p>
          </div>
          <div className="flex items-center gap-2">
            {tenant.hasOverride && (
              <span className="text-[10px] font-medium text-[#d97706] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 px-2 py-0.5 rounded">Modified</span>
            )}
            <button onClick={onClose} className="text-[16px] text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer leading-none">×</button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select
                value={draft.status || "current"}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Lease Type">
              <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">{tenant.leaseType || "—"}</p>
            </Field>

            <Field label="Lease Start" overridden={tenant.overrideFields?.includes("leaseFrom")}>
              <input
                type="date"
                value={(draft.leaseFrom || "").slice(0, 10)}
                onChange={(e) => setDraft({ ...draft, leaseFrom: e.target.value })}
                className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
              />
            </Field>
            <Field label="Lease End" overridden={tenant.overrideFields?.includes("leaseTo")}>
              <input
                type="date"
                value={(draft.leaseTo || "").slice(0, 10)}
                onChange={(e) => setDraft({ ...draft, leaseTo: e.target.value })}
                className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
              />
            </Field>

            <Field label="Monthly Rent" overridden={tenant.overrideFields?.includes("monthlyRent")}>
              <NumberInput value={draft.monthlyRent ?? 0} onChange={v => setDraft({ ...draft, monthlyRent: v })} />
            </Field>
            <Field label="Security Deposit" overridden={tenant.overrideFields?.includes("securityDeposit")}>
              <NumberInput value={draft.securityDeposit ?? 0} onChange={v => setDraft({ ...draft, securityDeposit: v })} />
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

          <Field label="Notes" overridden={tenant.overrideFields?.includes("notes")}>
            <textarea
              value={draft.notes || ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={4}
              placeholder="Anything the team should know about this lease — payment history, issues, off-system arrangements."
              className="w-full text-[12px] bg-white dark:bg-[#09090b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-2 text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa] resize-none"
            />
          </Field>

          {tenant.hasOverride && (
            <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] leading-relaxed">
              Modified fields override the synced Yardi data. They persist across syncs.
              Click <span className="font-medium">Revert to pipeline</span> to discard your edits and restore the synced values.
              {tenant.overrideUpdatedAt && <> · Last edited {new Date(tenant.overrideUpdatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{tenant.overrideUpdatedBy ? ` by ${tenant.overrideUpdatedBy}` : ""}.</>}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#e4e4e7] dark:border-[#3f3f46] sticky bottom-0 bg-white dark:bg-[#18181b]">
          <button
            onClick={handleRevert}
            disabled={!tenant.hasOverride || saving}
            className="text-[12px] font-medium text-[#71717a] dark:text-[#a1a1aa] hover:text-[#dc2626] dark:hover:text-[#f87171] px-2 py-1.5 rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Revert to pipeline
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] px-3 py-1.5 rounded cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="text-[12px] font-medium bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] px-3 py-1.5 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
    />
  );
}

function numOrUndef(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function strOrUndef(v: any): string | undefined {
  const s = (v || "").toString().trim();
  return s.length > 0 ? s : undefined;
}

"use client";
import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Mail } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { formatCurrency, normalizeTenantName, useReceivableDetails, useProperties } from "@/hooks/useConvexData";
import EmailComposer, { type EmailContext } from "./EmailComposer";

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
  const [tab, setTab] = useState<"details" | "ledger" | "electric">("details");
  const [emailCtx, setEmailCtx] = useState<EmailContext | null>(null);
  const { properties } = useProperties();
  const property = useMemo(() => properties.find((p: any) => p._id === tenant?.propertyId) || null, [properties, tenant?.propertyId]);

  useEffect(() => { setDraft(tenant); }, [tenant?.unit, tenant?.propertyId]);
  useEffect(() => { setTab("details"); }, [tenant?.unit, tenant?.propertyId]);

  // Pull all receivable_details for this property; filter to this tenant.
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

  if (!tenant || !draft) return null;

  const dirty = draft.monthlyRent !== tenant.monthlyRent
    || draft.monthlyElectric !== tenant.monthlyElectric
    || draft.securityDeposit !== tenant.securityDeposit
    || draft.leaseFrom !== tenant.leaseFrom
    || draft.leaseTo !== tenant.leaseTo
    || draft.status !== tenant.status
    || (draft.notes || "") !== (tenant.notes || "")
    || draft.pastDueAmount !== tenant.pastDueAmount
    || (draft.nextRentIncrease || "") !== (tenant.nextRentIncrease || "")
    || (draft.nextRentIncreaseAmount || 0) !== (tenant.nextRentIncreaseAmount || 0)
    || (draft.tenantEmail || "") !== (tenant.tenantEmail || "")
    || (draft.tenantPhone || "") !== (tenant.tenantPhone || "");

  async function handleSave() {
    if (!draft || !tenant.propertyId || !tenant.unit) return;
    setSaving(true);
    try {
      // Only persist fields the user actually changed. Sending the full draft
      // would freeze every field as an override (including ones the user
      // didn't touch like lease expiration), which then blocks future Yardi
      // syncs from updating that field until "Revert to pipeline" is clicked.
      const fields: Record<string, any> = {};
      if (draft.monthlyRent !== tenant.monthlyRent) fields.monthlyRent = numOrUndef(draft.monthlyRent);
      if (draft.monthlyElectric !== tenant.monthlyElectric) fields.monthlyElectric = numOrUndef(draft.monthlyElectric);
      if (draft.securityDeposit !== tenant.securityDeposit) fields.securityDeposit = numOrUndef(draft.securityDeposit);
      if (draft.leaseFrom !== tenant.leaseFrom) fields.leaseFrom = strOrUndef(draft.leaseFrom);
      if (draft.leaseTo !== tenant.leaseTo) fields.leaseTo = strOrUndef(draft.leaseTo);
      if (draft.status !== tenant.status) fields.status = strOrUndef(draft.status);
      if ((draft.notes || "") !== (tenant.notes || "")) fields.notes = strOrUndef(draft.notes);
      if (draft.pastDueAmount !== tenant.pastDueAmount) fields.pastDueAmount = numOrUndef(draft.pastDueAmount);
      if ((draft.nextRentIncrease || "") !== (tenant.nextRentIncrease || "")) fields.nextRentIncrease = strOrUndef(draft.nextRentIncrease);
      if ((draft.nextRentIncreaseAmount || 0) !== (tenant.nextRentIncreaseAmount || 0)) fields.nextRentIncreaseAmount = numOrUndef(draft.nextRentIncreaseAmount);
      if ((draft.tenantEmail || "") !== (tenant.tenantEmail || "")) fields.tenantEmail = strOrUndef(draft.tenantEmail);
      if ((draft.tenantPhone || "") !== (tenant.tenantPhone || "")) fields.tenantPhone = strOrUndef(draft.tenantPhone);
      if (Object.keys(fields).length === 0) return;
      await setOverride({
        propertyId: tenant.propertyId as any,
        unit: tenant.unit,
        fields,
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
        {tab === "details" && (
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

            <Field label="Next Rent Increase Date" overridden={tenant.overrideFields?.includes("nextRentIncrease")}>
              <input
                type="date"
                value={(draft.nextRentIncrease || "").slice(0, 10)}
                onChange={(e) => setDraft({ ...draft, nextRentIncrease: e.target.value })}
                className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
              />
            </Field>
            <Field label="New Monthly Rent" overridden={tenant.overrideFields?.includes("nextRentIncreaseAmount")}>
              <NumberInput value={draft.nextRentIncreaseAmount ?? 0} onChange={v => setDraft({ ...draft, nextRentIncreaseAmount: v })} />
            </Field>

            <Field label="Tenant Email" overridden={tenant.overrideFields?.includes("tenantEmail")}>
              <input
                type="email"
                value={draft.tenantEmail || ""}
                onChange={(e) => setDraft({ ...draft, tenantEmail: e.target.value })}
                placeholder="contact@example.com"
                className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
              />
            </Field>
            <Field label="Tenant Phone" overridden={tenant.overrideFields?.includes("tenantPhone")}>
              <input
                type="tel"
                value={draft.tenantPhone || ""}
                onChange={(e) => setDraft({ ...draft, tenantPhone: e.target.value })}
                className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
              />
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
        )}

        {tab === "details" && (
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
        )}
      </div>
      <EmailComposer open={!!emailCtx} context={emailCtx} onClose={() => setEmailCtx(null)} />
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

function LedgerTable({ rows, emptyLabel }: { rows: any[]; emptyLabel: string }) {
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
                Charged <span className="font-medium text-[#dc2626]">{formatCurrency(monthCharges)}</span>
                <span className="mx-1.5">·</span>
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

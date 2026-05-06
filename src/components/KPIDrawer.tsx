"use client";
import { useEffect, useState } from "react";
import { useActiveProperty, useTenants, useUnits, useMonthlyRevenue, formatCurrency, isExpiringWithin, leasedUnitKeys } from "@/hooks/useConvexData";

function useKpiData() {
  const property = useActiveProperty();
  const tenants = useTenants(property?._id) as any[];
  const units = useUnits(property?._id) as any[];
  const monthlyRevenue = useMonthlyRevenue(property?._id) as any[];
  return { tenants, units, monthlyRevenue };
}

// Derive vacant units from the diff: units in the Total Units listing that
// don't have a matching tenant in the Current Leases panel. The tenants table
// only carries active leases — vacancy is what's left of the unit list.
function deriveVacantUnits(tenants: any[], units: any[]): any[] {
  const tenantUnitKeys = new Set(tenants.map(t => (t.unit || "").trim().toLowerCase()));
  return units.filter((u: any) => !tenantUnitKeys.has((u.unit || "").trim().toLowerCase()));
}

interface KPIDrawerProps {
  open: boolean;
  onClose: () => void;
  kpiKey: string | null;
}

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#f4f4f5] dark:border-[#27272a] last:border-0">
      <span className="text-[12px] text-[#71717a] dark:text-[#a1a1aa]">{label}</span>
      <span className={`text-[12px] font-medium ${color || "text-[#18181b] dark:text-[#fafafa]"}`}>{value}</span>
    </div>
  );
}

function RevenueDetail() {
  const { tenants, monthlyRevenue } = useKpiData();
  const occupied = tenants.filter((t: any) => t.status !== "vacant" && t.monthlyRent > 0 && !t.tenant?.includes("Owner"));
  const totalRent = occupied.reduce((s: number, t: any) => s + t.monthlyRent, 0);
  const totalElectric = occupied.reduce((s: number, t: any) => s + t.monthlyElectric, 0);
  const top5 = [...occupied].sort((a: any, b: any) => b.monthlyRent - a.monthlyRent).slice(0, 5);
  const latest = monthlyRevenue[monthlyRevenue.length - 1];
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">Revenue Breakdown</p>
        <Field label="Base Rent" value={formatCurrency(totalRent)} />
        <Field label="Electric Recovery" value={formatCurrency(totalElectric)} />
        <Field label="CAM" value={formatCurrency(latest?.cam || 0)} />
        <Field label="Late Fees" value={formatCurrency(latest?.lateFees || 0)} />
        <Field label="Total Monthly" value={formatCurrency(latest?.total || 0)} color="text-[#18181b] dark:text-[#fafafa]" />
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">Top 5 Tenants by Rent</p>
        {top5.map(t => (
          <Field key={t.unit} label={`${t.unit} — ${t.tenant}`} value={`${formatCurrency(t.monthlyRent)}/mo`} />
        ))}
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">Trend (Last 9 Months)</p>
        {monthlyRevenue.map(m => (
          <Field key={m.month} label={m.month} value={formatCurrency(m.total)} />
        ))}
      </div>
    </div>
  );
}

function OccupancyDetail() {
  const { tenants, units } = useKpiData();
  const occupied = tenants.filter((t: any) => t.status !== "vacant");
  const vacantUnits = deriveVacantUnits(tenants, units);
  const totalUnitsCount = units.length > 0 ? units.length : tenants.length;
  const totalSqft = units.length > 0
    ? units.reduce((s: number, u: any) => s + (u.sqft || 0), 0)
    : tenants.reduce((s: number, t: any) => s + (t.sqft || 0), 0);
  const occSqft = occupied.reduce((s: number, t: any) => s + (t.sqft || 0), 0);
  const buildings = Array.from(new Set(units.map((u: any) => u.building).filter(Boolean))).sort() as string[];
  // Multi-unit leases pack several units into one tenant row — expand on
  // comma so the count is unit-level, not lease-level.
  const tenantUnitKeys = leasedUnitKeys(tenants);
  const occupiedCount = tenantUnitKeys.size;
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">Occupancy Summary</p>
        <Field label="Occupied Units" value={`${occupiedCount} of ${totalUnitsCount}`} />
        <Field label="Occupied SF" value={`${occSqft.toLocaleString()} of ${totalSqft.toLocaleString()}`} />
        <Field label="Occupancy Rate" value={totalUnitsCount > 0 ? `${Math.round((occupiedCount / totalUnitsCount) * 100)}%` : "—"} color="text-[#16a34a]" />
      </div>
      {buildings.length > 0 && (
        <div>
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">By Building</p>
          {buildings.map(b => {
            const all = units.filter((u: any) => u.building === b);
            const occ = all.filter((u: any) => tenantUnitKeys.has((u.unit || "").trim().toLowerCase()));
            return <Field key={b} label={`Building ${b}`} value={`${occ.length}/${all.length} units`} />;
          })}
        </div>
      )}
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">Vacant Units</p>
        {vacantUnits.length === 0 ? (
          <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a]">No vacant units.</p>
        ) : vacantUnits.map((u: any) => (
          <Field key={u.unit} label={u.unit} value={`${(u.sqft || 0).toLocaleString()} SF`} />
        ))}
      </div>
    </div>
  );
}

function PastDueDetail() {
  const { tenants } = useKpiData();
  // Status-driven so the site plan drawer's manual Past Due toggle flows
  // through here without needing the synced pastDueAmount to be non-zero.
  const pastDue = tenants.filter((t: any) => t.status === "past_due");
  const total = pastDue.reduce((s: number, t: any) => s + (t.pastDueAmount || 0), 0);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">Past Due Summary</p>
        <Field label="Total Past Due" value={formatCurrency(total)} color="text-[#dc2626]" />
        <Field label="Tenants" value={`${pastDue.length}`} />
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">Delinquent Tenants</p>
        {pastDue.length === 0 ? (
          <p className="text-[11px] text-[#16a34a]">No delinquent tenants.</p>
        ) : pastDue.map((t: any) => (
          <div key={t.unit} className="py-2 border-b border-[#f4f4f5] dark:border-[#27272a] last:border-0">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-[#18181b] dark:text-[#fafafa]">{t.unit} — {t.tenant}</span>
              <span className="text-[12px] font-medium text-[#dc2626]">{formatCurrency(t.pastDueAmount)}</span>
            </div>
            <p className="text-[10px] text-[#a1a1aa] mt-0.5">Last paid: {t.lastPaymentDate} · {t.delinquencyStage || "past_due"}</p>
            {t.notes && <p className="text-[10px] text-[#71717a] mt-0.5">{t.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function VacantDetail() {
  const { tenants, units } = useKpiData();
  const vacantUnits = deriveVacantUnits(tenants, units);
  const totalSF = vacantUnits.reduce((s: number, u: any) => s + (u.sqft || 0), 0);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">Vacant Units</p>
        <Field label="Total Vacant" value={`${vacantUnits.length} units`} />
        <Field label="Total Available SF" value={totalSF.toLocaleString()} />
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">Unit Details</p>
        {vacantUnits.length === 0 ? (
          <p className="text-[11px] text-[#16a34a]">Fully occupied.</p>
        ) : vacantUnits.map((u: any) => (
          <div key={u.unit} className="py-2 border-b border-[#f4f4f5] dark:border-[#27272a] last:border-0">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-[#18181b] dark:text-[#fafafa]">{u.unit}{u.building ? ` (Bldg ${u.building})` : ""}</span>
              <span className="text-[12px] text-[#71717a]">{(u.sqft || 0).toLocaleString()} SF</span>
            </div>
            {u.makeReady && <p className="text-[10px] text-[#d97706] mt-0.5">Make-ready required</p>}
            {u.splittable && <p className="text-[10px] text-[#2563eb] mt-0.5">Splittable: {u.splitDetail}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ElectricDetail() {
  const { tenants } = useKpiData();
  const netLease = tenants.filter((t: any) => t.leaseType === "Office Net Lease" && t.tenant && !t.tenant.includes("Owner"));
  const missing = netLease.filter((t: any) => !t.electricPosted);
  const posted = netLease.filter((t: any) => t.electricPosted);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">Electric Posting Status</p>
        <Field label="Net Lease Tenants" value={`${netLease.length}`} />
        <Field label="Posted" value={`${posted.length}`} color="text-[#16a34a]" />
        <Field label="Missing" value={`${missing.length}`} color={missing.length > 0 ? "text-[#dc2626]" : "text-[#16a34a]"} />
      </div>
      {missing.length > 0 && (
        <div>
          <p className="text-[10px] text-[#dc2626] uppercase tracking-wide font-medium mb-2">Not Posted</p>
          {missing.map((t: any) => (
            <Field key={t.unit} label={`${t.unit} — ${t.tenant}`} value={`~${formatCurrency(t.monthlyElectric)}/mo`} color="text-[#dc2626]" />
          ))}
        </div>
      )}
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">All Net Lease</p>
        {netLease.length === 0 ? (
          <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a]">No net-lease tenants.</p>
        ) : netLease.map((t: any) => (
          <Field key={t.unit} label={`${t.unit} — ${t.tenant}`} value={t.electricPosted ? "Posted" : "NOT POSTED"} color={t.electricPosted ? "text-[#16a34a]" : "text-[#dc2626]"} />
        ))}
      </div>
    </div>
  );
}

function ExpiringDetail() {
  const { tenants } = useKpiData();
  const expiring = tenants.filter((t: any) => t.status !== "vacant" && isExpiringWithin(t.leaseTo, 90));
  const totalRent = expiring.reduce((s: number, t: any) => s + t.monthlyRent, 0);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">Expiring Leases</p>
        <Field label="Expiring Within 90 Days" value={`${expiring.length} leases`} />
        <Field label="At-Risk Revenue" value={`${formatCurrency(totalRent)}/mo`} color="text-[#d97706]" />
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium mb-2">Lease Details</p>
        {expiring.length === 0 ? (
          <p className="text-[11px] text-[#a1a1aa] dark:text-[#71717a]">No leases expiring in the next 90 days.</p>
        ) : expiring.map((t: any) => (
          <div key={t.unit} className="py-2 border-b border-[#f4f4f5] dark:border-[#27272a] last:border-0">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[12px] font-medium text-[#18181b] dark:text-[#fafafa] truncate min-w-0 flex-1" title={`${t.unit} — ${t.tenant}`}>
                {t.unit} — {t.tenant}
              </span>
              <span className="text-[12px] text-[#d97706] whitespace-nowrap flex-shrink-0">{formatLeaseDate(t.leaseTo)}</span>
            </div>
            <p className="text-[10px] text-[#71717a] mt-0.5">{formatCurrency(t.monthlyRent)}/mo · {t.sqft.toLocaleString()} SF · Bldg {t.building}</p>
            {t.notes && <p className="text-[10px] text-[#a1a1aa] mt-0.5">{t.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

const titles: Record<string, string> = {
  revenue: "Monthly Revenue",
  occupancy: "Occupancy Rate",
  pastdue: "Past Due",
  vacant: "Vacant Units",
  electric: "Electric Posting",
  expiring: "Expiring Leases",
};

export default function KPIDrawer({ open, kpiKey, onClose }: KPIDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted || !kpiKey) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className={`absolute inset-0 bg-black transition-opacity duration-200 ${visible ? "opacity-20" : "opacity-0"}`} onClick={onClose} />
      <div className={`relative w-full sm:w-[440px] bg-white dark:bg-[#18181b] h-full overflow-y-auto border-l border-[#e4e4e7] dark:border-[#3f3f46] transition-transform duration-200 ease-out ${visible ? "translate-x-0" : "translate-x-full"}`}>
        <div className="sticky top-0 bg-white dark:bg-[#18181b] border-b border-[#e4e4e7] dark:border-[#3f3f46] px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-[16px] font-semibold text-[#18181b] dark:text-[#fafafa]">{titles[kpiKey] || kpiKey}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] rounded cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-5">
          {kpiKey === "revenue" && <RevenueDetail />}
          {kpiKey === "occupancy" && <OccupancyDetail />}
          {kpiKey === "pastdue" && <PastDueDetail />}
          {kpiKey === "vacant" && <VacantDetail />}
          {kpiKey === "electric" && <ElectricDetail />}
          {kpiKey === "expiring" && <ExpiringDetail />}
        </div>
      </div>
    </div>
  );
}

// Renders an ISO date as "Jul 14, 2026". Returns the input untouched if it
// doesn't look like a YYYY-MM-DD so we don't accidentally swallow values
// the parser doesn't understand.
function formatLeaseDate(iso?: string): string {
  if (!iso || iso.length < 10) return iso || "—";
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

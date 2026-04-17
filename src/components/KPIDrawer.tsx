"use client";
import { useEffect, useState } from "react";
import { tenants, monthlyRevenue, formatCurrency } from "@/data/_seed_tenants";

interface KPIDrawerProps {
  open: boolean;
  onClose: () => void;
  kpiKey: string | null;
}

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#f4f4f5] last:border-0">
      <span className="text-[12px] text-[#71717a]">{label}</span>
      <span className={`text-[12px] font-medium ${color || "text-[#18181b]"}`}>{value}</span>
    </div>
  );
}

function RevenueDetail() {
  const occupied = tenants.filter(t => t.status !== "vacant" && t.monthlyRent > 0 && !t.tenant.includes("Owner"));
  const totalRent = occupied.reduce((s, t) => s + t.monthlyRent, 0);
  const totalElectric = occupied.reduce((s, t) => s + t.monthlyElectric, 0);
  const top5 = [...occupied].sort((a, b) => b.monthlyRent - a.monthlyRent).slice(0, 5);
  const latest = monthlyRevenue[monthlyRevenue.length - 1];
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-2">Revenue Breakdown</p>
        <Field label="Base Rent" value={formatCurrency(totalRent)} />
        <Field label="Electric Recovery" value={formatCurrency(totalElectric)} />
        <Field label="CAM" value={formatCurrency(latest?.cam || 0)} />
        <Field label="Late Fees" value={formatCurrency(latest?.lateFees || 0)} />
        <Field label="Total Monthly" value={formatCurrency(latest?.total || 0)} color="text-[#18181b]" />
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-2">Top 5 Tenants by Rent</p>
        {top5.map(t => (
          <Field key={t.unit} label={`${t.unit} — ${t.tenant}`} value={`${formatCurrency(t.monthlyRent)}/mo`} />
        ))}
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-2">Trend (Last 9 Months)</p>
        {monthlyRevenue.map(m => (
          <Field key={m.month} label={m.month} value={formatCurrency(m.total)} />
        ))}
      </div>
    </div>
  );
}

function OccupancyDetail() {
  const occupied = tenants.filter(t => t.status !== "vacant");
  const vacant = tenants.filter(t => t.status === "vacant");
  const totalSqft = tenants.reduce((s, t) => s + t.sqft, 0);
  const occSqft = occupied.reduce((s, t) => s + t.sqft, 0);
  const buildings = ["A", "C", "D"] as const;
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-2">Occupancy Summary</p>
        <Field label="Occupied Units" value={`${occupied.length} of ${tenants.length}`} />
        <Field label="Occupied SF" value={`${occSqft.toLocaleString()} of ${totalSqft.toLocaleString()}`} />
        <Field label="Occupancy Rate" value={`${Math.round((occSqft / totalSqft) * 100)}%`} color="text-[#16a34a]" />
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-2">By Building</p>
        {buildings.map(b => {
          const all = tenants.filter(t => t.building === b);
          const occ = all.filter(t => t.status !== "vacant");
          return <Field key={b} label={`Building ${b}`} value={`${occ.length}/${all.length} units`} />;
        })}
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-2">Vacant Units</p>
        {vacant.map(t => (
          <Field key={t.unit} label={t.unit} value={`${t.sqft.toLocaleString()} SF${t.notes ? ` — ${t.notes}` : ""}`} />
        ))}
      </div>
    </div>
  );
}

function PastDueDetail() {
  const pastDue = tenants.filter(t => t.pastDueAmount > 0);
  const total = pastDue.reduce((s, t) => s + t.pastDueAmount, 0);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-2">Past Due Summary</p>
        <Field label="Total Past Due" value={formatCurrency(total)} color="text-[#dc2626]" />
        <Field label="Tenants" value={`${pastDue.length}`} />
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-2">Delinquent Tenants</p>
        {pastDue.map(t => (
          <div key={t.unit} className="py-2 border-b border-[#f4f4f5] last:border-0">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-[#18181b]">{t.unit} — {t.tenant}</span>
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
  const vacant = tenants.filter(t => t.status === "vacant");
  const totalSF = vacant.reduce((s, t) => s + t.sqft, 0);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-2">Vacant Units</p>
        <Field label="Total Vacant" value={`${vacant.length} units`} />
        <Field label="Total Available SF" value={totalSF.toLocaleString()} />
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-2">Unit Details</p>
        {vacant.map(t => (
          <div key={t.unit} className="py-2 border-b border-[#f4f4f5] last:border-0">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-[#18181b]">{t.unit} (Bldg {t.building})</span>
              <span className="text-[12px] text-[#71717a]">{t.sqft.toLocaleString()} SF</span>
            </div>
            {t.makeReady && <p className="text-[10px] text-[#d97706] mt-0.5">Make-ready required</p>}
            {t.splittable && <p className="text-[10px] text-[#2563eb] mt-0.5">Splittable: {t.splitDetail}</p>}
            {t.notes && <p className="text-[10px] text-[#a1a1aa] mt-0.5">{t.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ElectricDetail() {
  const netLease = tenants.filter(t => t.leaseType === "Office Net Lease" && t.tenant && !t.tenant.includes("Owner"));
  const missing = netLease.filter(t => !t.electricPosted);
  const posted = netLease.filter(t => t.electricPosted);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-2">Electric Posting Status</p>
        <Field label="Net Lease Tenants" value={`${netLease.length}`} />
        <Field label="Posted" value={`${posted.length}`} color="text-[#16a34a]" />
        <Field label="Missing" value={`${missing.length}`} color={missing.length > 0 ? "text-[#dc2626]" : "text-[#16a34a]"} />
      </div>
      {missing.length > 0 && (
        <div>
          <p className="text-[10px] text-[#dc2626] uppercase tracking-wide font-medium mb-2">Not Posted</p>
          {missing.map(t => (
            <Field key={t.unit} label={`${t.unit} — ${t.tenant}`} value={`~${formatCurrency(t.monthlyElectric)}/mo`} color="text-[#dc2626]" />
          ))}
        </div>
      )}
      <div>
        <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-2">All Net Lease</p>
        {netLease.map(t => (
          <Field key={t.unit} label={`${t.unit} — ${t.tenant}`} value={t.electricPosted ? "Posted" : "NOT POSTED"} color={t.electricPosted ? "text-[#16a34a]" : "text-[#dc2626]"} />
        ))}
      </div>
    </div>
  );
}

function ExpiringDetail() {
  const expiring = tenants.filter(t => t.status === "expiring_soon");
  const totalRent = expiring.reduce((s, t) => s + t.monthlyRent, 0);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-2">Expiring Leases</p>
        <Field label="Expiring Within 90 Days" value={`${expiring.length} leases`} />
        <Field label="At-Risk Revenue" value={`${formatCurrency(totalRent)}/mo`} color="text-[#d97706]" />
      </div>
      <div>
        <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide font-medium mb-2">Lease Details</p>
        {expiring.map(t => (
          <div key={t.unit} className="py-2 border-b border-[#f4f4f5] last:border-0">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-[#18181b]">{t.unit} — {t.tenant}</span>
              <span className="text-[12px] text-[#d97706]">{t.leaseTo}</span>
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
      <div className={`relative w-full sm:w-[440px] bg-white h-full overflow-y-auto border-l border-[#e4e4e7] transition-transform duration-200 ease-out ${visible ? "translate-x-0" : "translate-x-full"}`}>
        <div className="sticky top-0 bg-white border-b border-[#e4e4e7] px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-[16px] font-semibold text-[#18181b]">{titles[kpiKey] || kpiKey}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-[#f4f4f5] rounded cursor-pointer">
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

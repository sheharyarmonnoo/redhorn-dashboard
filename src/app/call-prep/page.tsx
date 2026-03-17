"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { tenants, formatCurrency, monthlyRevenue } from "@/data/tenants";
import PageHeader from "@/components/PageHeader";

interface ActionItemRecord {
  id: string;
  text: string;
  done: boolean;
  date: string;
}

export default function CallPrepPage() {
  const [copied, setCopied] = useState(false);
  const [actionItems, setActionItems] = useState<ActionItemRecord[]>([]);
  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("call-prep-actions");
    if (saved) setActionItems(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (actionItems.length > 0) {
      localStorage.setItem("call-prep-actions", JSON.stringify(actionItems));
    }
  }, [actionItems]);

  const today = new Date("2026-03-17");

  // Portfolio snapshot
  const totalUnits = tenants.length;
  const occupiedUnits = tenants.filter((t) => t.status !== "vacant").length;
  const vacantUnits = tenants.filter((t) => t.status === "vacant").length;
  const occupancyPct = Math.round((occupiedUnits / totalUnits) * 100);
  const totalMonthlyRent = tenants.reduce((s, t) => s + t.monthlyRent, 0);
  const totalPastDue = tenants.reduce((s, t) => s + t.pastDueAmount, 0);
  const latestRevenue = monthlyRevenue[monthlyRevenue.length - 1];

  // Past due tenants
  const pastDueTenants = useMemo(
    () =>
      tenants
        .filter((t) => t.pastDueAmount > 0)
        .sort((a, b) => b.pastDueAmount - a.pastDueAmount),
    []
  );

  // Posting status
  const netLeaseTenants = useMemo(
    () =>
      tenants.filter(
        (t) =>
          t.leaseType === "Office Net Lease" &&
          t.status !== "vacant" &&
          !t.tenant.includes("Owner") &&
          t.monthlyElectric > 0
      ),
    []
  );
  const postedCount = netLeaseTenants.filter((t) => t.electricPosted).length;
  const unpostedCount = netLeaseTenants.length - postedCount;
  const unpostedTenants = netLeaseTenants.filter((t) => !t.electricPosted);

  // Expiring leases
  const expiringLeases = useMemo(
    () =>
      tenants
        .filter((t) => {
          if (t.status === "vacant" || t.tenant.includes("Owner")) return false;
          if (!t.leaseTo) return false;
          const end = new Date(t.leaseTo);
          const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          return days <= 180;
        })
        .map((t) => {
          const end = new Date(t.leaseTo);
          const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          return { ...t, daysRemaining: days };
        })
        .sort((a, b) => a.daysRemaining - b.daysRemaining),
    []
  );

  // Vacant units
  const vacantTenants = useMemo(
    () => tenants.filter((t) => t.status === "vacant"),
    []
  );

  // Build summary text
  const summaryText = useMemo(() => {
    const lines: string[] = [];
    lines.push("HOLLISTER BUSINESS PARK — WEEKLY PM CALL SUMMARY");
    lines.push(`Date: ${today.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);
    lines.push("");

    lines.push("--- PORTFOLIO SNAPSHOT ---");
    lines.push(`Occupancy: ${occupancyPct}% (${occupiedUnits}/${totalUnits} units)`);
    lines.push(`Monthly Revenue: ${formatCurrency(latestRevenue.total)}`);
    lines.push(`Monthly Base Rent: ${formatCurrency(totalMonthlyRent)}`);
    lines.push(`Total Past Due: ${formatCurrency(totalPastDue)}`);
    lines.push(`Vacant Units: ${vacantUnits}`);
    lines.push("");

    lines.push("--- PAST DUE ACCOUNTS ---");
    if (pastDueTenants.length === 0) {
      lines.push("No past due accounts.");
    } else {
      for (const t of pastDueTenants) {
        const stage = (t.delinquencyStage || "past_due").replace(/_/g, " ");
        lines.push(`  ${t.unit} - ${t.tenant}: ${formatCurrency(t.pastDueAmount)} (${stage})`);
      }
    }
    lines.push("");

    lines.push("--- POSTING STATUS ---");
    lines.push(`Electric charges posted: ${postedCount}/${netLeaseTenants.length}`);
    if (unpostedTenants.length > 0) {
      lines.push("NOT posted:");
      for (const t of unpostedTenants) {
        lines.push(`  ${t.unit} - ${t.tenant}: ${formatCurrency(t.monthlyElectric)}`);
      }
    }
    lines.push("");

    lines.push("--- LEASE ACTIVITY ---");
    if (expiringLeases.length === 0) {
      lines.push("No leases expiring within 180 days.");
    } else {
      for (const t of expiringLeases) {
        const label = t.daysRemaining < 0 ? `EXPIRED (${Math.abs(t.daysRemaining)}d ago)` : `${t.daysRemaining}d remaining`;
        lines.push(`  ${t.unit} - ${t.tenant}: ${t.leaseTo} (${label}) - ${formatCurrency(t.monthlyRent)}/mo`);
      }
    }
    lines.push("");

    lines.push("--- VACANT UNITS ---");
    for (const t of vacantTenants) {
      const details = [];
      if (t.makeReady) details.push("needs make-ready");
      if (t.splittable) details.push(`splittable: ${t.splitDetail}`);
      if (t.notes) details.push(t.notes);
      lines.push(`  ${t.unit}: ${t.sqft.toLocaleString()} SF${details.length > 0 ? ` — ${details.join("; ")}` : ""}`);
    }
    lines.push("");

    lines.push("--- ACTION ITEMS ---");
    if (actionItems.length === 0) {
      lines.push("No action items recorded.");
    } else {
      for (const item of actionItems) {
        lines.push(`  [${item.done ? "x" : " "}] ${item.text}`);
      }
    }

    return lines.join("\n");
  }, [
    occupancyPct, occupiedUnits, totalUnits, latestRevenue, totalMonthlyRent,
    totalPastDue, vacantUnits, pastDueTenants, postedCount, netLeaseTenants.length,
    unpostedTenants, expiringLeases, vacantTenants, actionItems, today,
  ]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(summaryText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [summaryText]);

  const emailSummary = useCallback(() => {
    const subject = encodeURIComponent(`Hollister Business Park — Weekly Summary ${today.toISOString().split("T")[0]}`);
    const body = encodeURIComponent(summaryText);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  }, [summaryText, today]);

  const addActionItem = useCallback(() => {
    if (!newItem.trim()) return;
    const item: ActionItemRecord = {
      id: Date.now().toString(),
      text: newItem.trim(),
      done: false,
      date: today.toISOString().split("T")[0],
    };
    setActionItems((prev) => [...prev, item]);
    setNewItem("");
  }, [newItem, today]);

  const toggleActionItem = useCallback((id: string) => {
    setActionItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    );
  }, []);

  const removeActionItem = useCallback((id: string) => {
    setActionItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return (
    <>
      <PageHeader title="Call Prep" subtitle="Auto-generated weekly PM call summary">
        <button
          onClick={copyToClipboard}
          className={`text-sm border rounded px-3 py-1.5 transition-colors ${
            copied
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-white border-[#e4e4e7] text-[#18181b] hover:bg-[#f4f4f5]"
          }`}
        >
          {copied ? "Copied" : "Copy to Clipboard"}
        </button>
        <button
          onClick={emailSummary}
          className="text-sm border border-[#e4e4e7] rounded px-3 py-1.5 bg-white text-[#18181b] hover:bg-[#f4f4f5] transition-colors"
        >
          Email Summary
        </button>
      </PageHeader>

      <div className="space-y-6 max-w-3xl">
        {/* Portfolio Snapshot */}
        <section>
          <h2 className="text-sm font-semibold text-[#18181b] mb-3 uppercase tracking-wide">Portfolio Snapshot</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
              <div className="text-xs text-[#71717a]">Occupancy</div>
              <div className="text-lg font-semibold mt-0.5">{occupancyPct}%</div>
              <div className="text-[10px] text-[#a1a1aa]">{occupiedUnits}/{totalUnits} units</div>
            </div>
            <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
              <div className="text-xs text-[#71717a]">Monthly Revenue</div>
              <div className="text-lg font-semibold mt-0.5">{formatCurrency(latestRevenue.total)}</div>
            </div>
            <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
              <div className="text-xs text-[#71717a]">Total Past Due</div>
              <div className="text-lg font-semibold text-red-600 mt-0.5">{formatCurrency(totalPastDue)}</div>
            </div>
            <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
              <div className="text-xs text-[#71717a]">Vacant</div>
              <div className="text-lg font-semibold mt-0.5">{vacantUnits} units</div>
            </div>
          </div>
        </section>

        {/* Past Due */}
        <section>
          <h2 className="text-sm font-semibold text-[#18181b] mb-3 uppercase tracking-wide">Past Due Accounts</h2>
          {pastDueTenants.length === 0 ? (
            <p className="text-sm text-[#71717a]">No past due accounts.</p>
          ) : (
            <div className="space-y-2">
              {pastDueTenants.map((t) => (
                <div key={t.unit} className="border border-[#e4e4e7] bg-white rounded px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-[#18181b]">
                      {t.unit} — {t.tenant}
                    </div>
                    <div className="text-xs text-[#71717a] mt-0.5">
                      Stage: {(t.delinquencyStage || "past_due").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      {t.delinquencyDate && ` (since ${t.delinquencyDate})`}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-red-600">{formatCurrency(t.pastDueAmount)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Posting Status */}
        <section>
          <h2 className="text-sm font-semibold text-[#18181b] mb-3 uppercase tracking-wide">Posting Status</h2>
          <div className="border border-[#e4e4e7] bg-white rounded px-4 py-3 mb-2">
            <div className="text-sm">
              Electric charges posted: <span className="font-semibold">{postedCount}</span> / {netLeaseTenants.length}
              {unpostedCount > 0 && (
                <span className="text-red-600 ml-2">({unpostedCount} missing)</span>
              )}
            </div>
          </div>
          {unpostedTenants.length > 0 && (
            <div className="space-y-1">
              {unpostedTenants.map((t) => (
                <div key={t.unit} className="border border-red-200 bg-red-50 rounded px-4 py-2 flex items-center justify-between text-sm">
                  <span>
                    {t.unit} — {t.tenant}
                  </span>
                  <span className="font-medium text-red-600">{formatCurrency(t.monthlyElectric)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Lease Activity */}
        <section>
          <h2 className="text-sm font-semibold text-[#18181b] mb-3 uppercase tracking-wide">Lease Activity</h2>
          {expiringLeases.length === 0 ? (
            <p className="text-sm text-[#71717a]">No leases expiring within 180 days.</p>
          ) : (
            <div className="space-y-2">
              {expiringLeases.map((t) => (
                <div key={t.unit} className="border border-[#e4e4e7] bg-white rounded px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-[#18181b]">
                      {t.unit} — {t.tenant}
                    </div>
                    <div className="text-xs text-[#71717a] mt-0.5">
                      Expires {t.leaseTo} &middot;{" "}
                      <span className={t.daysRemaining < 0 ? "text-red-600 font-medium" : t.daysRemaining <= 90 ? "text-red-600" : "text-amber-600"}>
                        {t.daysRemaining < 0 ? `Expired ${Math.abs(t.daysRemaining)}d ago` : `${t.daysRemaining}d remaining`}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-[#18181b]">{formatCurrency(t.monthlyRent)}/mo</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Vacant Units */}
        <section>
          <h2 className="text-sm font-semibold text-[#18181b] mb-3 uppercase tracking-wide">Vacant Units</h2>
          <div className="space-y-2">
            {vacantTenants.map((t) => (
              <div key={t.unit} className="border border-[#e4e4e7] bg-white rounded px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#18181b]">{t.unit}</span>
                  <span className="text-xs text-[#71717a]">{t.sqft.toLocaleString()} SF</span>
                </div>
                {(t.makeReady || t.splittable || t.notes) && (
                  <div className="text-xs text-[#71717a] mt-1">
                    {t.makeReady && <span className="inline-block bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded mr-1 text-[10px] font-medium">Make-Ready</span>}
                    {t.splittable && <span className="inline-block bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded mr-1 text-[10px] font-medium">Splittable: {t.splitDetail}</span>}
                    {t.notes && <span className="text-[#a1a1aa]">{t.notes}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Action Items */}
        <section>
          <h2 className="text-sm font-semibold text-[#18181b] mb-3 uppercase tracking-wide">Action Items</h2>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addActionItem(); }}
              placeholder="Add action item..."
              className="flex-1 text-sm border border-[#e4e4e7] rounded px-3 py-1.5 bg-white"
            />
            <button
              onClick={addActionItem}
              className="text-sm px-3 py-1.5 bg-[#18181b] text-white rounded hover:bg-zinc-800 transition-colors"
            >
              Add
            </button>
          </div>
          {actionItems.length === 0 ? (
            <p className="text-xs text-[#a1a1aa]">No action items yet. Add items during the call.</p>
          ) : (
            <div className="space-y-1">
              {actionItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 border border-[#e4e4e7] bg-white rounded px-3 py-2"
                >
                  <button
                    onClick={() => toggleActionItem(item.id)}
                    className={`w-4 h-4 border rounded flex-shrink-0 flex items-center justify-center ${
                      item.done ? "bg-[#18181b] border-[#18181b]" : "border-[#d4d4d8]"
                    }`}
                  >
                    {item.done && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <span className={`flex-1 text-sm ${item.done ? "line-through text-[#a1a1aa]" : "text-[#18181b]"}`}>
                    {item.text}
                  </span>
                  <button
                    onClick={() => removeActionItem(item.id)}
                    className="text-[#a1a1aa] hover:text-red-500 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M4 4l6 6M10 4l-6 6" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

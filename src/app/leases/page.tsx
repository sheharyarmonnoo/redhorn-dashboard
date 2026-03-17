"use client";

import { useState, useMemo, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef } from "ag-grid-community";
import { tenants, Tenant, formatCurrency } from "@/data/tenants";
import PageHeader from "@/components/PageHeader";
import Drawer from "@/components/Drawer";

ModuleRegistry.registerModules([AllCommunityModule]);

type TabFilter = "all" | "expired" | "critical" | "warning" | "ok";

const RENEWAL_STAGES = ["Not Started", "Renewal Sent", "Tenant Responded", "New Terms", "Executed"] as const;

interface LeaseRow {
  unit: string;
  tenant: string;
  building: string;
  leaseStart: string;
  leaseEnd: string;
  daysRemaining: number;
  monthlyRent: number;
  urgency: string;
  tenantData: Tenant;
}

function getDaysRemaining(leaseTo: string): number {
  if (!leaseTo) return -9999;
  const today = new Date("2026-03-17");
  const end = new Date(leaseTo);
  return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgency(days: number): string {
  if (days < 0) return "Expired";
  if (days <= 90) return "Critical";
  if (days <= 180) return "Warning";
  return "OK";
}

export default function LeasesPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<LeaseRow | null>(null);
  const [tab, setTab] = useState<TabFilter>("all");
  const [renewalStages, setRenewalStages] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lease-renewal-stages");
      if (saved) return JSON.parse(saved);
    }
    return {};
  });

  const leaseRows: LeaseRow[] = useMemo(
    () =>
      tenants
        .filter((t) => t.status !== "vacant" && !t.tenant.includes("Owner"))
        .map((t) => {
          const days = getDaysRemaining(t.leaseTo);
          return {
            unit: t.unit,
            tenant: t.tenant,
            building: t.building,
            leaseStart: t.leaseFrom,
            leaseEnd: t.leaseTo,
            daysRemaining: days,
            monthlyRent: t.monthlyRent,
            urgency: getUrgency(days),
            tenantData: t,
          };
        })
        .sort((a, b) => a.daysRemaining - b.daysRemaining),
    []
  );

  const filteredRows = useMemo(() => {
    if (tab === "all") return leaseRows;
    if (tab === "expired") return leaseRows.filter((r) => r.urgency === "Expired");
    if (tab === "critical") return leaseRows.filter((r) => r.urgency === "Critical");
    if (tab === "warning") return leaseRows.filter((r) => r.urgency === "Warning");
    return leaseRows.filter((r) => r.urgency === "OK");
  }, [leaseRows, tab]);

  // Summary: rent at risk by category
  const rentAtRisk = useMemo(() => {
    const totals = { expired: 0, critical: 0, warning: 0 };
    for (const r of leaseRows) {
      if (r.urgency === "Expired") totals.expired += r.monthlyRent;
      if (r.urgency === "Critical") totals.critical += r.monthlyRent;
      if (r.urgency === "Warning") totals.warning += r.monthlyRent;
    }
    return totals;
  }, [leaseRows]);

  const columnDefs = useMemo<ColDef<LeaseRow>[]>(
    () => [
      { headerName: "Unit", field: "unit", width: 90 },
      { headerName: "Tenant", field: "tenant", flex: 1, minWidth: 160 },
      { headerName: "Lease Start", field: "leaseStart", width: 110 },
      { headerName: "Lease End", field: "leaseEnd", width: 110 },
      {
        headerName: "Days Left",
        field: "daysRemaining",
        width: 100,
        cellRenderer: (params: { value: number }) => {
          const v = params.value;
          if (v < 0) return `<span style="color:#dc2626;font-weight:600">${v}d</span>`;
          if (v <= 90) return `<span style="color:#dc2626;font-weight:600">${v}d</span>`;
          if (v <= 180) return `<span style="color:#d97706;font-weight:600">${v}d</span>`;
          return `<span style="color:#16a34a">${v}d</span>`;
        },
      },
      {
        headerName: "Monthly Rent",
        field: "monthlyRent",
        width: 120,
        valueFormatter: (params: { value: number }) => formatCurrency(params.value),
      },
      {
        headerName: "Status",
        field: "urgency",
        width: 100,
        cellRenderer: (params: { value: string }) => {
          const colors: Record<string, string> = {
            Expired: "#dc2626",
            Critical: "#dc2626",
            Warning: "#d97706",
            OK: "#16a34a",
          };
          const bg: Record<string, string> = {
            Expired: "#fef2f2",
            Critical: "#fef2f2",
            Warning: "#fffbeb",
            OK: "#f0fdf4",
          };
          return `<span style="display:inline-block;padding:1px 8px;border-radius:4px;font-size:11px;font-weight:500;color:${colors[params.value]};background:${bg[params.value]}">${params.value}</span>`;
        },
      },
    ],
    []
  );

  const onRowClicked = useCallback((event: { data: LeaseRow | undefined }) => {
    if (event.data) {
      setSelected(event.data);
      setDrawerOpen(true);
    }
  }, []);

  const advanceRenewal = useCallback(
    (unit: string) => {
      const current = renewalStages[unit] || "Not Started";
      const currentIdx = RENEWAL_STAGES.indexOf(current as typeof RENEWAL_STAGES[number]);
      const nextIdx = Math.min(currentIdx + 1, RENEWAL_STAGES.length - 1);
      const updated = { ...renewalStages, [unit]: RENEWAL_STAGES[nextIdx] };
      setRenewalStages(updated);
      localStorage.setItem("lease-renewal-stages", JSON.stringify(updated));
    },
    [renewalStages]
  );

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: leaseRows.length },
    { key: "expired", label: "Expired", count: leaseRows.filter((r) => r.urgency === "Expired").length },
    { key: "critical", label: "Critical (<90d)", count: leaseRows.filter((r) => r.urgency === "Critical").length },
    { key: "warning", label: "Warning (90-180d)", count: leaseRows.filter((r) => r.urgency === "Warning").length },
    { key: "ok", label: "OK (180d+)", count: leaseRows.filter((r) => r.urgency === "OK").length },
  ];

  return (
    <>
      <PageHeader title="Leases" subtitle="Lease expiration tracker and renewal workflow" />

      {/* Rent at risk summary */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
          <div className="text-xs text-[#71717a] uppercase tracking-wide font-medium">Expired — At Risk</div>
          <div className="text-lg font-semibold text-red-600 mt-0.5">{formatCurrency(rentAtRisk.expired)}/mo</div>
        </div>
        <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
          <div className="text-xs text-[#71717a] uppercase tracking-wide font-medium">Critical — At Risk</div>
          <div className="text-lg font-semibold text-red-600 mt-0.5">{formatCurrency(rentAtRisk.critical)}/mo</div>
        </div>
        <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
          <div className="text-xs text-[#71717a] uppercase tracking-wide font-medium">Warning — At Risk</div>
          <div className="text-lg font-semibold text-amber-600 mt-0.5">{formatCurrency(rentAtRisk.warning)}/mo</div>
        </div>
      </div>

      {/* Tab filters */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs font-medium px-3 py-1.5 rounded transition-colors whitespace-nowrap ${
              tab === t.key
                ? "bg-[#18181b] text-white"
                : "bg-white text-[#71717a] border border-[#e4e4e7] hover:bg-[#f4f4f5]"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* AG Grid */}
      <div className="border border-[#e4e4e7] bg-white rounded overflow-auto">
        <div className="ag-theme-alpine" style={{ width: "100%", minWidth: 600 }}>
          <AgGridReact<LeaseRow>
            rowData={filteredRows}
            columnDefs={columnDefs}
            domLayout="autoHeight"
            onRowClicked={onRowClicked}
            suppressCellFocus
            getRowId={(params) => params.data.unit}
          />
        </div>
      </div>

      {/* Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `${selected.unit} — Lease Detail` : ""}
        subtitle={selected ? `${selected.tenant} · Building ${selected.building}` : ""}
      >
        {selected && (
          <div className="space-y-5">
            {/* Urgency badge */}
            <div>
              <span
                className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded ${
                  selected.urgency === "Expired" || selected.urgency === "Critical"
                    ? "bg-red-100 text-red-700"
                    : selected.urgency === "Warning"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-green-100 text-green-700"
                }`}
              >
                {selected.urgency} — {selected.daysRemaining}d remaining
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-[#71717a] text-xs block">Lease Start</span>
                <span className="font-medium">{selected.leaseStart}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Lease End</span>
                <span className="font-medium">{selected.leaseEnd}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Monthly Rent</span>
                <span className="font-semibold">{formatCurrency(selected.monthlyRent)}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Annualized</span>
                <span className="font-semibold">{formatCurrency(selected.monthlyRent * 12)}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Square Feet</span>
                <span className="font-medium">{selected.tenantData.sqft.toLocaleString()} SF</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">$/SF/yr</span>
                <span className="font-medium">
                  {selected.tenantData.sqft > 0
                    ? formatCurrency(Math.round((selected.monthlyRent * 12) / selected.tenantData.sqft))
                    : "—"}
                </span>
              </div>
            </div>

            {/* Renewal workflow */}
            <div>
              <span className="text-[#71717a] text-xs block mb-2">Renewal Workflow</span>
              <div className="space-y-1">
                {RENEWAL_STAGES.map((stage, i) => {
                  const current = renewalStages[selected.unit] || "Not Started";
                  const currentIdx = RENEWAL_STAGES.indexOf(current as typeof RENEWAL_STAGES[number]);
                  const isPast = i < currentIdx;
                  const isCurrent = i === currentIdx;
                  return (
                    <div
                      key={stage}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${
                        isCurrent
                          ? "bg-[#18181b] text-white font-medium"
                          : isPast
                          ? "bg-[#f4f4f5] text-[#71717a]"
                          : "text-[#a1a1aa]"
                      }`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          background: isCurrent ? "#fff" : isPast ? "#16a34a" : "#d4d4d8",
                        }}
                      />
                      {stage}
                      {isPast && <span className="ml-auto text-[10px]">Done</span>}
                      {isCurrent && <span className="ml-auto text-[10px]">Current</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {selected.tenantData.notes && (
              <div>
                <span className="text-[#71717a] text-xs block mb-1">Notes</span>
                <p className="text-sm bg-[#f4f4f5] px-3 py-2 rounded">{selected.tenantData.notes}</p>
              </div>
            )}

            <button
              onClick={() => advanceRenewal(selected.unit)}
              className="w-full py-2 bg-[#18181b] text-white text-sm font-medium rounded hover:bg-zinc-800 transition-colors"
            >
              Advance Renewal Stage
            </button>
          </div>
        )}
      </Drawer>
    </>
  );
}

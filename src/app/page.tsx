"use client";

import { useState, useMemo, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef } from "ag-grid-community";
import { tenants, Tenant, formatCurrency } from "@/data/tenants";
import PageHeader from "@/components/PageHeader";
import Drawer from "@/components/Drawer";

ModuleRegistry.registerModules([AllCommunityModule]);

type Severity = "Critical" | "Warning" | "Info";

interface ActionItem {
  id: string;
  unit: string;
  tenant: string;
  building: string;
  issue: string;
  category: string;
  amountAtRisk: number;
  severity: Severity;
  action: string;
  tenantData: Tenant;
}

function generateActions(): ActionItem[] {
  const items: ActionItem[] = [];
  const today = new Date("2026-03-17");

  for (const t of tenants) {
    if (t.status === "vacant" && t.makeReady) {
      items.push({
        id: `makeready-${t.unit}`,
        unit: t.unit,
        tenant: "VACANT",
        building: t.building,
        issue: `Vacant — needs make-ready${t.splittable ? ` (splittable: ${t.splitDetail})` : ""}`,
        category: "Vacant",
        amountAtRisk: 0,
        severity: "Info",
        action: "Schedule Make-Ready",
        tenantData: t,
      });
      continue;
    }

    if (t.status === "vacant") continue;
    if (t.tenant.includes("Owner")) continue;

    // Past due
    if (t.pastDueAmount > 0) {
      const stage = t.delinquencyStage || "past_due";
      const stageLabel = stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      items.push({
        id: `pastdue-${t.unit}`,
        unit: t.unit,
        tenant: t.tenant,
        building: t.building,
        issue: `Past due ${formatCurrency(t.pastDueAmount)} — ${stageLabel}`,
        category: "Past Due",
        amountAtRisk: t.pastDueAmount,
        severity: "Critical",
        action: "Collect",
        tenantData: t,
      });
    }

    // Electric not posted (net lease only)
    if (t.leaseType === "Office Net Lease" && !t.electricPosted && t.monthlyElectric > 0) {
      items.push({
        id: `electric-${t.unit}`,
        unit: t.unit,
        tenant: t.tenant,
        building: t.building,
        issue: `Electric charge ${formatCurrency(t.monthlyElectric)} not posted`,
        category: "Unposted",
        amountAtRisk: t.monthlyElectric,
        severity: "Critical",
        action: "Post Charge",
        tenantData: t,
      });
    }

    // Lease expired — holdover
    if (t.leaseTo) {
      const end = new Date(t.leaseTo);
      if (end < today) {
        items.push({
          id: `holdover-${t.unit}`,
          unit: t.unit,
          tenant: t.tenant,
          building: t.building,
          issue: `Holdover — lease expired ${t.leaseTo}`,
          category: "Holdover",
          amountAtRisk: t.monthlyRent,
          severity: "Critical",
          action: "Send Renewal",
          tenantData: t,
        });
      }

      // Lease expiring within 90 days
      const daysRemaining = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysRemaining > 0 && daysRemaining <= 90) {
        items.push({
          id: `expiring-${t.unit}`,
          unit: t.unit,
          tenant: t.tenant,
          building: t.building,
          issue: `Lease expires in ${daysRemaining} days (${t.leaseTo})`,
          category: "Expiring",
          amountAtRisk: t.monthlyRent,
          severity: "Warning",
          action: "Start Renewal",
          tenantData: t,
        });
      }
    }
  }

  // Sort: Critical first, then Warning, then Info; within same severity, by amount desc
  const sevOrder: Record<Severity, number> = { Critical: 0, Warning: 1, Info: 2 };
  items.sort((a, b) => {
    const sd = sevOrder[a.severity] - sevOrder[b.severity];
    if (sd !== 0) return sd;
    return b.amountAtRisk - a.amountAtRisk;
  });

  return items;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const colors: Record<Severity, string> = {
    Critical: "bg-red-100 text-red-700",
    Warning: "bg-amber-100 text-amber-700",
    Info: "bg-zinc-100 text-zinc-600",
  };
  return (
    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded ${colors[severity]}`}>
      {severity}
    </span>
  );
}

export default function ActionBoard() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ActionItem | null>(null);

  const actions = useMemo(() => generateActions(), []);

  const totalPastDue = useMemo(
    () => tenants.reduce((sum, t) => sum + t.pastDueAmount, 0),
    []
  );
  const unpostedCount = useMemo(
    () =>
      tenants.filter(
        (t) =>
          t.leaseType === "Office Net Lease" &&
          !t.electricPosted &&
          t.monthlyElectric > 0 &&
          !t.tenant.includes("Owner")
      ).length,
    []
  );
  const expiringCount = useMemo(
    () => actions.filter((a) => a.category === "Expiring").length,
    [actions]
  );

  const columnDefs = useMemo<ColDef<ActionItem>[]>(
    () => [
      {
        headerName: "Severity",
        field: "severity",
        width: 100,
        cellRenderer: (params: { value: Severity }) => {
          const colors: Record<Severity, string> = {
            Critical: "#dc2626",
            Warning: "#d97706",
            Info: "#71717a",
          };
          return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colors[params.value]};margin-right:6px"></span>${params.value}`;
        },
      },
      { headerName: "Unit", field: "unit", width: 90 },
      { headerName: "Tenant", field: "tenant", flex: 1, minWidth: 160 },
      { headerName: "Issue", field: "issue", flex: 2, minWidth: 240 },
      {
        headerName: "At Risk",
        field: "amountAtRisk",
        width: 110,
        valueFormatter: (params: { value: number }) =>
          params.value > 0 ? formatCurrency(params.value) : "—",
      },
      {
        headerName: "Action",
        field: "action",
        width: 130,
        cellRenderer: (params: { value: string }) =>
          `<span style="color:#18181b;font-weight:500;text-decoration:underline;text-underline-offset:2px;cursor:pointer">${params.value}</span>`,
      },
    ],
    []
  );

  const onRowClicked = useCallback((event: { data: ActionItem | undefined }) => {
    if (event.data) {
      setSelected(event.data);
      setDrawerOpen(true);
    }
  }, []);

  const t = selected?.tenantData;

  return (
    <>
      <PageHeader title="Action Board" subtitle="Prioritized tasks for this week" />

      {/* Summary numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
          <div className="text-xs text-[#71717a] uppercase tracking-wide font-medium">Total Past Due</div>
          <div className="text-lg font-semibold text-red-600 mt-0.5">{formatCurrency(totalPastDue)}</div>
        </div>
        <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
          <div className="text-xs text-[#71717a] uppercase tracking-wide font-medium">Unposted Charges</div>
          <div className="text-lg font-semibold text-[#18181b] mt-0.5">{unpostedCount}</div>
        </div>
        <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
          <div className="text-xs text-[#71717a] uppercase tracking-wide font-medium">Leases Expiring (90d)</div>
          <div className="text-lg font-semibold text-amber-600 mt-0.5">{expiringCount}</div>
        </div>
      </div>

      {/* AG Grid */}
      <div className="border border-[#e4e4e7] bg-white rounded overflow-auto">
        <div className="ag-theme-alpine" style={{ width: "100%", minWidth: 600 }}>
          <AgGridReact<ActionItem>
            rowData={actions}
            columnDefs={columnDefs}
            domLayout="autoHeight"
            onRowClicked={onRowClicked}
            suppressCellFocus
            getRowId={(params) => params.data.id}
          />
        </div>
      </div>

      {/* Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `${selected.unit} — ${selected.tenant}` : ""}
        subtitle={selected ? `Building ${selected.building}` : ""}
      >
        {t && (
          <div className="space-y-5">
            <div>
              <SeverityBadge severity={selected!.severity} />
              <p className="text-sm text-[#18181b] mt-2 font-medium">{selected!.issue}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-[#71717a] text-xs block">Lease Type</span>
                <span className="font-medium">{t.leaseType}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Square Feet</span>
                <span className="font-medium">{t.sqft.toLocaleString()} SF</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Monthly Rent</span>
                <span className="font-medium">{formatCurrency(t.monthlyRent)}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Monthly Electric</span>
                <span className="font-medium">{t.monthlyElectric > 0 ? formatCurrency(t.monthlyElectric) : "—"}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Lease Start</span>
                <span className="font-medium">{t.leaseFrom || "—"}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Lease End</span>
                <span className="font-medium">{t.leaseTo || "—"}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Security Deposit</span>
                <span className="font-medium">{formatCurrency(t.securityDeposit)}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Last Payment</span>
                <span className="font-medium">{t.lastPaymentDate || "—"}</span>
              </div>
              {t.pastDueAmount > 0 && (
                <div>
                  <span className="text-[#71717a] text-xs block">Past Due</span>
                  <span className="font-medium text-red-600">{formatCurrency(t.pastDueAmount)}</span>
                </div>
              )}
              {t.delinquencyStage && t.delinquencyStage !== "none" && (
                <div>
                  <span className="text-[#71717a] text-xs block">Delinquency Stage</span>
                  <span className="font-medium">
                    {t.delinquencyStage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                </div>
              )}
              {t.amps && (
                <div>
                  <span className="text-[#71717a] text-xs block">Amps</span>
                  <span className="font-medium">{t.amps}A</span>
                </div>
              )}
            </div>

            {t.notes && (
              <div>
                <span className="text-[#71717a] text-xs block mb-1">Notes</span>
                <p className="text-sm bg-[#f4f4f5] px-3 py-2 rounded">{t.notes}</p>
              </div>
            )}

            <button className="w-full py-2 bg-[#18181b] text-white text-sm font-medium rounded hover:bg-zinc-800 transition-colors">
              {selected!.action}
            </button>
          </div>
        )}
      </Drawer>
    </>
  );
}

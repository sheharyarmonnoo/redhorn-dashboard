"use client";
import { useMemo, useRef, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, GridReadyEvent } from "ag-grid-community";
import { tenants, formatCurrency } from "@/data/tenants";
import PageHeader from "@/components/PageHeader";
import { Zap, DollarSign, CalendarClock, AlertTriangle, Clock } from "lucide-react";

ModuleRegistry.registerModules([AllCommunityModule]);

interface AlertRow {
  id: string;
  unit: string;
  tenant: string;
  building: string;
  category: string;
  severity: "Critical" | "Warning" | "Info";
  detail: string;
  amount: number;
  date: string;
}

function SeverityCellRenderer(props: { value: string }) {
  const colors: Record<string, string> = {
    Critical: "bg-red-100 text-red-700 border-red-200",
    Warning: "bg-amber-50 text-amber-700 border-amber-200",
    Info: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${colors[props.value] || ""}`}>
      {props.value}
    </span>
  );
}

function CategoryCellRenderer(props: { value: string }) {
  const icons: Record<string, { icon: typeof Zap; color: string }> = {
    "Electric Not Posted": { icon: Zap, color: "text-amber-500" },
    "Past Due": { icon: DollarSign, color: "text-red-500" },
    "Lease Expiring": { icon: CalendarClock, color: "text-blue-500" },
    "Holdover": { icon: AlertTriangle, color: "text-orange-500" },
  };
  const item = icons[props.value] || { icon: AlertTriangle, color: "text-gray-500" };
  const Icon = item.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 ${item.color} font-medium text-[12px]`}>
      <Icon size={14} />
      {props.value}
    </span>
  );
}

export default function AlertsPage() {
  const gridRef = useRef<AgGridReact>(null);
  const historyGridRef = useRef<AgGridReact>(null);

  const alertData = useMemo<AlertRow[]>(() => {
    const alerts: AlertRow[] = [];

    // Electric not posted
    tenants.filter(t => t.leaseType === "Office Net Lease" && !t.electricPosted && t.tenant && !t.tenant.includes("Owner"))
      .forEach(t => {
        alerts.push({
          id: `elec-${t.unit}`, unit: t.unit, tenant: t.tenant, building: t.building,
          category: "Electric Not Posted", severity: "Critical",
          detail: `Expected ~${formatCurrency(t.monthlyElectric)}/mo — not posted for March 2026`,
          amount: t.monthlyElectric, date: "2026-03-12",
        });
      });

    // Past due
    tenants.filter(t => t.pastDueAmount > 0)
      .forEach(t => {
        alerts.push({
          id: `pd-${t.unit}`, unit: t.unit, tenant: t.tenant, building: t.building,
          category: "Past Due", severity: "Critical",
          detail: `${formatCurrency(t.pastDueAmount)} outstanding — last paid ${t.lastPaymentDate}`,
          amount: t.pastDueAmount, date: "2026-03-12",
        });
      });

    // Expiring leases
    tenants.filter(t => t.status === "expiring_soon")
      .forEach(t => {
        alerts.push({
          id: `exp-${t.unit}`, unit: t.unit, tenant: t.tenant, building: t.building,
          category: "Lease Expiring", severity: "Warning",
          detail: `Expires ${t.leaseTo} — no renewal on file. Rent: ${formatCurrency(t.monthlyRent)}/mo`,
          amount: t.monthlyRent, date: t.leaseTo,
        });
      });

    // Holdovers
    tenants.filter(t => t.leaseTo && new Date(t.leaseTo) < new Date("2026-03-15") && t.status !== "vacant" && !t.tenant.includes("Owner"))
      .forEach(t => {
        alerts.push({
          id: `hold-${t.unit}`, unit: t.unit, tenant: t.tenant, building: t.building,
          category: "Holdover", severity: "Critical",
          detail: `Lease ended ${t.leaseTo} — tenant still occupying`,
          amount: t.monthlyRent, date: t.leaseTo,
        });
      });

    return alerts;
  }, []);

  const columnDefs = useMemo<ColDef[]>(() => [
    { field: "severity", headerName: "Severity", width: 110, cellRenderer: SeverityCellRenderer, filter: true },
    { field: "category", headerName: "Category", width: 170, cellRenderer: CategoryCellRenderer, filter: true },
    { field: "unit", headerName: "Unit", width: 80 },
    { field: "tenant", headerName: "Tenant", minWidth: 160, flex: 1 },
    { field: "building", headerName: "Bldg", width: 70 },
    { field: "detail", headerName: "Details", minWidth: 280, flex: 2 },
    { field: "amount", headerName: "Amount", width: 110, type: "numericColumn",
      valueFormatter: (p: { value: number }) => p.value > 0 ? formatCurrency(p.value) : "—" },
    { field: "date", headerName: "Date", width: 110 },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true, resizable: true, filter: true,
  }), []);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  }, []);

  const alertHistory = [
    { date: "2026-03-12", message: "Default letter sent to C-207 (Brazos Valley Imports)", type: "Action", category: "Past Due" },
    { date: "2026-03-10", message: "A-90 lease expired — holdover status triggered", type: "System", category: "Holdover" },
    { date: "2026-03-05", message: "February late fees assessed: A-120 ($99), C-207 ($84)", type: "System", category: "Past Due" },
    { date: "2026-03-01", message: "Monthly charges posted for March 2026", type: "System", category: "Charges" },
    { date: "2026-02-15", message: "Electric posting missed for C-212, C-305 — flagged for PM", type: "Alert", category: "Electric" },
    { date: "2026-02-12", message: "A-120 (Clear Lake IT) — first late notice sent", type: "Action", category: "Past Due" },
    { date: "2026-02-01", message: "Monthly charges posted for February 2026", type: "System", category: "Charges" },
    { date: "2026-01-20", message: "Lease renewal discussion initiated for A-111/C-216", type: "Action", category: "Lease" },
  ];

  const historyColDefs = useMemo<ColDef[]>(() => [
    { field: "date", headerName: "Date", width: 110, sort: "desc" },
    { field: "type", headerName: "Type", width: 90,
      cellRenderer: (p: { value: string }) => {
        const c: Record<string, string> = { Alert: "bg-amber-100 text-amber-700", Action: "bg-blue-100 text-blue-700", System: "bg-gray-100 text-gray-500" };
        return <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${c[p.value] || ""}`}>{p.value}</span>;
      }
    },
    { field: "category", headerName: "Category", width: 100 },
    { field: "message", headerName: "Description", minWidth: 300, flex: 1 },
  ], []);

  const criticalCount = alertData.filter(a => a.severity === "Critical").length;
  const warningCount = alertData.filter(a => a.severity === "Warning").length;

  return (
    <div>
      <PageHeader title="Alerts & Oversight" subtitle="Rule-based PM accountability tracking">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{criticalCount} Critical</span>
          <span className="text-[11px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{warningCount} Warnings</span>
        </div>
      </PageHeader>

      {/* Active Alerts Grid */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-bold text-[#1e1e2d]">Active Alerts ({alertData.length})</h3>
        <input
          type="text"
          placeholder="Search alerts..."
          className="px-3 py-1.5 bg-white border border-[#e8eaef] rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#4f6ef7] w-48 sm:w-64"
          onChange={(e) => {
            gridRef.current?.api?.setGridOption("quickFilterText", e.target.value);
          }}
        />
      </div>
      <div className="ag-theme-alpine w-full rounded-2xl overflow-hidden border border-[#e8eaef] shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-8" style={{ height: 340 }}>
        <AgGridReact
          ref={gridRef}
          rowData={alertData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          animateRows={true}
          pagination={true}
          paginationPageSize={500}
          getRowId={(params) => params.data.id}
        />
      </div>

      {/* Alert History */}
      <div className="flex items-center gap-2 mb-3">
        <Clock size={16} className="text-gray-400" />
        <h3 className="text-[14px] font-bold text-[#1e1e2d]">Alert History Log</h3>
      </div>
      <div className="ag-theme-alpine w-full rounded-2xl overflow-hidden border border-[#e8eaef] shadow-[0_1px_3px_rgba(0,0,0,0.04)]" style={{ height: 340 }}>
        <AgGridReact
          ref={historyGridRef}
          rowData={alertHistory}
          columnDefs={historyColDefs}
          defaultColDef={defaultColDef}
          onGridReady={(params) => params.api.sizeColumnsToFit()}
          animateRows={true}
        />
      </div>
    </div>
  );
}

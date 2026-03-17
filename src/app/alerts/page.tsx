"use client";
import { useMemo, useRef, useCallback, useState, useEffect } from "react";
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
  const dots: Record<string, string> = {
    Critical: "bg-[#dc2626]",
    Warning: "bg-[#d97706]",
    Info: "bg-[#2563eb]",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#18181b]">
      <span className={`w-1.5 h-1.5 rounded-full ${dots[props.value] || "bg-[#a1a1aa]"}`} />
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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

const ARCHIVED_KEY = "redhorn_archived_alerts";

function loadArchived(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(ARCHIVED_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveArchived(ids: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ARCHIVED_KEY, JSON.stringify(Array.from(ids)));
}

const CUSTOM_ALERTS_KEY = "redhorn_custom_alerts";

function loadCustomAlerts(): AlertRow[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(CUSTOM_ALERTS_KEY) || "[]"); }
  catch { return []; }
}
function saveCustomAlerts(alerts: AlertRow[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOM_ALERTS_KEY, JSON.stringify(alerts));
}

export default function AlertsPage() {
  const gridRef = useRef<AgGridReact>(null);
  const historyGridRef = useRef<AgGridReact>(null);
  const isMobile = useIsMobile();
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [customAlerts, setCustomAlerts] = useState<AlertRow[]>([]);
  const [showAddAlert, setShowAddAlert] = useState(false);
  const [newAlert, setNewAlert] = useState({ unit: "", category: "General", severity: "Warning" as AlertRow["severity"], detail: "" });
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);

  useEffect(() => { setArchivedIds(loadArchived()); setCustomAlerts(loadCustomAlerts()); }, []);

  function addAlert() {
    if (!newAlert.detail.trim()) return;
    const alert: AlertRow = {
      id: `custom-${Date.now()}`,
      unit: newAlert.unit.trim() || "—",
      tenant: tenants.find(t => t.unit === newAlert.unit.trim())?.tenant || "",
      building: tenants.find(t => t.unit === newAlert.unit.trim())?.building || "",
      category: newAlert.category,
      severity: newAlert.severity,
      detail: newAlert.detail.trim(),
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
    };
    const updated = [alert, ...customAlerts];
    setCustomAlerts(updated);
    saveCustomAlerts(updated);
    setNewAlert({ unit: "", category: "General", severity: "Warning", detail: "" });
    setShowAddAlert(false);
  }

  function removeCustomAlert(id: string) {
    const updated = customAlerts.filter(a => a.id !== id);
    setCustomAlerts(updated);
    saveCustomAlerts(updated);
  }

  function startEditAlert(alert: AlertRow) {
    setEditingAlertId(alert.id);
    setNewAlert({ unit: alert.unit === "—" ? "" : alert.unit, category: alert.category, severity: alert.severity, detail: alert.detail });
    setShowAddAlert(true);
  }

  function saveEditAlert() {
    if (!editingAlertId || !newAlert.detail.trim()) return;
    const updated = customAlerts.map(a => a.id === editingAlertId ? {
      ...a,
      unit: newAlert.unit.trim() || "—",
      tenant: tenants.find(t => t.unit === newAlert.unit.trim())?.tenant || "",
      building: tenants.find(t => t.unit === newAlert.unit.trim())?.building || "",
      category: newAlert.category,
      severity: newAlert.severity,
      detail: newAlert.detail.trim(),
    } : a);
    setCustomAlerts(updated);
    saveCustomAlerts(updated);
    setNewAlert({ unit: "", category: "General", severity: "Warning", detail: "" });
    setShowAddAlert(false);
    setEditingAlertId(null);
  }

  function archiveAlert(id: string) {
    const next = new Set(archivedIds);
    next.add(id);
    setArchivedIds(next);
    saveArchived(next);
  }

  function restoreAlert(id: string) {
    const next = new Set(archivedIds);
    next.delete(id);
    setArchivedIds(next);
    saveArchived(next);
  }

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

  const allAlerts = [...customAlerts, ...alertData];
  const activeAlerts = allAlerts.filter(a => !archivedIds.has(a.id));
  const archivedAlerts = allAlerts.filter(a => archivedIds.has(a.id));

  function ArchiveCell(props: { data: AlertRow }) {
    const isCustom = props.data.id.startsWith("custom-");
    return (
      <div className="flex items-center gap-1">
        {isCustom && (
          <button onClick={(e) => { e.stopPropagation(); startEditAlert(props.data); }}
            className="text-[10px] font-medium text-[#71717a] hover:text-[#18181b] cursor-pointer px-2 py-0.5 border border-[#e4e4e7] rounded hover:bg-[#f4f4f5] transition-colors">
            Edit
          </button>
        )}
        <button onClick={(e) => { e.stopPropagation(); archiveAlert(props.data.id); }}
          className="text-[10px] font-medium text-[#71717a] hover:text-[#18181b] cursor-pointer px-2 py-0.5 border border-[#e4e4e7] rounded hover:bg-[#f4f4f5] transition-colors">
          Handled
        </button>
      </div>
    );
  }

  function RestoreCell(props: { data: AlertRow }) {
    return (
      <button onClick={(e) => { e.stopPropagation(); restoreAlert(props.data.id); }}
        className="text-[10px] font-medium text-[#71717a] hover:text-[#18181b] cursor-pointer px-2 py-0.5 border border-[#e4e4e7] rounded hover:bg-[#f4f4f5] transition-colors">
        Restore
      </button>
    );
  }

  const columnDefs = useMemo<ColDef[]>(() => {
    if (isMobile) {
      return [
        { field: "severity", headerName: "Sev", width: 85, cellRenderer: SeverityCellRenderer },
        { field: "unit", headerName: "Unit", width: 90 },
        { field: "category", headerName: "Type", width: 140, cellRenderer: CategoryCellRenderer },
        { field: "detail", headerName: "Details", minWidth: 140, flex: 1 },
        { headerName: "", width: 130, cellRenderer: ArchiveCell, sortable: false, filter: false },
      ];
    }
    return [
      { field: "severity", headerName: "Severity", width: 110, cellRenderer: SeverityCellRenderer, filter: true },
      { field: "category", headerName: "Category", width: 170, cellRenderer: CategoryCellRenderer, filter: true },
      { field: "unit", headerName: "Unit", width: 100 },
      { field: "tenant", headerName: "Tenant", minWidth: 160, flex: 1 },
      { field: "building", headerName: "Bldg", width: 70 },
      { field: "detail", headerName: "Details", minWidth: 280, flex: 2 },
      { field: "amount", headerName: "Amount", width: 110, type: "numericColumn",
        valueFormatter: (p: { value: number }) => p.value > 0 ? formatCurrency(p.value) : "—" },
      { field: "date", headerName: "Date", width: 110 },
      { headerName: "", width: 130, cellRenderer: ArchiveCell, sortable: false, filter: false },
    ];
  }, [isMobile, archivedIds, customAlerts]);

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

  const historyColDefs = useMemo<ColDef[]>(() => {
    const typeRenderer = (p: { value: string }) => {
      const c: Record<string, string> = { Alert: "bg-amber-100 text-amber-700", Action: "bg-blue-100 text-blue-700", System: "bg-gray-100 text-gray-500" };
      return <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${c[p.value] || ""}`}>{p.value}</span>;
    };
    if (isMobile) {
      return [
        { field: "date", headerName: "Date", width: 90, sort: "desc" },
        { field: "type", headerName: "Type", width: 75, cellRenderer: typeRenderer },
        { field: "message", headerName: "Description", minWidth: 180, flex: 1 },
      ];
    }
    return [
      { field: "date", headerName: "Date", width: 110, sort: "desc" },
      { field: "type", headerName: "Type", width: 90, cellRenderer: typeRenderer },
      { field: "category", headerName: "Category", width: 100 },
      { field: "message", headerName: "Description", minWidth: 300, flex: 1 },
    ];
  }, [isMobile]);

  const criticalCount = activeAlerts.filter(a => a.severity === "Critical").length;
  const warningCount = activeAlerts.filter(a => a.severity === "Warning").length;

  return (
    <div>
      <PageHeader title="Alerts & Oversight" subtitle="Rule-based PM accountability tracking">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-[#dc2626]">{criticalCount} critical</span>
          <span className="text-[11px] font-medium text-[#d97706]">{warningCount} warnings</span>
          <button onClick={() => { setEditingAlertId(null); setNewAlert({ unit: "", category: "General", severity: "Warning", detail: "" }); setShowAddAlert(!showAddAlert); }}
            className="text-[11px] font-medium px-3 py-1.5 bg-[#18181b] text-white rounded hover:bg-[#27272a] cursor-pointer transition-colors">
            Add Alert
          </button>
        </div>
      </PageHeader>

      {/* Add Alert Form */}
      {showAddAlert && (
        <div className="bg-white border border-[#e4e4e7] rounded p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input type="text" value={newAlert.unit} onChange={e => setNewAlert({ ...newAlert, unit: e.target.value })}
              placeholder="Unit (e.g. A-102)"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
            <select value={newAlert.category} onChange={e => setNewAlert({ ...newAlert, category: e.target.value })}
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] text-[#18181b]">
              <option value="General">General</option>
              <option value="Electric Not Posted">Electric Not Posted</option>
              <option value="Past Due">Past Due</option>
              <option value="Lease Expiring">Lease Expiring</option>
              <option value="Holdover">Holdover</option>
              <option value="Maintenance">Maintenance</option>
              <option value="PM Follow-up">PM Follow-up</option>
            </select>
            <select value={newAlert.severity} onChange={e => setNewAlert({ ...newAlert, severity: e.target.value as AlertRow["severity"] })}
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] text-[#18181b]">
              <option value="Critical">Critical</option>
              <option value="Warning">Warning</option>
              <option value="Info">Info</option>
            </select>
            <div className="flex gap-2">
              <button onClick={editingAlertId ? saveEditAlert : addAlert} disabled={!newAlert.detail.trim()}
                className="text-[11px] font-medium px-3 py-1.5 bg-[#18181b] text-white rounded hover:bg-[#27272a] disabled:bg-[#e4e4e7] disabled:text-[#a1a1aa] cursor-pointer transition-colors">
                {editingAlertId ? "Save" : "Add"}
              </button>
              <button onClick={() => { setShowAddAlert(false); setEditingAlertId(null); setNewAlert({ unit: "", category: "General", severity: "Warning", detail: "" }); }}
                className="text-[11px] text-[#71717a] cursor-pointer px-2 py-1">Cancel</button>
            </div>
          </div>
          <textarea value={newAlert.detail} onChange={e => setNewAlert({ ...newAlert, detail: e.target.value })}
            placeholder="Alert description..."
            rows={2}
            className="w-full text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa] resize-none" />
        </div>
      )}

      {/* Active Alerts Grid */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-[#18181b]">Active Alerts ({activeAlerts.length})</h3>
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
          rowData={activeAlerts}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          animateRows={true}
          pagination={true}
          paginationPageSize={500}
          getRowId={(params) => params.data.id}
        />
      </div>

      {/* Archived / Handled */}
      {archivedAlerts.length > 0 && (
        <div className="mb-8">
          <p className="text-[13px] font-semibold text-[#18181b] mb-3">Handled ({archivedAlerts.length})</p>
          <div className="space-y-0 border border-[#e4e4e7] rounded overflow-hidden">
            {archivedAlerts.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2 border-b border-[#f4f4f5] last:border-0 bg-[#fafafa]">
                <span className="text-[11px] text-[#16a34a] font-medium">✓</span>
                <span className="text-[12px] font-medium text-[#71717a] w-14 flex-shrink-0">{a.unit}</span>
                <p className="flex-1 text-[12px] text-[#a1a1aa] line-through truncate">{a.detail}</p>
                <button onClick={() => restoreAlert(a.id)}
                  className="text-[10px] text-[#a1a1aa] hover:text-[#18181b] cursor-pointer px-2 py-0.5 border border-[#e4e4e7] rounded hover:bg-white transition-colors flex-shrink-0">
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alert History */}
      <div className="flex items-center gap-2 mb-3">
        <Clock size={16} className="text-[#a1a1aa]" />
        <p className="text-[13px] font-semibold text-[#18181b]">Alert History Log</p>
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

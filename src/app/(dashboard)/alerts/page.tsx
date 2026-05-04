"use client";
import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef } from "ag-grid-community";
import { useActiveProperty, useTenants, useAlerts, formatCurrency } from "@/hooks/useConvexData";
import { useAgGridPersistence } from "@/hooks/useAgGridPersistence";
import PageHeader from "@/components/PageHeader";
import { Zap, DollarSign, CalendarClock, AlertTriangle } from "lucide-react";

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
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#18181b] dark:text-[#fafafa]">
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
    "AI Insight": { icon: AlertTriangle, color: "text-violet-500" },
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
  const isMobile = useIsMobile();
  const activeProperty = useActiveProperty();
  const tenants = useTenants(activeProperty?._id);
  const { alerts: convexAlerts } = useAlerts();
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [customAlerts, setCustomAlerts] = useState<AlertRow[]>([]);
  const [showAddAlert, setShowAddAlert] = useState(false);
  const [newAlert, setNewAlert] = useState({ unit: "", category: "General", severity: "Warning" as AlertRow["severity"], detail: "" });
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  useEffect(() => { setArchivedIds(loadArchived()); setCustomAlerts(loadCustomAlerts()); }, []);

  function addAlert() {
    if (!newAlert.detail.trim()) return;
    const alert: AlertRow = {
      id: `custom-${Date.now()}`,
      unit: newAlert.unit.trim() || "—",
      tenant: tenants.find((t: any) => t.unit === newAlert.unit.trim())?.tenant || "",
      building: tenants.find((t: any) => t.unit === newAlert.unit.trim())?.building || "",
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

  function saveEditAlert() {
    if (!editingAlertId || !newAlert.detail.trim()) return;
    const updated = customAlerts.map(a => a.id === editingAlertId ? {
      ...a,
      unit: newAlert.unit.trim() || "—",
      tenant: tenants.find((t: any) => t.unit === newAlert.unit.trim())?.tenant || "",
      building: tenants.find((t: any) => t.unit === newAlert.unit.trim())?.building || "",
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
    const today = new Date().toISOString().slice(0, 10);

    // Past due
    tenants.filter((t: any) => t.pastDueAmount > 0)
      .forEach((t: any) => {
        alerts.push({
          id: `pd-${t.unit}`, unit: t.unit, tenant: t.tenant, building: t.building,
          category: "Past Due", severity: "Critical",
          detail: `${formatCurrency(t.pastDueAmount)} outstanding — last paid ${t.lastPaymentDate}`,
          amount: t.pastDueAmount, date: today,
        });
      });

    // Expiring leases
    tenants.filter((t: any) => t.status === "expiring_soon")
      .forEach((t: any) => {
        alerts.push({
          id: `exp-${t.unit}`, unit: t.unit, tenant: t.tenant, building: t.building,
          category: "Lease Expiring", severity: "Warning",
          detail: `Expires ${t.leaseTo} — no renewal on file. Rent: ${formatCurrency(t.monthlyRent)}/mo`,
          amount: t.monthlyRent, date: t.leaseTo,
        });
      });

    // Holdovers
    tenants.filter((t: any) => t.leaseTo && new Date(t.leaseTo) < new Date() && t.status !== "vacant" && !t.tenant.includes("Owner"))
      .forEach((t: any) => {
        alerts.push({
          id: `hold-${t.unit}`, unit: t.unit, tenant: t.tenant, building: t.building,
          category: "Holdover", severity: "Critical",
          detail: `Lease ended ${t.leaseTo} — tenant still occupying`,
          amount: t.monthlyRent, date: t.leaseTo,
        });
      });

    // AI-generated income/AR insights from Convex (alertType === "income_insight")
    // for the current property. These are the rich findings Claude produces
    // each sync (delinquency, missed postings, NOI compression, etc.).
    const sevTitle: Record<string, AlertRow["severity"]> = {
      critical: "Critical",
      warning: "Warning",
      info: "Info",
    };
    (convexAlerts as any[])
      .filter(a => a.alertType === "income_insight"
        && a.propertyId === activeProperty?._id
        && a.status !== "false_flag"
        && a.status !== "resolved"
        && a.status !== "dismissed")
      .forEach(a => {
        alerts.push({
          id: `aii-${a._id}`,
          unit: a.unit || "—",
          tenant: a.dataContext?.lineItem || "",
          building: "",
          category: "AI Insight",
          severity: sevTitle[a.severity] || "Warning",
          detail: a.body || "",
          amount: 0,
          date: (a.date || "").slice(0, 10),
        });
      });

    return alerts;
  }, [tenants, convexAlerts, activeProperty?._id]);

  const allAlerts = [...customAlerts, ...alertData];
  const activeAlerts = allAlerts.filter(a => !archivedIds.has(a.id));
  const archivedAlerts = allAlerts.filter(a => archivedIds.has(a.id));

  function RestoreCell(props: { data: AlertRow }) {
    return (
      <button onClick={(e) => { e.stopPropagation(); restoreAlert(props.data.id); }}
        className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer px-2 py-0.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] transition-colors">
        Restore
      </button>
    );
  }

  const columnDefs = useMemo<ColDef[]>(() => {
    if (isMobile) {
      return [
        { field: "severity", headerName: "Sev", width: 80, cellRenderer: SeverityCellRenderer },
        { field: "unit", headerName: "Unit", width: 80 },
        { field: "category", headerName: "Type", width: 130, cellRenderer: CategoryCellRenderer },
        { field: "detail", headerName: "Details", minWidth: 140, flex: 1 },
      ];
    }
    // Mirrors the Add Alert modal fields: severity / category / unit / details.
    return [
      { field: "severity", headerName: "Severity", width: 110, cellRenderer: SeverityCellRenderer, filter: true },
      { field: "category", headerName: "Category", width: 160, cellRenderer: CategoryCellRenderer, filter: true },
      { field: "unit", headerName: "Unit", width: 100 },
      { field: "detail", headerName: "Details", minWidth: 320, flex: 1 },
    ];
  }, [isMobile]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true, resizable: true, filter: true,
  }), []);

  const persistence = useAgGridPersistence({ storageKey: "redhorn_grid_alerts" });

  const criticalCount = activeAlerts.filter(a => a.severity === "Critical").length;
  const warningCount = activeAlerts.filter(a => a.severity === "Warning").length;

  return (
    <div>
      <PageHeader title="Alerts & Oversight" subtitle="Rule-based PM accountability tracking">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-[#dc2626]">{criticalCount} critical</span>
          <span className="text-[11px] font-medium text-[#d97706]">{warningCount} warnings</span>
          <button onClick={() => { setEditingAlertId(null); setNewAlert({ unit: "", category: "General", severity: "Warning", detail: "" }); setShowAddAlert(!showAddAlert); }}
            className="text-[11px] font-medium px-3 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] cursor-pointer transition-colors">
            Add Alert
          </button>
        </div>
      </PageHeader>

      {/* Add / Edit Alert Modal */}
      {showAddAlert && (
        <AlertModal
          editing={!!editingAlertId}
          alert={newAlert}
          onChange={setNewAlert}
          onCancel={() => { setShowAddAlert(false); setEditingAlertId(null); setNewAlert({ unit: "", category: "General", severity: "Warning", detail: "" }); }}
          onSubmit={editingAlertId ? saveEditAlert : addAlert}
        />
      )}

      {/* Active Alerts Grid */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Active Alerts ({activeAlerts.length})</h3>
        <input
          type="text"
          placeholder="Search alerts..."
          className="px-3 py-1.5 bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] rounded-lg text-sm text-gray-900 dark:text-[#fafafa] placeholder-gray-400 dark:placeholder-[#71717a] focus:outline-none focus:border-[#4f6ef7] w-48 sm:w-64"
          onChange={(e) => {
            gridRef.current?.api?.setGridOption("quickFilterText", e.target.value);
          }}
        />
      </div>
      <div className="ag-theme-alpine w-full rounded-2xl overflow-hidden border border-[#e8eaef] dark:border-[#3f3f46] shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-8" style={{ height: "calc(100vh - 280px)", minHeight: 480 }}>
        <AgGridReact
          ref={gridRef}
          rowData={activeAlerts}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={persistence.onGridReady}
          onColumnResized={persistence.onColumnResized}
          onColumnMoved={persistence.onColumnMoved}
          onColumnVisible={persistence.onColumnVisible}
          onColumnPinned={persistence.onColumnPinned}
          onSortChanged={persistence.onSortChanged}
          onRowClicked={(e) => setSelectedAlertId(e.data?.id ?? null)}
          rowClass="cursor-pointer"
          animateRows={true}
          pagination={true}
          paginationPageSize={500}
          getRowId={(params) => params.data.id}
        />
      </div>

      <AlertDrawer
        alert={activeAlerts.find(a => a.id === selectedAlertId) ?? null}
        onClose={() => setSelectedAlertId(null)}
        onSave={(updates) => {
          if (!selectedAlertId) return;
          const isCustom = selectedAlertId.startsWith("custom-");
          if (!isCustom) return;
          const updated = customAlerts.map(a => a.id === selectedAlertId ? { ...a, ...updates } : a);
          setCustomAlerts(updated);
          saveCustomAlerts(updated);
        }}
        onMarkHandled={() => {
          if (!selectedAlertId) return;
          archiveAlert(selectedAlertId);
          setSelectedAlertId(null);
        }}
      />

      {/* Archived / Handled */}
      {archivedAlerts.length > 0 && (
        <div className="mb-8">
          <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-3">Handled ({archivedAlerts.length})</p>
          <div className="space-y-0 border border-[#e4e4e7] dark:border-[#3f3f46] rounded overflow-hidden">
            {archivedAlerts.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2 border-b border-[#f4f4f5] dark:border-[#27272a] last:border-0 bg-[#fafafa] dark:bg-[#27272a]">
                <span className="text-[11px] text-[#16a34a] font-medium">✓</span>
                <span className="text-[12px] font-medium text-[#71717a] dark:text-[#a1a1aa] w-14 flex-shrink-0">{a.unit}</span>
                <p className="flex-1 text-[12px] text-[#a1a1aa] dark:text-[#71717a] line-through truncate">{a.detail}</p>
                <button onClick={() => restoreAlert(a.id)}
                  className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer px-2 py-0.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded hover:bg-white dark:hover:bg-[#18181b] transition-colors flex-shrink-0">
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function AlertModal({
  editing, alert, onChange, onCancel, onSubmit,
}: {
  editing: boolean;
  alert: { unit: string; category: string; severity: AlertRow["severity"]; detail: string };
  onChange: (a: { unit: string; category: string; severity: AlertRow["severity"]; detail: string }) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4 rh-backdrop"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg shadow-xl w-full max-w-md p-5 rh-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-3">
          {editing ? "Edit alert" : "New alert"}
        </p>

        <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide block mb-1">Description</label>
        <textarea
          autoFocus
          value={alert.detail}
          onChange={(e) => onChange({ ...alert, detail: e.target.value })}
          rows={3}
          placeholder="What needs attention? Be specific so the next person knows the action."
          className="w-full text-[12px] bg-white dark:bg-[#09090b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-2 text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] dark:placeholder-[#52525b] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa] resize-none mb-3"
        />

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div>
            <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide block mb-1">Unit</label>
            <input
              type="text"
              value={alert.unit}
              onChange={(e) => onChange({ ...alert, unit: e.target.value })}
              placeholder="A-102"
              className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide block mb-1">Category</label>
            <select
              value={alert.category}
              onChange={(e) => onChange({ ...alert, category: e.target.value })}
              className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
            >
              <option value="General">General</option>
              <option value="Past Due">Past Due</option>
              <option value="Lease Expiring">Lease Expiring</option>
              <option value="Holdover">Holdover</option>
              <option value="Maintenance">Maintenance</option>
              <option value="PM Follow-up">PM Follow-up</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide block mb-1">Severity</label>
            <select
              value={alert.severity}
              onChange={(e) => onChange({ ...alert, severity: e.target.value as AlertRow["severity"] })}
              className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
            >
              <option value="Critical">Critical</option>
              <option value="Warning">Warning</option>
              <option value="Info">Info</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] px-3 py-1.5 rounded cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!alert.detail.trim()}
            className="text-[12px] font-medium bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] px-3 py-1.5 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {editing ? "Save changes" : "Add alert"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertDrawer({
  alert: alertProp, onClose, onSave, onMarkHandled,
}: {
  alert: AlertRow | null;
  onClose: () => void;
  onSave: (updates: Partial<AlertRow>) => void;
  onMarkHandled: () => void;
}) {
  const [cached, setCached] = useState<AlertRow | null>(alertProp);
  const [closing, setClosing] = useState(false);
  const alert = alertProp ?? cached;
  const [draft, setDraft] = useState<AlertRow | null>(alert);
  useEffect(() => { setDraft(alert); }, [alert?.id]);

  useEffect(() => {
    if (alertProp) {
      setCached(alertProp);
      setClosing(false);
    } else if (cached) {
      setClosing(true);
      const t = setTimeout(() => {
        setCached(null);
        setClosing(false);
      }, 220);
      return () => clearTimeout(t);
    }
  }, [alertProp, cached]);

  if (!alert || !draft) return null;
  const isCustom = alert.id.startsWith("custom-");
  const dirty = isCustom && (draft.unit !== alert.unit || draft.category !== alert.category || draft.severity !== alert.severity || draft.detail !== alert.detail);

  function handleSave() {
    if (!isCustom || !draft) return;
    onSave({ unit: draft.unit, category: draft.category, severity: draft.severity, detail: draft.detail });
  }

  return (
    <div className={`fixed inset-0 z-50 flex justify-end bg-black/40 dark:bg-black/60 rh-backdrop${closing ? " is-closing" : ""}`} onClick={onClose}>
      <div
        className={`bg-white dark:bg-[#18181b] border-l border-[#e4e4e7] dark:border-[#3f3f46] shadow-xl w-full max-w-md h-full overflow-y-auto rh-drawer${closing ? " is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4e4e7] dark:border-[#3f3f46] sticky top-0 bg-white dark:bg-[#18181b]">
          <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Alert details</p>
          <button onClick={onClose} className="text-[16px] text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide block mb-1">Description</label>
            {isCustom ? (
              <textarea
                value={draft.detail}
                onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
                rows={4}
                className="w-full text-[12px] bg-white dark:bg-[#09090b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-2 text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa] resize-none"
              />
            ) : (
              <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] leading-relaxed">{alert.detail}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide block mb-1">Unit</label>
              {isCustom ? (
                <input
                  type="text"
                  value={draft.unit}
                  onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
                />
              ) : (
                <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">{alert.unit || "—"}</p>
              )}
            </div>
            <div>
              <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide block mb-1">Tenant</label>
              <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5 truncate">{alert.tenant || "—"}</p>
            </div>
            <div>
              <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide block mb-1">Category</label>
              {isCustom ? (
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
                >
                  <option value="General">General</option>
                  <option value="Past Due">Past Due</option>
                  <option value="Lease Expiring">Lease Expiring</option>
                  <option value="Holdover">Holdover</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="PM Follow-up">PM Follow-up</option>
                </select>
              ) : (
                <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">{alert.category}</p>
              )}
            </div>
            <div>
              <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide block mb-1">Severity</label>
              {isCustom ? (
                <select
                  value={draft.severity}
                  onChange={(e) => setDraft({ ...draft, severity: e.target.value as AlertRow["severity"] })}
                  className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
                >
                  <option value="Critical">Critical</option>
                  <option value="Warning">Warning</option>
                  <option value="Info">Info</option>
                </select>
              ) : (
                <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">{alert.severity}</p>
              )}
            </div>
            {alert.amount > 0 && (
              <div>
                <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide block mb-1">Amount</label>
                <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">{formatCurrency(alert.amount)}</p>
              </div>
            )}
            <div>
              <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide block mb-1">Date</label>
              <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] py-1.5">{alert.date || "—"}</p>
            </div>
          </div>

          {!isCustom && (
            <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] italic leading-relaxed">
              This alert is auto-generated from sync data. To suppress it, use "Mark as handled". The system will regenerate it on the next sync if the underlying condition still applies.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#e4e4e7] dark:border-[#3f3f46] sticky bottom-0 bg-white dark:bg-[#18181b]">
          <button
            onClick={onMarkHandled}
            className="text-[12px] font-medium bg-[#16a34a] text-white hover:bg-[#15803d] px-3 py-1.5 rounded cursor-pointer"
          >
            Mark as handled
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] px-3 py-1.5 rounded cursor-pointer"
            >
              Close
            </button>
            {isCustom && (
              <button
                onClick={handleSave}
                disabled={!dirty || !draft.detail.trim()}
                className="text-[12px] font-medium bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] px-3 py-1.5 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

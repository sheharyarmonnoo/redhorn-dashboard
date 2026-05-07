"use client";
import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef } from "ag-grid-community";
import { useActiveProperty, useTenants, useAlerts, formatCurrency } from "@/hooks/useConvexData";
import { useAgGridPersistence } from "@/hooks/useAgGridPersistence";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../../../convex/_generated/api";
import PageHeader from "@/components/PageHeader";
import EmailComposer, { type EmailContext } from "@/components/EmailComposer";
import { Zap, DollarSign, CalendarClock, AlertTriangle, Mail } from "lucide-react";

ModuleRegistry.registerModules([AllCommunityModule]);

interface AlertRow {
  id: string;
  unit: string;
  tenant: string;
  building: string;
  category: string;
  severity: "Critical" | "Warning" | "Info";
  title?: string;        // headline action — present on AI insights, optional otherwise
  detail: string;
  amount: number;
  date: string;
  // AI insight integration: when set, this row is backed by a Convex alert and
  // the action buttons hit Convex mutations instead of the localStorage archive.
  convexAlertId?: string;
  isAIInsight?: boolean;
  resolution?: "resolved" | "false_flag"; // populated for AI insights already actioned
  falseFlagReason?: string;
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

// Renders the Details column. For AI-generated alerts (which carry a title),
// shows the title bold above a one-line truncated detail so each row reads
// like a single insight unit. For rule-based alerts (no title), just shows
// the detail. Combined with autoHeight=true on the column, the row sizes
// itself to fit the title + body.
function DetailCellRenderer(props: { value: string; data: AlertRow }) {
  const title = (props.data?.title || "").trim();
  const body = (props.value || "").trim();
  // Strip simple markdown bold markers for the grid view (drawer renders full markdown).
  const stripBold = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, "$1");
  const firstLine = stripBold(body.split("\n").find(l => l.trim().length > 0) || "");
  if (!title) {
    return <span className="text-[12px] text-[#18181b] dark:text-[#fafafa] leading-snug">{stripBold(body)}</span>;
  }
  return (
    <div className="py-1.5 leading-snug">
      <p className="text-[12px] font-semibold text-[#18181b] dark:text-[#fafafa] truncate">{title}</p>
      <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] mt-0.5 line-clamp-1">{firstLine}</p>
    </div>
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
const HIDDEN_KEY = "redhorn_hidden_handled_alerts";
const HANDLED_PAGE_SIZE = 10;

function loadHidden(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveHidden(ids: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(ids)));
}

function loadArchived(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(ARCHIVED_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveArchived(ids: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ARCHIVED_KEY, JSON.stringify(Array.from(ids)));
}

export default function AlertsPage() {
  const gridRef = useRef<AgGridReact>(null);
  const isMobile = useIsMobile();
  const activeProperty = useActiveProperty();
  const tenants = useTenants(activeProperty?._id);
  const { alerts: convexAlerts } = useAlerts();
  const { user } = useUser();
  const updateAlertStatus = useMutation(api.alerts.updateStatus);
  const markFalseFlag = useMutation(api.alerts.markFalseFlag);
  const undoFalseFlag = useMutation(api.alerts.undoFalseFlag);
  const createAlert = useMutation(api.alerts.create);
  const updateAlert = useMutation(api.alerts.updateAlert);
  const removeAlert = useMutation(api.alerts.remove);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [showAddAlert, setShowAddAlert] = useState(false);
  const [newAlert, setNewAlert] = useState({ unit: "", category: "General", severity: "Warning" as AlertRow["severity"], detail: "" });
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [flagging, setFlagging] = useState<{ row: AlertRow } | null>(null);
  const [handledPage, setHandledPage] = useState(0);

  useEffect(() => { setArchivedIds(loadArchived()); setHiddenIds(loadHidden()); }, []);

  // User-created alerts now live in Convex with alertType="custom" so they
  // share the same schema as AI insights — title, body, severity, status,
  // propertyId, unit, date. localStorage no longer holds alert content; only
  // the per-browser "hidden from UI" + "archived" state lives there.
  // Multi-unit leases store comma-separated units (e.g. "A-103, A-112, A-85"),
  // so an exact `t.unit === alertUnit` lookup misses those leases entirely.
  // Tokenize once and match per token.
  const findLeaseForAlertUnit = (alertUnit: string) => {
    const target = (alertUnit || "").trim().toLowerCase();
    if (!target) return null;
    return tenants.find((t: any) =>
      (t.unit || "").split(",").map((s: string) => s.trim().toLowerCase()).includes(target)
    );
  };

  const customAlerts = useMemo<AlertRow[]>(() => {
    return (convexAlerts as any[])
      .filter(a => a.alertType === "custom" && a.propertyId === activeProperty?._id)
      .map(a => {
        const lease = findLeaseForAlertUnit(a.unit || "");
        return ({
        id: `custom-${a._id}`,
        unit: a.unit || "—",
        tenant: lease?.tenant || "",
        building: lease?.building || "",
        category: (a.dataContext as any)?.category || "General",
        severity: (a.severity?.[0]?.toUpperCase() + a.severity?.slice(1)) as AlertRow["severity"] || "Warning",
        title: a.title,
        detail: a.body || "",
        amount: 0,
        date: (a.date || "").slice(0, 10),
        convexAlertId: a._id,
        isAIInsight: false,
      });
    });
  }, [convexAlerts, activeProperty?._id, tenants]);

  async function addAlert() {
    if (!newAlert.detail.trim() || !activeProperty?._id) return;
    await createAlert({
      propertyId: activeProperty._id as any,
      alertType: "custom",
      severity: newAlert.severity.toLowerCase(),
      title: newAlert.detail.trim().slice(0, 120),
      body: newAlert.detail.trim(),
      status: "new",
      unit: newAlert.unit.trim() || undefined,
      date: new Date().toISOString(),
      dataContext: { category: newAlert.category },
    });
    setNewAlert({ unit: "", category: "General", severity: "Warning", detail: "" });
    setShowAddAlert(false);
  }

  async function removeCustomAlert(rowId: string) {
    const convexId = rowId.replace(/^custom-/, "");
    await removeAlert({ id: convexId as any });
  }

  async function saveEditAlert() {
    if (!editingAlertId || !newAlert.detail.trim()) return;
    const convexId = editingAlertId.replace(/^custom-/, "");
    await updateAlert({
      id: convexId as any,
      title: newAlert.detail.trim().slice(0, 120),
      body: newAlert.detail.trim(),
      severity: newAlert.severity.toLowerCase(),
      unit: newAlert.unit.trim() || undefined,
    });
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
          title: a.title || "",
          detail: a.body || "",
          amount: 0,
          date: (a.date || "").slice(0, 10),
          convexAlertId: a._id,
          isAIInsight: true,
        });
      });

    return alerts;
  }, [tenants, convexAlerts, activeProperty?._id]);

  // AI insights resolved or false-flagged via Convex (e.g. from the dashboard's
  // Mark as Completed action) — surface them in the Handled section so the
  // alerts page mirrors the dashboard's state without a refresh.
  const resolvedAIInsights = useMemo<AlertRow[]>(() => {
    const sevTitle: Record<string, AlertRow["severity"]> = {
      critical: "Critical",
      warning: "Warning",
      info: "Info",
    };
    return (convexAlerts as any[])
      .filter(a => a.alertType === "income_insight"
        && a.propertyId === activeProperty?._id
        && (a.status === "resolved" || a.status === "false_flag"))
      .map(a => ({
        id: `aii-${a._id}`,
        unit: a.unit || "—",
        tenant: a.dataContext?.lineItem || "",
        building: "",
        category: "AI Insight",
        severity: sevTitle[a.severity] || "Warning",
        title: a.title || "",
        detail: a.body || "",
        amount: 0,
        date: (a.date || "").slice(0, 10),
        convexAlertId: a._id,
        isAIInsight: true,
        resolution: a.status as "resolved" | "false_flag",
        falseFlagReason: a.dataContext?.falseFlagReason,
      }));
  }, [convexAlerts, activeProperty?._id]);

  const allAlerts = [...customAlerts, ...alertData];
  const activeAlerts = allAlerts.filter(a => !archivedIds.has(a.id));
  // Handled = locally archived custom/rule rows + Convex-resolved AI insights.
  // Hidden ids are filtered out client-side only — the underlying data stays
  // in Convex so syncs and continuity aren't affected.
  const archivedAlerts = [
    ...allAlerts.filter(a => archivedIds.has(a.id)),
    ...resolvedAIInsights,
  ].filter(a => !hiddenIds.has(a.id));
  const handledTotalPages = Math.max(1, Math.ceil(archivedAlerts.length / HANDLED_PAGE_SIZE));
  const handledPageRows = archivedAlerts.slice(handledPage * HANDLED_PAGE_SIZE, (handledPage + 1) * HANDLED_PAGE_SIZE);

  function hideHandled(id: string) {
    const next = new Set(hiddenIds);
    next.add(id);
    setHiddenIds(next);
    saveHidden(next);
  }

  async function handleMarkCompleted(row: AlertRow) {
    if (row.isAIInsight && row.convexAlertId) {
      await updateAlertStatus({
        id: row.convexAlertId as any,
        status: "resolved",
        resolvedBy: user?.fullName || user?.firstName || "User",
      });
    } else {
      archiveAlert(row.id);
    }
    setSelectedAlertId(null);
  }

  async function handleSubmitFalseFlag(reason: string) {
    if (!flagging) return;
    const row = flagging.row;
    if (row.isAIInsight && row.convexAlertId) {
      await markFalseFlag({
        id: row.convexAlertId as any,
        reason: reason.trim(),
        markedBy: user?.fullName || user?.firstName || "User",
      });
    }
    setFlagging(null);
    setSelectedAlertId(null);
  }

  async function handleRestore(row: AlertRow) {
    if (row.isAIInsight && row.convexAlertId) {
      // undoFalseFlag also clears resolved status (sets back to "new") and
      // strips any falseFlagReason — universal restore for AI insights.
      await undoFalseFlag({ id: row.convexAlertId as any });
    } else {
      restoreAlert(row.id);
    }
  }

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
        { field: "detail", headerName: "Details", flex: 1, autoHeight: true, wrapText: true, cellRenderer: DetailCellRenderer },
      ];
    }
    // Mirrors the Add Alert modal fields: severity / category / unit / details.
    return [
      { field: "severity", headerName: "Severity", width: 110, cellRenderer: SeverityCellRenderer, filter: true },
      { field: "category", headerName: "Category", width: 160, cellRenderer: CategoryCellRenderer, filter: true },
      { field: "unit", headerName: "Unit", width: 100 },
      { field: "detail", headerName: "Details", flex: 1, autoHeight: true, wrapText: true, cellRenderer: DetailCellRenderer },
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
      <div className="ag-theme-alpine w-full rounded-2xl overflow-hidden border border-[#e8eaef] dark:border-[#3f3f46] shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-8" style={{ height: "calc(80vh - 224px)", minHeight: 384 }}>
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
          paginationPageSize={20}
          getRowId={(params) => params.data.id}
        />
      </div>

      <AlertDrawer
        alert={activeAlerts.find(a => a.id === selectedAlertId) ?? null}
        onClose={() => setSelectedAlertId(null)}
        onSave={async (updates) => {
          if (!selectedAlertId) return;
          if (!selectedAlertId.startsWith("custom-")) return;
          const convexId = selectedAlertId.replace(/^custom-/, "");
          await updateAlert({
            id: convexId as any,
            title: updates.detail?.slice(0, 120),
            body: updates.detail,
            severity: updates.severity?.toLowerCase(),
            unit: updates.unit,
          });
        }}
        onMarkCompleted={handleMarkCompleted}
        onMarkFalseFlag={(row) => setFlagging({ row })}
        propertyId={activeProperty?._id}
        tenants={tenants}
        propertyPm={activeProperty ? { name: activeProperty.pmName, email: activeProperty.pmEmail, company: activeProperty.pmCompany } : null}
      />

      {flagging && (
        <FalseFlagModal
          title={flagging.row.title || flagging.row.detail.slice(0, 80) || "this finding"}
          onCancel={() => setFlagging(null)}
          onSubmit={handleSubmitFalseFlag}
        />
      )}

      {/* Archived / Handled */}
      {archivedAlerts.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Handled ({archivedAlerts.length})</p>
            {handledTotalPages > 1 && (
              <div className="flex items-center gap-2 text-[11px] text-[#71717a] dark:text-[#a1a1aa]">
                <button
                  onClick={() => setHandledPage(p => Math.max(0, p - 1))}
                  disabled={handledPage === 0}
                  className="px-2 py-0.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded hover:bg-white dark:hover:bg-[#18181b] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >‹</button>
                <span>Page {Math.min(handledPage, handledTotalPages - 1) + 1} of {handledTotalPages}</span>
                <button
                  onClick={() => setHandledPage(p => Math.min(handledTotalPages - 1, p + 1))}
                  disabled={handledPage >= handledTotalPages - 1}
                  className="px-2 py-0.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded hover:bg-white dark:hover:bg-[#18181b] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >›</button>
              </div>
            )}
          </div>
          <div className="space-y-0 border border-[#e4e4e7] dark:border-[#3f3f46] rounded overflow-hidden">
            {handledPageRows.map(a => (
              <div key={a.id} className="group flex items-center gap-3 px-3 py-2 border-b border-[#f4f4f5] dark:border-[#27272a] last:border-0 bg-[#fafafa] dark:bg-[#27272a]">
                <span className={`text-[11px] font-medium ${a.resolution === "false_flag" ? "text-[#d97706]" : "text-[#16a34a]"}`}>
                  {a.resolution === "false_flag" ? "⚑" : "✓"}
                </span>
                <span className="text-[12px] font-medium text-[#71717a] dark:text-[#a1a1aa] w-14 flex-shrink-0">{a.unit}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-[#a1a1aa] dark:text-[#71717a] line-through truncate">{a.title || a.detail}</p>
                  {a.falseFlagReason && (
                    <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] italic truncate mt-0.5">"{a.falseFlagReason}"</p>
                  )}
                </div>
                {a.resolution && (
                  <span className="text-[9px] uppercase tracking-wide font-medium text-[#a1a1aa] dark:text-[#71717a] flex-shrink-0">
                    {a.resolution === "false_flag" ? "false flag" : "completed"}
                  </span>
                )}
                <button onClick={() => handleRestore(a)}
                  className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer px-2 py-0.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded hover:bg-white dark:hover:bg-[#18181b] transition-colors flex-shrink-0">
                  Restore
                </button>
                <button onClick={() => hideHandled(a.id)}
                  title="Delete (UI only — backend record is preserved)"
                  className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] hover:text-[#dc2626] dark:hover:text-[#dc2626] cursor-pointer px-1.5 py-0.5 rounded transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100">
                  Delete
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
  alert: alertProp, onClose, onSave, onMarkCompleted, onMarkFalseFlag, propertyId, tenants, propertyPm,
}: {
  alert: AlertRow | null;
  onClose: () => void;
  onSave: (updates: Partial<AlertRow>) => void;
  onMarkCompleted: (row: AlertRow) => void | Promise<void>;
  onMarkFalseFlag: (row: AlertRow) => void;
  propertyId?: string;
  tenants: any[];
  propertyPm: { name?: string; email?: string; company?: string } | null;
}) {
  const [emailCtx, setEmailCtx] = useState<EmailContext | null>(null);
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
              <div className="text-[12px] text-[#18181b] dark:text-[#fafafa] leading-relaxed space-y-1.5">
                {renderMarkdownLite(alert.detail || "")}
              </div>
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

          {!isCustom && !alert.isAIInsight && (
            <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] italic leading-relaxed">
              This alert is auto-generated from sync data. Marking it as completed archives it locally; the system will regenerate it on the next sync if the underlying condition still applies.
            </p>
          )}
          {alert.isAIInsight && (
            <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] italic leading-relaxed">
              <strong className="not-italic">Mark as Completed</strong> — addressed; resolves the finding.
              {" "}
              <strong className="not-italic">Mark as False Flag</strong> — not actually an issue; suppresses the same pattern in the next sync's prompt.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#e4e4e7] dark:border-[#3f3f46] sticky bottom-0 bg-white dark:bg-[#18181b]">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setEmailCtx(buildAlertEmail(alert, tenants, propertyPm, propertyId))}
              className="flex items-center gap-1.5 text-[12px] font-medium bg-[#2563eb] text-white hover:bg-[#1d4ed8] px-3 py-1.5 rounded cursor-pointer"
              title="Compose an email about this alert"
            >
              <Mail size={12} /> Send Email
            </button>
            <button
              onClick={() => onMarkCompleted(alert)}
              className="text-[12px] font-medium bg-[#16a34a] text-white hover:bg-[#15803d] px-3 py-1.5 rounded cursor-pointer"
            >
              Mark as Completed
            </button>
            {alert.isAIInsight && (
              <button
                onClick={() => onMarkFalseFlag(alert)}
                className="text-[12px] font-medium border border-[#d97706] text-[#d97706] hover:bg-[#fffbeb] dark:hover:bg-[#451a03] px-3 py-1.5 rounded cursor-pointer"
              >
                Mark as False Flag
              </button>
            )}
          </div>
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
      <EmailComposer open={!!emailCtx} context={emailCtx} onClose={() => setEmailCtx(null)} />
    </div>
  );
}

function buildAlertEmail(
  alert: AlertRow,
  tenants: any[],
  pm: { name?: string; email?: string; company?: string } | null,
  propertyId?: string
): EmailContext {
  // Prefer the tenant's email if we have it. Otherwise fall back to PM.
  const t = alert.unit ? tenants.find((x: any) => (x.unit || "").toLowerCase() === alert.unit.toLowerCase()) : null;
  const tenantEmail = t?.tenantEmail;
  const toEmail = tenantEmail || pm?.email || "";
  const toName = tenantEmail ? (t?.tenantContactName || t?.tenant) : pm?.name;

  // Subject: if a title exists, use it (with optional " — Unit N" tail when
  // we have a unit). Otherwise use the category, again with " — Unit N"
  // only when a unit is set. Property-level alerts (no unit) don't get a
  // dangling " — Unit " in either case.
  const unitTail = alert.unit ? ` — Unit ${alert.unit}` : "";
  const subject = alert.title
    ? `${alert.title}${unitTail}`
    : `${alert.category}${unitTail}`;

  const cleanDetail = (alert.detail || "").replace(/\*\*/g, "").replace(/^- /gm, "• ");
  const greeting = tenantEmail
    ? (t?.tenantContactName ? `Hi ${t.tenantContactName},` : "Hello,")
    : (pm?.name ? `Hi ${pm.name},` : "Hi team,");

  // Body intro varies based on what we know:
  //   - tenant email available → speak to the tenant
  //   - have a unit + tenant name → "Following up on Unit X — Tenant:"
  //   - have a unit but no tenant name → "Following up on Unit X:"
  //   - no unit (property-level alert) → "Following up on the alert below:"
  let subject_intro: string;
  if (tenantEmail) {
    subject_intro = "I'm reaching out about your unit:";
  } else if (alert.unit) {
    subject_intro = alert.tenant
      ? `Following up on Unit ${alert.unit} — ${alert.tenant}:`
      : `Following up on Unit ${alert.unit}:`;
  } else {
    subject_intro = "Following up on the alert below:";
  }

  const body =
`${greeting}

${subject_intro}

${cleanDetail}

Please let me know if you have questions or need more context.

Best regards,`;

  return {
    propertyId,
    relatedType: "alert",
    relatedId: alert.id,
    toEmail,
    toName,
    subject,
    body,
  };
}

function FalseFlagModal({ title, onCancel, onSubmit }: {
  title: string;
  onCancel: () => void;
  onSubmit: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!reason.trim() || submitting) return;
    setSubmitting(true);
    try { await onSubmit(reason); } finally { setSubmitting(false); }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
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
        <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-1">Mark as False Flag</p>
        <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] mb-3 truncate">"{title}"</p>
        <p className="text-[12px] text-[#52525b] dark:text-[#a1a1aa] mb-2 leading-relaxed">
          Why isn't this an issue? Your explanation gets saved so the next sync won't re-flag the same finding.
        </p>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="e.g. Annual real-estate tax accrual is recorded as a lump sum in Q1 — this is expected."
          className="w-full text-[12px] bg-white dark:bg-[#09090b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-2 text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] dark:placeholder-[#52525b] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa] resize-none"
        />
        <div className="flex items-center justify-end gap-2 mt-3">
          <button
            onClick={onCancel}
            className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] px-3 py-1.5 rounded cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason.trim() || submitting}
            className="text-[12px] font-medium bg-[#d97706] text-white hover:bg-[#b45309] px-3 py-1.5 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Saving…" : "Mark as False Flag"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Lightweight markdown renderer mirroring the dashboard's renderer: handles
// **bold**, "- " bullets, and \n\n section breaks. Kept inline so the alerts
// page doesn't need a markdown library.
function renderMarkdownLite(text: string): React.ReactNode {
  const sections = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  return sections.map((section, i) => {
    const lines = section.split("\n").map(l => l.trimEnd());
    const blocks: React.ReactNode[] = [];
    let bulletBuffer: string[] = [];
    const flushBullets = () => {
      if (bulletBuffer.length > 0) {
        blocks.push(
          <ul key={`ul-${blocks.length}`} className="space-y-1 ml-4 list-disc marker:text-[#a1a1aa] dark:marker:text-[#52525b]">
            {bulletBuffer.map((b, bi) => (
              <li key={bi}>{renderInlineLite(b)}</li>
            ))}
          </ul>
        );
        bulletBuffer = [];
      }
    };
    for (const line of lines) {
      const m = line.match(/^[-*]\s+(.*)$/);
      if (m) bulletBuffer.push(m[1]);
      else {
        flushBullets();
        if (line.trim().length > 0) blocks.push(<p key={`p-${blocks.length}`}>{renderInlineLite(line)}</p>);
      }
    }
    flushBullets();
    return <div key={i} className="space-y-1.5">{blocks}</div>;
  });
}

function renderInlineLite(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={key++} className="font-semibold text-[#18181b] dark:text-[#fafafa]">{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

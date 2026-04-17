"use client";
import { useState, useMemo, useCallback, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, GridReadyEvent } from "ag-grid-community";
import PageHeader from "@/components/PageHeader";
import { useActivityLog } from "@/hooks/useConvexData";

ModuleRegistry.registerModules([AllCommunityModule]);

type ActivityType = "task_added" | "task_completed" | "task_assigned" | "status_change" | "note_added" | "deal_update" | "alert_created" | "alert_resolved" | "email_sent" | "sync" | "login";

interface ActivityEntry {
  _id?: string;
  id?: string;
  type: ActivityType;
  description: string;
  user: string;
  unit?: string;
  dealId?: string;
  createdAt: string;
}

const typeLabels: Record<ActivityType, string> = {
  task_added: "Task Added",
  task_completed: "Task Completed",
  task_assigned: "Task Assigned",
  status_change: "Status Change",
  note_added: "Note Added",
  deal_update: "Deal Update",
  alert_created: "Alert Created",
  alert_resolved: "Alert Resolved",
  email_sent: "Email Sent",
  sync: "Data Sync",
  login: "Login",
};

function getActivityColor(type: ActivityType): string {
  const map: Record<ActivityType, string> = {
    task_added: "bg-[#2563eb]",
    task_completed: "bg-[#16a34a]",
    task_assigned: "bg-[#7c3aed]",
    status_change: "bg-[#d97706]",
    note_added: "bg-[#71717a]",
    deal_update: "bg-[#0891b2]",
    alert_created: "bg-[#dc2626]",
    alert_resolved: "bg-[#16a34a]",
    email_sent: "bg-[#2563eb]",
    sync: "bg-[#71717a]",
    login: "bg-[#a1a1aa]",
  };
  return map[type];
}

function TypeCellRenderer(props: { value: ActivityType }) {
  return (
    <span className={`text-[9px] font-medium px-2 py-0.5 rounded text-white whitespace-nowrap ${getActivityColor(props.value)}`}>
      {typeLabels[props.value]}
    </span>
  );
}

function TimestampCellRenderer(props: { value: string }) {
  if (!props.value) return <span>\u2014</span>;
  const d = new Date(props.value);
  return (
    <div className="text-[11px]">
      <div className="text-[#18181b]">{d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
      <div className="text-[10px] text-[#a1a1aa]">{d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
    </div>
  );
}

export default function ActivityPage() {
  const entries = useActivityLog() as ActivityEntry[];
  const [filter, setFilter] = useState<string>("all");
  const gridRef = useRef<AgGridReact>(null);

  const types: ActivityType[] = Array.from(new Set(entries.map(e => e.type)));
  const filtered = filter === "all" ? entries : entries.filter(e => e.type === filter);

  const columnDefs = useMemo<ColDef[]>(() => [
    { field: "createdAt", headerName: "When", width: 170, cellRenderer: TimestampCellRenderer,
      sort: "desc",
      comparator: (a: string, b: string) => new Date(a).getTime() - new Date(b).getTime() },
    { field: "type", headerName: "Type", width: 150, cellRenderer: TypeCellRenderer, filter: true },
    { field: "description", headerName: "Description", minWidth: 300, flex: 2, wrapText: true, autoHeight: true },
    { field: "user", headerName: "User", width: 110, filter: true },
    { field: "unit", headerName: "Unit", width: 100, filter: true,
      valueFormatter: (p: any) => p.value || "\u2014" },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
  }), []);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    if (window.innerWidth >= 768) {
      params.api.sizeColumnsToFit();
    }
  }, []);

  return (
    <div>
      <PageHeader title="Activity Feed" subtitle="Recent actions & audit log" />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6">
        <div className="bg-white border border-[#e4e4e7] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">Total Events</p>
          <p className="text-[18px] font-semibold text-[#18181b] mt-0.5">{entries.length}</p>
        </div>
        <div className="bg-white border border-[#e4e4e7] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">Today</p>
          <p className="text-[18px] font-semibold text-[#18181b] mt-0.5">{entries.filter(e => new Date(e.createdAt).toDateString() === new Date().toDateString()).length}</p>
        </div>
        <div className="bg-white border border-[#e4e4e7] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">By Ori</p>
          <p className="text-[18px] font-semibold text-[#18181b] mt-0.5">{entries.filter(e => e.user === "Ori").length}</p>
        </div>
        <div className="bg-white border border-[#e4e4e7] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">By Max</p>
          <p className="text-[18px] font-semibold text-[#18181b] mt-0.5">{entries.filter(e => e.user === "Max").length}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <button onClick={() => setFilter("all")}
          className={`text-[11px] font-medium px-3 py-1.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
            filter === "all" ? "bg-[#18181b] text-white" : "text-[#71717a] hover:bg-[#f4f4f5]"
          }`}>
          All
        </button>
        {types.map(type => (
          <button key={type} onClick={() => setFilter(type)}
            className={`text-[11px] font-medium px-3 py-1.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
              filter === type ? "bg-[#18181b] text-white" : "text-[#71717a] hover:bg-[#f4f4f5]"
            }`}>
            {typeLabels[type]}
          </button>
        ))}
      </div>

      {/* Activity Grid */}
      <div className="ag-theme-quartz" style={{ height: 620, width: "100%" }}>
        <AgGridReact
          ref={gridRef}
          rowData={filtered}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          headerHeight={36}
          rowHeight={56}
          suppressCellFocus={true}
        />
      </div>
    </div>
  );
}

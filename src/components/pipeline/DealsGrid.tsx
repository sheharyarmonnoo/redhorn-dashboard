"use client";
import { useMemo, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, RowClickedEvent } from "ag-grid-community";
import { formatCurrency, useDealFieldDefinitions } from "@/hooks/useConvexData";
import { useAgGridPersistence } from "@/hooks/useAgGridPersistence";
import { DealStage, getStageLabel } from "@/data/_seed_deals";

ModuleRegistry.registerModules([AllCommunityModule]);

const STAGE_DOT: Record<string, string> = {
  lead: "bg-[#71717a]",
  outreach: "bg-[#2563eb]",
  underwriting: "bg-[#7c3aed]",
  loi: "bg-[#d97706]",
  due_diligence: "bg-[#0891b2]",
  closing: "bg-[#16a34a]",
  closed: "bg-[#18181b]",
  dead: "bg-[#dc2626]",
};

function StageCellRenderer(props: { value: string }) {
  const s = props.value as DealStage;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#18181b] dark:text-[#fafafa]">
      <span className={`w-1.5 h-1.5 rounded-full ${STAGE_DOT[s] || "bg-[#a1a1aa]"}`} />
      {getStageLabel(s)}
    </span>
  );
}

function CurrencyCellRenderer(props: { value: number }) {
  return <span>{props.value > 0 ? formatCurrency(props.value) : "—"}</span>;
}

function NotesCellRenderer(props: { value: any[] }) {
  const n = Array.isArray(props.value) ? props.value.length : 0;
  if (n === 0) return <span className="text-[#a1a1aa]">—</span>;
  const last = props.value[props.value.length - 1];
  const text = String(last?.text || "").replace(/\s+/g, " ").slice(0, 80);
  return <span className="text-[11px]" title={last?.text}>{text}{(last?.text?.length || 0) > 80 ? "…" : ""} <span className="text-[#a1a1aa]">({n})</span></span>;
}

interface Props {
  deals: any[];
  quickSearch: string;
  onDealClick: (deal: any) => void;
}

/**
 * AG Grid table view of the deal pipeline. Mirrors the rent-roll grid setup
 * (community module, alpine theme, persistence hook). Custom field columns
 * are appended dynamically based on the deal_field_definitions table — every
 * column the user adds in the Manage Fields modal automatically gets a slot
 * here too.
 */
export default function DealsGrid({ deals, quickSearch, onDealClick }: Props) {
  const gridRef = useRef<AgGridReact>(null);
  const { defs } = useDealFieldDefinitions();
  const persistence = useAgGridPersistence({ storageKey: "redhorn_grid_deals" });

  const columnDefs = useMemo<ColDef[]>(() => {
    const base: ColDef[] = [
      { field: "name", headerName: "Name", width: 240, pinned: "left",
        cellRenderer: (p: any) => (
          <span className="font-medium text-[#18181b] dark:text-[#fafafa]">{p.value || "—"}</span>
        ) },
      { field: "stage", headerName: "Stage", width: 150, pinned: "left",
        filter: "agSetColumnFilter",
        cellRenderer: StageCellRenderer },
      { field: "address", headerName: "Address", width: 260,
        valueGetter: (p: any) => p.data?.address || "" },
      { field: "city", headerName: "City", width: 110 },
      { field: "state", headerName: "State", width: 80 },
      { field: "propertyType", headerName: "Type", width: 130 },
      { field: "sqft", headerName: "Sq Ft", width: 110, filter: "agNumberColumnFilter",
        valueFormatter: (p: any) => p.value ? p.value.toLocaleString() : "—" },
      { field: "askingPrice", headerName: "Asking Price", width: 140, filter: "agNumberColumnFilter",
        cellRenderer: CurrencyCellRenderer },
      { field: "pricePerSF", headerName: "$/SF", width: 90,
        valueFormatter: (p: any) => p.value ? `$${p.value}` : "—" },
      { field: "capRate", headerName: "Cap Rate", width: 100,
        valueFormatter: (p: any) => p.value ? `${p.value}%` : "—" },
      { field: "assignedTo", headerName: "Assigned To", width: 140 },
      { field: "source", headerName: "Source", width: 160 },
      { field: "createdAt", headerName: "Created", width: 110, hide: true,
        valueFormatter: (p: any) => {
          if (!p.value) return "—";
          try { return new Date(p.value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }); } catch { return "—"; }
        } },
      { field: "updatedAt", headerName: "Updated", width: 110,
        valueFormatter: (p: any) => {
          if (!p.value) return "—";
          try { return new Date(p.value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }); } catch { return "—"; }
        } },
      { field: "mondayItemId", headerName: "Monday ID", width: 130, hide: true },
      { field: "notes", headerName: "Notes", width: 320, sortable: false, filter: false,
        cellRenderer: NotesCellRenderer },
    ];

    // Dynamic columns from custom field definitions. Currency and number
    // columns get an AG-Grid number filter; date columns get a date format;
    // select columns become set-filter friendly.
    const customCols: ColDef[] = (defs || []).map((d: any) => {
      const base: ColDef = {
        headerName: d.label,
        field: `customFields.${d.key}`,
        valueGetter: (p: any) => (p.data?.customFields || {})[d.key],
        width: 150,
      };
      if (d.type === "currency" || d.type === "number") {
        base.filter = "agNumberColumnFilter";
        if (d.type === "currency") {
          base.cellRenderer = (p: any) => p.value > 0 ? formatCurrency(p.value) : "—";
        } else {
          base.valueFormatter = (p: any) => p.value === undefined || p.value === null || p.value === "" ? "—" : String(p.value);
        }
      } else if (d.type === "date") {
        base.valueFormatter = (p: any) => {
          if (!p.value) return "—";
          try { return new Date(p.value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }); } catch { return p.value; }
        };
      } else if (d.type === "select" || d.type === "text") {
        base.filter = "agSetColumnFilter";
      } else if (d.type === "longtext") {
        base.cellRenderer = (p: any) => {
          const t = String(p.value || "").replace(/\s+/g, " ").slice(0, 60);
          return <span className="text-[11px]" title={p.value}>{t}{(p.value?.length || 0) > 60 ? "…" : ""}</span>;
        };
        base.sortable = false;
      }
      return base;
    });

    return [...base, ...customCols];
  }, [defs]);

  const defaultColDef: ColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    floatingFilter: false,
    cellStyle: {
      display: "flex",
      alignItems: "center",
      fontSize: "12px",
      color: "var(--ag-foreground-color)",
    },
  }), []);

  const onRowClicked = (e: RowClickedEvent) => {
    if (e.data) onDealClick(e.data);
  };

  return (
    <div className="ag-theme-alpine w-full rounded overflow-auto border border-[#e4e4e7] dark:border-[#3f3f46] flex-1 min-h-0">
      <AgGridReact
        ref={gridRef}
        rowData={deals}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        quickFilterText={quickSearch}
        onRowClicked={onRowClicked}
        pagination={true}
        paginationPageSize={50}
        paginationPageSizeSelector={[25, 50, 100, 200]}
        onGridReady={persistence.onGridReady}
        onColumnResized={persistence.onColumnResized}
        onColumnMoved={persistence.onColumnMoved}
        onColumnVisible={persistence.onColumnVisible}
        onColumnPinned={persistence.onColumnPinned}
        rowClassRules={{ "rh-clickable-row": () => true }}
      />
    </div>
  );
}

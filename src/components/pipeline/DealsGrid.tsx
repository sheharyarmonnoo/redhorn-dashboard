"use client";
import { useMemo, useRef, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, ColGroupDef, RowClickedEvent } from "ag-grid-community";
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
  /** Restrict rows to this stage. Composes (AND) with quickSearch. */
  stageFilter?: DealStage | null;
  /** Deal id to visually highlight (e.g. recently stage-changed). */
  recentlyMovedId?: string | null;
}

/**
 * AG Grid table view of the deal pipeline. Mirrors the rent-roll grid setup
 * (community module, alpine theme, persistence hook). Custom field columns
 * are appended dynamically based on the deal_field_definitions table — every
 * column the user adds in the Manage Fields modal automatically gets a slot
 * here too.
 */
export default function DealsGrid({ deals, quickSearch, onDealClick, stageFilter, recentlyMovedId }: Props) {
  const gridRef = useRef<AgGridReact>(null);
  const { defs } = useDealFieldDefinitions();
  const persistence = useAgGridPersistence({ storageKey: "redhorn_grid_deals" });

  const columnDefs = useMemo<(ColDef | ColGroupDef)[]>(() => {
    const base: (ColDef | ColGroupDef)[] = [
      { field: "name", headerName: "Name", width: 240, pinned: "left",
        cellRenderer: (p: any) => (
          <span className="font-medium text-[#18181b] dark:text-[#fafafa]">{p.value || "—"}</span>
        ) },
      { field: "stage", headerName: "Stage", width: 150, pinned: "left",
        filter: "agSetColumnFilter",
        cellRenderer: StageCellRenderer },
      // Address group — Address visible by default; City + State reveal on
      // group expand. Saves horizontal real estate while keeping the
      // city/state available for filtering.
      {
        headerName: "Location",
        marryChildren: true,
        children: [
          { field: "address", headerName: "Address", width: 260,
            valueGetter: (p: any) => p.data?.address || "" },
          { field: "city", headerName: "City", width: 110, columnGroupShow: "open" },
          { field: "state", headerName: "State", width: 80, columnGroupShow: "open" },
        ],
      } as ColGroupDef,
      { field: "propertyType", headerName: "Type", width: 130 },
      { field: "sqft", headerName: "Sq Ft", width: 110, filter: "agNumberColumnFilter",
        valueFormatter: (p: any) => p.value ? p.value.toLocaleString() : "—" },
      // Pricing group — Asking visible by default; $/SF + Cap Rate reveal on
      // group expand.
      {
        headerName: "Pricing",
        marryChildren: true,
        children: [
          { field: "askingPrice", headerName: "Asking Price", width: 140, filter: "agNumberColumnFilter",
            cellRenderer: CurrencyCellRenderer },
          { field: "pricePerSF", headerName: "$/SF", width: 90, columnGroupShow: "open",
            valueFormatter: (p: any) => p.value ? `$${p.value}` : "—" },
          { field: "capRate", headerName: "Cap Rate", width: 100, columnGroupShow: "open",
            valueFormatter: (p: any) => p.value ? `${p.value}%` : "—" },
        ],
      } as ColGroupDef,
      { field: "assignedTo", headerName: "Assigned To", width: 140, hide: true },
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

  // External filter on `stage` so it composes with quickFilterText (built-in
  // quick filter still runs alongside external filter — both must pass).
  // We re-evaluate whenever `stageFilter` changes.
  const isExternalFilterPresent = () => stageFilter != null;
  const doesExternalFilterPass = (node: any) => {
    if (!stageFilter) return true;
    return node?.data?.stage === stageFilter;
  };
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.onFilterChanged();
  }, [stageFilter]);

  // Highlight the recently-moved row. We use rowClassRules so AG Grid keeps
  // its own hover/selected classes intact (CSS layered, hover wins where it
  // matters because it's a more specific pseudo-class on .ag-row-hover).
  const rowClassRules = useMemo(() => ({
    "rh-clickable-row": () => true,
    "rh-recently-moved-row": (params: any) => !!recentlyMovedId && params?.data?._id === recentlyMovedId,
  }), [recentlyMovedId]);

  // Re-tag rows when recentlyMovedId changes so the highlight applies/clears
  // without waiting for the next AG Grid render pass.
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.redrawRows();
  }, [recentlyMovedId]);

  return (
    <div className="ag-theme-alpine w-full rounded overflow-auto border border-[#e4e4e7] dark:border-[#3f3f46] flex-1 min-h-0">
      {/* Local style: yellow left-border accent on the recently-moved row.
          Background uses an opacity-soft amber so AG Grid's hover color
          (which is also a background color rule) still reads through. */}
      <style jsx global>{`
        .ag-theme-alpine .ag-row.rh-recently-moved-row {
          box-shadow: inset 3px 0 0 0 #d97706;
          background-color: rgba(217, 119, 6, 0.08);
        }
        .ag-theme-alpine .ag-row.rh-recently-moved-row.ag-row-hover {
          background-color: rgba(217, 119, 6, 0.16);
        }
      `}</style>
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
        rowClassRules={rowClassRules}
        isExternalFilterPresent={isExternalFilterPresent}
        doesExternalFilterPass={doesExternalFilterPass}
      />
    </div>
  );
}

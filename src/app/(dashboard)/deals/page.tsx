"use client";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, ColGroupDef, GridReadyEvent, CellValueChangedEvent, CellClickedEvent } from "ag-grid-community";
import PageHeader from "@/components/PageHeader";
import { DealStage, getStageLabel, getStageColor } from "@/data/_seed_deals";
import { useDeals, formatCurrency } from "@/hooks/useConvexData";
import { Plus, Trash2, LayoutGrid, List, ArrowUpRight } from "lucide-react";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { DealDetail } from "@/components/pipeline/DealDetail";

const VIEW_KEY = "redhorn_deals_view";

ModuleRegistry.registerModules([AllCommunityModule]);

const stages: DealStage[] = ["lead", "outreach", "underwriting", "loi", "due_diligence", "closing", "closed", "dead"];

function StageCellRenderer(props: { value: string }) {
  const stage = props.value as DealStage;
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded text-white ${getStageColor(stage)}`}>
      {getStageLabel(stage)}
    </span>
  );
}

function CurrencyCellRenderer(props: { value: number }) {
  return <span>{props.value > 0 ? formatCurrency(props.value) : "\u2014"}</span>;
}

function PercentCellRenderer(props: { value: number }) {
  return <span>{props.value ? `${props.value}%` : "\u2014"}</span>;
}

export default function DealsPage() {
  const { deals, createDeal, updateStage, updateField, addNote, addTask, updateTask, toggleTask, removeTask, addDocument, removeDocument, removeDeal } = useDeals();
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"pipeline" | "table">(() => {
    if (typeof window === "undefined") return "pipeline";
    return (localStorage.getItem(VIEW_KEY) as "pipeline" | "table") || "pipeline";
  });
  const gridRef = useRef<AgGridReact>(null);

  function switchView(mode: "pipeline" | "table") {
    setViewMode(mode);
    localStorage.setItem(VIEW_KEY, mode);
  }

  async function handleCreateNewDeal() {
    // Create a blank deal and open its drawer for editing
    const id = await createDeal({
      name: "New Deal",
      address: "",
      city: "Houston",
      state: "TX",
      propertyType: "Office/Warehouse",
      sqft: 0,
      units: 0,
      askingPrice: 0,
      stage: "lead",
      source: "",
      assignedTo: "Max",
      contacts: [],
    });
    // Mark this id as a draft so we can auto-delete it on close if the user didn't edit anything
    draftDealIdRef.current = id as any;
    setSelectedDeal({ _id: id, name: "New Deal", address: "", city: "Houston", state: "TX", propertyType: "Office/Warehouse", sqft: 0, units: 0, askingPrice: 0, stage: "lead", source: "", assignedTo: "Max", contacts: [], notes: [], emails: [], tasks: [], documents: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  // M9: track the most recently created "New Deal" so we can clean it up if the user closes the drawer without editing
  const draftDealIdRef = useRef<any>(null);

  function isUntouchedDraft(d: any) {
    if (!d) return false;
    return (
      d.name === "New Deal" &&
      !d.address &&
      (d.askingPrice ?? 0) === 0 &&
      (d.sqft ?? 0) === 0 &&
      (d.units ?? 0) === 0 &&
      !d.source &&
      (!d.notes || d.notes.length === 0) &&
      (!d.tasks || d.tasks.length === 0) &&
      (!d.documents || d.documents.length === 0) &&
      d.stage === "lead"
    );
  }

  function handleCloseDrawer() {
    const draftId = draftDealIdRef.current;
    if (draftId) {
      const live = deals.find((d: any) => d._id === draftId);
      if (live && isUntouchedDraft(live)) {
        removeDeal({ id: draftId });
      }
    }
    draftDealIdRef.current = null;
    setSelectedDeal(null);
  }

  function handleDeleteDeal(id: any) {
    removeDeal({ id });
    if (selectedDeal?._id === id) setSelectedDeal(null);
  }

  function handleStageChange(dealId: string, stage: DealStage) {
    updateStage({ id: dealId as any, stage });
  }

  const columnDefs = useMemo<(ColDef | ColGroupDef)[]>(() => [
    // Open-drawer icon column (no group header, no expand)
    {
      headerName: "",
      groupId: "open",
      openByDefault: true,
      children: [
        {
          headerName: "",
          colId: "open",
          width: 44,
          minWidth: 44,
          maxWidth: 44,
          pinned: "left",
          sortable: false,
          filter: false,
          resizable: false,
          editable: false,
          cellRenderer: (p: any) => (
            <button
              className="inline-flex items-center justify-center w-full h-full text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"
              title="Open deal details"
              onClick={(e) => { e.stopPropagation(); setSelectedDeal(p.data); }}
            >
              <ArrowUpRight size={13} />
            </button>
          ),
        },
      ],
    } as ColGroupDef,
    // Property group — Name always visible; Type/Sq Ft/Units on expand
    {
      headerName: "Property",
      groupId: "property",
      openByDefault: false,
      children: [
        { field: "name", headerName: "Name", minWidth: 180, flex: 2, editable: true,
          cellRenderer: (p: any) => (
            <span className="font-medium text-[#18181b] dark:text-[#fafafa]">{p.data.name}</span>
          ) },
        { field: "propertyType", headerName: "Type", minWidth: 120, flex: 1, filter: true, editable: true,
          columnGroupShow: "open",
          cellEditor: "agSelectCellEditor",
          cellEditorParams: { values: ["Office/Warehouse", "Industrial", "Flex/Office", "Retail", "Warehouse", "Mixed Use"] } },
        { field: "sqft", headerName: "Sq Ft", minWidth: 90, flex: 1, type: "numericColumn", editable: true,
          columnGroupShow: "open",
          valueFormatter: (p: any) => p.value?.toLocaleString() || "\u2014",
          valueParser: (p: any) => Number(p.newValue) || 0 },
        { field: "units", headerName: "Units", minWidth: 80, flex: 1, type: "numericColumn", editable: true,
          columnGroupShow: "open",
          valueParser: (p: any) => Number(p.newValue) || 0 },
        { field: "address", headerName: "Address", minWidth: 160, flex: 1, editable: true, columnGroupShow: "open" },
        { field: "city", headerName: "City", minWidth: 110, flex: 1, editable: true, columnGroupShow: "open", hide: true },
        { field: "state", headerName: "State", minWidth: 70, flex: 1, editable: true, columnGroupShow: "open", hide: true },
      ],
    } as ColGroupDef,
    // Deal group — Stage always visible; Assigned + Source on expand
    {
      headerName: "Deal",
      groupId: "deal",
      openByDefault: true,
      children: [
        { field: "stage", headerName: "Stage", width: 50, minWidth: 35, pinned: "left", cellRenderer: StageCellRenderer, filter: true, editable: true,
          cellEditor: "agSelectCellEditor",
          cellEditorParams: { values: stages } },
        { field: "assignedTo", headerName: "Assigned", minWidth: 100, flex: 1, filter: true, editable: true,
          columnGroupShow: "open",
          cellEditor: "agSelectCellEditor",
          cellEditorParams: { values: ["Ori", "Max"] } },
        { field: "source", headerName: "Source", minWidth: 130, flex: 1, editable: true,
          columnGroupShow: "open" },
      ],
    } as ColGroupDef,
    // Financials group — Asking Price always visible; Cap Rate + $/SF on expand
    {
      headerName: "Financials",
      groupId: "financials",
      openByDefault: true,
      children: [
        { field: "askingPrice", headerName: "Asking Price", minWidth: 120, flex: 1, type: "numericColumn", cellRenderer: CurrencyCellRenderer, editable: true,
          valueParser: (p: any) => Number(p.newValue) || 0 },
        { field: "capRate", headerName: "Cap Rate", minWidth: 95, flex: 1, type: "numericColumn", cellRenderer: PercentCellRenderer, editable: true,
          columnGroupShow: "open",
          valueParser: (p: any) => Number(p.newValue) || 0 },
        { field: "pricePerSF", headerName: "$/SF", minWidth: 80, flex: 1, type: "numericColumn", editable: false,
          columnGroupShow: "open",
          valueFormatter: (p: any) => p.value ? `$${p.value}` : "\u2014" },
      ],
    } as ColGroupDef,
    // Actions group
    {
      headerName: "",
      groupId: "actions",
      openByDefault: true,
      children: [
        {
          headerName: "",
          colId: "delete",
          width: 50,
          minWidth: 50,
          maxWidth: 50,
          sortable: false,
          filter: false,
          resizable: false,
          editable: false,
          cellRenderer: (p: any) => (
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteDeal(p.data._id); }}
              className="text-[#d4d4d8] dark:text-[#52525b] hover:text-[#dc2626] dark:hover:text-[#dc2626] cursor-pointer transition-colors"
              title="Delete deal"
            >
              <Trash2 size={13} />
            </button>
          ),
        },
      ],
    } as ColGroupDef,
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    suppressMovable: false,
    singleClickEdit: true,
  }), []);

  const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    const field = event.colDef.field;
    const value = event.newValue;
    if (!field || value === event.oldValue) return;
    if (field === "stage") {
      updateStage({ id: event.data._id, stage: value });
    } else {
      updateField({ id: event.data._id, field, value });
    }
  }, [updateStage, updateField]);

  const onCellClicked = useCallback((event: CellClickedEvent) => {
    // Only open drawer when user clicks the "open" icon column
    const colId = (event.colDef as any).colId;
    if (colId === "open") {
      setSelectedDeal(event.data);
    }
    // All other cells (editable) — AG Grid handles inline editing
  }, []);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    // Restore saved column group open/close state from localStorage (ACP pattern)
    try {
      const saved = localStorage.getItem("redhorn-deals-col-groups");
      if (saved) {
        const groups = JSON.parse(saved) as Record<string, boolean>;
        Object.entries(groups).forEach(([groupId, open]) => {
          try { params.api.setColumnGroupOpened(groupId, open); } catch {}
        });
      }
    } catch {}
    if (window.innerWidth >= 768) {
      params.api.sizeColumnsToFit();
    }
  }, []);

  const onColumnGroupOpened = useCallback((event: any) => {
    try {
      const groupId = event.columnGroup?.getGroupId?.();
      const isExpanded = event.columnGroup?.isExpanded?.();
      if (!groupId) return;
      const saved = localStorage.getItem("redhorn-deals-col-groups");
      const groups = saved ? JSON.parse(saved) : {};
      groups[groupId] = isExpanded;
      localStorage.setItem("redhorn-deals-col-groups", JSON.stringify(groups));
    } catch {}
  }, []);

  const activeDeals = deals.filter((d: any) => d.stage !== "dead" && d.stage !== "closed");
  const totalPipeline = activeDeals.reduce((s: number, d: any) => s + (d.askingPrice || 0), 0);

  return (
    <div>
      <PageHeader title="Deal Pipeline" subtitle="Acquisitions & Sourcing" />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6">
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">Active Deals</p>
          <p className="text-[18px] font-semibold text-[#18181b] dark:text-[#fafafa] mt-0.5">{activeDeals.length}</p>
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">Pipeline Value</p>
          <p className="text-[18px] font-semibold text-[#18181b] dark:text-[#fafafa] mt-0.5">{formatCurrency(totalPipeline)}</p>
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">In LOI+</p>
          <p className="text-[18px] font-semibold text-[#18181b] dark:text-[#fafafa] mt-0.5">{deals.filter((d: any) => ["loi","due_diligence","closing"].includes(d.stage)).length}</p>
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">Dead Deals</p>
          <p className="text-[18px] font-semibold text-[#71717a] dark:text-[#a1a1aa] mt-0.5">{deals.filter((d: any) => d.stage === "dead").length}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
          <button onClick={() => switchView("pipeline")}
            title="Board view"
            className={`flex items-center justify-center px-3 py-1.5 cursor-pointer transition-colors ${viewMode === "pipeline" ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b]" : "bg-white dark:bg-[#18181b] text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a]"}`}>
            <LayoutGrid size={14} />
          </button>
          <button onClick={() => switchView("table")}
            title="Grid view"
            className={`flex items-center justify-center px-3 py-1.5 cursor-pointer transition-colors ${viewMode === "table" ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b]" : "bg-white dark:bg-[#18181b] text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a]"}`}>
            <List size={14} />
          </button>
        </div>
        <button onClick={handleCreateNewDeal}
          className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded cursor-pointer hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] transition-colors">
          <Plus size={13} /> New Deal
        </button>
      </div>

      {/* Table View (AG Grid) */}
      {viewMode === "table" && (
        <div className="ag-theme-quartz" style={{ height: 600, width: "100%" }}>
          <AgGridReact
            ref={gridRef}
            rowData={deals}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            onGridReady={onGridReady}
            onCellClicked={onCellClicked}
            onCellValueChanged={onCellValueChanged}
            onColumnGroupOpened={onColumnGroupOpened}
            rowHeight={32}
            headerHeight={28}
            groupHeaderHeight={24}
            suppressCellFocus={false}
            stopEditingWhenCellsLoseFocus={true}
          />
        </div>
      )}

      {/* Kanban View (ACP-style with dnd-kit) */}
      {viewMode === "pipeline" && (
        <div className="overflow-x-auto pb-4">
          <KanbanBoard
            deals={deals}
            onDealClick={(deal) => setSelectedDeal(deal)}
            onStageChange={handleStageChange}
          />
        </div>
      )}

      {/* Deal Detail Drawer */}
      {selectedDeal && (() => {
        const liveDeal = deals.find((d: any) => d._id === selectedDeal._id) || selectedDeal;
        return (
          <DealDetail
            deal={liveDeal}
            onClose={handleCloseDrawer}
            onStageChange={handleStageChange}
            onDelete={() => { draftDealIdRef.current = null; setSelectedDeal(null); }}
            updateField={updateField}
            addNote={addNote}
            addTask={addTask}
            updateTask={updateTask}
            toggleTask={toggleTask}
            removeTask={removeTask}
            addDocument={addDocument}
            removeDocument={removeDocument}
            removeDeal={removeDeal}
          />
        );
      })()}
    </div>
  );
}

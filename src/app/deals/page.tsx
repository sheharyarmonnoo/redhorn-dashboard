"use client";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, GridReadyEvent, RowClickedEvent, CellValueChangedEvent } from "ag-grid-community";
import PageHeader from "@/components/PageHeader";
import { DealStage, getStageLabel, getStageColor } from "@/data/_seed_deals";
import { useDeals, formatCurrency } from "@/hooks/useConvexData";
import { Plus, Trash2, LayoutGrid, List } from "lucide-react";
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", address: "", city: "Houston", state: "TX", propertyType: "Office/Warehouse", sqft: "", units: "", askingPrice: "", source: "", assignedTo: "Max" });
  const gridRef = useRef<AgGridReact>(null);

  function switchView(mode: "pipeline" | "table") {
    setViewMode(mode);
    localStorage.setItem(VIEW_KEY, mode);
  }

  function handleAddDeal() {
    if (!addForm.name.trim() || !addForm.address.trim()) return;
    createDeal({
      name: addForm.name.trim(),
      address: addForm.address.trim(),
      city: addForm.city.trim(),
      state: addForm.state.trim(),
      propertyType: addForm.propertyType,
      sqft: Number(addForm.sqft) || 0,
      units: Number(addForm.units) || 0,
      askingPrice: Number(addForm.askingPrice) || 0,
      pricePerSF: Number(addForm.sqft) > 0 ? Math.round(Number(addForm.askingPrice) / Number(addForm.sqft)) : undefined,
      stage: "lead",
      source: addForm.source.trim(),
      assignedTo: addForm.assignedTo,
      contacts: [],
    });
    setShowAddForm(false);
    setAddForm({ name: "", address: "", city: "Houston", state: "TX", propertyType: "Office/Warehouse", sqft: "", units: "", askingPrice: "", source: "", assignedTo: "Max" });
  }

  function handleDeleteDeal(id: any) {
    removeDeal({ id });
    if (selectedDeal?._id === id) setSelectedDeal(null);
  }

  function handleStageChange(dealId: string, stage: DealStage) {
    updateStage({ id: dealId as any, stage });
  }

  const columnDefs = useMemo<ColDef[]>(() => [
    { field: "name", headerName: "Property", minWidth: 200, flex: 1, pinned: "left", editable: true,
      cellRenderer: (p: any) => (
        <div>
          <div className="font-medium text-[#18181b] dark:text-[#fafafa]">{p.data.name}</div>
          <div className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">{p.data.city}, {p.data.state}</div>
        </div>
      ) },
    { field: "stage", headerName: "Stage", width: 140, cellRenderer: StageCellRenderer, filter: true, editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: stages } },
    { field: "askingPrice", headerName: "Asking Price", width: 130, type: "numericColumn", cellRenderer: CurrencyCellRenderer, editable: true,
      valueParser: (p: any) => Number(p.newValue) || 0 },
    { field: "capRate", headerName: "Cap Rate", width: 100, type: "numericColumn", cellRenderer: PercentCellRenderer, editable: true,
      valueParser: (p: any) => Number(p.newValue) || 0 },
    { field: "pricePerSF", headerName: "$/SF", width: 90, type: "numericColumn", editable: false,
      valueFormatter: (p: any) => p.value ? `$${p.value}` : "\u2014" },
    { field: "sqft", headerName: "Sq Ft", width: 100, type: "numericColumn", editable: true,
      valueFormatter: (p: any) => p.value?.toLocaleString() || "\u2014",
      valueParser: (p: any) => Number(p.newValue) || 0 },
    { field: "units", headerName: "Units", width: 80, type: "numericColumn", editable: true,
      valueParser: (p: any) => Number(p.newValue) || 0 },
    { field: "propertyType", headerName: "Type", width: 140, filter: true, editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["Office/Warehouse", "Industrial", "Flex/Office", "Retail", "Warehouse", "Mixed Use"] } },
    { field: "assignedTo", headerName: "Assigned", width: 110, filter: true, editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["Ori", "Max"] } },
    { field: "source", headerName: "Source", minWidth: 150, flex: 1, editable: true },
    { field: "city", headerName: "City", width: 120, editable: true, hide: true },
    { field: "state", headerName: "State", width: 80, editable: true, hide: true },
    { field: "address", headerName: "Address", minWidth: 200, editable: true, hide: true },
    {
      headerName: "",
      width: 60,
      sortable: false,
      filter: false,
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

  const onGridReady = useCallback((params: GridReadyEvent) => {
    if (window.innerWidth >= 768) {
      params.api.sizeColumnsToFit();
    }
  }, []);

  const onRowClicked = useCallback((event: RowClickedEvent) => {
    setSelectedDeal(event.data);
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
        <button onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded cursor-pointer hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] transition-colors">
          <Plus size={13} /> New Deal
        </button>
      </div>

      {/* Add Deal Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-4 mb-4">
          <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-3">New Deal</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} placeholder="Property Name"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" autoFocus />
            <input value={addForm.address} onChange={e => setAddForm({ ...addForm, address: e.target.value })} placeholder="Address"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
            <input value={addForm.city} onChange={e => setAddForm({ ...addForm, city: e.target.value })} placeholder="City"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
            <input value={addForm.state} onChange={e => setAddForm({ ...addForm, state: e.target.value })} placeholder="State"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
            <input value={addForm.sqft} onChange={e => setAddForm({ ...addForm, sqft: e.target.value })} placeholder="Sq Ft" type="number"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
            <input value={addForm.units} onChange={e => setAddForm({ ...addForm, units: e.target.value })} placeholder="Units" type="number"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
            <input value={addForm.askingPrice} onChange={e => setAddForm({ ...addForm, askingPrice: e.target.value })} placeholder="Asking Price" type="number"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
            <input value={addForm.source} onChange={e => setAddForm({ ...addForm, source: e.target.value })} placeholder="Source (e.g. Broker, Cold Call)"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
            <select value={addForm.propertyType} onChange={e => setAddForm({ ...addForm, propertyType: e.target.value })}
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#71717a] dark:text-[#a1a1aa]">
              <option>Office/Warehouse</option>
              <option>Industrial</option>
              <option>Flex/Office</option>
              <option>Retail</option>
              <option>Warehouse</option>
              <option>Mixed Use</option>
            </select>
            <select value={addForm.assignedTo} onChange={e => setAddForm({ ...addForm, assignedTo: e.target.value })}
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#71717a] dark:text-[#a1a1aa]">
              <option value="Ori">Assigned: Ori</option>
              <option value="Max">Assigned: Max</option>
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleAddDeal} disabled={!addForm.name.trim() || !addForm.address.trim()}
              className="text-[11px] font-medium px-4 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] transition-colors cursor-pointer disabled:opacity-40">
              Add Deal
            </button>
            <button onClick={() => setShowAddForm(false)} className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] cursor-pointer px-3 py-1.5">Cancel</button>
          </div>
        </div>
      )}

      {/* Table View (AG Grid) */}
      {viewMode === "table" && (
        <div className="ag-theme-quartz" style={{ height: 600, width: "100%" }}>
          <AgGridReact
            ref={gridRef}
            rowData={deals}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            onGridReady={onGridReady}
            onRowClicked={onRowClicked}
            onCellValueChanged={onCellValueChanged}
            rowHeight={52}
            headerHeight={36}
            suppressCellFocus={false}
            stopEditingWhenCellsLoseFocus={true}
            rowClass="cursor-pointer"
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
            onClose={() => setSelectedDeal(null)}
            onStageChange={handleStageChange}
            onDelete={() => { setSelectedDeal(null); }}
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

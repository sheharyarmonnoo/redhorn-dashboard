"use client";
import { useState, useMemo, useCallback, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, GridReadyEvent, RowClickedEvent } from "ag-grid-community";
import PageHeader from "@/components/PageHeader";
import { DealStage, getStageLabel, getStageColor, emailTemplates } from "@/data/_seed_deals";
import { useDeals, formatCurrency } from "@/hooks/useConvexData";
import { Plus, X, Send, Trash2 } from "lucide-react";

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

function DealDrawer({ deal, allDeals, onClose, updateStage, addNote, addEmail }: {
  deal: any;
  allDeals: any[];
  onClose: () => void;
  updateStage: (args: { id: any; stage: string }) => void;
  addNote: (args: { id: any; text: string; author: string }) => void;
  addEmail: (args: { id: any; to: string; subject: string; body: string; sentBy: string }) => void;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "notes" | "emails">("overview");
  const [newNote, setNewNote] = useState("");
  const [noteAuthor, setNoteAuthor] = useState("Ori");
  const [showEmailCompose, setShowEmailCompose] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  function handleStageChange(stage: DealStage) {
    updateStage({ id: deal._id, stage });
  }

  function handleAddNote() {
    if (!newNote.trim()) return;
    addNote({ id: deal._id, text: newNote.trim(), author: noteAuthor });
    setNewNote("");
  }

  function handleSendEmail() {
    if (!emailTo.trim() || !emailSubject.trim()) return;
    addEmail({ id: deal._id, to: emailTo, subject: emailSubject, body: emailBody, sentBy: noteAuthor });
    setShowEmailCompose(false);
    setEmailTo(""); setEmailSubject(""); setEmailBody("");
  }

  function applyTemplate(idx: number) {
    const tpl = emailTemplates[idx];
    if (!tpl) return;
    const contact = deal.contacts?.[0];
    let subject = tpl.subject.replace(/\{\{property_name\}\}/g, deal.name).replace(/\{\{address\}\}/g, deal.address);
    let body = tpl.body
      .replace(/\{\{property_name\}\}/g, deal.name)
      .replace(/\{\{address\}\}/g, deal.address)
      .replace(/\{\{contact_name\}\}/g, contact?.name || "")
      .replace(/\{\{sender_name\}\}/g, noteAuthor)
      .replace(/\{\{property_type\}\}/g, deal.propertyType)
      .replace(/\{\{asking_price\}\}/g, formatCurrency(deal.askingPrice));
    setEmailSubject(subject);
    setEmailBody(body);
    if (contact) setEmailTo(contact.email);
    setSelectedTemplate(String(idx));
  }

  const currentDeal = allDeals.find((d: any) => d._id === deal._id) || deal;
  const notes = currentDeal.notes || [];
  const emails = currentDeal.emails || [];

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen w-full max-w-[560px] bg-white z-50 flex flex-col shadow-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e4e4e7] flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-[#18181b] truncate">{currentDeal.name}</p>
            <p className="text-[12px] text-[#71717a] mt-0.5">{currentDeal.address}, {currentDeal.city}, {currentDeal.state}</p>
          </div>
          <button onClick={onClose} className="text-[#a1a1aa] hover:text-[#18181b] cursor-pointer ml-3">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-[#e4e4e7] flex items-center gap-2 overflow-x-auto">
          {stages.map(s => (
            <button key={s} onClick={() => handleStageChange(s)}
              className={`text-[10px] font-medium px-2.5 py-1 rounded cursor-pointer transition-colors whitespace-nowrap ${
                currentDeal.stage === s ? `${getStageColor(s)} text-white` : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
              }`}>
              {getStageLabel(s)}
            </button>
          ))}
        </div>

        <div className="px-5 border-b border-[#e4e4e7] flex gap-4">
          {(["overview", "notes", "emails"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`text-[12px] font-medium py-2.5 border-b-2 cursor-pointer transition-colors capitalize ${
                activeTab === tab ? "border-[#18181b] text-[#18181b]" : "border-transparent text-[#a1a1aa] hover:text-[#71717a]"
              }`}>
              {tab} {tab === "notes" && notes.length > 0 ? `(${notes.length})` : ""}{tab === "emails" && emails.length > 0 ? `(${emails.length})` : ""}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#fafafa] border border-[#e4e4e7] rounded p-3">
                  <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">Asking Price</p>
                  <p className="text-[14px] font-semibold text-[#18181b] mt-0.5">{formatCurrency(currentDeal.askingPrice)}</p>
                </div>
                <div className="bg-[#fafafa] border border-[#e4e4e7] rounded p-3">
                  <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">Price / SF</p>
                  <p className="text-[14px] font-semibold text-[#18181b] mt-0.5">${currentDeal.pricePerSF || "\u2014"}</p>
                </div>
                <div className="bg-[#fafafa] border border-[#e4e4e7] rounded p-3">
                  <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">Cap Rate</p>
                  <p className="text-[14px] font-semibold text-[#18181b] mt-0.5">{currentDeal.capRate ? `${currentDeal.capRate}%` : "\u2014"}</p>
                </div>
                <div className="bg-[#fafafa] border border-[#e4e4e7] rounded p-3">
                  <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">Size</p>
                  <p className="text-[14px] font-semibold text-[#18181b] mt-0.5">{currentDeal.sqft.toLocaleString()} SF</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide mb-1">Property Type</p>
                  <p className="text-[12px] text-[#18181b]">{currentDeal.propertyType}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide mb-1">Units</p>
                  <p className="text-[12px] text-[#18181b]">{currentDeal.units}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide mb-1">Source</p>
                  <p className="text-[12px] text-[#18181b]">{currentDeal.source}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide mb-1">Assigned To</p>
                  <p className="text-[12px] text-[#18181b]">{currentDeal.assignedTo}</p>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-[#18181b] uppercase tracking-wide mb-2">Contacts</p>
                <div className="space-y-2">
                  {(currentDeal.contacts || []).map((c: any, i: number) => (
                    <div key={i} className="bg-[#fafafa] border border-[#e4e4e7] rounded p-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[12px] font-medium text-[#18181b]">{c.name}</p>
                        <span className="text-[10px] text-[#71717a]">{c.role}</span>
                      </div>
                      <p className="text-[11px] text-[#2563eb] mt-0.5">{c.email}</p>
                      {c.phone && <p className="text-[11px] text-[#71717a] mt-0.5">{c.phone}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "notes" && (
            <div>
              <div className="flex gap-2 mb-4">
                <input value={newNote} onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddNote()}
                  placeholder="Add a note..."
                  className="flex-1 text-[12px] px-3 py-2 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
                <select value={noteAuthor} onChange={e => setNoteAuthor(e.target.value)}
                  className="text-[11px] px-2 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] text-[#71717a]">
                  <option value="Ori">Ori</option>
                  <option value="Max">Max</option>
                </select>
                <button onClick={handleAddNote} disabled={!newNote.trim()}
                  className="text-[11px] font-medium px-3 py-1.5 bg-[#18181b] text-white rounded hover:bg-[#27272a] transition-colors cursor-pointer disabled:opacity-40">
                  Add
                </button>
              </div>
              <div className="space-y-3">
                {notes.map((note: any, idx: number) => (
                  <div key={note.id || idx} className="border-l-2 border-[#e4e4e7] pl-3">
                    <p className="text-[12px] text-[#18181b] leading-relaxed">{note.text}</p>
                    <p className="text-[10px] text-[#a1a1aa] mt-1">{note.author} \u00B7 {new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                  </div>
                ))}
                {notes.length === 0 && <p className="text-[12px] text-[#a1a1aa] text-center py-6">No notes yet</p>}
              </div>
            </div>
          )}

          {activeTab === "emails" && (
            <div>
              {!showEmailCompose ? (
                <button onClick={() => setShowEmailCompose(true)}
                  className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-2 bg-[#18181b] text-white rounded cursor-pointer hover:bg-[#27272a] transition-colors mb-4">
                  <Send size={12} /> Compose Email
                </button>
              ) : (
                <div className="border border-[#e4e4e7] rounded p-3 mb-4 space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[11px] font-medium text-[#18181b]">Template:</p>
                    <select value={selectedTemplate} onChange={e => applyTemplate(Number(e.target.value))}
                      className="text-[11px] px-2 py-1 border border-[#e4e4e7] rounded bg-[#fafafa] text-[#71717a] flex-1">
                      <option value="">Select template...</option>
                      {emailTemplates.map((t, i) => (
                        <option key={i} value={i}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <input value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="To"
                    className="w-full text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
                  <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject"
                    className="w-full text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
                  <select value={noteAuthor} onChange={e => setNoteAuthor(e.target.value)}
                    className="text-[11px] px-2 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] text-[#71717a]">
                    <option value="Ori">From: Ori</option>
                    <option value="Max">From: Max</option>
                  </select>
                  <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder="Email body..."
                    className="w-full text-[12px] px-2.5 py-2 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa] min-h-[140px] resize-none leading-relaxed" />
                  <div className="flex gap-2">
                    <button onClick={handleSendEmail} disabled={!emailTo.trim() || !emailSubject.trim()}
                      className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 bg-[#18181b] text-white rounded cursor-pointer hover:bg-[#27272a] disabled:opacity-40 transition-colors">
                      <Send size={11} /> Send
                    </button>
                    <button onClick={() => { setShowEmailCompose(false); setEmailTo(""); setEmailSubject(""); setEmailBody(""); }}
                      className="text-[11px] text-[#71717a] cursor-pointer px-2 py-1.5">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {emails.map((email: any, idx: number) => (
                  <div key={email.id || idx} className="border border-[#e4e4e7] rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-medium text-[#18181b]">{email.subject}</p>
                      <span className="text-[9px] text-[#a1a1aa]">{new Date(email.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    </div>
                    <p className="text-[10px] text-[#71717a] mb-1.5">To: {email.to} \u00B7 From: {email.sentBy}</p>
                    <p className="text-[11px] text-[#52525b] leading-relaxed whitespace-pre-line line-clamp-4">{email.body}</p>
                  </div>
                ))}
                {emails.length === 0 && !showEmailCompose && <p className="text-[12px] text-[#a1a1aa] text-center py-6">No emails sent</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function DealsPage() {
  const { deals, createDeal, updateStage, addNote, addEmail, removeDeal } = useDeals();
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"pipeline" | "table">("table");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", address: "", city: "Houston", state: "TX", propertyType: "Office/Warehouse", sqft: "", units: "", askingPrice: "", source: "", assignedTo: "Max" });
  const gridRef = useRef<AgGridReact>(null);

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

  const columnDefs = useMemo<ColDef[]>(() => [
    { field: "name", headerName: "Property", minWidth: 200, flex: 1, pinned: "left",
      cellRenderer: (p: any) => (
        <div>
          <div className="font-medium text-[#18181b]">{p.data.name}</div>
          <div className="text-[10px] text-[#a1a1aa]">{p.data.city}, {p.data.state}</div>
        </div>
      ) },
    { field: "stage", headerName: "Stage", width: 140, cellRenderer: StageCellRenderer, filter: true },
    { field: "askingPrice", headerName: "Asking Price", width: 130, type: "numericColumn", cellRenderer: CurrencyCellRenderer },
    { field: "capRate", headerName: "Cap Rate", width: 100, type: "numericColumn", cellRenderer: PercentCellRenderer },
    { field: "pricePerSF", headerName: "$/SF", width: 90, type: "numericColumn",
      valueFormatter: (p: any) => p.value ? `$${p.value}` : "\u2014" },
    { field: "sqft", headerName: "Sq Ft", width: 100, type: "numericColumn",
      valueFormatter: (p: any) => p.value?.toLocaleString() || "\u2014" },
    { field: "units", headerName: "Units", width: 80, type: "numericColumn" },
    { field: "propertyType", headerName: "Type", width: 140, filter: true },
    { field: "assignedTo", headerName: "Assigned", width: 110, filter: true },
    { field: "source", headerName: "Source", minWidth: 150, flex: 1 },
    {
      headerName: "",
      width: 60,
      sortable: false,
      filter: false,
      cellRenderer: (p: any) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleDeleteDeal(p.data._id); }}
          className="text-[#d4d4d8] hover:text-[#dc2626] cursor-pointer transition-colors"
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
  }), []);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    if (window.innerWidth >= 768) {
      params.api.sizeColumnsToFit();
    }
  }, []);

  const onRowClicked = useCallback((event: RowClickedEvent) => {
    setSelectedDeal(event.data);
  }, []);

  const activeDeals = deals.filter((d: any) => d.stage !== "dead" && d.stage !== "closed");
  const totalPipeline = activeDeals.reduce((s: number, d: any) => s + d.askingPrice, 0);

  return (
    <div>
      <PageHeader title="Deal Pipeline" subtitle="Acquisitions & Sourcing" />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6">
        <div className="bg-white border border-[#e4e4e7] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">Active Deals</p>
          <p className="text-[18px] font-semibold text-[#18181b] mt-0.5">{activeDeals.length}</p>
        </div>
        <div className="bg-white border border-[#e4e4e7] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">Pipeline Value</p>
          <p className="text-[18px] font-semibold text-[#18181b] mt-0.5">{formatCurrency(totalPipeline)}</p>
        </div>
        <div className="bg-white border border-[#e4e4e7] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">In LOI+</p>
          <p className="text-[18px] font-semibold text-[#18181b] mt-0.5">{deals.filter((d: any) => ["loi","due_diligence","closing"].includes(d.stage)).length}</p>
        </div>
        <div className="bg-white border border-[#e4e4e7] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">Dead Deals</p>
          <p className="text-[18px] font-semibold text-[#71717a] mt-0.5">{deals.filter((d: any) => d.stage === "dead").length}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          <button onClick={() => setViewMode("table")}
            className={`text-[11px] font-medium px-3 py-1.5 rounded cursor-pointer transition-colors ${viewMode === "table" ? "bg-[#18181b] text-white" : "text-[#71717a] hover:bg-[#f4f4f5]"}`}>
            Table
          </button>
          <button onClick={() => setViewMode("pipeline")}
            className={`text-[11px] font-medium px-3 py-1.5 rounded cursor-pointer transition-colors ${viewMode === "pipeline" ? "bg-[#18181b] text-white" : "text-[#71717a] hover:bg-[#f4f4f5]"}`}>
            Pipeline
          </button>
        </div>
        <button onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 bg-[#18181b] text-white rounded cursor-pointer hover:bg-[#27272a] transition-colors">
          <Plus size={13} /> New Deal
        </button>
      </div>

      {/* Add Deal Form */}
      {showAddForm && (
        <div className="bg-white border border-[#e4e4e7] rounded p-4 mb-4">
          <p className="text-[13px] font-semibold text-[#18181b] mb-3">New Deal</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} placeholder="Property Name"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" autoFocus />
            <input value={addForm.address} onChange={e => setAddForm({ ...addForm, address: e.target.value })} placeholder="Address"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
            <input value={addForm.city} onChange={e => setAddForm({ ...addForm, city: e.target.value })} placeholder="City"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
            <input value={addForm.state} onChange={e => setAddForm({ ...addForm, state: e.target.value })} placeholder="State"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
            <input value={addForm.sqft} onChange={e => setAddForm({ ...addForm, sqft: e.target.value })} placeholder="Sq Ft" type="number"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
            <input value={addForm.units} onChange={e => setAddForm({ ...addForm, units: e.target.value })} placeholder="Units" type="number"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
            <input value={addForm.askingPrice} onChange={e => setAddForm({ ...addForm, askingPrice: e.target.value })} placeholder="Asking Price" type="number"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
            <input value={addForm.source} onChange={e => setAddForm({ ...addForm, source: e.target.value })} placeholder="Source (e.g. Broker, Cold Call)"
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]" />
            <select value={addForm.propertyType} onChange={e => setAddForm({ ...addForm, propertyType: e.target.value })}
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] text-[#71717a]">
              <option>Office/Warehouse</option>
              <option>Industrial</option>
              <option>Flex/Office</option>
              <option>Retail</option>
              <option>Warehouse</option>
              <option>Mixed Use</option>
            </select>
            <select value={addForm.assignedTo} onChange={e => setAddForm({ ...addForm, assignedTo: e.target.value })}
              className="text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] text-[#71717a]">
              <option value="Ori">Assigned: Ori</option>
              <option value="Max">Assigned: Max</option>
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleAddDeal} disabled={!addForm.name.trim() || !addForm.address.trim()}
              className="text-[11px] font-medium px-4 py-1.5 bg-[#18181b] text-white rounded hover:bg-[#27272a] transition-colors cursor-pointer disabled:opacity-40">
              Add Deal
            </button>
            <button onClick={() => setShowAddForm(false)} className="text-[11px] text-[#71717a] cursor-pointer px-3 py-1.5">Cancel</button>
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
            rowHeight={52}
            headerHeight={36}
            suppressCellFocus={true}
            rowClass="cursor-pointer"
          />
        </div>
      )}

      {/* Pipeline View */}
      {viewMode === "pipeline" && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.filter(s => s !== "dead").map(stage => {
            const stageDeals = deals.filter((d: any) => d.stage === stage);
            return (
              <div key={stage} className="min-w-[220px] flex-shrink-0">
                <div className={`flex items-center justify-between mb-2 px-2 py-1.5 rounded border-t-2 ${getStageColor(stage).replace("bg-", "border-t-")}`}>
                  <p className="text-[11px] font-semibold text-[#18181b] uppercase tracking-wide">{getStageLabel(stage)}</p>
                  <span className="text-[10px] text-[#a1a1aa] font-medium">{stageDeals.length}</span>
                </div>
                <div className="space-y-2">
                  {stageDeals.map((deal: any) => (
                    <div key={deal._id} onClick={() => setSelectedDeal(deal)}
                      className="group bg-white border border-[#e4e4e7] rounded p-3 hover:border-[#a1a1aa] transition-colors cursor-pointer">
                      <p className="text-[12px] font-medium text-[#18181b] truncate">{deal.name}</p>
                      <p className="text-[10px] text-[#71717a] mt-0.5">{deal.city}, {deal.state} \u00B7 {deal.sqft.toLocaleString()} SF</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[12px] font-semibold text-[#18181b]">{formatCurrency(deal.askingPrice)}</p>
                        <span className="text-[9px] text-[#a1a1aa]">{deal.assignedTo}</span>
                      </div>
                      {deal.capRate && <p className="text-[10px] text-[#71717a] mt-0.5">{deal.capRate}% cap \u00B7 ${deal.pricePerSF}/SF</p>}
                    </div>
                  ))}
                  {stageDeals.length === 0 && <p className="text-[10px] text-[#d4d4d8] text-center py-4">No deals</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedDeal && <DealDrawer deal={selectedDeal} allDeals={deals} onClose={() => setSelectedDeal(null)} updateStage={updateStage} addNote={addNote} addEmail={addEmail} />}
    </div>
  );
}

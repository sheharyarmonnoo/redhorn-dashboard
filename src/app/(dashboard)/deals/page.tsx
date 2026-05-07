"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Plus, LayoutGrid, List, Search, X, Download } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import PageHeader from "@/components/PageHeader";
import { useDeals } from "@/hooks/useConvexData";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { DealDetail } from "@/components/pipeline/DealDetail";
import DealsGrid from "@/components/pipeline/DealsGrid";
import { DealStage, getStageLabel } from "@/data/_seed_deals";

type DealsView = "kanban" | "table";
const VIEW_STORAGE_KEY = "redhorn_deals_view";
const STAGE_FILTER_STORAGE_KEY = "redhorn_deals_stage_filter";
// How long the moved-deal highlight stays on after a stage change.
const RECENT_MOVE_HIGHLIGHT_MS = 6000;

// Stage strip is the same set the board renders, minus the terminal
// "closed"/"dead" buckets — those would dominate the count visually for
// the Active pipeline view but are still reachable by drag on the board.
const STAGE_STRIP: DealStage[] = [
  "lead",
  "outreach",
  "underwriting",
  "loi",
  "due_diligence",
  "closing",
];

const STAGE_DOT: Record<DealStage, string> = {
  lead: "bg-[#71717a]",
  outreach: "bg-[#2563eb]",
  underwriting: "bg-[#7c3aed]",
  loi: "bg-[#d97706]",
  due_diligence: "bg-[#0891b2]",
  closing: "bg-[#16a34a]",
  closed: "bg-[#18181b]",
  dead: "bg-[#dc2626]",
};

export default function DealsPage() {
  const {
    deals,
    createDeal,
    updateStage,
    updateField,
    addNote,
    addTask,
    updateTask,
    toggleTask,
    removeTask,
    addDocument,
    removeDocument,
    removeDeal,
  } = useDeals();

  // Track the selected deal by id so the drawer always reflects the latest
  // Convex snapshot — passing the deal object directly would freeze the
  // detail panel on the click-time copy and miss inline edits / new notes.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // View toggle — kanban (default) vs table. Persisted in localStorage so the
  // user lands on whichever view they last used. AG-Grid table is heavier for
  // large pipelines (1700+ deals from the Monday import) where kanban becomes
  // unwieldy.
  const [view, setView] = useState<DealsView>("kanban");
  useEffect(() => {
    const stored = (typeof window !== "undefined" ? localStorage.getItem(VIEW_STORAGE_KEY) : null) as DealsView | null;
    if (stored === "kanban" || stored === "table") setView(stored);
  }, []);
  const switchView = (next: DealsView) => {
    setView(next);
    if (typeof window !== "undefined") localStorage.setItem(VIEW_STORAGE_KEY, next);
  };

  // Quick search — filters across name / address / city / source / assignedTo
  // / mondayItemId / contact emails / notes for kanban; AG Grid uses its own
  // built-in quickFilterText for the table view.
  const [quickSearch, setQuickSearch] = useState("");

  // Stage pill toggle filter. Persisted to localStorage so reload keeps the
  // user inside whichever stage they were focused on. Composes (AND) with
  // quickSearch in both kanban and table views.
  const [stageFilter, setStageFilter] = useState<DealStage | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STAGE_FILTER_STORAGE_KEY);
    if (stored && (STAGE_STRIP as string[]).includes(stored)) {
      setStageFilter(stored as DealStage);
    }
  }, []);
  function toggleStageFilter(s: DealStage) {
    setStageFilter((cur) => {
      const next = cur === s ? null : s;
      if (typeof window !== "undefined") {
        if (next) localStorage.setItem(STAGE_FILTER_STORAGE_KEY, next);
        else localStorage.removeItem(STAGE_FILTER_STORAGE_KEY);
      }
      return next;
    });
  }

  // Recently-moved highlight — set inside handleStageChange and cleared
  // after RECENT_MOVE_HIGHLIGHT_MS. Used by both kanban (yellow ring) and
  // table view (yellow row accent) so the user can find the card after a
  // stage change.
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);
  const recentMoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (recentMoveTimerRef.current) clearTimeout(recentMoveTimerRef.current);
    };
  }, []);
  // CSV export — DealsGrid hands us a callback once the AG Grid is ready.
  const exportCsvRef = useRef<(() => void) | null>(null);

  const selectedDeal = useMemo(
    () => (selectedId ? deals.find((d: any) => d._id === selectedId) || null : null),
    [selectedId, deals]
  );

  // Per-stage counts feed the strip above the board.
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of deals) {
      map[d.stage] = (map[d.stage] || 0) + 1;
    }
    return map;
  }, [deals]);

  // Filter deals by quickSearch for the kanban view (AG Grid handles its own
  // filtering via quickFilterText on the table view). stageFilter is applied
  // visually by hiding columns inside the KanbanBoard, so no need to filter
  // it out here — the cards in non-active columns just won't be shown.
  const filteredDeals = useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter((d: any) => {
      const haystack: string[] = [
        d.name || "",
        d.address || "",
        d.city || "",
        d.state || "",
        d.source || "",
        d.assignedTo || "",
        d.mondayItemId || "",
        d.propertyType || "",
        ...(d.contacts || []).flatMap((c: any) => [c.name || "", c.email || "", c.phone || ""]),
      ];
      // Sweep custom-field string values too so a search for "Medium" or
      // "Marcus Millichap" matches Monday-imported metadata.
      const cf = d.customFields || {};
      for (const v of Object.values(cf)) {
        if (typeof v === "string" || typeof v === "number") haystack.push(String(v));
      }
      return haystack.some((s) => s.toLowerCase().includes(q));
    });
  }, [deals, quickSearch]);

  function flagRecentlyMoved(dealId: string) {
    setRecentlyMovedId(dealId);
    if (recentMoveTimerRef.current) clearTimeout(recentMoveTimerRef.current);
    recentMoveTimerRef.current = setTimeout(() => {
      setRecentlyMovedId(null);
      recentMoveTimerRef.current = null;
    }, RECENT_MOVE_HIGHLIGHT_MS);
  }

  function handleStageChange(dealId: string, newStage: DealStage) {
    flagRecentlyMoved(dealId);
    updateStage({ id: dealId as any, stage: newStage, user: "Ori" });
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-9rem)] min-h-0 overflow-hidden">
      <PageHeader
        title="Deal Pipeline"
        subtitle={`${deals.length} ${deals.length === 1 ? "deal" : "deals"} across the acquisition funnel`}
      />

      {/* Stage-count strip — pills are toggle filters. Click once to focus
          the kanban/table on a single stage, click again to clear. */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[12px]">
        {STAGE_STRIP.map((s) => {
          const active = stageFilter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStageFilter(s)}
              title={active ? `Clear ${getStageLabel(s)} filter` : `Filter to ${getStageLabel(s)}`}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors cursor-pointer border ${
                active
                  ? "bg-[#18181b] dark:bg-[#fafafa] border-[#18181b] dark:border-[#fafafa] text-white dark:text-[#18181b]"
                  : "bg-white dark:bg-[#18181b] border-[#e8eaef] dark:border-[#3f3f46] text-[#1e1e2d] dark:text-[#fafafa] hover:border-[#a1a1aa] dark:hover:border-[#52525b]"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${STAGE_DOT[s]}`} />
              <span className={`text-[11px] uppercase tracking-wider font-medium ${
                active ? "text-white/80 dark:text-[#18181b]/70" : "text-[#71717a] dark:text-[#a1a1aa]"
              }`}>
                {getStageLabel(s)}
              </span>
              <span className="font-semibold">{counts[s] || 0}</span>
            </button>
          );
        })}
        {stageFilter && (
          <button
            type="button"
            onClick={() => toggleStageFilter(stageFilter)}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"
            title="Clear stage filter"
          >
            <X size={12} /> Clear
          </button>
        )}
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded-lg hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] transition-colors cursor-pointer"
        >
          <Plus size={14} /> New Deal
        </button>
      </div>

      {/* View toggle + search */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[12px]">
        <div className="inline-flex items-center bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-0.5">
          <button
            onClick={() => switchView("kanban")}
            className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded cursor-pointer transition-colors ${
              view === "kanban"
                ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b]"
                : "text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
            }`}
            title="Kanban view"
          >
            <LayoutGrid size={12} /> Kanban
          </button>
          <button
            onClick={() => switchView("table")}
            className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded cursor-pointer transition-colors ${
              view === "table"
                ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b]"
                : "text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
            }`}
            title="Table view"
          >
            <List size={12} /> Table
          </button>
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a1a1aa]" />
          <input
            type="text"
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            placeholder="Search name, address, source, contact, custom fields…"
            className="w-full pl-7 pr-7 py-1.5 text-[12px] bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] focus:outline-none focus:border-[#71717a]"
          />
          {quickSearch && (
            <button
              onClick={() => setQuickSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {quickSearch && (
          <span className="text-[11px] text-[#71717a] dark:text-[#a1a1aa]">
            {view === "kanban" ? `${filteredDeals.length} of ${deals.length}` : "filtering table"}
          </span>
        )}
        {view === "table" && (
          <button
            onClick={() => exportCsvRef.current?.()}
            className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] hover:border-[#71717a] cursor-pointer whitespace-nowrap"
            title="Export current table view to CSV"
          >
            <Download size={12} /> Export
          </button>
        )}
      </div>

      {/* View body */}
      {view === "kanban" ? (
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden -mx-2 px-2 pb-2">
          <KanbanBoard
            deals={filteredDeals}
            onDealClick={(deal) => setSelectedId(deal._id)}
            onStageChange={handleStageChange}
            recentlyMovedId={recentlyMovedId}
            stageFilter={stageFilter}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <DealsGrid
            deals={deals}
            quickSearch={quickSearch}
            onDealClick={(deal) => setSelectedId(deal._id)}
            stageFilter={stageFilter}
            recentlyMovedId={recentlyMovedId}
            onExportReady={(fn) => { exportCsvRef.current = fn; }}
          />
        </div>
      )}

      {/* Detail drawer — only mounted when a card is selected so its
          internal Convex queries (e.g. file URLs in DocRow) don't fire
          on every page render. */}
      {selectedDeal && (
        <DealDetail
          deal={selectedDeal}
          onClose={() => setSelectedId(null)}
          onStageChange={(dealId, stage) => {
            flagRecentlyMoved(dealId);
            updateStage({ id: dealId as any, stage, user: "Ori" });
          }}
          onDelete={() => setSelectedId(null)}
          updateField={(args) => { updateField(args); }}
          addNote={(args) => { addNote(args); }}
          addTask={(args) => { addTask(args); }}
          updateTask={(args) => { updateTask(args); }}
          toggleTask={(args) => { toggleTask(args); }}
          removeTask={(args) => { removeTask(args); }}
          addDocument={(args) => { addDocument(args); }}
          removeDocument={(args) => { removeDocument(args); }}
          removeDeal={(args) => { removeDeal(args); }}
        />
      )}

      {/* New-deal modal */}
      {creating && (
        <NewDealModal
          onClose={() => setCreating(false)}
          onCreate={async (form) => {
            const id = await createDeal(form);
            setCreating(false);
            // Convex returns the freshly inserted Id; pop the drawer open
            // so the user can fill in the rest of the fields inline.
            if (id) setSelectedId(id as unknown as string);
          }}
        />
      )}
    </div>
  );
}

// Minimal modal for new deal creation. Mirrors the create() mutation's
// required args; the heavier fields (cap rate, $/SF, contacts beyond the
// primary one, etc.) are filled in via the drawer after creation.
function NewDealModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (form: any) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("TX");
  const [propertyType, setPropertyType] = useState("Office/Warehouse");
  const [sqft, setSqft] = useState("");
  const [units, setUnits] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [source, setSource] = useState("Broker");
  const { user } = useUser();
  const assignedTo = user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "User";
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("Broker");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const valid = name.trim() && address.trim() && city.trim() && state.trim();

  async function submit() {
    if (!valid) return;
    setSubmitting(true);
    try {
      const sqftN = Number(sqft) || 0;
      const askingN = Number(askingPrice) || 0;
      await onCreate({
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        propertyType,
        sqft: sqftN,
        units: Number(units) || 0,
        askingPrice: askingN,
        pricePerSF: sqftN > 0 && askingN > 0 ? Math.round(askingN / sqftN) : undefined,
        stage: "lead",
        source: source.trim() || "Unknown",
        assignedTo,
        contacts: contactName.trim()
          ? [
              {
                name: contactName.trim(),
                role: contactRole,
                email: contactEmail.trim(),
              },
            ]
          : [],
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] z-40"
        onClick={onClose}
      />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(560px,calc(100vw-32px))] max-h-[90vh] overflow-y-auto bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-xl shadow-2xl">
        <div className="px-5 py-4 border-b border-[#e4e4e7] dark:border-[#3f3f46] flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#18181b] dark:text-[#fafafa]">New Deal</h2>
          <button
            onClick={onClose}
            className="text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer text-[18px] leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-5 space-y-4">
          <ModalField label="Deal Name *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Greenway Industrial"
              className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
            />
          </ModalField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ModalField label="Address *">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St"
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
              />
            </ModalField>
            <ModalField label="Property Type">
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a]"
              >
                {["Office/Warehouse", "Industrial", "Flex/Office", "Retail", "Warehouse", "Mixed Use"].map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </ModalField>
            <ModalField label="City *">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Houston"
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
              />
            </ModalField>
            <ModalField label="State *">
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="TX"
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
              />
            </ModalField>
            <ModalField label="Square Feet">
              <input
                value={sqft}
                onChange={(e) => setSqft(e.target.value)}
                inputMode="numeric"
                placeholder="50000"
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
              />
            </ModalField>
            <ModalField label="Units">
              <input
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                inputMode="numeric"
                placeholder="12"
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
              />
            </ModalField>
            <ModalField label="Asking Price">
              <input
                value={askingPrice}
                onChange={(e) => setAskingPrice(e.target.value)}
                inputMode="numeric"
                placeholder="5000000"
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
              />
            </ModalField>
            <ModalField label="Source">
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Broker / Direct / Off-market"
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
              />
            </ModalField>
            <ModalField label="Assigned To">
              <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] py-2">{assignedTo}</p>
            </ModalField>
          </div>

          <div className="border-t border-[#e4e4e7] dark:border-[#3f3f46] pt-4">
            <p className="text-[10px] font-semibold text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wider mb-2">
              Primary Contact (optional)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ModalField label="Name">
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
                />
              </ModalField>
              <ModalField label="Role">
                <input
                  value={contactRole}
                  onChange={(e) => setContactRole(e.target.value)}
                  placeholder="Broker / Owner"
                  className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
                />
              </ModalField>
              <ModalField label="Email">
                <input
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  type="email"
                  placeholder="jane@example.com"
                  className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
                />
              </ModalField>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[#e4e4e7] dark:border-[#3f3f46] flex items-center justify-end gap-2 bg-[#fafafa] dark:bg-[#27272a]">
          <button
            onClick={onClose}
            className="text-[12px] font-medium px-3 py-1.5 text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid || submitting}
            className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={12} /> {submitting ? "Creating..." : "Create Deal"}
          </button>
        </div>
      </div>
    </>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide mb-1 font-medium">
        {label}
      </p>
      {children}
    </div>
  );
}

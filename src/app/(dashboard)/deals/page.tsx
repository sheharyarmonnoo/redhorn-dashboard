"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useDeals } from "@/hooks/useConvexData";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { DealDetail } from "@/components/pipeline/DealDetail";
import { DealStage, getStageLabel } from "@/data/_seed_deals";

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

  function handleStageChange(dealId: string, newStage: DealStage) {
    updateStage({ id: dealId as any, stage: newStage, user: "Ori" });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] min-h-0">
      <PageHeader
        title="Deal Pipeline"
        subtitle={`${deals.length} ${deals.length === 1 ? "deal" : "deals"} across the acquisition funnel`}
      >
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded-lg hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] transition-colors cursor-pointer"
        >
          <Plus size={14} /> New Deal
        </button>
      </PageHeader>

      {/* Stage-count strip */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-[12px]">
        {STAGE_STRIP.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-2 bg-white dark:bg-[#18181b] border border-[#e8eaef] dark:border-[#3f3f46] rounded-lg px-3 py-1.5 whitespace-nowrap"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${STAGE_DOT[s]}`} />
            <span className="text-[11px] uppercase tracking-wider text-[#71717a] dark:text-[#a1a1aa] font-medium">
              {getStageLabel(s)}
            </span>
            <span className="text-[#1e1e2d] dark:text-[#fafafa] font-semibold">{counts[s] || 0}</span>
          </span>
        ))}
      </div>

      {/* Kanban board — horizontal scroll for the 8 columns */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden -mx-2 px-2 pb-2">
        <KanbanBoard
          deals={deals}
          onDealClick={(deal) => setSelectedId(deal._id)}
          onStageChange={handleStageChange}
        />
      </div>

      {/* Detail drawer — only mounted when a card is selected so its
          internal Convex queries (e.g. file URLs in DocRow) don't fire
          on every page render. */}
      {selectedDeal && (
        <DealDetail
          deal={selectedDeal}
          onClose={() => setSelectedId(null)}
          onStageChange={(dealId, stage) => updateStage({ id: dealId as any, stage, user: "Ori" })}
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
  const [assignedTo, setAssignedTo] = useState("Ori");
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
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a]"
              >
                <option value="Ori">Ori</option>
                <option value="Max">Max</option>
              </select>
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

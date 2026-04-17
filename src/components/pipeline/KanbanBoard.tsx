"use client";

import { useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MapPin, GripVertical } from "lucide-react";
import { formatCurrency } from "@/hooks/useConvexData";
import { DealStage, getStageLabel, getStageColor } from "@/data/_seed_deals";

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

const STAGES: DealStage[] = ["lead", "outreach", "underwriting", "loi", "due_diligence", "closing", "closed", "dead"];

// Stage dot colors that match the redhorn getStageColor palette (extract the hex)
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

function formatNumber(n: number | undefined | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

function formatDate(d: string | undefined | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

interface KanbanBoardProps {
  deals: any[];
  onDealClick: (deal: any) => void;
  onStageChange: (dealId: string, newStage: DealStage) => void;
}

export function KanbanBoard({ deals, onDealClick, onStageChange }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const dealsByStage = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const s of STAGES) groups[s] = [];
    for (const d of deals) {
      const stage = (STAGES as string[]).includes(d.stage) ? d.stage : "lead";
      groups[stage].push(d);
    }
    for (const s of STAGES) {
      groups[s].sort((a: any, b: any) => {
        return new Date(b.updatedAt || b.createdAt || 0).getTime() -
               new Date(a.updatedAt || a.createdAt || 0).getTime();
      });
    }
    return groups;
  }, [deals]);

  const activeDeal = activeId ? deals.find(d => d._id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const dealId = active.id as string;
    const overId = over.id as string;
    const deal = deals.find(d => d._id === dealId);
    if (!deal) return;

    let targetStage: DealStage;
    if ((STAGES as string[]).includes(overId)) {
      targetStage = overId as DealStage;
    } else {
      const overDeal = deals.find(d => d._id === overId);
      if (!overDeal) return;
      targetStage = overDeal.stage as DealStage;
    }

    if (deal.stage !== targetStage) {
      onStageChange(dealId, targetStage);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 h-full min-w-max">
        {STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            deals={dealsByStage[stage]}
            onDealClick={onDealClick}
            isActive={activeId !== null}
          />
        ))}
      </div>

      <DragOverlay>
        {activeDeal ? <DealCardOverlay deal={activeDeal} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  stage, deals, onDealClick, isActive,
}: {
  stage: DealStage; deals: any[]; onDealClick: (deal: any) => void; isActive: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const dealIds = deals.map(d => d._id);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col transition-colors rounded-xl w-[272px] flex-shrink-0 p-2",
        isOver && "bg-blue-50/60 dark:bg-blue-950/30 ring-1 ring-blue-200 dark:ring-blue-900 ring-inset",
        isActive && !isOver && "bg-zinc-50/40 dark:bg-[#27272a]/40"
      )}
    >
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", STAGE_DOT[stage])} />
          <span className="text-[11px] font-semibold text-[#52525b] dark:text-[#a1a1aa] uppercase tracking-wider">
            {getStageLabel(stage)}
          </span>
        </div>
        <span className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] bg-[#f4f4f5] dark:bg-[#27272a] px-1.5 py-0.5 rounded-md">
          {deals.length}
        </span>
      </div>
      <SortableContext items={dealIds} strategy={verticalListSortingStrategy}>
        <div className="flex-1 space-y-2 overflow-y-auto pr-0.5 min-h-[120px]">
          {deals.map((deal) => (
            <SortableDealCard
              key={deal._id}
              deal={deal}
              onClick={() => onDealClick(deal)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableDealCard({ deal, onClick }: { deal: any; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const brokerName = deal.contacts?.[0]?.name;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-2.5 transition-all hover:border-[#a1a1aa] dark:hover:border-[#52525b] hover:shadow-sm",
        isDragging && "opacity-30 shadow-lg"
      )}
    >
      <div className="flex gap-1.5">
        <div
          {...listeners}
          {...attributes}
          className="flex-shrink-0 pt-0.5 cursor-grab active:cursor-grabbing text-[#d4d4d8] dark:text-[#52525b] hover:text-[#71717a] dark:hover:text-[#a1a1aa]"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0" onClick={onClick}>
          <div className="flex items-start justify-between mb-1">
            <h3 className="text-[13px] font-medium text-[#18181b] dark:text-[#fafafa] leading-snug line-clamp-2 pr-2 cursor-pointer hover:text-[#52525b] dark:hover:text-[#a1a1aa]">
              {deal.name}
            </h3>
          </div>

          {brokerName && (
            <p className="text-[11px] font-medium text-[#71717a] dark:text-[#a1a1aa] mb-1 truncate">{brokerName}</p>
          )}

          {(deal.city || deal.state) && (
            <div className="flex items-center gap-1 text-[11px] text-[#a1a1aa] dark:text-[#71717a] mb-2">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{[deal.city, deal.state].filter(Boolean).join(", ")}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] mb-2">
            <div className="flex justify-between">
              <span className="text-[#a1a1aa] dark:text-[#71717a]">Ask</span>
              <span className="font-semibold text-[#27272a] dark:text-[#fafafa]">{deal.askingPrice ? formatCurrency(deal.askingPrice) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#a1a1aa] dark:text-[#71717a]">Cap</span>
              <span className="font-semibold text-[#27272a] dark:text-[#fafafa]">
                {deal.capRate ? `${deal.capRate}%` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#a1a1aa] dark:text-[#71717a]">$/SF</span>
              <span className="font-semibold text-[#27272a] dark:text-[#fafafa]">{deal.pricePerSF ? `$${deal.pricePerSF}` : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#a1a1aa] dark:text-[#71717a]">SF</span>
              <span className="font-semibold text-[#27272a] dark:text-[#fafafa]">{formatNumber(deal.sqft)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {deal.propertyType && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[#f4f4f5] dark:bg-[#27272a] text-[#52525b] dark:text-[#a1a1aa]">
                {deal.propertyType}
              </span>
            )}
            {deal.assignedTo && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[#eef2ff] dark:bg-indigo-950/40 text-[#4338ca] dark:text-indigo-300">
                {deal.assignedTo}
              </span>
            )}
          </div>

          {deal.updatedAt && (
            <p className="text-[10px] text-[#d4d4d8] dark:text-[#52525b] mt-1.5">Updated {formatDate(deal.updatedAt)}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DealCardOverlay({ deal }: { deal: any }) {
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#a1a1aa] dark:border-[#52525b] rounded-lg p-2.5 shadow-lg rotate-1 w-[264px]">
      <h3 className="text-[13px] font-medium text-[#18181b] dark:text-[#fafafa] line-clamp-1">{deal.name}</h3>
      {deal.contacts?.[0]?.name && <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa]">{deal.contacts[0].name}</p>}
      <div className="flex gap-3 mt-1 text-[11px]">
        <span className="font-semibold text-[#27272a] dark:text-[#fafafa]">{deal.askingPrice ? formatCurrency(deal.askingPrice) : "—"}</span>
        <span className="text-[#a1a1aa] dark:text-[#71717a]">{deal.capRate ? `${deal.capRate}%` : ""}</span>
      </div>
    </div>
  );
}

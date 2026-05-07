"use client";
import { useState } from "react";
import { Plus, X, GripVertical } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useActionItems } from "@/hooks/useConvexData";

type KanbanColumn = "todo" | "in_progress" | "done";

// Visible Redhorn assignees. Setup + delivery — they're "silent users" and don't appear in the
// assignee dropdown even if they happen to sign in. Anyone else with a
// @redhorncapital.com email gets added to the dropdown automatically.
const TEAM_ASSIGNEES = ["Ori", "Max"];
const REDHORN_DOMAIN = "redhorncapital.com";
const SILENT_EMAILS = new Set<string>([
  "sheharyarmonnoo@gmail.com",
  "mattyellin1@gmail.com",  
]);

function useAssigneeOptions() {
  const { user } = useUser();
  const meName = user?.firstName?.trim();
  const meEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase() || "";
  const isSilent = SILENT_EMAILS.has(meEmail);
  const isRedhornUser = !isSilent && meEmail.endsWith(`@${REDHORN_DOMAIN}`);
  const options = isRedhornUser && meName && !TEAM_ASSIGNEES.includes(meName)
    ? [...TEAM_ASSIGNEES, meName]
    : TEAM_ASSIGNEES;
  return { options, meName: isRedhornUser ? meName : undefined };
}

function AssigneeSelect({ value, onChange, placeholder, fullWidth }: { value: string; onChange: (v: string) => void; placeholder?: string; fullWidth?: boolean }) {
  const { options } = useAssigneeOptions();
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa] ${fullWidth ? "w-full" : ""}`}
    >
      <option value="">{placeholder || "Unassigned"}</option>
      {options.map(name => (
        <option key={name} value={name}>{name}</option>
      ))}
    </select>
  );
}

const columns: { key: KanbanColumn; label: string }[] = [
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
];

const priorityDot: Record<string, string> = {
  high: "bg-[#dc2626]",
  medium: "bg-[#d97706]",
  low: "bg-[#a1a1aa]",
};

const columnBorder: Record<KanbanColumn, string> = {
  todo: "border-t-[#dc2626]",
  in_progress: "border-t-[#d97706]",
  done: "border-t-[#16a34a]",
};

function KanbanCard({ item, onRemove, onEdit, onDragStart, onDragEnd, isDragging, readOnly = false }: {
  item: any;
  onRemove: (id: string) => void;
  onEdit: (id: string, updates: { text?: string; priority?: string; assignedTo?: string }) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const [editPriority, setEditPriority] = useState(item.priority);
  const [editAssignee, setEditAssignee] = useState(item.assignedTo || "");

  function save() {
    if (editText.trim() && (editText.trim() !== item.text || editPriority !== item.priority || editAssignee !== (item.assignedTo || ""))) {
      onEdit(item._id, { text: editText.trim(), priority: editPriority, assignedTo: editAssignee || undefined });
    }
    setEditing(false);
  }

  return (
    <div
      draggable={!editing && !readOnly}
      onDragStart={readOnly ? undefined : () => onDragStart(item._id)}
      onDragEnd={readOnly ? undefined : onDragEnd}
      className={`group bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-2.5 ${readOnly ? "" : "hover:border-[#a1a1aa] dark:hover:border-[#52525b]"} transition-all ${
        isDragging ? "opacity-40 scale-[0.98]" : ""
      } ${!editing && !readOnly ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-start gap-2">
        <GripVertical size={12} className="text-[#d4d4d8] dark:text-[#52525b] mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-1.5">
              <textarea value={editText} onChange={e => setEditText(e.target.value)}
                className="w-full text-[12px] text-[#18181b] dark:text-[#fafafa] bg-[#fafafa] dark:bg-[#27272a] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-1.5 leading-relaxed focus:outline-none focus:border-[#71717a] resize-none min-h-[40px]"
                autoFocus onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === "Escape") setEditing(false); }} />
              <div className="flex items-center gap-2">
                <select value={editPriority} onChange={e => setEditPriority(e.target.value)}
                  className="text-[10px] px-1.5 py-0.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#71717a] dark:text-[#a1a1aa]">
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <AssigneeSelect value={editAssignee} onChange={setEditAssignee} />
                <button onClick={save} className="text-[10px] font-medium px-2 py-0.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded cursor-pointer">Save</button>
                <button onClick={() => { setEditing(false); setEditText(item.text); setEditPriority(item.priority); setEditAssignee(item.assignedTo || ""); }}
                  className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] cursor-pointer">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <p onClick={readOnly ? undefined : () => setEditing(true)}
                className={`text-[12px] leading-relaxed rounded px-0.5 -mx-0.5 ${readOnly ? "" : "cursor-text hover:bg-[#fafafa] dark:hover:bg-[#27272a]"} ${item.column === "done" ? "text-[#a1a1aa] line-through" : "text-[#18181b] dark:text-[#fafafa]"}`}>
                {item.text}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${priorityDot[item.priority] || priorityDot.medium}`} />
                <span className="text-[9px] text-[#a1a1aa] dark:text-[#71717a] capitalize">{item.priority}</span>
                {item.assignedTo && (
                  <>
                    <span className="text-[9px] text-[#d4d4d8] dark:text-[#52525b]">·</span>
                    <span className="text-[9px] text-[#2563eb] dark:text-[#60a5fa] font-medium">{item.assignedTo}</span>
                  </>
                )}
                {item.unit && (
                  <>
                    <span className="text-[9px] text-[#d4d4d8] dark:text-[#52525b]">·</span>
                    <span className="text-[9px] text-[#71717a] dark:text-[#a1a1aa] font-medium">{item.unit}</span>
                  </>
                )}
                <span className="text-[9px] text-[#d4d4d8] dark:text-[#52525b]">·</span>
                <span className="text-[9px] text-[#a1a1aa] dark:text-[#71717a]">{item.createdAt?.slice(0, 10)}</span>
              </div>
            </>
          )}
        </div>
        {!editing && !readOnly && (
          <button onClick={(e) => { e.stopPropagation(); onRemove(item._id); }}
            className="opacity-0 group-hover:opacity-100 text-[#a1a1aa] dark:text-[#71717a] hover:text-[#dc2626] dark:hover:text-[#dc2626] transition-all cursor-pointer">
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ActionItems({ heading = "Tasks", showHeader = true, compact = false, readOnly = false }: { heading?: string; showHeader?: boolean; compact?: boolean; readOnly?: boolean } = {}) {
  const { items, createItem, moveItem, updateItem, removeItem } = useActionItems();
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newAssignee, setNewAssignee] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<KanbanColumn | null>(null);

  function handleRemove(id: string) {
    removeItem({ id: id as any });
  }

  function handleEdit(id: string, updates: { text?: string; priority?: string; assignedTo?: string }) {
    updateItem({ id: id as any, ...updates });
  }

  function handleAdd() {
    if (!newText.trim()) return;
    createItem({ text: newText.trim(), priority: newPriority, assignedTo: newAssignee || undefined });
    setNewText("");
    setNewAssignee("");
    setShowAdd(false);
  }

  function handleDragStart(id: string) {
    setDraggingId(id);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverCol(null);
  }

  function handleDragOver(e: React.DragEvent, col: KanbanColumn) {
    e.preventDefault();
    setDragOverCol(col);
  }

  function handleDrop(e: React.DragEvent, col: KanbanColumn) {
    e.preventDefault();
    if (draggingId) {
      const item = items.find(i => i._id === draggingId);
      if (item && item.column !== col) {
        moveItem({ id: draggingId as any, column: col });
      }
    }
    setDraggingId(null);
    setDragOverCol(null);
  }

  return (
    <div className="mb-6">
      {showHeader && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">{heading}</p>
          {readOnly ? (
            <a href="/tasks" className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] transition-colors">
              Open task board →
            </a>
          ) : (
            <button onClick={() => setShowAdd(!showAdd)}
              className="flex items-center gap-1 text-[11px] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] transition-colors cursor-pointer">
              <Plus size={14} /> New
            </button>
          )}
        </div>
      )}
      {!showHeader && !readOnly && (
        <div className="flex justify-end mb-3">
          <button onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 text-[11px] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] transition-colors cursor-pointer">
            <Plus size={14} /> New
          </button>
        </div>
      )}

      {showAdd && !readOnly && (
        <NewTaskModal
          text={newText}
          priority={newPriority}
          assignee={newAssignee}
          onTextChange={setNewText}
          onPriorityChange={setNewPriority}
          onAssigneeChange={setNewAssignee}
          onCancel={() => { setShowAdd(false); setNewText(""); setNewAssignee(""); }}
          onSubmit={handleAdd}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {columns.map(col => {
          const colItems = items.filter(i => i.column === col.key);
          const isDropTarget = dragOverCol === col.key && draggingId !== null;
          return (
            <div
              key={col.key}
              onDragOver={readOnly ? undefined : (e) => handleDragOver(e, col.key)}
              onDragLeave={readOnly ? undefined : () => setDragOverCol(null)}
              onDrop={readOnly ? undefined : (e) => handleDrop(e, col.key)}
              className={`bg-[#fafafa] dark:bg-[#27272a] border-2 border-t-2 ${columnBorder[col.key]} rounded p-2.5 min-h-[140px] transition-colors ${
                isDropTarget ? "border-[#18181b] dark:border-[#fafafa] bg-[#f4f4f5] dark:bg-[#3f3f46]" : "border-[#e4e4e7] dark:border-[#3f3f46]"
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[11px] font-semibold text-[#18181b] dark:text-[#fafafa] uppercase tracking-wide">{col.label}</p>
                <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] font-medium">{colItems.length}</span>
              </div>
              <div
                className="space-y-2 min-h-[80px] overflow-y-auto pr-1"
                style={{ maxHeight: compact ? "200px" : "50vh" }}
              >
                {colItems.map(item => (
                  <KanbanCard
                    key={item._id}
                    item={item}
                    onRemove={handleRemove}
                    onEdit={handleEdit}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isDragging={draggingId === item._id}
                    readOnly={readOnly}
                  />
                ))}
                {colItems.length === 0 && (
                  <p className="text-[10px] text-[#d4d4d8] dark:text-[#52525b] text-center py-4">
                    {isDropTarget ? "Drop here" : "No items"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewTaskModal({
  text, priority, assignee,
  onTextChange, onPriorityChange, onAssigneeChange,
  onCancel, onSubmit,
}: {
  text: string;
  priority: string;
  assignee: string;
  onTextChange: (v: string) => void;
  onPriorityChange: (v: string) => void;
  onAssigneeChange: (v: string) => void;
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
        <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-3">New task</p>

        <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide block mb-1">What needs doing?</label>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={3}
          placeholder="e.g. Review tax accrual entries with PM before close"
          className="w-full text-[12px] bg-white dark:bg-[#09090b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-2 text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] dark:placeholder-[#52525b] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa] resize-none mb-3"
        />

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div>
            <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide block mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => onPriorityChange(e.target.value)}
              className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide block mb-1">Assign to</label>
            <AssigneeSelect value={assignee} onChange={onAssigneeChange} placeholder="Unassigned" fullWidth />
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
            disabled={!text.trim()}
            className="text-[12px] font-medium bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] px-3 py-1.5 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add task
          </button>
        </div>
      </div>
    </div>
  );
}

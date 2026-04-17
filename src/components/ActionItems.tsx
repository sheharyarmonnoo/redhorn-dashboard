"use client";
import { useState } from "react";
import { Plus, X, GripVertical } from "lucide-react";
import { useActionItems } from "@/hooks/useConvexData";

type KanbanColumn = "todo" | "in_progress" | "done";

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

function KanbanCard({ item, onRemove, onEdit, onDragStart, onDragEnd, isDragging }: {
  item: any;
  onRemove: (id: string) => void;
  onEdit: (id: string, updates: { text?: string; priority?: string; assignedTo?: string }) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
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
      draggable={!editing}
      onDragStart={() => onDragStart(item._id)}
      onDragEnd={onDragEnd}
      className={`group bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-2.5 hover:border-[#a1a1aa] dark:hover:border-[#52525b] transition-all ${
        isDragging ? "opacity-40 scale-[0.98]" : ""
      } ${!editing ? "cursor-grab active:cursor-grabbing" : ""}`}
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
                <select value={editAssignee} onChange={e => setEditAssignee(e.target.value)}
                  className="text-[10px] px-1.5 py-0.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#71717a] dark:text-[#a1a1aa]">
                  <option value="">Unassigned</option>
                  <option value="Ori">Ori</option>
                  <option value="Max">Max</option>
                </select>
                <button onClick={save} className="text-[10px] font-medium px-2 py-0.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded cursor-pointer">Save</button>
                <button onClick={() => { setEditing(false); setEditText(item.text); setEditPriority(item.priority); setEditAssignee(item.assignedTo || ""); }}
                  className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] cursor-pointer">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <p onClick={() => setEditing(true)}
                className={`text-[12px] leading-relaxed cursor-text hover:bg-[#fafafa] dark:hover:bg-[#27272a] rounded px-0.5 -mx-0.5 ${item.column === "done" ? "text-[#a1a1aa] line-through" : "text-[#18181b] dark:text-[#fafafa]"}`}>
                {item.text}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${priorityDot[item.priority] || priorityDot.medium}`} />
                <span className="text-[9px] text-[#a1a1aa] dark:text-[#71717a] capitalize">{item.priority}</span>
                {item.assignedTo && (
                  <>
                    <span className="text-[9px] text-[#d4d4d8] dark:text-[#52525b]">\u00B7</span>
                    <span className="text-[9px] text-[#2563eb] dark:text-[#60a5fa] font-medium">{item.assignedTo}</span>
                  </>
                )}
                {item.unit && (
                  <>
                    <span className="text-[9px] text-[#d4d4d8] dark:text-[#52525b]">\u00B7</span>
                    <span className="text-[9px] text-[#71717a] dark:text-[#a1a1aa] font-medium">{item.unit}</span>
                  </>
                )}
                <span className="text-[9px] text-[#d4d4d8] dark:text-[#52525b]">\u00B7</span>
                <span className="text-[9px] text-[#a1a1aa] dark:text-[#71717a]">{item.createdAt?.slice(0, 10)}</span>
              </div>
            </>
          )}
        </div>
        {!editing && (
          <button onClick={(e) => { e.stopPropagation(); onRemove(item._id); }}
            className="opacity-0 group-hover:opacity-100 text-[#a1a1aa] dark:text-[#71717a] hover:text-[#dc2626] dark:hover:text-[#dc2626] transition-all cursor-pointer">
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ActionItems() {
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
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Action Items</p>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-[11px] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] transition-colors cursor-pointer">
          <Plus size={14} /> New
        </button>
      </div>

      {showAdd && (
        <div className="flex flex-col sm:flex-row gap-2 mb-3 p-3 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded">
          <input type="text" value={newText} onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder="Type an action item..."
            className="flex-1 text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
            autoFocus />
          <select value={newPriority} onChange={e => setNewPriority(e.target.value)}
            className="text-[11px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#71717a] dark:text-[#a1a1aa]">
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select value={newAssignee} onChange={e => setNewAssignee(e.target.value)}
            className="text-[11px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-[#fafafa] dark:bg-[#27272a] text-[#71717a] dark:text-[#a1a1aa]">
            <option value="">Assign to...</option>
            <option value="Ori">Ori</option>
            <option value="Max">Max</option>
          </select>
          <button onClick={handleAdd}
            className="text-[11px] font-medium px-3 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] transition-colors cursor-pointer">
            Add
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {columns.map(col => {
          const colItems = items.filter(i => i.column === col.key);
          const isDropTarget = dragOverCol === col.key && draggingId !== null;
          return (
            <div
              key={col.key}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => handleDrop(e, col.key)}
              className={`bg-[#fafafa] dark:bg-[#27272a] border-2 border-t-2 ${columnBorder[col.key]} rounded p-2.5 min-h-[140px] transition-colors ${
                isDropTarget ? "border-[#18181b] dark:border-[#fafafa] bg-[#f4f4f5] dark:bg-[#3f3f46]" : "border-[#e4e4e7] dark:border-[#3f3f46]"
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[11px] font-semibold text-[#18181b] dark:text-[#fafafa] uppercase tracking-wide">{col.label}</p>
                <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] font-medium">{colItems.length}</span>
              </div>
              <div className="space-y-2 min-h-[80px]">
                {colItems.map(item => (
                  <KanbanCard
                    key={item._id}
                    item={item}
                    onRemove={handleRemove}
                    onEdit={handleEdit}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isDragging={draggingId === item._id}
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

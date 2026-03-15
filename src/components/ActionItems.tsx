"use client";
import { useState, useEffect } from "react";
import { Plus, X, GripVertical } from "lucide-react";
import { KanbanItem, KanbanColumn, loadKanban, saveKanban, addKanbanItem, moveKanbanItem, removeKanbanItem, updateKanbanItem } from "@/data/store";

const columns: { key: KanbanColumn; label: string; count?: number }[] = [
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

function KanbanCard({ item, onMove, onRemove, onEdit }: {
  item: KanbanItem;
  onMove: (id: string, col: KanbanColumn) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, updates: Partial<Pick<KanbanItem, "text" | "priority" | "unit">>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const [editPriority, setEditPriority] = useState(item.priority);

  function save() {
    if (editText.trim() && editText.trim() !== item.text || editPriority !== item.priority) {
      onEdit(item.id, { text: editText.trim(), priority: editPriority });
    }
    setEditing(false);
  }

  return (
    <div className="group bg-white border border-[#e4e4e7] rounded p-2.5 hover:border-[#a1a1aa] transition-colors">
      <div className="flex items-start gap-2">
        <GripVertical size={12} className="text-[#d4d4d8] mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-1.5">
              <textarea value={editText} onChange={e => setEditText(e.target.value)}
                className="w-full text-[12px] text-[#18181b] bg-[#fafafa] border border-[#e4e4e7] rounded p-1.5 leading-relaxed focus:outline-none focus:border-[#71717a] resize-none min-h-[40px]"
                autoFocus onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === "Escape") setEditing(false); }} />
              <div className="flex items-center gap-2">
                <select value={editPriority} onChange={e => setEditPriority(e.target.value as KanbanItem["priority"])}
                  className="text-[10px] px-1.5 py-0.5 border border-[#e4e4e7] rounded bg-[#fafafa] text-[#71717a]">
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <button onClick={save} className="text-[10px] font-medium px-2 py-0.5 bg-[#18181b] text-white rounded cursor-pointer">Save</button>
                <button onClick={() => { setEditing(false); setEditText(item.text); setEditPriority(item.priority); }}
                  className="text-[10px] text-[#a1a1aa] cursor-pointer">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <p onClick={() => setEditing(true)}
                className={`text-[12px] leading-relaxed cursor-text hover:bg-[#fafafa] rounded px-0.5 -mx-0.5 ${item.column === "done" ? "text-[#a1a1aa] line-through" : "text-[#18181b]"}`}>
                {item.text}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${priorityDot[item.priority]}`} />
                <span className="text-[9px] text-[#a1a1aa] capitalize">{item.priority}</span>
                {item.unit && (
                  <>
                    <span className="text-[9px] text-[#d4d4d8]">·</span>
                    <span className="text-[9px] text-[#71717a] font-medium">{item.unit}</span>
                  </>
                )}
                <span className="text-[9px] text-[#d4d4d8]">·</span>
                <span className="text-[9px] text-[#a1a1aa]">{item.createdAt}</span>
              </div>
            </>
          )}
        </div>
        {!editing && (
          <button onClick={() => onRemove(item.id)}
            className="opacity-0 group-hover:opacity-100 text-[#a1a1aa] hover:text-[#dc2626] transition-all cursor-pointer">
            <X size={13} />
          </button>
        )}
      </div>
      {/* Move buttons */}
      {item.column !== "done" && (
        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {item.column === "todo" && (
            <button onClick={() => onMove(item.id, "in_progress")}
              className="text-[9px] text-[#71717a] hover:text-[#18181b] px-1.5 py-0.5 border border-[#e4e4e7] rounded cursor-pointer transition-colors">
              → In Progress
            </button>
          )}
          {item.column === "in_progress" && (
            <>
              <button onClick={() => onMove(item.id, "todo")}
                className="text-[9px] text-[#71717a] hover:text-[#18181b] px-1.5 py-0.5 border border-[#e4e4e7] rounded cursor-pointer transition-colors">
                ← To Do
              </button>
              <button onClick={() => onMove(item.id, "done")}
                className="text-[9px] text-[#71717a] hover:text-[#18181b] px-1.5 py-0.5 border border-[#e4e4e7] rounded cursor-pointer transition-colors">
                → Done
              </button>
            </>
          )}
        </div>
      )}
      {item.column === "done" && (
        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onMove(item.id, "todo")}
            className="text-[9px] text-[#71717a] hover:text-[#18181b] px-1.5 py-0.5 border border-[#e4e4e7] rounded cursor-pointer transition-colors">
            ← Reopen
          </button>
        </div>
      )}
    </div>
  );
}

export default function ActionItems() {
  const [items, setItems] = useState<KanbanItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [newPriority, setNewPriority] = useState<KanbanItem["priority"]>("medium");

  useEffect(() => { setItems(loadKanban()); }, []);

  // Listen for custom events from the chat
  useEffect(() => {
    function handleUpdate() { setItems(loadKanban()); }
    window.addEventListener("kanban-updated", handleUpdate);
    return () => window.removeEventListener("kanban-updated", handleUpdate);
  }, []);

  function handleMove(id: string, col: KanbanColumn) {
    moveKanbanItem(id, col);
    setItems(loadKanban());
  }

  function handleRemove(id: string) {
    removeKanbanItem(id);
    setItems(loadKanban());
  }

  function handleAdd() {
    if (!newText.trim()) return;
    addKanbanItem(newText.trim(), newPriority);
    setItems(loadKanban());
    setNewText("");
    setShowAdd(false);
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold text-[#18181b]">Action Items</p>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-[11px] text-[#71717a] hover:text-[#18181b] transition-colors cursor-pointer">
          <Plus size={14} /> New
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="flex flex-col sm:flex-row gap-2 mb-3 p-3 bg-white border border-[#e4e4e7] rounded">
          <input type="text" value={newText} onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder="Type an action item..."
            className="flex-1 text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
            autoFocus />
          <select value={newPriority} onChange={e => setNewPriority(e.target.value as KanbanItem["priority"])}
            className="text-[11px] px-2 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] text-[#71717a]">
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button onClick={handleAdd}
            className="text-[11px] font-medium px-3 py-1.5 bg-[#18181b] text-white rounded hover:bg-[#27272a] transition-colors cursor-pointer">
            Add
          </button>
        </div>
      )}

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {columns.map(col => {
          const colItems = items.filter(i => i.column === col.key);
          return (
            <div key={col.key} className={`bg-[#fafafa] border border-[#e4e4e7] border-t-2 ${columnBorder[col.key]} rounded p-2.5 min-h-[120px]`}>
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[11px] font-semibold text-[#18181b] uppercase tracking-wide">{col.label}</p>
                <span className="text-[10px] text-[#a1a1aa] font-medium">{colItems.length}</span>
              </div>
              <div className="space-y-2">
                {colItems.map(item => (
                  <KanbanCard key={item.id} item={item} onMove={handleMove} onRemove={handleRemove} />
                ))}
                {colItems.length === 0 && (
                  <p className="text-[10px] text-[#d4d4d8] text-center py-4">No items</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

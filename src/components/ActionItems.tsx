"use client";
import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";

export interface ActionItem {
  id: string;
  text: string;
  done: boolean;
  priority: "high" | "medium" | "low";
  createdAt: string;
}

const STORAGE_KEY = "redhorn_action_items";

const defaultItems: ActionItem[] = [
  { id: "1", text: "Follow up with PM — late fees not auto-posted in Yardi for $40K past due", done: false, priority: "high", createdAt: "2026-03-12" },
  { id: "2", text: "C-212 & C-305 — electric charges not posted for March. Contact PM by EOD", done: false, priority: "high", createdAt: "2026-03-12" },
  { id: "3", text: "A-90 holdover — lease expired Feb 28. No renewal signed. Escalate to legal", done: false, priority: "high", createdAt: "2026-03-10" },
  { id: "4", text: "C-207 default letter sent 03/10 — verify tenant response within 5 business days", done: false, priority: "medium", createdAt: "2026-03-10" },
  { id: "5", text: "A-106A lease expires Jun 30 — initiate renewal conversation with QuickShip", done: false, priority: "medium", createdAt: "2026-03-08" },
  { id: "6", text: "Request Yardi API access from management company for automated syncing", done: true, priority: "low", createdAt: "2026-03-01" },
  { id: "7", text: "Verify Feb electric billing posted correctly for all Net Lease tenants", done: true, priority: "medium", createdAt: "2026-02-15" },
];

function loadItems(): ActionItem[] {
  if (typeof window === "undefined") return defaultItems;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : defaultItems;
  } catch { return defaultItems; }
}

function saveItems(items: ActionItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function ActionItems() {
  const [items, setItems] = useState<ActionItem[]>(defaultItems);
  const [newText, setNewText] = useState("");
  const [newPriority, setNewPriority] = useState<ActionItem["priority"]>("medium");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { setItems(loadItems()); }, []);

  function toggle(id: string) {
    const updated = items.map(i => i.id === id ? { ...i, done: !i.done } : i);
    setItems(updated);
    saveItems(updated);
  }

  function remove(id: string) {
    const updated = items.filter(i => i.id !== id);
    setItems(updated);
    saveItems(updated);
  }

  function add() {
    if (!newText.trim()) return;
    const item: ActionItem = {
      id: Date.now().toString(),
      text: newText.trim(),
      done: false,
      priority: newPriority,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    const updated = [item, ...items];
    setItems(updated);
    saveItems(updated);
    setNewText("");
    setShowAdd(false);
  }

  const pending = items.filter(i => !i.done);
  const completed = items.filter(i => i.done);

  const priorityDot: Record<string, string> = {
    high: "bg-[#dc2626]",
    medium: "bg-[#d97706]",
    low: "bg-[#a1a1aa]",
  };

  return (
    <div className="bg-white border border-[#e4e4e7] rounded p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold text-[#18181b]">Action Items</p>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-[11px] text-[#71717a] hover:text-[#18181b] transition-colors cursor-pointer"
        >
          <Plus size={14} />
          New
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="flex flex-col sm:flex-row gap-2 mb-3 pb-3 border-b border-[#f4f4f5]">
          <input
            type="text"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
            placeholder="Type an action item..."
            className="flex-1 text-[12px] px-2.5 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#a1a1aa] placeholder-[#a1a1aa]"
            autoFocus
          />
          <select
            value={newPriority}
            onChange={e => setNewPriority(e.target.value as ActionItem["priority"])}
            className="text-[11px] px-2 py-1.5 border border-[#e4e4e7] rounded bg-[#fafafa] text-[#71717a]"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button
            onClick={add}
            className="text-[11px] font-medium px-3 py-1.5 bg-[#18181b] text-white rounded hover:bg-[#27272a] transition-colors cursor-pointer"
          >
            Add
          </button>
        </div>
      )}

      {/* Pending items */}
      <div className="space-y-0.5">
        {pending.map(item => (
          <div key={item.id} className="group flex items-start gap-2.5 py-1.5 hover:bg-[#fafafa] -mx-2 px-2 rounded transition-colors">
            <button
              onClick={() => toggle(item.id)}
              className="mt-0.5 w-4 h-4 rounded border border-[#d4d4d8] flex-shrink-0 hover:border-[#18181b] transition-colors cursor-pointer"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-[#18181b] leading-relaxed">{item.text}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${priorityDot[item.priority]}`} />
                <span className="text-[10px] text-[#a1a1aa] capitalize">{item.priority}</span>
                <span className="text-[10px] text-[#d4d4d8]">·</span>
                <span className="text-[10px] text-[#a1a1aa]">{item.createdAt}</span>
              </div>
            </div>
            <button
              onClick={() => remove(item.id)}
              className="opacity-0 group-hover:opacity-100 text-[#a1a1aa] hover:text-[#dc2626] transition-all cursor-pointer mt-0.5"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Completed */}
      {completed.length > 0 && (
        <>
          <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide mt-4 mb-1.5">{completed.length} completed</p>
          <div className="space-y-0.5">
            {completed.map(item => (
              <div key={item.id} className="group flex items-start gap-2.5 py-1.5 hover:bg-[#fafafa] -mx-2 px-2 rounded transition-colors">
                <button
                  onClick={() => toggle(item.id)}
                  className="mt-0.5 w-4 h-4 rounded bg-[#18181b] flex-shrink-0 flex items-center justify-center cursor-pointer"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
                <p className="flex-1 text-[12px] text-[#a1a1aa] line-through leading-relaxed">{item.text}</p>
                <button
                  onClick={() => remove(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-[#a1a1aa] hover:text-[#dc2626] transition-all cursor-pointer mt-0.5"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

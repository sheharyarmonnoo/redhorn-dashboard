"use client";
import { useState } from "react";
import { Plus, X, Trash2, GripVertical } from "lucide-react";
import { useDealFieldDefinitions } from "@/hooks/useConvexData";

type FieldType = "text" | "longtext" | "number" | "currency" | "date" | "select";

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short text",
  longtext: "Long text",
  number: "Number",
  currency: "Currency ($)",
  date: "Date",
  select: "Dropdown (select)",
};

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Manage the user-defined custom field columns for the deals pipeline.
 * Add / rename / reorder / delete. Deleting a definition also clears the
 * value off every deal so we don't leave orphaned data.
 */
export default function CustomFieldsModal({ open, onClose }: Props) {
  const { defs, upsertByKey, updateDef, reorder, removeDef } = useDealFieldDefinitions();
  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftType, setDraftType] = useState<FieldType>("text");
  const [draftOptions, setDraftOptions] = useState("");

  if (!open) return null;

  function slugify(s: string): string {
    const cleaned = s.replace(/[^a-zA-Z0-9 ]/g, "").trim();
    const parts = cleaned.split(/\s+/);
    return parts
      .map((p, i) => (i === 0 ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1).toLowerCase()))
      .join("");
  }

  async function handleAdd() {
    const label = draftLabel.trim();
    if (!label) return;
    const key = slugify(label);
    if (!key) return;
    if (defs.find((d: any) => d.key === key)) {
      alert(`A field with key "${key}" already exists.`);
      return;
    }
    const options = draftType === "select"
      ? draftOptions.split(",").map(s => s.trim()).filter(Boolean)
      : undefined;
    await upsertByKey({
      key,
      label,
      type: draftType,
      options: options && options.length > 0 ? options : undefined,
    });
    setAdding(false);
    setDraftLabel("");
    setDraftOptions("");
    setDraftType("text");
  }

  async function handleDelete(d: any) {
    if (!confirm(`Delete custom field "${d.label}"? This will also clear the value on every deal that has it.`)) return;
    await removeDef({ id: d._id });
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...defs];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    reorder({ ids: next.map((d: any) => d._id) });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 dark:bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg shadow-2xl w-full max-w-xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-[#e4e4e7] dark:border-[#3f3f46] sticky top-0 bg-white dark:bg-[#18181b]">
          <div>
            <p className="text-[14px] font-semibold text-[#18181b] dark:text-[#fafafa]">Custom Deal Fields</p>
            <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] mt-0.5">Add columns that surface across every deal in the pipeline.</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] rounded cursor-pointer">
            <X size={16} className="text-[#a1a1aa]" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {defs.length === 0 ? (
            <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] italic">No custom fields yet. Click "Add Field" to create one.</p>
          ) : (
            <div className="space-y-1">
              {defs.map((d: any, idx: number) => (
                <div key={d._id} className="flex items-center gap-2 px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b]">
                  <div className="flex flex-col">
                    <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-[10px] text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] disabled:opacity-20 cursor-pointer leading-none">▲</button>
                    <button onClick={() => move(idx, 1)} disabled={idx === defs.length - 1} className="text-[10px] text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] disabled:opacity-20 cursor-pointer leading-none">▼</button>
                  </div>
                  <GripVertical size={12} className="text-[#d4d4d8]" />
                  <input
                    type="text"
                    defaultValue={d.label}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next && next !== d.label) updateDef({ id: d._id, label: next });
                    }}
                    className="flex-1 text-[12px] px-2 py-1 border border-transparent hover:border-[#e4e4e7] dark:hover:border-[#3f3f46] rounded bg-transparent text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a]"
                  />
                  <span className="text-[10px] text-[#71717a] dark:text-[#a1a1aa] uppercase font-medium whitespace-nowrap">{FIELD_TYPE_LABELS[d.type as FieldType] || d.type}</span>
                  <button
                    onClick={() => handleDelete(d)}
                    className="p-1 text-[#a1a1aa] hover:text-[#dc2626] cursor-pointer"
                    title={`Delete "${d.label}"`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {adding ? (
            <div className="border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 space-y-2 bg-[#fafafa] dark:bg-[#27272a]">
              <input
                type="text"
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="Field label (e.g. Cap Rate Target)"
                autoFocus
                className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a]"
              />
              <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value as FieldType)}
                className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a]"
              >
                {Object.entries(FIELD_TYPE_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>{lbl}</option>
                ))}
              </select>
              {draftType === "select" && (
                <input
                  type="text"
                  value={draftOptions}
                  onChange={(e) => setDraftOptions(e.target.value)}
                  placeholder="Comma-separated options (e.g. High, Medium, Low)"
                  className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a]"
                />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!draftLabel.trim()}
                  className="text-[11px] font-medium px-3 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save
                </button>
                <button
                  onClick={() => { setAdding(false); setDraftLabel(""); setDraftOptions(""); }}
                  className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-[#2563eb] dark:text-[#60a5fa] hover:bg-blue-50 dark:hover:bg-blue-950/30 px-2 py-1 rounded cursor-pointer"
            >
              <Plus size={12} /> Add Field
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

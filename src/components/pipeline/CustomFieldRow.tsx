"use client";
import { useState, useEffect } from "react";

type FieldType = "text" | "longtext" | "number" | "currency" | "date" | "select";

interface Props {
  label: string;
  fieldKey: string;
  type: FieldType;
  options?: string[];
  value: any;
  onSave: (next: any) => void | Promise<void>;
}

/**
 * One custom-field input that lives in DealDetail's overview tab. The control
 * shape switches off `type`. Saves on blur (text inputs) or change (select +
 * date) — never per-keystroke, so we don't hammer Convex.
 */
export default function CustomFieldRow({ label, type, options, value, onSave }: Props) {
  const [draft, setDraft] = useState<string>(value === undefined || value === null ? "" : String(value));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value === undefined || value === null ? "" : String(value));
  }, [value]);

  async function commit(next: string) {
    setSaving(true);
    try {
      if (type === "number" || type === "currency") {
        const n = next.trim() === "" ? undefined : Number(next.replace(/[$,]/g, ""));
        await onSave(Number.isFinite(n!) ? n : undefined);
      } else {
        await onSave(next.trim() === "" ? undefined : next);
      }
    } finally {
      setSaving(false);
    }
  }

  const inputBase =
    "w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] disabled:opacity-50";

  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3 py-1">
      <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide">{label}</label>
      {type === "longtext" ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== (value ?? "") && commit(draft)}
          rows={2}
          disabled={saving}
          className={`${inputBase} resize-none leading-relaxed`}
        />
      ) : type === "select" ? (
        <select
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            commit(e.target.value);
          }}
          disabled={saving}
          className={inputBase}
        >
          <option value="">—</option>
          {(options || []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : type === "date" ? (
        <input
          type="date"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            commit(e.target.value);
          }}
          disabled={saving}
          className={inputBase}
        />
      ) : (
        <input
          type={type === "number" || type === "currency" ? "text" : "text"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const cur = value === undefined || value === null ? "" : String(value);
            if (draft !== cur) commit(draft);
          }}
          placeholder={type === "currency" ? "$0" : ""}
          disabled={saving}
          className={inputBase}
        />
      )}
    </div>
  );
}

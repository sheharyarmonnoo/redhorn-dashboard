"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import StatusPill, { type TenantStatusKey } from "./StatusPill";

// Click-to-edit popover that lets an asset manager set the manual status
// override on a tenant or RV site. The trigger is just a StatusPill; on
// click, a floating menu opens with every enum value plus a "Clear
// override" item that reverts to the synced (system) status.
//
// Save flow is fire-and-forget from this component's perspective. The
// onSelect handler is expected to call setOverride / clearOverride and
// throw if it fails; we surface a small "Saving…" state while the
// promise resolves.

const STATUS_OPTIONS: { key: TenantStatusKey; group?: string }[] = [
  { key: "current" },
  { key: "past_due" },
  { key: "locked_out" },
  { key: "auction_posted" },
  { key: "in_eviction" },
  { key: "auction_completed" },
  { key: "needs_review" },
  { key: "vacant" },
];

interface Props {
  status: string | undefined | null;
  isOverridden?: boolean;
  // RV site rows compute their status at read time, so the override
  // semantics differ slightly — disable the popover for those until
  // Slice 2.5 surfaces overrides on the RV side. Pass disabled=true
  // to render the pill non-interactively.
  disabled?: boolean;
  onSelect: (status: string) => void | Promise<void>;
  onClear?: () => void | Promise<void>;
}

export default function StatusEditor({
  status,
  isOverridden = false,
  disabled = false,
  onSelect,
  onClear,
}: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Position the menu under the pill using viewport coords so AG Grid's
  // cell clipping can't truncate it. Recalculated on open and on resize
  // / scroll so the popover stays anchored even when the user scrolls
  // the grid.
  useEffect(() => {
    if (!open) return;
    function place() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const left = Math.max(8, Math.min(window.innerWidth - 240, r.left));
      const top = r.bottom + 4;
      setCoords({ top, left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  async function pick(next: string | null) {
    setSaving(true);
    try {
      if (next === null) await onClear?.();
      else await onSelect(next);
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((v) => !v);
        }}
        disabled={disabled}
        className={`inline-flex items-center ${
          disabled
            ? "cursor-default"
            : "cursor-pointer hover:opacity-80"
        }`}
        title={disabled ? "" : "Click to change status"}
      >
        <StatusPill status={status} />
      </button>
      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              style={{ top: coords.top, left: coords.left }}
              className="fixed z-[60] w-56 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg shadow-xl py-1 text-[12px]"
            >
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide font-semibold text-[#a1a1aa] dark:text-[#71717a] border-b border-[#f4f4f5] dark:border-[#27272a]">
                Set manual status
              </div>
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void pick(o.key);
                  }}
                  disabled={saving}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#fafafa] dark:hover:bg-[#27272a] cursor-pointer text-left disabled:opacity-50"
                >
                  <StatusPill status={o.key} size="xs" />
                </button>
              ))}
              {isOverridden && onClear && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void pick(null);
                  }}
                  disabled={saving}
                  className="w-full px-3 py-1.5 hover:bg-[#fafafa] dark:hover:bg-[#27272a] cursor-pointer text-left text-[#71717a] dark:text-[#a1a1aa] border-t border-[#f4f4f5] dark:border-[#27272a] disabled:opacity-50"
                >
                  Clear override (revert to system)
                </button>
              )}
              {saving && (
                <div className="px-3 py-1 text-[10px] text-[#a1a1aa] dark:text-[#71717a] border-t border-[#f4f4f5] dark:border-[#27272a]">
                  Saving…
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

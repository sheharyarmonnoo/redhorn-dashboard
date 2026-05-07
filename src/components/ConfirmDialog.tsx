"use client";
import { useEffect } from "react";

/**
 * Reusable confirmation dialog. Used anywhere we need a "are you sure"
 * before a destructive action — replaces `window.confirm` so the prompt
 * matches the dashboard's design system instead of the browser-native one.
 *
 * Esc + backdrop click cancel. The Confirm button auto-focuses so the user
 * can hit Enter to commit.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 dark:bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg shadow-2xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-2">
          <p className="text-[14px] font-semibold text-[#18181b] dark:text-[#fafafa]">{title}</p>
          <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] mt-1.5 leading-relaxed">{message}</p>
        </div>
        <div className="px-5 py-3 border-t border-[#e4e4e7] dark:border-[#3f3f46] flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-[12px] px-3 py-1.5 rounded text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={`text-[12px] font-medium px-3 py-1.5 rounded text-white cursor-pointer ${
              destructive
                ? "bg-[#dc2626] hover:bg-[#b91c1c]"
                : "bg-[#18181b] dark:bg-[#fafafa] dark:text-[#18181b] hover:opacity-90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

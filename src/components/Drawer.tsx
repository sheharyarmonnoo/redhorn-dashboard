"use client";

import { useEffect, useRef } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: string;
}

export default function Drawer({ open, onClose, title, subtitle, children, width = "480px" }: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      document.addEventListener("keydown", handleKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/30"
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 200ms ease",
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={drawerRef}
        className="fixed top-0 right-0 h-full z-50 bg-white flex flex-col"
        style={{
          width: `min(${width}, 100vw)`,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 200ms ease",
        }}
      >
        {/* Sticky header */}
        <div className="sticky top-0 bg-white border-b border-[#e4e4e7] px-5 py-4 flex items-start justify-between z-10">
          <div className="min-w-0 flex-1 mr-3">
            <h2 className="text-base font-semibold text-[#18181b] truncate">{title}</h2>
            {subtitle && <p className="text-xs text-[#71717a] mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-[#f4f4f5] text-[#71717a] hover:text-[#18181b] transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </>
  );
}

"use client";

import { UserProfile } from "@clerk/nextjs";
import { useState } from "react";
import { RotateCcw, Check } from "lucide-react";
import PageHeader from "@/components/PageHeader";

export default function AccountPage() {
  const [toast, setToast] = useState<string | null>(null);

  const show = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const resetDealsCols = () => {
    localStorage.removeItem("redhorn-deals-col-groups");
    show("Deal pipeline column state reset");
  };

  const resetDealsView = () => {
    localStorage.removeItem("redhorn_deals_view");
    show("Deal pipeline view reset");
  };

  const resetSidebar = () => {
    localStorage.removeItem("redhorn_sidebar_collapsed");
    show("Sidebar preference reset");
  };

  const resetTheme = () => {
    localStorage.removeItem("redhorn_theme");
    show("Theme preference reset — refresh to apply");
  };

  const resetAll = () => {
    if (!confirm("Reset all table and UI preferences?")) return;
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("redhorn")) localStorage.removeItem(key);
    }
    show("All preferences reset");
  };

  return (
    <div>
      <PageHeader title="Account" subtitle="Profile & preferences" />

      {/* Preferences */}
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-5 mb-6 max-w-2xl">
        <div className="mb-4">
          <h2 className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Preferences</h2>
          <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] mt-0.5">
            Reset saved UI state (column layouts, view modes, sidebar, theme)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={resetDealsCols} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] cursor-pointer">
            <RotateCcw className="w-3 h-3" /> Deals Columns
          </button>
          <button onClick={resetDealsView} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] cursor-pointer">
            <RotateCcw className="w-3 h-3" /> Deals View
          </button>
          <button onClick={resetSidebar} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] cursor-pointer">
            <RotateCcw className="w-3 h-3" /> Sidebar
          </button>
          <button onClick={resetTheme} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] cursor-pointer">
            <RotateCcw className="w-3 h-3" /> Theme
          </button>
          <button onClick={resetAll} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 border border-[#fecaca] dark:border-[#7f1d1d] rounded text-[#dc2626] hover:bg-[#fef2f2] dark:hover:bg-[#7f1d1d]/20 cursor-pointer">
            <RotateCcw className="w-3 h-3" /> Reset Everything
          </button>
        </div>
        {toast && (
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
            <Check className="w-3 h-3" /> {toast}
          </div>
        )}
      </div>

      {/* Clerk User Profile */}
      <div className="max-w-3xl">
        <h2 className="text-[13px] font-semibold mb-3 text-[#18181b] dark:text-[#fafafa]">Profile</h2>
        <div className="rounded-md border border-[#e4e4e7] dark:border-[#3f3f46] overflow-hidden" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          <UserProfile
            appearance={{
              elements: {
                rootBox: "w-full",
                cardBox: "w-full shadow-none",
                card: "shadow-none border-none w-full",
                navbar: "hidden",
                navbarMobileMenuRow: "hidden",
                pageScrollBox: "p-4",
                page: "gap-4",
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { UserProfile } from "@clerk/nextjs";
import { useState, useEffect } from "react";
import { RotateCcw, Check, Mail } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import {
  EMAIL_PROVIDER_LABELS,
  getEmailProvider,
  setEmailProvider,
  type EmailProvider,
} from "@/lib/emailProvider";

export default function AccountPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [provider, setProviderState] = useState<EmailProvider>("gmail");

  useEffect(() => {
    setProviderState(getEmailProvider());
  }, []);

  const show = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const handleProviderChange = (next: EmailProvider) => {
    setEmailProvider(next);
    setProviderState(next);
    show(`Email provider set to ${EMAIL_PROVIDER_LABELS[next]}`);
  };

  const resetGridLayouts = () => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("redhorn_grid_")) localStorage.removeItem(key);
    }
    show("Table column layouts reset — refresh to apply");
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
    if (!confirm("Reset all table layouts, sidebar, theme, and other UI preferences?")) return;
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("redhorn")) localStorage.removeItem(key);
    }
    show("All preferences reset — refresh to apply");
  };

  return (
    <div>
      <PageHeader title="Account" subtitle="Profile & preferences" />

      {/* Email Provider — controls where the alert/tenant compose UI sends
          users. We never SMTP-send anything ourselves; the user's webmail
          handles delivery. Selection persists in localStorage. */}
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-5 mb-6 max-w-2xl mx-auto">
        <div className="mb-3 flex items-start gap-2">
          <Mail className="w-4 h-4 text-[#71717a] dark:text-[#a1a1aa] mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Email Provider</h2>
            <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] mt-0.5">
              When you click "Open in &lt;provider&gt;" on an alert or tenant email, we open a pre-filled compose tab in your webmail — no SMTP keys, no server-side delivery.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(EMAIL_PROVIDER_LABELS) as Array<[EmailProvider, string]>).map(([key, label]) => {
            const active = provider === key;
            return (
              <button
                key={key}
                onClick={() => handleProviderChange(key)}
                className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 border rounded cursor-pointer ${
                  active
                    ? "bg-[#18181b] dark:bg-[#fafafa] border-[#18181b] dark:border-[#fafafa] text-white dark:text-[#18181b] font-medium"
                    : "border-[#e4e4e7] dark:border-[#3f3f46] text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a]"
                }`}
              >
                {active && <Check className="w-3 h-3" />}
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-2">
          Currently selected: <span className="font-medium text-[#18181b] dark:text-[#fafafa]">{EMAIL_PROVIDER_LABELS[provider]}</span>
        </p>
      </div>

      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-5 mb-6 max-w-2xl mx-auto">
        <div className="mb-4">
          <h2 className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Preferences</h2>
          <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] mt-0.5">
            Reset saved UI state (table column widths/order, sidebar, theme)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={resetGridLayouts} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] cursor-pointer">
            <RotateCcw className="w-3 h-3" /> Table Layouts
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

      <div className="max-w-3xl mx-auto account-clerk-wrapper">
        <UserProfile
          appearance={{
            elements: {
              rootBox: "w-full",
              cardBox: "w-full shadow-none border border-[#e4e4e7] dark:border-[#3f3f46] rounded-md",
              card: "shadow-none border-none w-full bg-white dark:bg-[#18181b]",
              navbar: "!hidden",
              navbarMobileMenuRow: "!hidden",
              scrollBox: "rounded-md",
              pageScrollBox: "px-6 py-5",
              page: "gap-5",
              header: "pb-2",
              profileSectionTitleText: "text-[13px] font-semibold",
              profileSectionPrimaryButton: "text-[12px]",
              formButtonPrimary: "text-[12px]",
            },
          }}
        />
      </div>
    </div>
  );
}

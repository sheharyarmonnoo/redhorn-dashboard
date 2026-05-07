"use client";

import { Construction } from "lucide-react";

// Rendered in place of the normal page body for properties that don't have a
// Yardi feed (e.g. the RV park, which will integrate from Campspot later).
// Without this, every dashboard page would render zero-state KPIs / empty
// grids that look identical to a broken Yardi sync — which the client would
// (rightly) read as a bug.
export default function ComingSoonBanner({ propertyName }: { propertyName: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-12 max-w-xl w-full text-center">
        <div className="flex justify-center mb-5">
          <div className="w-14 h-14 rounded-full bg-[#fef9c3] dark:bg-[#422006]/40 flex items-center justify-center">
            <Construction className="w-7 h-7 text-[#854d0e] dark:text-[#fde68a]" strokeWidth={1.75} />
          </div>
        </div>
        <p className="text-[18px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-2">
          {propertyName}
        </p>
        <p className="text-[12px] uppercase tracking-wide font-medium text-[#a1a1aa] dark:text-[#71717a] mb-4">
          Data integration coming soon
        </p>
        <p className="text-[13px] text-[#52525b] dark:text-[#a1a1aa] leading-relaxed">
          {propertyName} pulls from Campspot, which we'll wire up in a future release. For now, this property doesn't have live data.
        </p>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Dashboard error boundary caught:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-[11px] uppercase tracking-wider text-[#dc2626] font-semibold mb-2">Something went wrong</p>
        <h1 className="text-[18px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-2">
          We hit a snag rendering this page.
        </h1>
        <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] mb-5">
          {error.message || "Unknown error"}
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={reset}
            className="text-[12px] font-medium px-4 py-2 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded cursor-pointer hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="text-[12px] font-medium px-4 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] text-[#71717a] dark:text-[#a1a1aa] rounded cursor-pointer hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] transition-colors"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

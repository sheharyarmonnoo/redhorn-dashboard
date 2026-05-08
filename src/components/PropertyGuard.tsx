"use client";
import { useActiveProperty } from "@/hooks/useConvexData";

export { useActiveProperty };

export default function PropertyGuard({ children }: { children: React.ReactNode }) {
  const property = useActiveProperty();

  if (!property) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-[13px] text-[#a1a1aa] dark:text-[#71717a]">Loading properties...</p>
        </div>
      </div>
    );
  }

  // No global hasData gate. Each page decides what to render for properties
  // without a Yardi/Convex feed — e.g. /site-plan embeds Diamond Maps for
  // the RV park while other pages still fall back to their own
  // ComingSoonBanner. A blanket guard here masks that page-level logic and
  // forces every route into "Coming Soon", which is wrong for site-plan.
  return <>{children}</>;
}

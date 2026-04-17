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

  if (!property.hasData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <p className="text-[18px] font-semibold text-[#18181b] dark:text-[#fafafa]">{property.name}</p>
          <p className="text-[13px] text-[#a1a1aa] dark:text-[#71717a] mt-2">{property.location}{property.sqft ? ` · ${property.sqft}` : ""}</p>
          <p className="text-[13px] text-[#71717a] dark:text-[#a1a1aa] mt-5 leading-relaxed">
            No data synced for this property yet.
          </p>
          <p className="text-[12px] text-[#a1a1aa] dark:text-[#71717a] mt-2 leading-relaxed">
            Yardi syncs run automatically every few hours. You can also trigger an upload from the
            <a href="/data-pipeline" className="text-[#18181b] dark:text-[#fafafa] font-medium underline decoration-dotted mx-1">Data Pipeline</a>
            page, or switch to another property using the sidebar.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

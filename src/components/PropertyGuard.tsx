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
        <div className="text-center max-w-sm">
          <p className="text-[18px] font-semibold text-[#18181b] dark:text-[#fafafa]">{property.name}</p>
          <p className="text-[13px] text-[#a1a1aa] dark:text-[#71717a] mt-2">{property.location}{property.sqft ? ` · ${property.sqft}` : ""}</p>
          <p className="text-[13px] text-[#71717a] dark:text-[#a1a1aa] mt-4 leading-relaxed">
            No data synced for this property yet. Data will appear automatically after the next Yardi sync.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

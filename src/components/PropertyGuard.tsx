"use client";
import { useState, useEffect } from "react";
import { getProperties, getActiveProperty } from "@/data/portfolio";

export function useActiveProperty() {
  const [propId, setPropId] = useState("hollister");

  useEffect(() => {
    setPropId(getActiveProperty());
    function handle(e: Event) {
      const detail = (e as CustomEvent).detail;
      setPropId(detail.id);
    }
    window.addEventListener("portfolio-changed", handle);
    return () => window.removeEventListener("portfolio-changed", handle);
  }, []);

  const props = getProperties();
  const property = props.find(p => p.id === propId) || props[0];
  return property;
}

export default function PropertyGuard({ children }: { children: React.ReactNode }) {
  const property = useActiveProperty();

  if (!property.hasData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-sm">
          <p className="text-[18px] font-semibold text-[#18181b]">{property.name}</p>
          <p className="text-[13px] text-[#a1a1aa] mt-2">{property.location} · {property.sqft}</p>
          <p className="text-[13px] text-[#71717a] mt-4 leading-relaxed">
            No data has been uploaded for this property yet. Upload a Yardi rent roll, lease ledger, or income statement to get started.
          </p>
          <div className="mt-6">
            <label className="inline-flex items-center gap-2 text-[12px] font-medium px-4 py-2 bg-[#18181b] text-white rounded hover:bg-[#27272a] cursor-pointer transition-colors">
              Upload File
              <input type="file" className="hidden" accept=".xlsx,.csv,.pdf" />
            </label>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

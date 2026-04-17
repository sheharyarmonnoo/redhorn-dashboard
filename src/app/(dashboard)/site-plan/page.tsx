"use client";
import { useState } from "react";
import { useActiveProperty, useTenants } from "@/hooks/useConvexData";
import UnitDetailPanel from "@/components/UnitDetailPanel";
import PageHeader from "@/components/PageHeader";
import SitePlan3D from "@/components/SitePlan3D";

type ViewMode = "layout" | "map";

export default function SitePlanPage() {
  const property = useActiveProperty();
  const tenantsList = useTenants(property?._id) as any[];
  const [selected, setSelected] = useState<any | null>(null);
  const [view, setView] = useState<ViewMode>("layout");

  const occupied = tenantsList.filter((t: any) => t.status !== "vacant");
  const pastDue = tenantsList.filter((t: any) => t.status === "past_due");
  const vacant = tenantsList.filter((t: any) => t.status === "vacant");

  const propertyName = property?.name || "";
  const propertyLocation = property?.location || "";

  return (
    <div>
      <PageHeader title="Site Plan" subtitle="Click any unit for details">
        <div className="flex items-center border border-[#e4e4e7] dark:border-[#3f3f46] rounded overflow-hidden">
          <button
            onClick={() => setView("layout")}
            className={`text-[11px] font-medium px-3 py-1.5 transition-colors cursor-pointer ${
              view === "layout" ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b]" : "bg-white dark:bg-[#18181b] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
            }`}
          >
            Layout
          </button>
          <button
            onClick={() => setView("map")}
            className={`text-[11px] font-medium px-3 py-1.5 transition-colors cursor-pointer ${
              view === "map" ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b]" : "bg-white dark:bg-[#18181b] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
            }`}
          >
            Map
          </button>
        </div>
      </PageHeader>

      {view === "layout" ? (
        <SitePlan3D onSelect={setSelected} selectedUnit={selected?.unit || null} />
      ) : (
        <div className="w-full bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded overflow-hidden">
          <div className="bg-[#18181b] dark:bg-[#09090b] text-white px-4 sm:px-5 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-[13px] font-semibold tracking-tight">{propertyName || "Property"}</h2>
              <p className="text-[10px] text-[#a1a1aa] mt-0.5">{propertyLocation || "—"}</p>
            </div>
            {propertyLocation && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(propertyLocation)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[#71717a] hover:text-white transition-colors cursor-pointer"
              >
                Open in Google Maps →
              </a>
            )}
          </div>
          <iframe
            src={`https://www.google.com/maps?q=${encodeURIComponent(propertyLocation || propertyName)}&output=embed`}
            width="100%"
            height="500"
            style={{ border: 0 }}
            loading="lazy"
            title={`${propertyName} — Map`}
          />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4">
        {[
          { label: "Total Units", value: tenantsList.length, color: "text-[#18181b] dark:text-[#fafafa]" },
          { label: "Occupied", value: occupied.length, color: "text-[#16a34a]" },
          { label: "Past Due", value: pastDue.length, color: "text-[#dc2626]" },
          { label: "Vacant", value: vacant.length, color: "text-[#71717a] dark:text-[#a1a1aa]" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 text-center">
            <p className={`text-[20px] sm:text-[24px] font-semibold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] font-medium uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Unit Index */}
      <div className="mt-4 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-4">
        <p className="text-[12px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-3">All Units</p>
        <div className="flex flex-wrap gap-1">
          {tenantsList.map((t: any) => (
            <button
              key={t.unit}
              onClick={() => setSelected(t)}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                t.status === "current" ? "bg-white dark:bg-[#18181b] border-[#e4e4e7] dark:border-[#3f3f46] text-[#18181b] dark:text-[#fafafa] hover:bg-[#fafafa] dark:hover:bg-[#27272a]" :
                t.status === "past_due" ? "bg-white dark:bg-[#18181b] border-[#dc2626]/30 text-[#dc2626] hover:bg-red-50 dark:hover:bg-red-950/30" :
                t.status === "expiring_soon" ? "bg-white dark:bg-[#18181b] border-[#2563eb]/30 text-[#2563eb] dark:text-[#60a5fa] hover:bg-blue-50 dark:hover:bg-blue-950/30" :
                t.status === "vacant" ? "bg-[#fafafa] dark:bg-[#27272a] border-[#e4e4e7] dark:border-[#3f3f46] text-[#a1a1aa] dark:text-[#71717a]" :
                "bg-white dark:bg-[#18181b] border-[#d97706]/30 text-[#d97706] hover:bg-amber-50 dark:hover:bg-amber-950/30"
              }`}
            >
              {t.unit}
            </button>
          ))}
        </div>
      </div>

      <UnitDetailPanel tenant={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

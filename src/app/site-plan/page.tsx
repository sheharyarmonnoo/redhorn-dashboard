"use client";
import { useState } from "react";
import { tenants, Tenant } from "@/data/_seed_tenants";
import UnitDetailPanel from "@/components/UnitDetailPanel";
import PageHeader from "@/components/PageHeader";
import SitePlan3D from "@/components/SitePlan3D";

type ViewMode = "layout" | "map";

export default function SitePlanPage() {
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [view, setView] = useState<ViewMode>("layout");

  const occupied = tenants.filter(t => t.status !== "vacant");
  const pastDue = tenants.filter(t => t.status === "past_due");
  const vacant = tenants.filter(t => t.status === "vacant");

  return (
    <div>
      <PageHeader title="Site Plan" subtitle="Click any unit for details">
        <div className="flex items-center border border-[#e4e4e7] rounded overflow-hidden">
          <button
            onClick={() => setView("layout")}
            className={`text-[11px] font-medium px-3 py-1.5 transition-colors cursor-pointer ${
              view === "layout" ? "bg-[#18181b] text-white" : "bg-white text-[#71717a] hover:text-[#18181b]"
            }`}
          >
            Layout
          </button>
          <button
            onClick={() => setView("map")}
            className={`text-[11px] font-medium px-3 py-1.5 transition-colors cursor-pointer ${
              view === "map" ? "bg-[#18181b] text-white" : "bg-white text-[#71717a] hover:text-[#18181b]"
            }`}
          >
            Map
          </button>
        </div>
      </PageHeader>

      {view === "layout" ? (
        <SitePlan3D onSelect={setSelected} selectedUnit={selected?.unit || null} />
      ) : (
        <div className="w-full bg-white border border-[#e4e4e7] rounded overflow-hidden">
          <div className="bg-[#18181b] text-white px-4 sm:px-5 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-[13px] font-semibold tracking-tight">Hollister Business Park</h2>
              <p className="text-[10px] text-[#a1a1aa] mt-0.5">16261 Hollister St, Houston, TX 77066</p>
            </div>
            <a
              href="https://www.google.com/maps/place/16261+Hollister+St,+Houston,+TX+77066"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-[#71717a] hover:text-white transition-colors cursor-pointer"
            >
              Open in Google Maps →
            </a>
          </div>
          <iframe
            src="https://www.openstreetmap.org/export/embed.html?bbox=-95.5050%2C29.9490%2C-95.4910%2C29.9570&layer=mapnik&marker=29.9530%2C-95.4980"
            width="100%"
            height="500"
            style={{ border: 0 }}
            loading="lazy"
            title="Hollister Business Park — Houston, TX"
          />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4">
        {[
          { label: "Total Units", value: tenants.length, color: "text-[#18181b]" },
          { label: "Occupied", value: occupied.length, color: "text-[#16a34a]" },
          { label: "Past Due", value: pastDue.length, color: "text-[#dc2626]" },
          { label: "Vacant", value: vacant.length, color: "text-[#71717a]" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#e4e4e7] rounded p-3 text-center">
            <p className={`text-[20px] sm:text-[24px] font-semibold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-[#a1a1aa] font-medium uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Unit Index */}
      <div className="mt-4 bg-white border border-[#e4e4e7] rounded p-4">
        <p className="text-[12px] font-semibold text-[#18181b] mb-3">All Units</p>
        <div className="flex flex-wrap gap-1">
          {tenants.map(t => (
            <button
              key={t.unit}
              onClick={() => setSelected(t)}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                t.status === "current" ? "bg-white border-[#e4e4e7] text-[#18181b] hover:bg-[#fafafa]" :
                t.status === "past_due" ? "bg-white border-[#dc2626]/30 text-[#dc2626] hover:bg-red-50" :
                t.status === "expiring_soon" ? "bg-white border-[#2563eb]/30 text-[#2563eb] hover:bg-blue-50" :
                t.status === "vacant" ? "bg-[#fafafa] border-[#e4e4e7] text-[#a1a1aa]" :
                "bg-white border-[#d97706]/30 text-[#d97706] hover:bg-amber-50"
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

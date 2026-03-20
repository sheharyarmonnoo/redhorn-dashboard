"use client";
import { useState, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { ActivityEntry, loadActivity, getActivityIcon, getActivityColor } from "@/data/activity";

const typeLabels: Record<ActivityEntry["type"], string> = {
  task_added: "Task Added",
  task_completed: "Task Completed",
  task_assigned: "Task Assigned",
  status_change: "Status Change",
  note_added: "Note Added",
  deal_update: "Deal Update",
  alert_created: "Alert Created",
  alert_resolved: "Alert Resolved",
  email_sent: "Email Sent",
  sync: "Data Sync",
  login: "Login",
};

export default function ActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    setEntries(loadActivity());
    function handleUpdate() { setEntries(loadActivity()); }
    window.addEventListener("activity-updated", handleUpdate);
    return () => window.removeEventListener("activity-updated", handleUpdate);
  }, []);

  const types = Array.from(new Set(entries.map(e => e.type)));
  const filtered = filter === "all" ? entries : entries.filter(e => e.type === filter);

  // Group by date
  const grouped: Record<string, ActivityEntry[]> = {};
  for (const entry of filtered) {
    const date = new Date(entry.createdAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(entry);
  }

  return (
    <div>
      <PageHeader title="Activity Feed" subtitle="Recent actions & audit log" />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6">
        <div className="bg-white border border-[#e4e4e7] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">Total Events</p>
          <p className="text-[18px] font-semibold text-[#18181b] mt-0.5">{entries.length}</p>
        </div>
        <div className="bg-white border border-[#e4e4e7] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">Today</p>
          <p className="text-[18px] font-semibold text-[#18181b] mt-0.5">{entries.filter(e => new Date(e.createdAt).toDateString() === new Date().toDateString()).length}</p>
        </div>
        <div className="bg-white border border-[#e4e4e7] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">By Ori</p>
          <p className="text-[18px] font-semibold text-[#18181b] mt-0.5">{entries.filter(e => e.user === "Ori").length}</p>
        </div>
        <div className="bg-white border border-[#e4e4e7] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">By Max</p>
          <p className="text-[18px] font-semibold text-[#18181b] mt-0.5">{entries.filter(e => e.user === "Max").length}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <button onClick={() => setFilter("all")}
          className={`text-[11px] font-medium px-3 py-1.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
            filter === "all" ? "bg-[#18181b] text-white" : "text-[#71717a] hover:bg-[#f4f4f5]"
          }`}>
          All
        </button>
        {types.map(type => (
          <button key={type} onClick={() => setFilter(type)}
            className={`text-[11px] font-medium px-3 py-1.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
              filter === type ? "bg-[#18181b] text-white" : "text-[#71717a] hover:bg-[#f4f4f5]"
            }`}>
            {typeLabels[type]}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([date, dayEntries]) => (
          <div key={date}>
            <p className="text-[11px] font-semibold text-[#71717a] uppercase tracking-wide mb-3 sticky top-0 bg-[#fafafa] py-1 z-10">{date}</p>
            <div className="space-y-0">
              {dayEntries.map((entry, idx) => (
                <div key={entry.id} className="flex gap-3 group">
                  {/* Timeline line + dot */}
                  <div className="flex flex-col items-center">
                    <div className={`w-6 h-6 rounded-full ${getActivityColor(entry.type)} flex items-center justify-center flex-shrink-0`}>
                      <span className="text-[10px] text-white font-bold">{getActivityIcon(entry.type)}</span>
                    </div>
                    {idx < dayEntries.length - 1 && <div className="w-px flex-1 bg-[#e4e4e7] min-h-[16px]" />}
                  </div>

                  {/* Content */}
                  <div className="pb-4 flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-[#18181b] leading-relaxed">{entry.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-[#a1a1aa]">{entry.user}</span>
                          {entry.unit && (
                            <>
                              <span className="text-[10px] text-[#d4d4d8]">·</span>
                              <span className="text-[10px] text-[#71717a] font-medium">{entry.unit}</span>
                            </>
                          )}
                          <span className="text-[10px] text-[#d4d4d8]">·</span>
                          <span className="text-[10px] text-[#a1a1aa]">
                            {new Date(entry.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                      <span className={`text-[9px] font-medium px-2 py-0.5 rounded text-white whitespace-nowrap ${getActivityColor(entry.type)}`}>
                        {typeLabels[entry.type]}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-[12px] text-[#a1a1aa] text-center py-10">No activity to show</p>
      )}
    </div>
  );
}

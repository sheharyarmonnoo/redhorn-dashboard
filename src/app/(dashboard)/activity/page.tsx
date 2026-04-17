"use client";
import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useActivityLog } from "@/hooks/useConvexData";

const PAGE_SIZE = 25;

type ActivityType = "task_added" | "task_completed" | "task_assigned" | "status_change" | "note_added" | "deal_update" | "alert_created" | "alert_resolved" | "email_sent" | "sync" | "login";

interface ActivityEntry {
  _id?: string;
  id?: string;
  type: ActivityType;
  description: string;
  user: string;
  unit?: string;
  dealId?: string;
  createdAt: string;
}

const typeLabels: Record<ActivityType, string> = {
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

function getActivityIcon(type: ActivityType): string {
  const map: Record<ActivityType, string> = {
    task_added: "+",
    task_completed: "\u2713",
    task_assigned: "\u2192",
    status_change: "\u2191",
    note_added: "\u270E",
    deal_update: "$",
    alert_created: "!",
    alert_resolved: "\u2713",
    email_sent: "\u2709",
    sync: "\u21BB",
    login: "\u25CF",
  };
  return map[type];
}

function getActivityColor(type: ActivityType): string {
  const map: Record<ActivityType, string> = {
    task_added: "bg-[#2563eb]",
    task_completed: "bg-[#16a34a]",
    task_assigned: "bg-[#7c3aed]",
    status_change: "bg-[#d97706]",
    note_added: "bg-[#71717a]",
    deal_update: "bg-[#0891b2]",
    alert_created: "bg-[#dc2626]",
    alert_resolved: "bg-[#16a34a]",
    email_sent: "bg-[#2563eb]",
    sync: "bg-[#71717a]",
    login: "bg-[#a1a1aa]",
  };
  return map[type];
}

export default function ActivityPage() {
  const entries = useActivityLog() as ActivityEntry[];
  const [filter, setFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const types: ActivityType[] = Array.from(new Set(entries.map(e => e.type)));
  const filtered = useMemo(
    () => (filter === "all" ? entries : entries.filter(e => e.type === filter)),
    [entries, filter]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEntries = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  // Group by date (only the current page)
  const grouped: Record<string, ActivityEntry[]> = {};
  for (const entry of pageEntries) {
    const date = new Date(entry.createdAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(entry);
  }

  return (
    <div>
      <PageHeader title="Activity Feed" subtitle="Recent actions & audit log" />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6">
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">Total Events</p>
          <p className="text-[18px] font-semibold text-[#18181b] dark:text-[#fafafa] mt-0.5">{entries.length}</p>
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">Today</p>
          <p className="text-[18px] font-semibold text-[#18181b] dark:text-[#fafafa] mt-0.5">{entries.filter(e => new Date(e.createdAt).toDateString() === new Date().toDateString()).length}</p>
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">By Ori</p>
          <p className="text-[18px] font-semibold text-[#18181b] dark:text-[#fafafa] mt-0.5">{entries.filter(e => e.user === "Ori").length}</p>
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3">
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide">By Max</p>
          <p className="text-[18px] font-semibold text-[#18181b] dark:text-[#fafafa] mt-0.5">{entries.filter(e => e.user === "Max").length}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <button onClick={() => setFilter("all")}
          className={`text-[11px] font-medium px-3 py-1.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
            filter === "all" ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b]" : "text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a]"
          }`}>
          All
        </button>
        {types.map(type => (
          <button key={type} onClick={() => setFilter(type)}
            className={`text-[11px] font-medium px-3 py-1.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
              filter === type ? "bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b]" : "text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a]"
            }`}>
            {typeLabels[type]}
          </button>
        ))}
      </div>

      {/* Timeline (scrollable, capped at 80vh) */}
      <div className="space-y-6 overflow-y-auto pr-2" style={{ maxHeight: "80vh" }}>
        {Object.entries(grouped).map(([date, dayEntries]) => (
          <div key={date}>
            <p className="text-[11px] font-semibold text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide mb-3 sticky top-0 bg-[#fafafa] dark:bg-[#09090b] py-1 z-10">{date}</p>
            <div className="space-y-0">
              {dayEntries.map((entry, idx) => (
                <div key={entry._id ?? entry.id ?? idx} className="flex gap-3 group">
                  {/* Timeline line + dot */}
                  <div className="flex flex-col items-center">
                    <div className={`w-6 h-6 rounded-full ${getActivityColor(entry.type)} flex items-center justify-center flex-shrink-0`}>
                      <span className="text-[10px] text-white font-bold">{getActivityIcon(entry.type)}</span>
                    </div>
                    {idx < dayEntries.length - 1 && <div className="w-px flex-1 bg-[#e4e4e7] dark:bg-[#3f3f46] min-h-[16px]" />}
                  </div>

                  {/* Content */}
                  <div className="pb-4 flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] leading-relaxed">{entry.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">{entry.user}</span>
                          {entry.unit && (
                            <>
                              <span className="text-[10px] text-[#d4d4d8] dark:text-[#52525b]">·</span>
                              <span className="text-[10px] text-[#71717a] dark:text-[#a1a1aa] font-medium">{entry.unit}</span>
                            </>
                          )}
                          <span className="text-[10px] text-[#d4d4d8] dark:text-[#52525b]">·</span>
                          <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">
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
        <p className="text-[12px] text-[#a1a1aa] dark:text-[#71717a] text-center py-10">No activity to show</p>
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#e4e4e7] dark:border-[#3f3f46]">
          <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa]">
            Showing {pageStart + 1}&ndash;{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center justify-center w-7 h-7 rounded border border-[#e4e4e7] dark:border-[#3f3f46] text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] min-w-[60px] text-center">
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center justify-center w-7 h-7 rounded border border-[#e4e4e7] dark:border-[#3f3f46] text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

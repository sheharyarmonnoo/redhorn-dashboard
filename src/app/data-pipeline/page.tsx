"use client";
import { Database, RefreshCw, CheckCircle2, AlertTriangle, Clock, ArrowRight } from "lucide-react";

interface FeedStatus {
  name: string;
  source: string;
  lastRefresh: string;
  nextRefresh: string;
  status: "healthy" | "warning" | "error";
  recordCount: number;
  description: string;
}

const feeds: FeedStatus[] = [
  {
    name: "Rent Roll",
    source: "Yardi Voyager → CSV Export",
    lastRefresh: "2026-03-12 08:15 AM CST",
    nextRefresh: "2026-03-19 08:00 AM CST",
    status: "healthy",
    recordCount: 51,
    description: "All units, tenants, lease terms, and monthly charges. Weekly auto-export.",
  },
  {
    name: "Lease Ledger",
    source: "Yardi Voyager → CSV Export",
    lastRefresh: "2026-03-12 08:15 AM CST",
    nextRefresh: "2026-03-19 08:00 AM CST",
    status: "healthy",
    recordCount: 48,
    description: "Transaction-level charge and payment history per tenant. Weekly auto-export.",
  },
  {
    name: "Income Statement",
    source: "Yardi Voyager → Custom Financial Template",
    lastRefresh: "2026-03-12 08:16 AM CST",
    nextRefresh: "2026-03-19 08:00 AM CST",
    status: "healthy",
    recordCount: 1,
    description: "Monthly P&L by category (accrual basis). Includes CAM, electric, late fees.",
  },
  {
    name: "Electric Billing",
    source: "Yardi Voyager → CAM Charges",
    lastRefresh: "2026-03-12 08:16 AM CST",
    nextRefresh: "2026-03-19 08:00 AM CST",
    status: "warning",
    recordCount: 10,
    description: "Net lease tenant electric charges. 2 tenants missing March postings.",
  },
  {
    name: "Late Fee Assessment",
    source: "Yardi Voyager → Charge Log",
    lastRefresh: "2026-03-05 09:00 AM CST",
    nextRefresh: "2026-03-19 08:00 AM CST",
    status: "healthy",
    recordCount: 3,
    description: "Late fee charges applied to past-due tenants. Monthly extraction.",
  },
];

const pipeline = [
  { step: "Yardi Voyager", desc: "Source of truth — PM enters all charges, payments, leases", icon: Database },
  { step: "CSV/XLSX Export", desc: "Weekly automated report export (Rent Roll, Ledger, P&L)", icon: RefreshCw },
  { step: "Data Pipeline", desc: "Parse, normalize, map to dashboard schema", icon: Database },
  { step: "Dashboard", desc: "Real-time visibility for ownership team", icon: CheckCircle2 },
];

export default function DataPipelinePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Data Pipeline</h1>
        <p className="text-gray-500 text-sm mt-1">Yardi Voyager data feed status & refresh schedule</p>
      </div>

      {/* Pipeline Flow */}
      <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 mb-8">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Data Flow</h3>
        <div className="flex items-center justify-between">
          {pipeline.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto mb-2">
                  <step.icon size={20} className="text-blue-400" />
                </div>
                <p className="text-xs font-medium text-white">{step.step}</p>
                <p className="text-xs text-gray-500 max-w-[150px] mt-1">{step.desc}</p>
              </div>
              {i < pipeline.length - 1 && (
                <ArrowRight size={20} className="text-gray-600 mx-2 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Feed Status Cards */}
      <div className="space-y-4 mb-8">
        <h3 className="text-sm font-semibold text-gray-300">Feed Status</h3>
        {feeds.map((feed, i) => (
          <div key={i} className="bg-[#141414] border border-[#262626] rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${
                  feed.status === "healthy" ? "bg-emerald-400" :
                  feed.status === "warning" ? "bg-yellow-400" :
                  "bg-red-400"
                }`} />
                <div>
                  <h4 className="text-sm font-semibold text-white">{feed.name}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">{feed.source}</p>
                  <p className="text-xs text-gray-400 mt-2">{feed.description}</p>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  feed.status === "healthy" ? "bg-emerald-500/20 text-emerald-400" :
                  feed.status === "warning" ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-red-500/20 text-red-400"
                }`}>
                  {feed.status === "healthy" ? "Healthy" : feed.status === "warning" ? "Warning" : "Error"}
                </span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 text-xs border-t border-[#262626] pt-3">
              <div>
                <p className="text-gray-500">Last Refresh</p>
                <p className="text-gray-300 flex items-center gap-1 mt-0.5">
                  <Clock size={12} /> {feed.lastRefresh}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Next Scheduled</p>
                <p className="text-gray-300 flex items-center gap-1 mt-0.5">
                  <RefreshCw size={12} /> {feed.nextRefresh}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Records</p>
                <p className="text-gray-300 mt-0.5">{feed.recordCount.toLocaleString()} rows</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Refresh Schedule */}
      <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Refresh Schedule</h3>
        <div className="text-sm text-gray-400 space-y-2">
          <p><span className="text-white font-medium">Weekly:</span> Every Wednesday at 8:00 AM CST — Rent Roll, Lease Ledger, Income Statement auto-export from Yardi</p>
          <p><span className="text-white font-medium">Monthly:</span> 1st business day — Full P&L reconciliation and late fee assessment extraction</p>
          <p><span className="text-white font-medium">On-Demand:</span> Manual refresh available via Yardi report scheduler for ad-hoc pulls</p>
        </div>
        <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-xs text-blue-300">
            <span className="font-medium">Integration Note:</span> Currently using file-based CSV/XLSX exports from Yardi Voyager.
            Future phase: Yardi API direct integration for real-time data sync (requires Yardi API license add-on).
          </p>
        </div>
      </div>
    </div>
  );
}

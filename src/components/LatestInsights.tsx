"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../convex/_generated/api";
import { useAlerts } from "@/hooks/useConvexData";

// Shared "Latest AI Insights" widget used by both the commercial dashboard
// and the RV park dashboard. Same shape: a SummaryCard at the top (when an
// aiAnalysis blurb exists on the freshest insight) + an expandable list of
// active findings. Severity dots + INFO/WARNING/CRITICAL tag right-aligned.
export default function LatestInsights({
  propertyId,
  sourceLabel = "From most recent sync · click to expand",
}: {
  propertyId: string;
  sourceLabel?: string;
}) {
  const { alerts, loading } = useAlerts();
  const { user } = useUser();
  const updateStatus = useMutation(api.alerts.updateStatus);

  const summaryKey = `redhorn_summary_expanded_${propertyId}`;
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem(summaryKey);
      setSummaryExpanded(v === "1");
    } catch {}
  }, [summaryKey]);
  const toggleSummary = () => {
    setSummaryExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(summaryKey, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  const { active, latestSummary, latestSummaryAt, hasAnyHistory } = useMemo(() => {
    const all = (alerts as any[])
      .filter((a) => a.alertType === "income_insight" && a.propertyId === propertyId)
      .sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0));
    const active = all
      .filter(
        (a) => a.status !== "false_flag" && a.status !== "resolved" && a.status !== "dismissed",
      )
      .slice(0, 6);
    const top = active[0] ?? all[0];
    // The RV insights pipeline emits a legacy one-liner ("Generated from
    // monthly bundle YYYY-MM.") on alerts that predate the {summary,
    // insights} envelope upgrade. Treat that as no-summary-available so
    // the card doesn't render with placeholder text.
    const rawSummary = top?.aiAnalysis as string | undefined;
    const summary = rawSummary && /^Generated from monthly bundle \d{4}-\d{2}\.?$/i.test(
      rawSummary.trim(),
    )
      ? undefined
      : rawSummary;
    return {
      active,
      latestSummary: summary,
      latestSummaryAt: top?._creationTime as number | undefined,
      hasAnyHistory: all.length > 0,
    };
  }, [alerts, propertyId]);

  if (loading) {
    return (
      <div className="mb-6 mt-6">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Latest AI Insights</p>
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">Loading…</p>
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 mb-3 animate-pulse">
          <div className="h-3 w-20 bg-[#f4f4f5] dark:bg-[#27272a] rounded mb-3" />
          <div className="space-y-1.5">
            <div className="h-3 w-full bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
            <div className="h-3 w-11/12 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
            <div className="h-3 w-10/12 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
          </div>
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded divide-y divide-[#e4e4e7] dark:divide-[#3f3f46]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e4e4e7] dark:bg-[#3f3f46]" />
              <span className="flex-1 h-3 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
              <span className="h-3 w-12 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!hasAnyHistory) return null;

  const sevDot: Record<string, string> = {
    critical: "bg-[#dc2626]",
    warning: "bg-[#d97706]",
    info: "bg-[#2563eb]",
  };

  return (
    <div className="mb-6 mt-6">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">Latest AI Insights</p>
        <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">{sourceLabel}</p>
      </div>
      {latestSummary && (
        <SummaryCard
          summary={latestSummary}
          updatedAt={latestSummaryAt}
          expanded={summaryExpanded}
          onToggle={toggleSummary}
        />
      )}
      {active.length > 0 ? (
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded divide-y divide-[#e4e4e7] dark:divide-[#3f3f46] max-h-[360px] overflow-y-auto">
          {active.map((ins, i) => (
            <InsightRow
              key={ins._id}
              insight={ins}
              dotClass={sevDot[ins.severity] || sevDot.info}
              onComplete={async () => {
                await updateStatus({
                  id: ins._id,
                  status: "resolved",
                  resolvedBy: user?.fullName || user?.firstName || "User",
                });
              }}
              index={i}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-4 text-center">
          <p className="text-[12px] text-[#16a34a] font-medium">All clear · no active findings this run</p>
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-1">
            Past insights are kept for continuity. Next sync will flag anything new.
          </p>
        </div>
      )}
    </div>
  );
}

function InsightRow({
  insight,
  dotClass,
  onComplete,
  leaving,
  index = 0,
}: {
  insight: any;
  dotClass: string;
  onComplete: () => void | Promise<void>;
  leaving?: boolean;
  index?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [localLeaving, setLocalLeaving] = useState(false);
  const isLeaving = leaving || localLeaving;
  const handleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (completing) return;
    setCompleting(true);
    setLocalLeaving(true);
    await new Promise((r) => setTimeout(r, 280));
    try {
      await onComplete();
    } finally {
      setCompleting(false);
    }
  };
  return (
    <div
      className={`${isLeaving ? "rh-row-leave" : "rh-row-in"}`}
      style={!isLeaving ? { animationDelay: `${index * 40}ms` } : undefined}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#fafafa] dark:hover:bg-[#27272a] cursor-pointer text-left transition-colors"
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
        <span className="flex-1 text-[12px] font-medium text-[#18181b] dark:text-[#fafafa] truncate">
          {insight.title}
        </span>
        {insight.dataContext?.mom && (
          <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] hidden sm:inline">
            {insight.dataContext.mom}
          </span>
        )}
        <span className="text-[9px] uppercase tracking-wide font-medium text-[#a1a1aa] dark:text-[#71717a] flex-shrink-0">
          {insight.severity}
        </span>
        <span
          className={`text-[10px] text-[#a1a1aa] dark:text-[#71717a] transition-transform flex-shrink-0 ${
            expanded ? "rotate-90" : ""
          }`}
        >
          ›
        </span>
      </button>
      <div className={`rh-collapse ${expanded ? "is-open" : ""}`}>
        <div className="rh-collapse-inner">
          <div className="px-3 pb-3 pl-[1.625rem]">
            <div className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] leading-relaxed space-y-1.5">
              {renderMarkdown(insight.body || "")}
            </div>
            {insight.dataContext?.lineItem && (
              <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-1.5">
                <span className="uppercase tracking-wide font-medium">Line item:</span>{" "}
                {insight.dataContext.lineItem}
              </p>
            )}
            {insight.dataContext?.mom && (
              <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] sm:hidden mt-0.5">
                <span className="uppercase tracking-wide font-medium">MoM:</span>{" "}
                {insight.dataContext.mom}
              </p>
            )}
            <div className="mt-2 flex items-center justify-end gap-3">
              <button
                onClick={handleComplete}
                disabled={completing}
                className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] hover:text-[#16a34a] cursor-pointer disabled:opacity-50"
                title="Resolved — this finding has been addressed"
              >
                {completing ? "Marking…" : "Mark as Completed"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  summary,
  updatedAt,
  expanded,
  onToggle,
}: {
  summary: string;
  updatedAt?: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isLong = summary.length > 280;
  const ts = updatedAt ? formatRelativeTime(updatedAt) : "";

  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 mb-3 rh-card-mount">
      <p className="text-[11px] font-semibold text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide mb-2">
        Summary
      </p>
      <div
        className={`rh-summary-collapse text-[12px] text-[#18181b] dark:text-[#fafafa] leading-relaxed space-y-2 ${
          !expanded && isLong ? "is-clamped" : ""
        }`}
      >
        {renderMarkdown(summary)}
      </div>
      <div className="flex items-center gap-3 mt-2">
        {isLong && (
          <button
            onClick={onToggle}
            className="text-[11px] text-[#2563eb] dark:text-[#60a5fa] hover:underline cursor-pointer"
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
        {ts && <span className="text-[9px] text-[#d4d4d8] dark:text-[#52525b]">· updated {ts}</span>}
      </div>
    </div>
  );
}

function renderMarkdown(text: string): React.ReactNode {
  const sections = text
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sections.map((section, i) => {
    const lines = section.split("\n").map((l) => l.trimEnd());
    const blocks: React.ReactNode[] = [];
    let bulletBuffer: string[] = [];
    const flushBullets = () => {
      if (bulletBuffer.length > 0) {
        blocks.push(
          <ul
            key={`ul-${blocks.length}`}
            className="space-y-1 ml-4 list-disc marker:text-[#a1a1aa] dark:marker:text-[#52525b]"
          >
            {bulletBuffer.map((b, bi) => (
              <li key={bi}>{renderInline(b)}</li>
            ))}
          </ul>,
        );
        bulletBuffer = [];
      }
    };
    for (const line of lines) {
      const m = line.match(/^[-*]\s+(.*)$/);
      if (m) {
        bulletBuffer.push(m[1]);
      } else {
        flushBullets();
        if (line.trim().length > 0) {
          blocks.push(<p key={`p-${blocks.length}`}>{renderInline(line)}</p>);
        }
      }
    }
    flushBullets();
    return (
      <div key={i} className="space-y-1.5">
        {blocks}
      </div>
    );
  });
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <strong key={key++} className="font-semibold text-[#18181b] dark:text-[#fafafa]">
        {m[1]}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

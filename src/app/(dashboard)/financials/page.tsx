"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useActiveProperty, useIncomeLines, useMonthlyRevenue, formatCurrency } from "@/hooks/useConvexData";

const SECTION_ORDER = ["income", "expense", "net"];

function classifyLine(lineItem: string): "income" | "expense" | "net" | "other" {
  const li = lineItem.toLowerCase();
  if (/total\s+income|^income$/i.test(li)) return "net";
  if (/total\s+(expense|operating)|net\s+operating|^noi\b/i.test(li)) return "net";
  if (/expense|insurance|management|maintenance|repair|tax|deprec|interest|admin|overhead|utility expense/i.test(li)) return "expense";
  if (/rent|income|revenue|cam|electric|late\s*fee|storage|park/i.test(li)) return "income";
  return "other";
}

function pct(val: number, total: number) {
  if (!total) return "";
  return `${Math.round((val / total) * 100)}%`;
}

export default function FinancialsPage() {
  const property = useActiveProperty();
  const rawLines = useIncomeLines(property?._id);
  const monthlyRevenue = useMonthlyRevenue(property?._id);

  const [view, setView] = useState<"statement" | "trend">("statement");

  // Derive the month from the latest income lines snapshot (period field)
  const period = useMemo(() => {
    if (!rawLines.length) return null;
    const periods = rawLines.map((l: any) => l.period).filter(Boolean);
    if (!periods.length) return null;
    return periods.sort().reverse()[0];
  }, [rawLines]);

  // Sort lines by hierarchy so subtotals follow their children
  const lines = useMemo(() => {
    return [...rawLines].sort((a: any, b: any) => {
      if (a.hierarchyLevel !== b.hierarchyLevel) return a.hierarchyLevel - b.hierarchyLevel;
      return (a.lineItem || "").localeCompare(b.lineItem || "");
    });
  }, [rawLines]);

  // Pull total income + total expense for % column
  const totalIncome = useMemo(() => {
    const row = rawLines.find((l: any) => /^\s*total\s+income\s*$/i.test((l.lineItem || "").trim()));
    return row?.currentPeriod || 0;
  }, [rawLines]);

  // Trend data — last 12 months, sorted ascending
  const trend = useMemo(() => {
    const today = new Date();
    const cutoff = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    return [...monthlyRevenue]
      .filter((m: any) => m.month && m.month < cutoff)
      .sort((a: any, b: any) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [monthlyRevenue]);

  if (!property) return null;

  const formatMonth = (m: string) => {
    const [y, mo] = m.split("-");
    const date = new Date(Number(y), Number(mo) - 1);
    return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };

  const formatPeriod = (p: string) => {
    const [y, mo] = p.split("-");
    const date = new Date(Number(y), Number(mo) - 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  return (
    <div>
      <PageHeader
        title="Financials"
        subtitle={period ? `Income Statement · ${formatPeriod(period)}` : "Income Statement"}
      />

      {/* Tab switcher */}
      <div className="flex gap-1 mb-4 bg-[#f4f4f5] dark:bg-[#27272a] rounded-md p-0.5 w-fit">
        {(["statement", "trend"] as const).map(t => (
          <button
            key={t}
            onClick={() => setView(t)}
            className={`text-[12px] font-medium px-3 py-1.5 rounded cursor-pointer transition-colors capitalize ${
              view === t
                ? "bg-white dark:bg-[#18181b] text-[#18181b] dark:text-[#fafafa] shadow-sm"
                : "text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
            }`}
          >
            {t === "statement" ? "Income Statement" : "Monthly Trend"}
          </button>
        ))}
      </div>

      {view === "statement" ? (
        <IncomeStatement lines={lines} totalIncome={totalIncome} />
      ) : (
        <TrendTable trend={trend} formatMonth={formatMonth} />
      )}
    </div>
  );
}

function IncomeStatement({ lines, totalIncome }: { lines: any[]; totalIncome: number }) {
  if (!lines.length) {
    return (
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-8 text-center">
        <p className="text-[13px] text-[#71717a] dark:text-[#a1a1aa]">No income statement data yet. Run a Yardi sync to populate.</p>
      </div>
    );
  }

  // Separate income vs expense vs net sections based on parentLine grouping
  const sections: { header: string; rows: any[]; isNet?: boolean }[] = [];
  let currentSection: { header: string; rows: any[]; isNet?: boolean } | null = null;

  for (const line of lines) {
    const isTotal = /^\s*total\b/i.test(line.lineItem) || /^\s*net\b/i.test(line.lineItem);
    const isHeader = line.hierarchyLevel === 0 && !isTotal;

    if (isHeader) {
      if (currentSection) sections.push(currentSection);
      currentSection = { header: line.lineItem.trim(), rows: [] };
    } else if (currentSection) {
      currentSection.rows.push(line);
    } else {
      // Orphan rows before any section header
      currentSection = { header: "", rows: [line] };
    }
  }
  if (currentSection) sections.push(currentSection);

  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_140px_140px_80px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
        <span>Line Item</span>
        <span className="text-right">Current Period</span>
        <span className="text-right">Year to Date</span>
        <span className="text-right">% Income</span>
      </div>

      {sections.map((section, si) => {
        const isNetSection = /total|net\s+operating|noi/i.test(section.header);
        return (
          <div key={si} className={si > 0 ? "border-t border-[#e4e4e7] dark:border-[#3f3f46]" : ""}>
            {section.header && (
              <div className={`px-4 py-2 text-[11px] font-semibold uppercase tracking-wide ${
                isNetSection
                  ? "bg-[#f4f4f5] dark:bg-[#27272a] text-[#18181b] dark:text-[#fafafa]"
                  : "text-[#71717a] dark:text-[#a1a1aa] bg-[#fafafa]/60 dark:bg-[#27272a]/40"
              }`}>
                {section.header}
              </div>
            )}
            {section.rows.map((line: any, ri: number) => {
              const isSubtotal = /^\s*total\b/i.test(line.lineItem) || /^\s*net\b/i.test(line.lineItem);
              const indent = Math.max(0, (line.hierarchyLevel - 1)) * 16;
              const cp = line.currentPeriod || 0;
              const ytd = line.yearToDate || 0;
              const isNeg = cp < 0;

              return (
                <div
                  key={ri}
                  className={`grid grid-cols-[1fr_140px_140px_80px] px-4 py-1.5 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] ${
                    isSubtotal
                      ? "bg-[#fafafa] dark:bg-[#27272a]/60 font-semibold text-[#18181b] dark:text-[#fafafa]"
                      : "text-[#18181b] dark:text-[#fafafa]"
                  }`}
                >
                  <span style={{ paddingLeft: indent }} className="truncate">
                    {line.lineItem.trim()}
                  </span>
                  <span className={`text-right font-${isSubtotal ? "semibold" : "normal"} ${isNeg ? "text-[#dc2626]" : ""}`}>
                    {cp !== 0 ? formatCurrency(Math.abs(cp)) : "—"}
                    {isNeg && cp !== 0 ? <span className="text-[#dc2626]"> ▼</span> : null}
                  </span>
                  <span className={`text-right ${ytd < 0 ? "text-[#dc2626]" : "text-[#71717a] dark:text-[#a1a1aa]"}`}>
                    {ytd !== 0 ? formatCurrency(Math.abs(ytd)) : "—"}
                  </span>
                  <span className="text-right text-[#a1a1aa] dark:text-[#71717a]">
                    {cp !== 0 && totalIncome > 0 ? pct(Math.abs(cp), totalIncome) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function TrendTable({ trend, formatMonth }: { trend: any[]; formatMonth: (m: string) => string }) {
  if (!trend.length) {
    return (
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-8 text-center">
        <p className="text-[13px] text-[#71717a] dark:text-[#a1a1aa]">No monthly trend data yet.</p>
      </div>
    );
  }

  const maxTotal = Math.max(...trend.map((r: any) => r.total || 0), 1);

  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
      <div className="grid grid-cols-[100px_1fr_100px_100px_100px_100px_70px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
        <span>Month</span>
        <span>Bar</span>
        <span className="text-right">Total</span>
        <span className="text-right">Rent</span>
        <span className="text-right">Electric</span>
        <span className="text-right">Late Fees</span>
        <span className="text-right">Occ%</span>
      </div>
      {[...trend].reverse().map((row: any) => {
        const barPct = maxTotal > 0 ? (row.total / maxTotal) * 100 : 0;
        return (
          <div
            key={row.month}
            className="grid grid-cols-[100px_1fr_100px_100px_100px_100px_70px] px-4 py-2.5 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] text-[#18181b] dark:text-[#fafafa]"
          >
            <span className="font-medium">{formatMonth(row.month)}</span>
            <div className="flex items-center pr-4">
              <div
                className="h-2 rounded-full bg-[#16a34a]/60"
                style={{ width: `${barPct}%` }}
              />
            </div>
            <span className="text-right font-semibold">{formatCurrency(row.total)}</span>
            <span className="text-right text-[#71717a] dark:text-[#a1a1aa]">{formatCurrency(row.rent)}</span>
            <span className="text-right text-[#71717a] dark:text-[#a1a1aa]">{formatCurrency(row.electric)}</span>
            <span className="text-right text-[#71717a] dark:text-[#a1a1aa]">{row.lateFees > 0 ? formatCurrency(row.lateFees) : "—"}</span>
            <span className="text-right text-[#71717a] dark:text-[#a1a1aa]">{row.occupancy}%</span>
          </div>
        );
      })}
    </div>
  );
}

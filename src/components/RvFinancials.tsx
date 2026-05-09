"use client";
import { useMemo } from "react";
import PageHeader from "@/components/PageHeader";
import { useRvFinancials, formatCurrency } from "@/hooks/useConvexData";

// RV park income statement — mirrors the commercial Hollister/Belgold
// /financials layout: KPI strip + single IS table. Sourced from the monthly
// Northgate xlsx (rv_financials.kind === "isBudget"). Cash Flow / Balance
// Sheet / GL parsed data still lives in Convex but isn't surfaced here per
// the user's directive to keep this page focused on P&L performance.

type Row = any;

type LineKind = "header" | "subgroup" | "leaf" | "subtotal" | "skip";

// Line classification based on the lineItem text. The Northgate xlsx doesn't
// carry an explicit hierarchy level, so we derive one from naming convention:
//   "Income" / "Expense" / generic capitalized words → section header
//   "NNNN-000 - Total X" without amounts → subgroup header
//   "Total - X" → subtotal (bold)
//   numeric-prefixed line with amounts → leaf
function classifyLine(r: Row): LineKind {
  const li = String(r.lineItem || "").trim();
  if (!li) return "skip";
  if (/^Total\s*-/i.test(li)) return "subtotal";
  // Lines like "Income" / "Expense" / "Ordinary Income/Expense" / "Net Income"
  if (!/^\d/.test(li) && !r.subsidiary) return "header";
  // "4020-000 - Total RV Income" — header for a sub-section, has no amounts
  if (/^\d{4}-000/.test(li)) return "subgroup";
  return "leaf";
}

function isIncomeContext(li: string): boolean {
  return /^4\d{3}-/.test(li);
}
function isExpenseContext(li: string): boolean {
  return /^[5-9]\d{3}-/.test(li);
}

export default function RvFinancials({
  propertyName,
  propertyId,
}: {
  propertyName: string;
  propertyId: string | undefined;
}) {
  const { financials, loading } = useRvFinancials(propertyId);

  // Filter to IS-vs-Budget rows only — BS / CF / GL parsed data isn't
  // surfaced on this page (user feedback: keep this page focused).
  const lines = useMemo(() => financials.filter((r: Row) => r.kind === "isBudget"), [financials]);

  const period = lines[0]?.snapshotPeriod || null;

  // KPIs — sum the leaf revenue / expense lines, skipping "Total -"
  // subtotals so we don't double-count.
  const kpis = useMemo(() => {
    let income = 0;
    let expense = 0;
    let incomeYtd = 0;
    let expenseYtd = 0;
    for (const r of lines) {
      if (classifyLine(r) !== "leaf") continue;
      const li = String(r.lineItem || "");
      if (isIncomeContext(li)) {
        income += r.amountMtd || 0;
        incomeYtd += r.amountYtd || 0;
      } else if (isExpenseContext(li)) {
        expense += r.amountMtd || 0;
        expenseYtd += r.amountYtd || 0;
      }
    }
    const noi = income - expense;
    const noiYtd = incomeYtd - expenseYtd;
    return { income, expense, noi, incomeYtd, expenseYtd, noiYtd };
  }, [lines]);

  if (!propertyId) return null;

  if (loading) {
    return (
      <div>
        <PageHeader title="Financials" subtitle={`${propertyName} — loading…`} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 animate-pulse"
            >
              <div className="h-6 w-24 bg-[#f4f4f5] dark:bg-[#27272a] rounded mb-1.5" />
              <div className="h-2 w-16 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-6">
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="h-4 bg-[#f4f4f5] dark:bg-[#27272a] rounded" style={{ opacity: 0.6 + (i % 5) * 0.08 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const periodLabel = period
    ? new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

  if (lines.length === 0) {
    return (
      <div>
        <PageHeader title="Financials" subtitle={propertyName} />
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-10 text-center">
          <p className="text-[14px] font-semibold text-[#18181b] dark:text-[#fafafa]">No financial data yet</p>
          <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] mt-1.5">
            Drop the monthly bundle (with the Northgate Financial Package xlsx) in <span className="font-medium">Monthly Uploads</span>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Financials" subtitle={`Income Statement · ${periodLabel}`} />

      {/* KPI strip — same shape as commercial /financials */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        <KPIBox label="Total Income" value={formatCurrency(kpis.income)} />
        <KPIBox label="Total Expense" value={formatCurrency(kpis.expense)} color="text-[#dc2626]" />
        <KPIBox
          label="NOI"
          value={formatCurrency(kpis.noi)}
          color={kpis.noi >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}
        />
        <KPIBox
          label="YTD NOI"
          value={formatCurrency(kpis.noiYtd)}
          color={kpis.noiYtd >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}
        />
      </div>

      <IncomeStatementTable lines={lines} />
    </div>
  );
}

function KPIBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3">
      <p className={`text-[18px] sm:text-[20px] font-semibold tracking-tight ${color || "text-[#18181b] dark:text-[#fafafa]"}`}>
        {value}
      </p>
      <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] font-medium uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

function IncomeStatementTable({ lines }: { lines: Row[] }) {
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_120px_120px_100px_120px_120px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
        <span>Line</span>
        <span className="text-right">MTD</span>
        <span className="text-right">Budget MTD</span>
        <span className="text-right">Var %</span>
        <span className="text-right">YTD</span>
        <span className="text-right">Budget YTD</span>
      </div>
      {lines.map((r: Row, i: number) => (
        <ISRow key={`${r._id}-${i}`} row={r} />
      ))}
    </div>
  );
}

function ISRow({ row }: { row: Row }) {
  const kind = classifyLine(row);
  if (kind === "skip") return null;

  const li = String(row.lineItem || "").trim();
  const cleanLabel = kind === "subtotal" ? li.replace(/^Total\s*-\s*/i, "Total ") : li;
  const indent = kind === "leaf" ? 24 : kind === "subgroup" ? 12 : 0;

  const rowClass = [
    "grid grid-cols-[1fr_120px_120px_100px_120px_120px] px-4 py-1.5 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] items-center",
    kind === "header"
      ? "bg-[#f4f4f5] dark:bg-[#27272a] uppercase tracking-wide font-semibold text-[#18181b] dark:text-[#fafafa]"
      : kind === "subtotal"
      ? "bg-[#fafafa] dark:bg-[#27272a]/60 font-semibold text-[#18181b] dark:text-[#fafafa]"
      : kind === "subgroup"
      ? "font-medium text-[#18181b] dark:text-[#fafafa]"
      : "text-[#18181b] dark:text-[#fafafa]",
  ].join(" ");

  const mtd = row.amountMtd || 0;
  const budgetMtd = row.budgetMtd || 0;
  const ytd = row.amountYtd || 0;
  const budgetYtd = row.budgetYtd || 0;
  const varPct = row.pctVarianceMtd;
  const showVar = varPct != null && Number.isFinite(varPct) && Math.abs(varPct) > 0.0001;
  const isNegMtd = mtd < 0;

  return (
    <div className={rowClass}>
      <span style={{ paddingLeft: indent }} className="truncate" title={cleanLabel}>
        {cleanLabel}
      </span>
      <span className={`text-right tabular-nums ${isNegMtd ? "text-[#dc2626]" : ""}`}>
        {kind === "header" || mtd === 0 ? "—" : formatCurrency(Math.abs(mtd))}
      </span>
      <span className="text-right tabular-nums text-[#71717a] dark:text-[#a1a1aa]">
        {kind === "header" || budgetMtd === 0 ? "—" : formatCurrency(budgetMtd)}
      </span>
      <span
        className={`text-right tabular-nums text-[11px] ${
          showVar ? (varPct >= 0 ? "text-[#16a34a]" : "text-[#dc2626]") : "text-[#71717a] dark:text-[#a1a1aa]"
        }`}
      >
        {showVar ? `${varPct >= 0 ? "+" : ""}${(varPct * 100).toFixed(1)}%` : "—"}
      </span>
      <span className="text-right tabular-nums">
        {kind === "header" || ytd === 0 ? "—" : formatCurrency(Math.abs(ytd))}
      </span>
      <span className="text-right tabular-nums text-[#71717a] dark:text-[#a1a1aa]">
        {kind === "header" || budgetYtd === 0 ? "—" : formatCurrency(budgetYtd)}
      </span>
    </div>
  );
}

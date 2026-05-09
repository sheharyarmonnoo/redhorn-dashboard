"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useRvFinancials, formatCurrency } from "@/hooks/useConvexData";

// RV park income statement — visually mirrors the commercial Hollister/
// Belgold /financials layout: KPI strip + Summary panel + IS table with
// LINE ITEM / period / Budget / VARIANCE $ / VAR % / % INCOME columns.
// Sourced from the monthly Northgate xlsx (rv_financials.kind === "isBudget").
// Cash Flow / Balance Sheet / GL parsed data still lives in Convex but isn't
// surfaced here per the user's directive to focus this page on P&L.

type Row = any;

type LineKind = "header" | "subgroup" | "leaf" | "subtotal" | "skip";

// Line classification derived from naming convention since the Northgate
// xlsx doesn't carry an explicit hierarchyLevel:
//   "Income" / "Expense" / generic capitalized words → section header
//   "NNNN-000 - Total X" without amounts → subgroup header
//   "Total - X" → subtotal (bold)
//   numeric-prefixed line with amounts → leaf
function classifyLine(r: Row): LineKind {
  const li = String(r.lineItem || "").trim();
  if (!li) return "skip";
  if (/^Total\s*-/i.test(li)) return "subtotal";
  if (!/^\d/.test(li) && !r.subsidiary) return "header";
  if (/^\d{4}-000/.test(li)) return "subgroup";
  return "leaf";
}

function isIncomeContext(li: string): boolean {
  return /^4\d{3}-/.test(li);
}
function isExpenseContext(li: string): boolean {
  return /^[5-9]\d{3}-/.test(li);
}

function formatPeriodLabel(period: string | null) {
  if (!period) return "—";
  return new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).toUpperCase();
}

function formatPctSigned(p: number | null | undefined) {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${p >= 0 ? "+" : ""}${(p * 100).toFixed(1)}%`;
}

function formatVarianceDollars(v: number) {
  if (Math.abs(v) < 0.5) return "—";
  return `${v >= 0 ? "+" : "−"}${formatCurrency(Math.abs(v))}`;
}

export default function RvFinancials({
  propertyName,
  propertyId,
}: {
  propertyName: string;
  propertyId: string | undefined;
}) {
  const { financials, loading } = useRvFinancials(propertyId);

  void propertyName;
  const lines = useMemo(() => financials.filter((r: Row) => r.kind === "isBudget"), [financials]);
  const period = lines[0]?.snapshotPeriod || null;
  const periodLabel = formatPeriodLabel(period);

  // KPIs / summary totals — sum the LEAF revenue / expense lines, skipping
  // "Total -" subtotals so we don't double-count.
  const totals = useMemo(() => {
    let income = 0;
    let incomeBudget = 0;
    let incomeYtd = 0;
    let incomeYtdBudget = 0;
    let expense = 0;
    let expenseBudget = 0;
    let expenseYtd = 0;
    let expenseYtdBudget = 0;
    for (const r of lines) {
      if (classifyLine(r) !== "leaf") continue;
      const li = String(r.lineItem || "");
      if (isIncomeContext(li)) {
        income += r.amountMtd || 0;
        incomeBudget += r.budgetMtd || 0;
        incomeYtd += r.amountYtd || 0;
        incomeYtdBudget += r.budgetYtd || 0;
      } else if (isExpenseContext(li)) {
        expense += r.amountMtd || 0;
        expenseBudget += r.budgetMtd || 0;
        expenseYtd += r.amountYtd || 0;
        expenseYtdBudget += r.budgetYtd || 0;
      }
    }
    const noi = income - expense;
    const noiBudget = incomeBudget - expenseBudget;
    const noiYtd = incomeYtd - expenseYtd;
    const noiYtdBudget = incomeYtdBudget - expenseYtdBudget;
    return {
      income,
      incomeBudget,
      incomeYtd,
      incomeYtdBudget,
      expense,
      expenseBudget,
      expenseYtd,
      expenseYtdBudget,
      noi,
      noiBudget,
      noiYtd,
      noiYtdBudget,
    };
  }, [lines]);

  if (!propertyId) return null;

  if (loading) {
    return (
      <div>
        <PageHeader title="Financials" subtitle="Loading…" />
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
              <div
                key={i}
                className="h-4 bg-[#f4f4f5] dark:bg-[#27272a] rounded"
                style={{ opacity: 0.6 + (i % 5) * 0.08 }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div>
        <PageHeader title="Financials" subtitle="Income Statement" />
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-10 text-center">
          <p className="text-[14px] font-semibold text-[#18181b] dark:text-[#fafafa]">No financial data yet</p>
          <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] mt-1.5">
            Drop the monthly bundle (with the Northgate Financial Package xlsx) in <span className="font-medium">Monthly Uploads</span>.
          </p>
        </div>
      </div>
    );
  }

  const subtitlePeriod = period
    ? new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";

  return (
    <div>
      <PageHeader title="Financials" subtitle={`Income Statement · ${subtitlePeriod}`} />

      {/* KPI strip — matches commercial /financials shape */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        <KPIBox label="Total Income" value={formatCurrency(totals.income)} />
        <KPIBox
          label="Total Expense"
          value={formatCurrency(totals.expense)}
          color="text-[#dc2626]"
        />
        <KPIBox
          label="NOI"
          value={formatCurrency(totals.noi)}
          color={totals.noi >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}
        />
        <KPIBox
          label="YTD NOI"
          value={formatCurrency(totals.noiYtd)}
          color={totals.noiYtd >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}
        />
      </div>

      {/* Summary panel — same shape as Hollister: Total Income / Total
          Operating Expense / NOI / Net Income across the period vs budget. */}
      <SummaryPanel totals={totals} periodLabel={periodLabel} />

      <IncomeStatementTable lines={lines} totalIncome={totals.income} periodLabel={periodLabel} />
    </div>
  );
}

function KPIBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3">
      <p
        className={`text-[18px] sm:text-[20px] font-semibold tracking-tight ${
          color || "text-[#18181b] dark:text-[#fafafa]"
        }`}
      >
        {value}
      </p>
      <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] font-medium uppercase tracking-wide mt-0.5">
        {label}
      </p>
    </div>
  );
}

function SummaryPanel({
  totals,
  periodLabel,
}: {
  totals: ReturnType<typeof useMemo<any>> extends infer R ? any : never; // shape only
  periodLabel: string;
}) {
  // Compute MTD vs Budget variance and YTD vs Budget YTD variance for each
  // headline. Negative values render red, positives green; expense direction
  // is interpreted as "over budget = bad" (handled by the consumer).
  const t = totals as any;
  const rows = [
    {
      label: "Total Income",
      mtd: t.income,
      budget: t.incomeBudget,
      ytd: t.incomeYtd,
      ytdBudget: t.incomeYtdBudget,
      // For income, exceeding budget is good (positive variance is green)
      goodWhenPositive: true,
    },
    {
      label: "Total Operating Expense",
      mtd: t.expense,
      budget: t.expenseBudget,
      ytd: t.expenseYtd,
      ytdBudget: t.expenseYtdBudget,
      // For expense, exceeding budget is bad (positive variance is red)
      goodWhenPositive: false,
    },
    {
      label: "NOI (Net Operating Income)",
      mtd: t.noi,
      budget: t.noiBudget,
      ytd: t.noiYtd,
      ytdBudget: t.noiYtdBudget,
      goodWhenPositive: true,
    },
    {
      label: "Net Income (Loss)",
      mtd: t.noi,
      budget: t.noiBudget,
      ytd: t.noiYtd,
      ytdBudget: t.noiYtdBudget,
      goodWhenPositive: true,
    },
  ];

  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden mb-4">
      <div className="grid grid-cols-[1fr_120px_120px_90px_120px_120px_90px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2.5 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
        <span>Summary</span>
        <span className="text-right">{periodLabel}</span>
        <span className="text-right">Budget</span>
        <span className="text-right">Var %</span>
        <span className="text-right">YTD</span>
        <span className="text-right">Budget YTD</span>
        <span className="text-right">YTD Var %</span>
      </div>
      {rows.map((r, idx) => {
        const varPct = r.budget !== 0 ? (r.mtd - r.budget) / Math.abs(r.budget) : null;
        const ytdVarPct = r.ytdBudget !== 0 ? (r.ytd - r.ytdBudget) / Math.abs(r.ytdBudget) : null;
        const colorVar = (v: number | null) => {
          if (v == null) return "text-[#71717a] dark:text-[#a1a1aa]";
          const positive = v >= 0;
          const isGood = r.goodWhenPositive ? positive : !positive;
          return isGood ? "text-[#16a34a]" : "text-[#dc2626]";
        };
        return (
          <div
            key={idx}
            className="grid grid-cols-[1fr_120px_120px_90px_120px_120px_90px] px-4 py-2 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] items-center text-[#18181b] dark:text-[#fafafa]"
          >
            <span className="font-medium">{r.label}</span>
            <span className="text-right tabular-nums">{formatCurrency(r.mtd)}</span>
            <span className="text-right tabular-nums text-[#71717a] dark:text-[#a1a1aa]">
              {formatCurrency(r.budget)}
            </span>
            <span className={`text-right tabular-nums ${colorVar(varPct)}`}>
              {formatPctSigned(varPct)}
            </span>
            <span className="text-right tabular-nums">{formatCurrency(r.ytd)}</span>
            <span className="text-right tabular-nums text-[#71717a] dark:text-[#a1a1aa]">
              {formatCurrency(r.ytdBudget)}
            </span>
            <span className={`text-right tabular-nums ${colorVar(ytdVarPct)}`}>
              {formatPctSigned(ytdVarPct)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Block parser — groups rows into collapsible "subsection" blocks. A block
// opens on a "NNNN-000 - Total X" header that carries no amounts and closes
// on the matching "Total - NNNN-000 - Total X" subtotal. Anything between is
// rendered as the block's children (including nested NNNN-100 subgroups,
// leaves, and X-100 subtotals). Top-level rows (Income, Expense, GROSS
// PROFIT, Total Income, etc.) sit outside any block and render as bare rows.
type Block = { header: Row; children: Row[]; closingTotal: Row | null };

function isBlock(x: any): x is Block {
  return x && typeof x === "object" && "children" in x && "header" in x;
}

function parseBlocks(lines: Row[]): (Block | Row)[] {
  const out: (Block | Row)[] = [];
  let current: Block | null = null;
  let currentCode: string | null = null;

  for (const r of lines) {
    const li = String(r.lineItem || "").trim();
    const hasAmounts =
      Math.abs(r.amountMtd || 0) > 0.0001 ||
      Math.abs(r.amountYtd || 0) > 0.0001 ||
      Math.abs(r.budgetMtd || 0) > 0.0001 ||
      Math.abs(r.budgetYtd || 0) > 0.0001;

    // Block-opening header: NNNN-000 prefix + no amounts + not a "Total -" row.
    const openMatch = li.match(/^(\d{4}-000)\s*-/);
    if (openMatch && !hasAmounts && !/^Total\s*-/i.test(li)) {
      if (current) out.push(current);
      current = { header: r, children: [], closingTotal: null };
      currentCode = openMatch[1];
      continue;
    }

    // Block-closing subtotal: "Total - NNNN-000 - ..." matching the open code.
    if (current && currentCode) {
      const closeMatch = li.match(/^Total\s*-\s*(\d{4}-000)/i);
      if (closeMatch && closeMatch[1] === currentCode) {
        current.closingTotal = r;
        out.push(current);
        current = null;
        currentCode = null;
        continue;
      }
    }

    if (current) {
      current.children.push(r);
    } else {
      out.push(r);
    }
  }
  if (current) out.push(current);
  return out;
}

function IncomeStatementTable({
  lines,
  totalIncome,
  periodLabel,
}: {
  lines: Row[];
  totalIncome: number;
  periodLabel: string;
}) {
  const blocks = useMemo(() => parseBlocks(lines), [lines]);
  // Per-block expansion state, default collapsed. Keyed by the header lineItem
  // since the X-000 prefix is unique within the IS.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_120px_120px_120px_90px_90px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2.5 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
        <span>Line Item</span>
        <span className="text-right">{periodLabel}</span>
        <span className="text-right">Budget</span>
        <span className="text-right">Variance $</span>
        <span className="text-right">Var %</span>
        <span className="text-right">% Income</span>
      </div>
      {blocks.map((item, idx) => {
        if (isBlock(item)) {
          const key = String(item.header.lineItem || `block-${idx}`);
          const isOpen = !!expanded[key];
          // Inline summary is the closing subtotal — that's where the actual
          // roll-up values live (the header row itself has all-zero amounts).
          const summaryRow = item.closingTotal || item.header;
          const summaryHasValues =
            Math.abs(summaryRow.amountMtd || 0) > 0.0001 ||
            Math.abs(summaryRow.amountYtd || 0) > 0.0001 ||
            Math.abs(summaryRow.budgetMtd || 0) > 0.0001;
          return (
            <BlockSection
              key={`${key}-${idx}`}
              block={item}
              summaryRow={summaryRow}
              isOpen={isOpen}
              onToggle={summaryHasValues ? () => toggle(key) : undefined}
              totalIncome={totalIncome}
            />
          );
        }
        return <ISRow key={`${item._id}-${idx}`} row={item} totalIncome={totalIncome} />;
      })}
    </div>
  );
}

function BlockSection({
  block,
  summaryRow,
  isOpen,
  onToggle,
  totalIncome,
}: {
  block: Block;
  summaryRow: Row;
  isOpen: boolean;
  onToggle?: () => void;
  totalIncome: number;
}) {
  return (
    <>
      {/* Block header row — uses summaryRow values when collapsed so the
          X-000 line shows its real roll-up totals next to the chevron, the
          way Hollister inlines RENTAL INCOME's totals. Empty blocks (no
          values anywhere) render without a chevron per user feedback —
          there's nothing useful to expand. */}
      <ISRow
        row={block.header}
        totalIncome={totalIncome}
        valueRow={summaryRow}
        isBlockHeader
        onToggle={onToggle}
        isOpen={isOpen}
      />
      {isOpen &&
        block.children.map((c, i) => (
          <ISRow key={`${c._id}-${i}`} row={c} totalIncome={totalIncome} />
        ))}
      {isOpen && block.closingTotal && (
        <ISRow row={block.closingTotal} totalIncome={totalIncome} />
      )}
    </>
  );
}

function ISRow({
  row,
  totalIncome,
  valueRow,
  isBlockHeader,
  onToggle,
  isOpen,
}: {
  row: Row;
  totalIncome: number;
  // When supplied, the row's labels come from `row` but the displayed values
  // come from `valueRow`. Used by collapsed block headers to show the
  // closing-subtotal numbers inline next to the section name.
  valueRow?: Row;
  isBlockHeader?: boolean;
  onToggle?: () => void;
  isOpen?: boolean;
}) {
  const kind = classifyLine(row);
  if (kind === "skip") return null;

  const li = String(row.lineItem || "").trim();
  const cleanLabel = kind === "subtotal" ? li.replace(/^Total\s*-\s*/i, "Total ") : li;
  // Indent: leaves nest deepest, X-100 subgroups one level in, headers/X-000 at root.
  // Block headers are at root with the chevron drawn alongside.
  const indent = isBlockHeader ? 0 : kind === "leaf" ? 24 : kind === "subgroup" ? 12 : 0;

  const rowClass = [
    "grid grid-cols-[1fr_120px_120px_120px_90px_90px] px-4 py-1.5 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] items-center",
    isBlockHeader
      ? "uppercase tracking-wide font-medium text-[#18181b] dark:text-[#fafafa]"
      : kind === "header"
      ? "bg-[#f4f4f5] dark:bg-[#27272a] uppercase tracking-wide font-semibold text-[#18181b] dark:text-[#fafafa]"
      : kind === "subtotal"
      ? "bg-[#fafafa] dark:bg-[#27272a]/60 font-semibold text-[#18181b] dark:text-[#fafafa]"
      : kind === "subgroup"
      ? "font-medium text-[#18181b] dark:text-[#fafafa]"
      : "text-[#18181b] dark:text-[#fafafa]",
    onToggle ? "cursor-pointer hover:bg-[#fafafa]/60 dark:hover:bg-[#27272a]/40" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Pick which row's amounts to display. For a collapsed block header we use
  // the closing subtotal's numbers so the section reads as a meaningful row
  // even with the children hidden.
  const valueSource = valueRow || row;
  const mtd = valueSource.amountMtd || 0;
  const budgetMtd = valueSource.budgetMtd || 0;
  const ytd = valueSource.amountYtd || 0;
  const varianceDollars = mtd - budgetMtd;
  const varPct = valueSource.pctVarianceMtd;
  const showVarPct =
    varPct != null && Number.isFinite(varPct) && Math.abs(varPct) > 0.0001;
  const isNegMtd = mtd < 0;
  const isIncomeLine = isIncomeContext(li);

  const pctIncome =
    totalIncome > 0 && kind === "leaf" && Math.abs(mtd) > 0.5
      ? Math.abs(mtd) / totalIncome
      : null;

  function varColor() {
    if (Math.abs(varianceDollars) < 0.5) return "text-[#71717a] dark:text-[#a1a1aa]";
    if (isIncomeLine) {
      return varianceDollars >= 0 ? "text-[#16a34a]" : "text-[#dc2626]";
    }
    if (isExpenseContext(li)) {
      return varianceDollars <= 0 ? "text-[#16a34a]" : "text-[#dc2626]";
    }
    return varianceDollars >= 0 ? "text-[#16a34a]" : "text-[#dc2626]";
  }

  const isHeaderLikePlain = kind === "header" && !isBlockHeader;
  const showValues = !isHeaderLikePlain;
  void ytd;

  return (
    <div className={rowClass} onClick={onToggle}>
      <span style={{ paddingLeft: indent }} className="truncate flex items-center gap-1.5" title={cleanLabel}>
        {/* Chevron only when there's a toggle handler (i.e. block has values). */}
        {isBlockHeader && onToggle && (
          <span className="text-[10px] text-[#71717a] dark:text-[#a1a1aa] inline-block w-3">
            {isOpen ? "▼" : "▶"}
          </span>
        )}
        {isBlockHeader && !onToggle && <span className="inline-block w-3" />}
        <span className="truncate">{cleanLabel}</span>
      </span>
      <span className={`text-right tabular-nums ${isNegMtd ? "text-[#dc2626]" : ""}`}>
        {!showValues || mtd === 0 ? "—" : formatCurrency(Math.abs(mtd))}
      </span>
      <span className="text-right tabular-nums text-[#71717a] dark:text-[#a1a1aa]">
        {!showValues || budgetMtd === 0 ? "—" : formatCurrency(budgetMtd)}
      </span>
      <span className={`text-right tabular-nums ${varColor()}`}>
        {!showValues || (mtd === 0 && budgetMtd === 0)
          ? "—"
          : formatVarianceDollars(varianceDollars)}
      </span>
      <span
        className={`text-right tabular-nums text-[11px] ${
          showVarPct
            ? varPct >= 0
              ? isExpenseContext(li)
                ? "text-[#dc2626]"
                : "text-[#16a34a]"
              : isExpenseContext(li)
              ? "text-[#16a34a]"
              : "text-[#dc2626]"
            : "text-[#71717a] dark:text-[#a1a1aa]"
        }`}
      >
        {showVarPct ? formatPctSigned(varPct) : "—"}
      </span>
      <span className="text-right tabular-nums text-[#71717a] dark:text-[#a1a1aa] text-[11px]">
        {pctIncome != null ? `${(pctIncome * 100).toFixed(0)}%` : "—"}
      </span>
    </div>
  );
}

"use client";
import { useMemo, useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import PageHeader from "@/components/PageHeader";
import { api } from "../../../../convex/_generated/api";
import { useActiveProperty, useIncomeLinesWithLoading, useMonthlyRevenue, useDebt, useLineBudgets, formatCurrency } from "@/hooks/useConvexData";

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

// "2026-04" -> "Apr 2026"
function formatPeriodShort(p: string) {
  if (!p) return "";
  const [y, mo] = p.split("-");
  const date = new Date(Number(y), Number(mo) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// Pick the most recent snapshot for a given period from a flat list of
// income_lines rows (a period can have multiple snapshots from repeated
// Yardi syncs). Returns the rows belonging to that single best snapshot.
function pickLatestSnapshot(rows: any[], period: string) {
  const periodRows = rows.filter((r: any) => r.period === period);
  if (!periodRows.length) return [] as any[];
  // Group by snapshotDate, find max
  const dates = periodRows.map((r: any) => r.snapshotDate || "").filter(Boolean);
  if (!dates.length) return periodRows;
  const latest = dates.sort().reverse()[0];
  return periodRows.filter((r: any) => (r.snapshotDate || "") === latest);
}

// Build a Map keyed by trimmed lineItem -> { currentPeriod, yearToDate }
function indexByLineItem(rows: any[]) {
  const m = new Map<string, { currentPeriod: number; yearToDate: number }>();
  for (const r of rows) {
    const key = (r.lineItem || "").trim();
    if (!key) continue;
    m.set(key, {
      currentPeriod: r.currentPeriod || 0,
      yearToDate: r.yearToDate || 0,
    });
  }
  return m;
}

export default function FinancialsPage() {
  const property = useActiveProperty();
  const { lines: rawLines, loading: linesLoading } = useIncomeLinesWithLoading(property?._id);
  const monthlyRevenue = useMonthlyRevenue(property?._id);
  const { debt, upsertDebt, clearDebt } = useDebt(property?._id);
  const updateProperty = useMutation(api.properties.update);
  const { user } = useUser();

  const [view, setView] = useState<"statement" | "budget">("statement");
  const [budgetYear, setBudgetYear] = useState<string>(String(new Date().getFullYear()));
  const [budgetCompareYear, setBudgetCompareYear] = useState<string>(String(new Date().getFullYear() - 1));
  const { budgets, upsertBudget } = useLineBudgets(property?._id, budgetYear);
  const { budgets: compareBudgets } = useLineBudgets(property?._id, budgetCompareYear);
  const compareBudgetByLine = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of compareBudgets) m.set((b.lineItem || "").trim(), b.annualBudget || 0);
    return m;
  }, [compareBudgets]);
  const budgetByLine = useMemo(() => {
    const m = new Map<string, { annualBudget: number; monthlyBudgets?: number[]; isSynced: boolean; snapshotDate?: string }>();
    for (const b of budgets) {
      const isSynced = (b as any).updatedBy === "yardi" || !!(b as any).syncId;
      m.set((b.lineItem || "").trim(), {
        annualBudget: b.annualBudget || 0,
        monthlyBudgets: (b as any).monthlyBudgets,
        isSynced,
        snapshotDate: (b as any).snapshotDate || (b as any).updatedAt,
      });
    }
    return m;
  }, [budgets]);
  // Latest sync date across all Yardi-synced budget rows
  const lastSyncDate = useMemo(() => {
    const dates = budgets
      .filter((b: any) => b.updatedBy === "yardi" || b.syncId)
      .map((b: any) => b.snapshotDate || b.updatedAt)
      .filter(Boolean);
    if (dates.length === 0) return null;
    return dates.sort().reverse()[0];
  }, [budgets]);

  // Derive the month from the latest income lines snapshot (period field)
  const period = useMemo(() => {
    if (!rawLines.length) return null;
    const periods = rawLines.map((l: any) => l.period).filter(Boolean);
    if (!periods.length) return null;
    return periods.sort().reverse()[0];
  }, [rawLines]);

  // Pull every snapshot ever recorded so the user can compare the current
  // period against any prior period in history.
  const allHistoricLines = useQuery(
    api.incomeLines.allForProperty,
    property?._id ? { propertyId: property._id as any } : "skip"
  );

  // Distinct periods available for comparison (sorted ascending, current
  // period excluded — it's already the left column).
  const availablePeriods = useMemo(() => {
    const rows = allHistoricLines || [];
    const set = new Set<string>();
    for (const r of rows) if (r.period) set.add(r.period);
    return Array.from(set).sort();
  }, [allHistoricLines]);

  // Default the IS comparison to the latest period strictly before `period`.
  const [comparePeriod, setComparePeriod] = useState<string | null>(null);
  useEffect(() => {
    if (!period || !availablePeriods.length) return;
    setComparePeriod(prev => {
      if (prev && availablePeriods.includes(prev) && prev !== period) return prev;
      const candidates = availablePeriods.filter(p => p < period);
      return candidates.length ? candidates[candidates.length - 1] : null;
    });
  }, [period, availablePeriods]);

  // Index of compare-period values keyed by line item (for quick lookups
  // while rendering the income statement).
  const compareIndex = useMemo(() => {
    if (!allHistoricLines || !comparePeriod) return null;
    const snap = pickLatestSnapshot(allHistoricLines, comparePeriod);
    return indexByLineItem(snap);
  }, [allHistoricLines, comparePeriod]);

  // Yardi inserts rows in income-statement order; preserve that by sorting on
  // _creationTime ascending. Previous code sorted alphabetically, which broke
  // the natural P&L hierarchy (INCOME -> children -> TOTAL -> EXPENSE -> ...).
  const lines = useMemo(() => {
    return [...rawLines].sort((a: any, b: any) => {
      const ta = a._creationTime ?? 0;
      const tb = b._creationTime ?? 0;
      return ta - tb;
    });
  }, [rawLines]);

  // Pull total income + total expense for % column
  const totalIncome = useMemo(() => {
    const row = rawLines.find((l: any) => /^\s*total\s+income\s*$/i.test((l.lineItem || "").trim()));
    return row?.currentPeriod || 0;
  }, [rawLines]);

  // Total operating expenses + NOI lookup. Match common Yardi labels.
  const totalExpense = useMemo(() => {
    const row = rawLines.find((l: any) => /^\s*total\s+(operating\s+)?expense/i.test((l.lineItem || "").trim()));
    return row?.currentPeriod || 0;
  }, [rawLines]);

  const noi = useMemo(() => {
    const row = rawLines.find((l: any) => /net\s+operating\s+income|^\s*noi\s*$/i.test((l.lineItem || "").trim()));
    if (row) return row.currentPeriod;
    return totalIncome - totalExpense;
  }, [rawLines, totalIncome, totalExpense]);

  // Expense recoveries = lines under any "Misc Income" (or Recoverable Income)
  // parent in the income statement.
  const recoveries = useMemo(() => {
    const parents = new Set(
      rawLines
        .filter((l: any) => /misc\s+income|recoverable\s+income|recoveries/i.test((l.lineItem || "").trim()))
        .map((l: any) => (l.lineItem || "").trim())
    );
    if (!parents.size) return { total: 0, items: [] as any[] };
    const items = rawLines.filter((l: any) => l.parentLine && parents.has(l.parentLine));
    const total = items.reduce((s: number, l: any) => s + (l.currentPeriod || 0), 0);
    return { total, items };
  }, [rawLines]);

  // DSCR = annualized NOI ÷ annual debt service
  const dscr = useMemo(() => {
    if (!debt || debt.monthlyDebtService <= 0) return null;
    const annualNOI = noi * 12;
    const annualDS = debt.monthlyDebtService * 12;
    if (annualDS <= 0) return null;
    return annualNOI / annualDS;
  }, [debt, noi]);

  // Trend data — last 12 months, sorted ascending
  const trend = useMemo(() => {
    const today = new Date();
    const cutoff = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    return [...monthlyRevenue]
      .filter((m: any) => m.month && m.month >= "2026-01" && m.month <= cutoff)
      .sort((a: any, b: any) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [monthlyRevenue]);

  if (!property) return null;

  // Skeleton while income_lines streams in. Without this, the page flashes
  // "$0 / $0 / NOI $0 / 'No monthly trend data yet'" because the empty []
  // fallback can't be distinguished from a real empty result.
  if (linesLoading) {
    return (
      <div>
        <PageHeader title="Financials" subtitle="Loading…" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 animate-pulse">
              <div className="h-6 w-24 bg-[#f4f4f5] dark:bg-[#27272a] rounded mb-1.5" />
              <div className="h-2 w-16 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-6">
          <div className="space-y-2 animate-pulse">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="h-4 bg-[#f4f4f5] dark:bg-[#27272a] rounded" style={{ width: `${60 + (i * 5) % 35}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

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

  // Empty income_lines = no Yardi income statement ingested yet for this
  // property. Without a banner the KPI strip would show "$0 / $0 / NOI $0",
  // which reads exactly like a real (broken) statement.
  const noYardiData = !property.hasData && rawLines.length === 0;

  return (
    <div>
      <PageHeader
        title="Financials"
        subtitle={period ? `Income Statement · ${formatPeriod(period)}` : "Income Statement"}
      />

      {noYardiData && (
        <div className="mb-4 bg-[#fef9c3] dark:bg-[#422006]/40 border border-[#fde68a] dark:border-[#854d0e] rounded p-3">
          <p className="text-[12px] font-semibold text-[#713f12] dark:text-[#fde68a]">No financial data yet for {property.name}</p>
          <p className="text-[11px] text-[#854d0e] dark:text-[#fcd34d] mt-0.5">
            No income statement has been imported for this property. The figures below will read $0 until a Yardi sync runs — or this property may not have a Yardi feed.
          </p>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        <KPIBox label="Total Income" value={formatCurrency(totalIncome)} />
        <KPIBox label="Total Expense" value={formatCurrency(totalExpense)} color="text-[#dc2626]" />
        <KPIBox label="NOI" value={formatCurrency(noi)} color={noi >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"} />
        <KPIBox label="Recoveries" value={formatCurrency(recoveries.total)} />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-4 bg-[#f4f4f5] dark:bg-[#27272a] rounded-md p-0.5 w-fit">
        {(["statement", "budget"] as const).map(t => (
          <button
            key={t}
            onClick={() => setView(t)}
            className={`text-[12px] font-medium px-3 py-1.5 rounded cursor-pointer transition-colors capitalize ${
              view === t
                ? "bg-white dark:bg-[#18181b] text-[#18181b] dark:text-[#fafafa] shadow-sm"
                : "text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
            }`}
          >
            {t === "statement" ? "Income Statement" : "Budget vs Actuals"}
          </button>
        ))}
      </div>

      {view === "statement" && (
        <>
          <ISSummaryPanel lines={lines} compareIndex={compareIndex} comparePeriod={comparePeriod} currentPeriod={period} />
          <IncomeStatement
            lines={lines}
            totalIncome={totalIncome}
            currentPeriod={period}
            comparePeriod={comparePeriod}
            availablePeriods={availablePeriods}
            onChangeComparePeriod={setComparePeriod}
            compareIndex={compareIndex}
          />
        </>
      )}
      {view === "budget" && (
        <BudgetVsActualsHighLevel
          propertyId={property?._id}
          lines={lines}
          period={period}
          allHistoricLines={(allHistoricLines as any[]) || []}
          availablePeriods={availablePeriods}
        />
      )}
    </div>
  );
}

function KPIBox({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3">
      <p className={`text-[18px] sm:text-[20px] font-semibold tracking-tight ${color || "text-[#18181b] dark:text-[#fafafa]"}`}>{value}</p>
      <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] font-medium uppercase tracking-wide mt-0.5">{label}</p>
      {hint && <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-0.5 normal-case truncate">{hint}</p>}
    </div>
  );
}

function IncomeStatement({
  lines,
  totalIncome,
  currentPeriod,
  comparePeriod,
  availablePeriods,
  onChangeComparePeriod,
  compareIndex,
}: {
  lines: any[];
  totalIncome: number;
  currentPeriod: string | null;
  comparePeriod: string | null;
  availablePeriods: string[];
  onChangeComparePeriod: (p: string | null) => void;
  compareIndex: Map<string, { currentPeriod: number; yearToDate: number }> | null;
}) {
  // Group rows into "blocks". A block = one level-1 header + every row until
  // the next level-1 header. children = level-3 leaves; totals = level-16
  // subtotals or level-24 grand totals. Grand totals that fall outside any
  // header (e.g. NOI at the very end) become headerless blocks so they
  // always render.
  type Block = {
    header: any | null;        // level-1 row, or null for orphan trailing totals
    children: any[];           // level-3 rows
    totals: any[];             // level-16 / level-24 rows
    sectionTotal: any | null;  // last total in block — used for inline value
                                // when the section is collapsed
    isExpense: boolean;        // for the larger gap between INCOME and EXPENSE
  };

  const blocks: Block[] = useMemo(() => {
    const out: Block[] = [];
    let cur: Block | null = null;
    for (const line of lines) {
      const lvl = line.hierarchyLevel;
      if (lvl === 1) {
        if (cur) out.push(cur);
        cur = {
          header: line,
          children: [],
          totals: [],
          sectionTotal: null,
          isExpense: /expense/i.test(line.lineItem || ""),
        };
      } else if (cur) {
        if (lvl >= 16) cur.totals.push(line);
        else cur.children.push(line);
      } else {
        // Orphan rows before any header (or after a header was flushed) get
        // their own headerless block so totals are still visible.
        if (!out.length || out[out.length - 1].header) {
          out.push({ header: null, children: [], totals: [], sectionTotal: null, isExpense: false });
        }
        const last = out[out.length - 1];
        if (lvl >= 16) last.totals.push(line);
        else last.children.push(line);
      }
    }
    if (cur) out.push(cur);

    // Inline-total heuristic: pick the LAST level-16/24 row inside the block.
    // In Yardi's export each section closes with its TOTAL line, so "last
    // total in block" reliably picks the right subtotal (e.g. INCOME -> TOTAL
    // RENTAL REVENUE, OPERATING EXPENSE -> TOTAL OPERATING EXPENSE).
    for (const b of out) {
      // Pick the FIRST level-16 total whose name matches the header section
      // ("TOTAL <header text>"). Falls back to the first level-16 in the block
      // if no name match. Last-in-block was wrong: MISC INCOME would pick up
      // "TOTAL RENTAL REVENUE/PROPERTY INCOME" (combined rental+misc) instead
      // of "TOTAL MISC INCOME".
      if (b.totals.length && b.header) {
        const headerName = (b.header.lineItem || "").trim().toLowerCase();
        const named = b.totals.find((t: any) =>
          /^total\b/i.test((t.lineItem || "").trim()) &&
          (t.lineItem || "").toLowerCase().includes(headerName) &&
          t.hierarchyLevel === 16
        );
        b.sectionTotal = named || b.totals.find((t: any) => t.hierarchyLevel === 16) || b.totals[0];
      } else if (b.totals.length) {
        b.sectionTotal = b.totals[0];
      }
    }
    return out;
  }, [lines]);

  // Per-section expand state, keyed by header lineItem. Default: all collapsed.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!lines.length) {
    return (
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-8 text-center">
        <p className="text-[13px] text-[#71717a] dark:text-[#a1a1aa]">No income statement data yet. Run a Yardi sync to populate.</p>
      </div>
    );
  }

  const periodOptions = availablePeriods.filter(p => p !== currentPeriod);
  const compareLabel = comparePeriod ? formatPeriodShort(comparePeriod) : "Prior";
  const currentLabel = currentPeriod ? formatPeriodShort(currentPeriod) : "Current Period";

  function renderRow(
    line: any,
    key: string | number,
    opts: {
      isHeader?: boolean;
      isOpen?: boolean;
      onClick?: () => void;
      valueOverride?: number | null;
      ytdOverride?: number | null;
      cmpOverride?: number | null;
      bold?: boolean;
      topBorder?: boolean;
    } = {}
  ) {
    const li = (line.lineItem || "").trim();
    const lvl = line.hierarchyLevel;
    const isLevel24 = lvl === 24;
    const isLevel16 = lvl === 16;
    const isLevel3 = lvl === 3;
    const isLevel1 = lvl === 1;

    const indent = isLevel1 ? 0 : isLevel3 ? 24 : isLevel16 ? 16 : 0;
    const cp = opts.valueOverride !== undefined && opts.valueOverride !== null
      ? opts.valueOverride
      : (line.currentPeriod || 0);
    const ytd = opts.ytdOverride !== undefined && opts.ytdOverride !== null
      ? opts.ytdOverride
      : (line.yearToDate || 0);
    const isNeg = cp < 0;
    const cmp = opts.cmpOverride !== undefined
      ? opts.cmpOverride
      : (compareIndex?.get(li)?.currentPeriod ?? null);
    const variance = cmp !== null && cmp !== undefined ? cp - cmp : null;
    const variancePct = variance !== null && cmp !== null && cmp !== undefined && cmp !== 0
      ? (variance / Math.abs(cmp)) * 100
      : null;
    const showValue = cp !== 0;

    const rowClass = [
      "grid grid-cols-[1fr_120px_120px_110px_80px_70px] px-4 py-1.5 text-[12px]",
      opts.topBorder ? "border-t-2 border-[#18181b] dark:border-[#fafafa]" : "border-t border-[#f4f4f5] dark:border-[#27272a]",
      isLevel24 ? "bg-[#f4f4f5] dark:bg-[#27272a] font-bold text-[#18181b] dark:text-[#fafafa]" :
        isLevel16 ? "bg-[#fafafa] dark:bg-[#27272a]/60 font-semibold text-[#18181b] dark:text-[#fafafa]" :
        opts.bold ? "font-semibold text-[#18181b] dark:text-[#fafafa]" :
        "text-[#18181b] dark:text-[#fafafa]",
      opts.onClick ? "cursor-pointer hover:bg-[#fafafa]/50 dark:hover:bg-[#27272a]/40" : "",
    ].filter(Boolean).join(" ");

    const labelClass = [
      "truncate flex items-center gap-1",
      isLevel1 ? "uppercase tracking-wide font-semibold text-[#18181b] dark:text-[#fafafa] select-none" : "",
      isLevel24 ? "uppercase tracking-wide" : "",
    ].filter(Boolean).join(" ");

    return (
      <div key={key} className={rowClass} onClick={opts.onClick}>
        <span style={{ paddingLeft: indent }} className={labelClass}>
          {opts.isHeader && (
            <span className="text-[10px] text-[#71717a] dark:text-[#a1a1aa] inline-block w-3">
              {opts.isOpen ? "▼" : "▶"}
            </span>
          )}
          {li}
        </span>
        <span className={`text-right ${isNeg ? "text-[#dc2626]" : ""}`}>
          {showValue ? formatCurrency(Math.abs(cp)) : "—"}
          {isNeg && showValue ? <span className="text-[#dc2626]"> ▼</span> : null}
        </span>
        <span className={`text-right ${cmp !== null && cmp !== undefined && cmp < 0 ? "text-[#dc2626]" : "text-[#71717a] dark:text-[#a1a1aa]"}`}>
          {cmp === null || cmp === undefined || cmp === 0 ? "—" : formatCurrency(Math.abs(cmp))}
        </span>
        <span className={`text-right ${variance === null ? "text-[#a1a1aa]" : variance > 0 ? "text-[#16a34a]" : variance < 0 ? "text-[#dc2626]" : "text-[#a1a1aa]"}`}>
          {variance === null ? "—" : `${variance >= 0 ? "+" : "−"}${formatCurrency(Math.abs(variance))}`}
        </span>
        <span className={`text-right ${variancePct === null ? "text-[#a1a1aa]" : variancePct > 0 ? "text-[#16a34a]" : variancePct < 0 ? "text-[#dc2626]" : "text-[#a1a1aa]"}`}>
          {variancePct === null ? "—" : `${variancePct >= 0 ? "+" : ""}${variancePct.toFixed(0)}%`}
        </span>
        <span className="text-right text-[#a1a1aa] dark:text-[#71717a]">
          {showValue && totalIncome > 0 ? pct(Math.abs(cp), totalIncome) : ""}
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-[12px] text-[#71717a] dark:text-[#a1a1aa]">
          <span>Compare to</span>
          <select
            value={comparePeriod || ""}
            onChange={e => onChangeComparePeriod(e.target.value || null)}
            disabled={!periodOptions.length}
            className="text-[12px] px-2 py-1 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa] disabled:opacity-40"
          >
            {!periodOptions.length && <option value="">No prior periods</option>}
            {periodOptions.length > 0 && <option value="">— None —</option>}
            {periodOptions.map(p => (
              <option key={p} value={p}>{formatPeriodShort(p)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_120px_110px_80px_70px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
          <span>Line Item</span>
          <span className="text-right">{currentLabel}</span>
          <span className="text-right">{compareLabel}</span>
          <span className="text-right">Variance $</span>
          <span className="text-right">Var %</span>
          <span className="text-right">% Income</span>
        </div>

        {blocks.map((block, bi) => {
          const headerLi = block.header ? (block.header.lineItem || "").trim() : "";
          const isOpen = block.header ? !!expanded[headerLi] : true;

          // Bigger visual gap when crossing the income/expense boundary.
          const prev = bi > 0 ? blocks[bi - 1] : null;
          const gapClass =
            bi === 0
              ? ""
              : prev && prev.isExpense !== block.isExpense
                ? "mt-2 border-t-2 border-[#e4e4e7] dark:border-[#3f3f46]"
                : "";

          // When the section is collapsed, surface the section's total value
          // inline on the header row. Pull both current and compare values
          // from the matched subtotal row so variance is meaningful.
          let inlineValue: number | null = null;
          let inlineYtd: number | null = null;
          let inlineCmp: number | null | undefined = undefined;
          if (block.header && !isOpen && block.sectionTotal) {
            inlineValue = block.sectionTotal.currentPeriod || 0;
            inlineYtd = block.sectionTotal.yearToDate || 0;
            const totalLi = (block.sectionTotal.lineItem || "").trim();
            inlineCmp = compareIndex?.get(totalLi)?.currentPeriod ?? null;
          }

          return (
            <div key={bi} className={gapClass}>
              {block.header && renderRow(block.header, `h-${bi}`, {
                isHeader: true,
                isOpen,
                onClick: () => setExpanded(s => ({ ...s, [headerLi]: !s[headerLi] })),
                valueOverride: inlineValue,
                ytdOverride: inlineYtd,
                cmpOverride: inlineCmp,
              })}

              {/* Children render only when the section is expanded. */}
              {isOpen && block.children.map((c, ci) => renderRow(c, `c-${bi}-${ci}`))}

              {/* Subtotals render when expanded. When collapsed they're
                  hidden — the inline header value already shows the total. */}
              {isOpen && block.totals.map((t, ti) => {
                const isGrand = t.hierarchyLevel === 24;
                return renderRow(t, `t-${bi}-${ti}`, {
                  bold: isGrand,
                  topBorder: isGrand,
                });
              })}
            </div>
          );
        })}
      </div>
    </>
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
      <div className="grid grid-cols-[100px_140px_1fr_120px_120px_120px_70px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
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
            className="grid grid-cols-[100px_140px_1fr_120px_120px_120px_70px] px-4 py-2.5 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] text-[#18181b] dark:text-[#fafafa]"
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

function RecoveriesPanel({ items, total }: { items: any[]; total: number }) {
  return (
    <div className="mt-4 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#fafafa] dark:bg-[#27272a] border-b border-[#e4e4e7] dark:border-[#3f3f46]">
        <p className="text-[12px] font-semibold text-[#18181b] dark:text-[#fafafa]">Expense Recoveries</p>
        <p className="text-[12px] font-semibold text-[#16a34a]">{formatCurrency(total)}</p>
      </div>
      <div className="divide-y divide-[#f4f4f5] dark:divide-[#27272a]">
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_120px] px-4 py-1.5 text-[12px] text-[#18181b] dark:text-[#fafafa]">
            <span style={{ paddingLeft: Math.max(0, (it.hierarchyLevel - 1)) * 16 }}>{it.lineItem.trim()}</span>
            <span className="text-right">{formatCurrency(it.currentPeriod || 0)}</span>
            <span className="text-right text-[#71717a] dark:text-[#a1a1aa]">YTD {formatCurrency(it.yearToDate || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DebtPanel({
  debt,
  noi,
  dscr,
  onSave,
  onClear,
}: {
  debt: any | null;
  noi: number;
  dscr: number | null;
  onSave: (form: DebtForm) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [form, setForm] = useState<DebtForm>({
    totalDebt: 0,
    monthlyDebtService: 0,
    interestRate: undefined,
    lender: undefined,
    loanStartDate: undefined,
    loanMaturityDate: undefined,
    notes: undefined,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (debt) {
      setForm({
        totalDebt: debt.totalDebt ?? 0,
        monthlyDebtService: debt.monthlyDebtService ?? 0,
        interestRate: debt.interestRate,
        lender: debt.lender,
        loanStartDate: debt.loanStartDate,
        loanMaturityDate: debt.loanMaturityDate,
        notes: debt.notes,
      });
    }
  }, [debt?._id, debt?.updatedAt]);

  async function handleSave() {
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  }

  const annualNOI = noi * 12;
  const annualDS = (form.monthlyDebtService || 0) * 12;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-5">
        <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-4">Loan Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DebtField label="Total Debt (Outstanding Balance)">
            <NumInput value={form.totalDebt} onChange={v => setForm({ ...form, totalDebt: v })} prefix="$" />
          </DebtField>
          <DebtField label="Monthly Debt Service (P&I)">
            <NumInput value={form.monthlyDebtService} onChange={v => setForm({ ...form, monthlyDebtService: v })} prefix="$" />
          </DebtField>
          <DebtField label="Interest Rate (%)">
            <NumInput value={form.interestRate ?? 0} onChange={v => setForm({ ...form, interestRate: v })} suffix="%" />
          </DebtField>
          <DebtField label="Lender">
            <input
              type="text"
              value={form.lender || ""}
              onChange={e => setForm({ ...form, lender: e.target.value })}
              className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
            />
          </DebtField>
          <DebtField label="Loan Start">
            <input
              type="date"
              value={form.loanStartDate || ""}
              onChange={e => setForm({ ...form, loanStartDate: e.target.value })}
              className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
            />
          </DebtField>
          <DebtField label="Loan Maturity">
            <input
              type="date"
              value={form.loanMaturityDate || ""}
              onChange={e => setForm({ ...form, loanMaturityDate: e.target.value })}
              className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
            />
          </DebtField>
        </div>
        <div className="mt-4">
          <DebtField label="Notes">
            <textarea
              value={form.notes || ""}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa] resize-none"
            />
          </DebtField>
        </div>
        <div className="flex items-center justify-between mt-5">
          <button
            onClick={onClear}
            disabled={!debt || saving}
            className="text-[12px] font-medium text-[#71717a] dark:text-[#a1a1aa] hover:text-[#dc2626] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Clear debt info
          </button>
          <button
            onClick={handleSave}
            disabled={saving || form.totalDebt < 0 || form.monthlyDebtService < 0}
            className="text-[12px] font-medium bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] px-4 py-1.5 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {debt?.updatedAt && (
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-2">
            Last updated {new Date(debt.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            {debt.updatedBy ? ` by ${debt.updatedBy}` : ""}
          </p>
        )}
      </div>

      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-5">
        <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-3">DSCR Calculation</p>
        <div className="space-y-1.5 text-[12px]">
          <Row label="NOI (current period × 12)" value={formatCurrency(annualNOI)} />
          <Row label="Annual debt service" value={formatCurrency(annualDS)} />
          <div className="border-t border-[#e4e4e7] dark:border-[#3f3f46] pt-2 mt-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">DSCR (NOI ÷ Debt Service)</p>
            <p className={`text-[18px] font-semibold tracking-tight ${
              dscr === null ? "text-[#a1a1aa]" :
              dscr >= 1.25 ? "text-[#16a34a]" :
              dscr >= 1.0 ? "text-[#d97706]" : "text-[#dc2626]"
            }`}>
              {dscr === null ? "—" : `${dscr.toFixed(2)}×`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DebtField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, prefix, suffix }: { value: number; onChange: (v: number) => void; prefix?: string; suffix?: string }) {
  return (
    <div className="relative">
      {prefix && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-[#a1a1aa]">{prefix}</span>}
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className={`w-full text-[12px] py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa] ${prefix ? "pl-6" : "pl-2"} ${suffix ? "pr-6" : "pr-2"}`}
      />
      {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-[#a1a1aa]">{suffix}</span>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#71717a] dark:text-[#a1a1aa]">{label}</span>
      <span className="text-[#18181b] dark:text-[#fafafa] font-medium">{value}</span>
    </div>
  );
}

interface DebtForm {
  totalDebt: number;
  monthlyDebtService: number;
  interestRate?: number;
  lender?: string;
  loanStartDate?: string;
  loanMaturityDate?: string;
  notes?: string;
}

function PmContactPanel({
  property,
  onSave,
}: {
  property: any;
  onSave: (form: { pmName?: string; pmEmail?: string; pmPhone?: string; pmCompany?: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    pmName: property?.pmName || "",
    pmEmail: property?.pmEmail || "",
    pmPhone: property?.pmPhone || "",
    pmCompany: property?.pmCompany || "",
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number>(0);

  useEffect(() => {
    setForm({
      pmName: property?.pmName || "",
      pmEmail: property?.pmEmail || "",
      pmPhone: property?.pmPhone || "",
      pmCompany: property?.pmCompany || "",
    });
  }, [property?._id, property?.pmEmail]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form);
      setSavedAt(Date.now());
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-5">
      <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-1">Property Manager Contact</p>
      <p className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] mb-4">Used by the "Email PM" action across rent roll and alerts.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DebtField label="PM Name">
          <input
            type="text"
            value={form.pmName}
            onChange={e => setForm({ ...form, pmName: e.target.value })}
            className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
          />
        </DebtField>
        <DebtField label="Company">
          <input
            type="text"
            value={form.pmCompany}
            onChange={e => setForm({ ...form, pmCompany: e.target.value })}
            className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
          />
        </DebtField>
        <DebtField label="Email">
          <input
            type="email"
            value={form.pmEmail}
            onChange={e => setForm({ ...form, pmEmail: e.target.value })}
            placeholder="pm@example.com"
            className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
          />
        </DebtField>
        <DebtField label="Phone">
          <input
            type="tel"
            value={form.pmPhone}
            onChange={e => setForm({ ...form, pmPhone: e.target.value })}
            className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
          />
        </DebtField>
      </div>
      <div className="flex items-center justify-end mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-[12px] font-medium bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] px-4 py-1.5 rounded cursor-pointer disabled:opacity-40"
        >
          {saving ? "Saving…" : savedAt ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}

function BudgetVsActuals({
  lines,
  budgetByLine,
  compareBudgetByLine,
  compareYear,
  setCompareYear,
  lastSyncDate,
  year,
  setYear,
  onSaveBudget,
}: {
  lines: any[];
  budgetByLine: Map<string, { annualBudget: number; isSynced: boolean; snapshotDate?: string }>;
  compareBudgetByLine: Map<string, number>;
  compareYear: string;
  setCompareYear: (y: string) => void;
  lastSyncDate: string | null;
  year: string;
  setYear: (y: string) => void;
  onSaveBudget: (lineItem: string, annualBudget: number) => Promise<void>;
}) {
  // Use income_lines as the structural source — they're already sorted by
  // _creationTime ascending and carry the hierarchyLevel sentinel from Yardi.
  // Budget values are looked up by lineItem against budgetByLine /
  // compareBudgetByLine. This mirrors the IncomeStatement hierarchy 1:1.
  type Block = {
    header: any | null;        // level-1 row
    children: any[];           // level-3 rows (editable leaves)
    totals: any[];             // level-16 / level-24 rows (computed)
    sectionTotal: any | null;  // last total in block — for inline collapsed value
    isExpense: boolean;
  };

  const blocks: Block[] = useMemo(() => {
    const out: Block[] = [];
    let cur: Block | null = null;
    for (const line of lines) {
      const lvl = line.hierarchyLevel;
      if (lvl === 1) {
        if (cur) out.push(cur);
        cur = {
          header: line,
          children: [],
          totals: [],
          sectionTotal: null,
          isExpense: /expense/i.test(line.lineItem || ""),
        };
      } else if (cur) {
        if (lvl >= 16) cur.totals.push(line);
        else cur.children.push(line);
      } else {
        if (!out.length || out[out.length - 1].header) {
          out.push({ header: null, children: [], totals: [], sectionTotal: null, isExpense: false });
        }
        const last = out[out.length - 1];
        if (lvl >= 16) last.totals.push(line);
        else last.children.push(line);
      }
    }
    if (cur) out.push(cur);
    for (const b of out) {
      // Pick the FIRST level-16 total whose name matches the header section
      // ("TOTAL <header text>"). Falls back to the first level-16 in the block
      // if no name match. Last-in-block was wrong: MISC INCOME would pick up
      // "TOTAL RENTAL REVENUE/PROPERTY INCOME" (combined rental+misc) instead
      // of "TOTAL MISC INCOME".
      if (b.totals.length && b.header) {
        const headerName = (b.header.lineItem || "").trim().toLowerCase();
        const named = b.totals.find((t: any) =>
          /^total\b/i.test((t.lineItem || "").trim()) &&
          (t.lineItem || "").toLowerCase().includes(headerName) &&
          t.hierarchyLevel === 16
        );
        b.sectionTotal = named || b.totals.find((t: any) => t.hierarchyLevel === 16) || b.totals[0];
      } else if (b.totals.length) {
        b.sectionTotal = b.totals[0];
      }
    }
    return out;
  }, [lines]);

  // Default: all sections collapsed.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [String(y - 2), String(y - 1), String(y), String(y + 1)];
  }, []);
  const compareYearOptions = useMemo(() => yearOptions.filter(y => y !== year), [yearOptions, year]);

  async function handleSave(lineItem: string) {
    const raw = drafts[lineItem];
    const val = Number(raw);
    if (!Number.isFinite(val)) return;
    setSaving(lineItem);
    try {
      await onSaveBudget(lineItem, val);
      setDrafts(d => { const next = { ...d }; delete next[lineItem]; return next; });
    } finally { setSaving(null); }
  }

  // Top-line totals across budgetable leaves only (level-3 rows).
  const totals = useMemo(() => {
    let budgetSum = 0;
    let ytdSum = 0;
    for (const b of blocks) {
      for (const c of b.children) {
        const li = (c.lineItem || "").trim();
        budgetSum += budgetByLine.get(li)?.annualBudget || 0;
        ytdSum += c.yearToDate || 0;
      }
    }
    return { budgetSum, ytdSum };
  }, [blocks, budgetByLine]);

  // Render a single row. Header rows (level-1) accept onClick to toggle expand
  // and surface the matched section TOTAL inline when collapsed. Level-3 rows
  // are the only editable leaves. Level-16/24 rows are subtotals/grand totals
  // with budget pulled from budgetByLine when present (Yardi syncs subtotals
  // too) but never editable.
  function renderRow(
    line: any,
    key: string | number,
    opts: {
      isHeader?: boolean;
      isOpen?: boolean;
      onClick?: () => void;
      budgetOverride?: number | null;
      compareBudgetOverride?: number | null;
      ytdOverride?: number | null;
      bold?: boolean;
      topBorder?: boolean;
    } = {}
  ) {
    const li = (line.lineItem || "").trim();
    const lvl = line.hierarchyLevel;
    const isLevel24 = lvl === 24;
    const isLevel16 = lvl === 16;
    const isLevel3 = lvl === 3;
    const isLevel1 = lvl === 1;

    const indent = isLevel1 ? 0 : isLevel3 ? 24 : isLevel16 ? 16 : 0;

    const entry = budgetByLine.get(li);
    const isSynced = !!entry?.isSynced;
    const budgetRaw = opts.budgetOverride !== undefined && opts.budgetOverride !== null
      ? opts.budgetOverride
      : (entry?.annualBudget || 0);
    const compareBudget = opts.compareBudgetOverride !== undefined && opts.compareBudgetOverride !== null
      ? opts.compareBudgetOverride
      : (compareBudgetByLine.get(li) || 0);
    const ytd = opts.ytdOverride !== undefined && opts.ytdOverride !== null
      ? opts.ytdOverride
      : (line.yearToDate || 0);

    const variance = ytd - budgetRaw;
    const pctUsed = budgetRaw > 0 ? (ytd / budgetRaw) * 100 : 0;
    const draft = drafts[li];
    const editing = draft !== undefined;

    // Inline edit only on level-3 leaves and only when not Yardi-synced.
    const editable = isLevel3 && !isSynced;

    const rowClass = [
      "grid grid-cols-[1fr_120px_120px_110px_80px_70px] px-4 py-1.5 text-[12px] items-center",
      opts.topBorder ? "border-t-2 border-[#18181b] dark:border-[#fafafa]" : "border-t border-[#f4f4f5] dark:border-[#27272a]",
      isLevel24 ? "bg-[#f4f4f5] dark:bg-[#27272a] font-bold text-[#18181b] dark:text-[#fafafa]" :
        isLevel16 ? "bg-[#fafafa] dark:bg-[#27272a]/60 font-semibold text-[#18181b] dark:text-[#fafafa]" :
        opts.bold ? "font-semibold text-[#18181b] dark:text-[#fafafa]" :
        "text-[#18181b] dark:text-[#fafafa]",
      opts.onClick ? "cursor-pointer hover:bg-[#fafafa]/50 dark:hover:bg-[#27272a]/40" : "",
    ].filter(Boolean).join(" ");

    const labelClass = [
      "truncate flex items-center gap-1",
      isLevel1 ? "uppercase tracking-wide font-semibold text-[#18181b] dark:text-[#fafafa] select-none" : "",
      isLevel24 ? "uppercase tracking-wide" : "",
    ].filter(Boolean).join(" ");

    const showBudget = budgetRaw !== 0;
    const showYtd = ytd !== 0;

    return (
      <div key={key} className={rowClass} onClick={opts.onClick}>
        <span style={{ paddingLeft: indent }} className={labelClass}>
          {opts.isHeader && (
            <span className="text-[10px] text-[#71717a] dark:text-[#a1a1aa] inline-block w-3">
              {opts.isOpen ? "▼" : "▶"}
            </span>
          )}
          {li}
          {isSynced && isLevel3 && (
            <span className="text-[9px] font-medium text-[#16a34a] bg-[#dcfce7] dark:bg-[#14532d]/50 dark:text-[#86efac] px-1.5 py-0.5 rounded uppercase tracking-wide">
              Yardi
            </span>
          )}
        </span>
        <span className="text-right" onClick={editable ? (e) => e.stopPropagation() : undefined}>
          {editable ? (
            <input
              type="number"
              value={editing ? draft : (budgetRaw || "")}
              placeholder="—"
              onChange={e => setDrafts(d => ({ ...d, [li]: e.target.value }))}
              className="w-full text-[12px] text-right px-2 py-1 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
            />
          ) : (
            <span
              title={isSynced ? "Synced from Yardi 12-Month Budget — manual entry disabled" : undefined}
              className="block w-full text-[12px] text-right px-2 py-1 text-[#18181b] dark:text-[#fafafa]"
            >
              {showBudget ? formatCurrency(Math.round(budgetRaw)) : "—"}
            </span>
          )}
        </span>
        <span className="text-right text-[#71717a] dark:text-[#a1a1aa]">
          {compareBudget > 0 ? formatCurrency(compareBudget) : "—"}
        </span>
        <span className="text-right text-[#71717a] dark:text-[#a1a1aa]">
          {showYtd ? formatCurrency(ytd) : "—"}
        </span>
        <span className={`text-right ${budgetRaw > 0 && variance > 0 ? "text-[#dc2626]" : budgetRaw > 0 && variance < 0 ? "text-[#16a34a]" : "text-[#a1a1aa]"}`}>
          {budgetRaw > 0 ? formatCurrency(variance) : "—"}
        </span>
        <span className={`text-right ${budgetRaw > 0 && pctUsed > 100 ? "text-[#dc2626] font-medium" : budgetRaw > 0 && pctUsed > 80 ? "text-[#d97706]" : "text-[#71717a] dark:text-[#a1a1aa]"}`}>
          {budgetRaw > 0 ? `${Math.round(pctUsed)}%` : "—"}
        </span>
        <span className="text-right" onClick={editable ? (e) => e.stopPropagation() : undefined}>
          {editable && editing && (
            <button
              onClick={() => handleSave(li)}
              disabled={saving === li}
              className="text-[10px] font-medium bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] px-2 py-0.5 rounded cursor-pointer disabled:opacity-40"
            >
              {saving === li ? "…" : "Save"}
            </button>
          )}
        </span>
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-8 text-center">
        <p className="text-[13px] text-[#71717a] dark:text-[#a1a1aa]">No income statement data yet. Run a Yardi sync to populate.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa]">
            {lastSyncDate
              ? "Annual budgets are synced from Yardi's 12-Month Budget report; actuals come from the latest income statement YTD."
              : "Enter annual budget per line item; actuals come from the latest income statement YTD."}
          </p>
          {lastSyncDate && (
            <p className="text-[10px] text-[#16a34a] mt-0.5">
              Synced from Yardi 12-Month Budget on {new Date(lastSyncDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
            </p>
          )}
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-0.5">
            Budgeted: <span className="font-medium text-[#18181b] dark:text-[#fafafa]">{formatCurrency(Math.round(totals.budgetSum))}</span> ·
            YTD Actual: <span className="font-medium text-[#18181b] dark:text-[#fafafa]">{formatCurrency(totals.ytdSum)}</span> ·
            Variance: <span className={`font-medium ${totals.ytdSum - totals.budgetSum > 0 ? "text-[#dc2626]" : "text-[#16a34a]"}`}>
              {formatCurrency(Math.round(totals.ytdSum - totals.budgetSum))}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <label className="text-[9px] font-medium text-[#a1a1aa] uppercase tracking-wide">Year</label>
            <select
              value={year}
              onChange={e => setYear(e.target.value)}
              className="text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] font-medium text-[#a1a1aa] uppercase tracking-wide">Compare to</label>
            <select
              value={compareYear}
              onChange={e => setCompareYear(e.target.value)}
              className="text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
            >
              {compareYearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_120px_110px_80px_70px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
          <span>Line Item</span>
          <span className="text-right">{year} Budget</span>
          <span className="text-right">{compareYear} Budget</span>
          <span className="text-right">YTD Actual</span>
          <span className="text-right">Variance $</span>
          <span className="text-right">% Used</span>
          <span></span>
        </div>

        {blocks.map((block, bi) => {
          const headerLi = block.header ? (block.header.lineItem || "").trim() : "";
          const isOpen = block.header ? !!expanded[headerLi] : true;

          // Bigger visual gap when crossing the income/expense boundary.
          const prev = bi > 0 ? blocks[bi - 1] : null;
          const gapClass =
            bi === 0
              ? ""
              : prev && prev.isExpense !== block.isExpense
                ? "mt-2 border-t-2 border-[#e4e4e7] dark:border-[#3f3f46]"
                : "";

          // When collapsed, surface the section's matched TOTAL row's values
          // inline (budget + YTD + compareBudget) so the section reads as a
          // one-liner without needing to expand.
          let inlineBudget: number | null = null;
          let inlineCompareBudget: number | null = null;
          let inlineYtd: number | null = null;
          if (block.header && !isOpen && block.sectionTotal) {
            const totalLi = (block.sectionTotal.lineItem || "").trim();
            inlineBudget = budgetByLine.get(totalLi)?.annualBudget || 0;
            inlineCompareBudget = compareBudgetByLine.get(totalLi) || 0;
            inlineYtd = block.sectionTotal.yearToDate || 0;
          }

          return (
            <div key={bi} className={gapClass}>
              {block.header && renderRow(block.header, `h-${bi}`, {
                isHeader: true,
                isOpen,
                onClick: () => setExpanded(s => ({ ...s, [headerLi]: !s[headerLi] })),
                budgetOverride: inlineBudget,
                compareBudgetOverride: inlineCompareBudget,
                ytdOverride: inlineYtd,
              })}

              {isOpen && block.children.map((c, ci) => renderRow(c, `c-${bi}-${ci}`))}

              {isOpen && block.totals.map((t, ti) => {
                const isGrand = t.hierarchyLevel === 24;
                return renderRow(t, `t-${bi}-${ti}`, {
                  bold: isGrand,
                  topBorder: isGrand,
                });
              })}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-2">
        Tip: click a section header to expand. Inline-edit budget on leaf rows; subtotals and grand totals are computed from Yardi.
      </p>
    </div>
  );
}

// High-level Budget vs Actuals — only shows section headers + subtotals +
// grand totals (no leaf line items). Compares both the current month and
// YTD against budget. Budget month = monthlyBudgets[month_index]; budget
// YTD = sum of monthlyBudgets[0..current_month_index]. Year defaults to
// the income statement period's year so May 2026 actuals compare against
// 2026 budget without the user needing to pick.
function BudgetVsActualsHighLevel({
  propertyId,
  lines,
  period,
  allHistoricLines,
  availablePeriods,
}: {
  propertyId: string | undefined;
  lines: any[];
  period: string | null;
  allHistoricLines: any[];
  availablePeriods: string[];
}) {
  // The user can pick ANY period that has data; both the budget AND the
  // actuals re-key off this. Defaults to the latest period (the income
  // statement's current period).
  const [selectedPeriod, setSelectedPeriod] = useState<string>(period || availablePeriods[0] || "");
  useEffect(() => {
    if (period && !availablePeriods.includes(selectedPeriod)) setSelectedPeriod(period);
  }, [period, availablePeriods]);

  // Year derived from selected period (e.g. "2026-05" -> "2026")
  const year = selectedPeriod ? selectedPeriod.split("-")[0] : String(new Date().getFullYear());
  const { budgets } = useLineBudgets(propertyId, year);
  const budgetByLine = useMemo(() => {
    const m = new Map<string, { annualBudget: number; monthlyBudgets?: number[] }>();
    for (const b of budgets) {
      m.set((b.lineItem || "").trim(), {
        annualBudget: b.annualBudget || 0,
        monthlyBudgets: (b as any).monthlyBudgets,
      });
    }
    return m;
  }, [budgets]);

  // Calendar month index from selected period
  const currentMonthIdx = useMemo(() => {
    if (selectedPeriod) {
      const m = selectedPeriod.split("-")[1];
      const n = Number(m);
      if (Number.isFinite(n)) return n - 1;
    }
    return Math.max(0, new Date().getMonth() - 1);
  }, [selectedPeriod]);

  // For non-current periods, look up actual values from the historic
  // income_lines snapshots. Each (lineItem, period) pair → the latest
  // snapshot's currentPeriod + yearToDate values.
  const actualsForPeriod = useMemo(() => {
    const m = new Map<string, { currentPeriod: number; yearToDate: number }>();
    if (!selectedPeriod) return m;
    if (period && selectedPeriod === period) {
      // Use the live latest-snapshot values from `lines` directly
      for (const l of lines) {
        const li = (l.lineItem || "").trim();
        if (li) m.set(li, { currentPeriod: l.currentPeriod || 0, yearToDate: l.yearToDate || 0 });
      }
      return m;
    }
    // Historic period: find rows with matching period, pick the latest snapshot
    const matching = allHistoricLines.filter((l: any) => l.period === selectedPeriod);
    if (matching.length === 0) return m;
    // Group by snapshotDate, keep latest
    const latestSnap = matching.reduce((acc: string, r: any) => (r.snapshotDate || "") > acc ? (r.snapshotDate || "") : acc, "");
    for (const l of matching) {
      if (l.snapshotDate !== latestSnap) continue;
      const li = (l.lineItem || "").trim();
      if (li) m.set(li, { currentPeriod: l.currentPeriod || 0, yearToDate: l.yearToDate || 0 });
    }
    return m;
  }, [selectedPeriod, period, lines, allHistoricLines]);

  const periodOptions = availablePeriods.length > 0 ? availablePeriods : (period ? [period] : []);

  // High-level filter: ONLY section headers (level 1) + grand totals (level 24).
  // Section subtotals (level 16, e.g. TOTAL RENTAL REVENUE, TOTAL MISC INCOME)
  // are hidden — section header rows already show that value inline via the
  // rollup logic.
  const highLevelRows = useMemo(() => {
    return lines.filter((l: any) => {
      const li = (l.lineItem || "").trim();
      if (!li) return false;
      return l.hierarchyLevel === 1 || l.hierarchyLevel === 24;
    });
  }, [lines]);

  // Walk the FULL income statement to map section/total rows to their leaf
  // children. Budget table only carries leaf items (Yardi parser drops
  // section headers + TOTAL rows), so rollup happens here in the UI.
  // Strategy: walk lines top-to-bottom; track the currently open level-1
  // section header. Every level-3 row "belongs to" the current section.
  // When we hit a level-16 TOTAL, it closes the current section. Level-24
  // grand totals roll up across all sections walked since the last grand
  // total.
  const lineBudgetRollup = useMemo(() => {
    const result = new Map<string, { monthBudget: number; ytdBudget: number; hasBudget: boolean }>();
    // Build leaf budget lookup
    function leafBudget(name: string) {
      const b = budgetByLine.get(name);
      if (!b) return null;
      const monthly = b.monthlyBudgets;
      if (Array.isArray(monthly) && monthly.length === 12) {
        return {
          month: monthly[currentMonthIdx] || 0,
          ytd: monthly.slice(0, currentMonthIdx + 1).reduce((s, v) => s + (v || 0), 0),
          annual: b.annualBudget || 0,
        };
      }
      return {
        month: (b.annualBudget || 0) / 12,
        ytd: ((b.annualBudget || 0) / 12) * (currentMonthIdx + 1),
        annual: b.annualBudget || 0,
      };
    }

    let currentSection: string | null = null;
    let sectionLeaves: string[] = [];
    let allLeavesSinceGrandTotal: string[] = [];

    function flushSection(totalLineName: string) {
      let mSum = 0, ySum = 0;
      let any = false;
      for (const leafName of sectionLeaves) {
        const lb = leafBudget(leafName);
        if (!lb) continue;
        mSum += lb.month;
        ySum += lb.ytd;
        if (lb.annual !== 0 || lb.month !== 0) any = true;
      }
      result.set(totalLineName, { monthBudget: mSum, ytdBudget: ySum, hasBudget: any });
      sectionLeaves = [];
    }

    function flushGrand(grandLineName: string) {
      let mSum = 0, ySum = 0;
      let any = false;
      for (const leafName of allLeavesSinceGrandTotal) {
        const lb = leafBudget(leafName);
        if (!lb) continue;
        mSum += lb.month;
        ySum += lb.ytd;
        if (lb.annual !== 0 || lb.month !== 0) any = true;
      }
      result.set(grandLineName, { monthBudget: mSum, ytdBudget: ySum, hasBudget: any });
      allLeavesSinceGrandTotal = [];
    }

    for (const l of lines) {
      const li = (l.lineItem || "").trim();
      if (!li) continue;
      const lvl = l.hierarchyLevel;
      const isTotal = /^total\b|^net\b/i.test(li);

      if (lvl === 1 && !isTotal) {
        currentSection = li;
        // Header: rollup will be all leaves under this section. Computed
        // when we hit the next level-16 TOTAL (which closes the section).
        // For now, also pre-store the header with running section sum so
        // it shows leaf totals BEFORE the closing TOTAL row hits.
        continue;
      }
      if (lvl === 3) {
        sectionLeaves.push(li);
        allLeavesSinceGrandTotal.push(li);
        // Also store leaf rollup directly (for cases where leaves render)
        const lb = leafBudget(li);
        if (lb) result.set(li, { monthBudget: lb.month, ytdBudget: lb.ytd, hasBudget: lb.annual !== 0 || lb.month !== 0 });
        continue;
      }
      if (isTotal && lvl === 16) {
        flushSection(li);
        continue;
      }
      if (isTotal && lvl === 24) {
        flushGrand(li);
        continue;
      }
    }

    // Also compute a per-section-header budget by summing the leaves
    // grouped by parentLine (covers the level-1 header rows that need
    // a budget value when collapsed).
    const leavesByParent = new Map<string, string[]>();
    for (const l of lines) {
      if (l.hierarchyLevel === 3 && l.parentLine) {
        const list = leavesByParent.get(l.parentLine) || [];
        list.push((l.lineItem || "").trim());
        leavesByParent.set(l.parentLine, list);
      }
    }
    leavesByParent.forEach((leafNames, parent) => {
      let mSum = 0, ySum = 0, any = false;
      for (const n of leafNames) {
        const lb = leafBudget(n);
        if (!lb) continue;
        mSum += lb.month;
        ySum += lb.ytd;
        if (lb.annual !== 0 || lb.month !== 0) any = true;
      }
      if (!result.has(parent)) {
        result.set(parent, { monthBudget: mSum, ytdBudget: ySum, hasBudget: any });
      }
    });

    // Compute TOTAL INCOME, TOTAL OPERATING EXPENSE, NOI, NET INCOME via
    // a separate walk that tracks income vs expense mode. The earlier walk
    // didn't roll TOTAL OPERATING EXPENSE correctly because nested
    // sub-section TOTALs (TOTAL COMMON AREA EXPENSES, etc.) reset the leaf
    // accumulator before we reached the wrapping TOTAL OPERATING EXPENSE.
    let mode: "income" | "expense" = "income";
    const incomeLeaves: string[] = [];
    const expenseLeaves: string[] = [];
    for (const l of lines) {
      const li = (l.lineItem || "").trim();
      if (!li) continue;
      const lvl = l.hierarchyLevel;
      const isTotal = /^total\b|^net\b/i.test(li);
      if (lvl === 1 && !isTotal && /operating\s+expense/i.test(li)) {
        mode = "expense";
      }
      if (lvl === 3) {
        if (mode === "income") incomeLeaves.push(li);
        else expenseLeaves.push(li);
      }
    }
    const sumLeaves = (names: string[]) => {
      let m = 0, y = 0, any = false;
      for (const n of names) {
        const lb = leafBudget(n);
        if (!lb) continue;
        m += lb.month; y += lb.ytd;
        if (lb.annual !== 0 || lb.month !== 0) any = true;
      }
      return { monthBudget: m, ytdBudget: y, hasBudget: any };
    };
    const incomeR = sumLeaves(incomeLeaves);
    const opExpR = sumLeaves(expenseLeaves);
    // Override the walk's values for the canonical 4 grand totals
    for (const l of lines) {
      const li = (l.lineItem || "").trim();
      if (/^total\s+income\s*$/i.test(li)) {
        result.set(li, incomeR);
      }
      if (/^total\s+(operating\s+)?expense/i.test(li)) {
        result.set(li, opExpR);
      }
      if (/net\s+operating\s+income/i.test(li) || /^net\s+income\s*\(loss\)/i.test(li)) {
        result.set(li, {
          monthBudget: incomeR.monthBudget - opExpR.monthBudget,
          ytdBudget: incomeR.ytdBudget - opExpR.ytdBudget,
          hasBudget: incomeR.hasBudget || opExpR.hasBudget,
        });
      }
    }

    return result;
  }, [lines, budgetByLine, currentMonthIdx]);

  function getBudgetForLine(li: string) {
    const r = lineBudgetRollup.get(li);
    if (r) return r;
    return { monthBudget: 0, ytdBudget: 0, hasBudget: false };
  }

  const periodLabel = period ? formatPeriodShort(period) : "Current";
  const hasAnyBudgetData = budgets.some((b: any) => (b.annualBudget || 0) !== 0 || (Array.isArray(b.monthlyBudgets) && b.monthlyBudgets.some((v: number) => v !== 0)));

  return (
    <>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-[12px] text-[#71717a] dark:text-[#a1a1aa]">
          <span>Period</span>
          <select
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(e.target.value)}
            className="text-[12px] px-2 py-1 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
          >
            {periodOptions.length === 0 && <option value="">No data</option>}
            {periodOptions.map(p => (
              <option key={p} value={p}>{formatPeriodShort(p)}</option>
            ))}
          </select>
          <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">
            (budget pulled from {year} fiscal year)
          </span>
        </div>
        {!hasAnyBudgetData && (
          <span className="text-[11px] text-[#d97706] dark:text-[#fbbf24]">
            No Yardi budget for {year}. Showing actuals only — run a sync to populate.
          </span>
        )}
      </div>
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_110px_110px_90px_110px_110px_90px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
        <span>Line Item</span>
        <span className="text-right">{periodLabel} Actual</span>
        <span className="text-right">{periodLabel} Budget</span>
        <span className="text-right">Var %</span>
        <span className="text-right">YTD Actual</span>
        <span className="text-right">YTD Budget</span>
        <span className="text-right">Var %</span>
      </div>
      {highLevelRows.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-[12px] text-[#a1a1aa] dark:text-[#71717a]">No income statement data yet.</p>
        </div>
      ) : highLevelRows.map((line: any, i: number) => {
        const li = (line.lineItem || "").trim();
        const lvl = line.hierarchyLevel;
        const isLevel1 = lvl === 1;
        const isLevel16 = lvl === 16;
        const isLevel24 = lvl === 24;
        const isSubtotal = /^total\b|^net\b/i.test(li);
        const indent = isLevel1 ? 0 : isLevel16 ? 16 : 0;

        // For the selected period, look up actuals from the period-aware
        // map. For section-header rows (level 1) the snapshot stores 0;
        // roll up the leaf actuals to that header instead.
        const periodActuals = actualsForPeriod.get(li);
        let monthActual = periodActuals?.currentPeriod ?? (line.currentPeriod || 0);
        let ytdActual = periodActuals?.yearToDate ?? (line.yearToDate || 0);
        if (isLevel1 && (monthActual === 0 || ytdActual === 0)) {
          // Section header — sum its level-3 leaves' actuals
          let cpSum = 0, ytdSum = 0;
          for (const l of lines) {
            if (l.hierarchyLevel === 3 && l.parentLine === li) {
              const a = actualsForPeriod.get((l.lineItem || "").trim());
              cpSum += a?.currentPeriod ?? (l.currentPeriod || 0);
              ytdSum += a?.yearToDate ?? (l.yearToDate || 0);
            }
          }
          if (monthActual === 0) monthActual = cpSum;
          if (ytdActual === 0) ytdActual = ytdSum;
        }
        const { monthBudget, ytdBudget, hasBudget } = getBudgetForLine(li);

        const monthVarPct = monthBudget !== 0 ? ((monthActual - monthBudget) / Math.abs(monthBudget)) * 100 : null;
        const ytdVarPct = ytdBudget !== 0 ? ((ytdActual - ytdBudget) / Math.abs(ytdBudget)) * 100 : null;

        const rowClass = [
          "grid grid-cols-[1fr_110px_110px_90px_110px_110px_90px] px-4 py-1.5 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a]",
          isLevel24 ? "bg-[#f4f4f5] dark:bg-[#27272a] font-bold border-t-2 border-[#18181b] dark:border-[#fafafa]" :
            isLevel16 ? "bg-[#fafafa] dark:bg-[#27272a]/60 font-semibold" :
            isLevel1 ? "uppercase tracking-wide font-semibold" : "",
          "text-[#18181b] dark:text-[#fafafa]",
        ].filter(Boolean).join(" ");

        return (
          <div key={i} className={rowClass}>
            <span style={{ paddingLeft: indent }} className="truncate">{li}</span>
            <span className={`text-right ${monthActual < 0 ? "text-[#dc2626]" : ""}`}>
              {monthActual === 0 ? "—" : formatCurrency(Math.abs(monthActual))}
            </span>
            <span className="text-right text-[#71717a] dark:text-[#a1a1aa]">
              {hasBudget ? formatCurrency(Math.round(Math.abs(monthBudget))) : "—"}
            </span>
            <span className={`text-right ${monthVarPct === null ? "text-[#a1a1aa]" : monthVarPct >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
              {monthVarPct === null ? "—" : `${monthVarPct >= 0 ? "+" : ""}${monthVarPct.toFixed(0)}%`}
            </span>
            <span className={`text-right ${ytdActual < 0 ? "text-[#dc2626]" : ""}`}>
              {ytdActual === 0 ? "—" : formatCurrency(Math.abs(ytdActual))}
            </span>
            <span className="text-right text-[#71717a] dark:text-[#a1a1aa]">
              {hasBudget ? formatCurrency(Math.round(Math.abs(ytdBudget))) : "—"}
            </span>
            <span className={`text-right ${ytdVarPct === null ? "text-[#a1a1aa]" : ytdVarPct >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
              {ytdVarPct === null ? "—" : `${ytdVarPct >= 0 ? "+" : ""}${ytdVarPct.toFixed(0)}%`}
            </span>
          </div>
        );
      })}
      </div>
    </>
  );
}

// Summary panel showing the 4 income-statement grand totals (TOTAL INCOME,
// TOTAL OPERATING EXPENSE, NET OPERATING INCOME (LOSS), NET INCOME (LOSS))
// at the top of the Income Statement view. Always visible by default —
// before the user expands any section. Pulls current + compare values for
// each row.
function ISSummaryPanel({
  lines,
  compareIndex,
  comparePeriod,
  currentPeriod,
}: {
  lines: any[];
  compareIndex: Map<string, { currentPeriod: number; yearToDate: number }> | null;
  comparePeriod: string | null;
  currentPeriod: string | null;
}) {
  const KEY_TOTALS = [
    { match: /^total\s+income\s*$/i, label: "Total Income", color: "text-[#16a34a]" },
    { match: /^total\s+(operating\s+)?expense\s*$/i, label: "Total Operating Expense", color: "text-[#dc2626]" },
    { match: /^net\s+operating\s+income/i, label: "NOI (Net Operating Income)", color: "text-[#16a34a]", emphasized: true },
    { match: /^net\s+income\s*\(loss\)/i, label: "Net Income (Loss)", color: "text-[#16a34a]", emphasized: true },
  ];

  const found = KEY_TOTALS.map(t => {
    const row = lines.find((l: any) => t.match.test((l.lineItem || "").trim()));
    if (!row) return null;
    const li = (row.lineItem || "").trim();
    const cp = row.currentPeriod || 0;
    const ytd = row.yearToDate || 0;
    const cmp = compareIndex?.get(li)?.currentPeriod ?? null;
    const cmpYtd = compareIndex?.get(li)?.yearToDate ?? null;
    const variance = cmp !== null ? cp - cmp : null;
    const variancePct = cmp !== null && cmp !== 0 ? (variance! / Math.abs(cmp)) * 100 : null;
    const ytdVariance = cmpYtd !== null ? ytd - cmpYtd : null;
    const ytdVariancePct = cmpYtd !== null && cmpYtd !== 0 ? (ytdVariance! / Math.abs(cmpYtd)) * 100 : null;
    return { spec: t, line: row, cp, ytd, cmp, variance, variancePct, ytdVariance, ytdVariancePct };
  }).filter(Boolean) as any[];

  if (found.length === 0) return null;

  const cpLabel = currentPeriod ? formatPeriodShort(currentPeriod) : "Current";
  const cmpLabel = comparePeriod ? formatPeriodShort(comparePeriod) : "Prior";

  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden mb-4">
      <div className="grid grid-cols-[1fr_120px_120px_90px_120px_120px_90px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
        <span>Summary</span>
        <span className="text-right">{cpLabel}</span>
        <span className="text-right">{cmpLabel}</span>
        <span className="text-right">Var %</span>
        <span className="text-right">YTD</span>
        <span className="text-right">YTD {cmpLabel}</span>
        <span className="text-right">Var %</span>
      </div>
      {found.map((f: any, i: number) => {
        const isNeg = f.cp < 0;
        return (
          <div
            key={i}
            className={`grid grid-cols-[1fr_120px_120px_90px_120px_120px_90px] px-4 py-2 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] ${
              f.spec.emphasized ? "bg-[#fafafa] dark:bg-[#27272a]/60 font-bold text-[#18181b] dark:text-[#fafafa]" : "font-semibold text-[#18181b] dark:text-[#fafafa]"
            }`}
          >
            <span className="truncate">{f.spec.label}</span>
            <span className={`text-right ${isNeg ? "text-[#dc2626]" : ""}`}>
              {f.cp === 0 ? "—" : formatCurrency(Math.abs(f.cp))}
            </span>
            <span className={`text-right text-[#71717a] dark:text-[#a1a1aa]`}>
              {f.cmp === null || f.cmp === 0 ? "—" : formatCurrency(Math.abs(f.cmp))}
            </span>
            <span className={`text-right ${f.variancePct === null ? "text-[#a1a1aa]" : f.variancePct >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
              {f.variancePct === null ? "—" : `${f.variancePct >= 0 ? "+" : ""}${f.variancePct.toFixed(0)}%`}
            </span>
            <span className={`text-right ${f.ytd < 0 ? "text-[#dc2626]" : ""}`}>
              {f.ytd === 0 ? "—" : formatCurrency(Math.abs(f.ytd))}
            </span>
            <span className={`text-right text-[#71717a] dark:text-[#a1a1aa]`}>
              {f.ytdVariance === null ? "—" : f.cmp === null || compareIndex?.get((f.line.lineItem||"").trim())?.yearToDate === undefined ? "—" : formatCurrency(Math.abs(f.ytd - f.ytdVariance))}
            </span>
            <span className={`text-right ${f.ytdVariancePct === null ? "text-[#a1a1aa]" : f.ytdVariancePct >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
              {f.ytdVariancePct === null ? "—" : `${f.ytdVariancePct >= 0 ? "+" : ""}${f.ytdVariancePct.toFixed(0)}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

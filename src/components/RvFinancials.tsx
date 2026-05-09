"use client";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useRvFinancials, useRvLastUpdated, useDebt, formatCurrency, formatLastUpdated } from "@/hooks/useConvexData";

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
  // "Net Income (Loss)" / "Net Operating Income" / "Net Other Income" carry
  // actual roll-up dollar values in the xlsx but no numeric prefix or
  // subsidiary tag. Treat them as grand-total subtotals so the BudgetRow
  // / IS rendering surfaces the numbers instead of greying them out as
  // pure section headers.
  if (/^Net\s+(Income|Operating|Ordinary|Other)/i.test(li)) return "subtotal";
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

// Strip the GL account code prefix off line-item labels so the IS reads
// as plain category names ("RV Seasonal Rent", "Late Payment and NSF Fees")
// instead of Northgate's internal numbering ("4020-120 - RV Seasonal Rent").
// Three label patterns to handle:
//   1. "Total - NNNN-NNN - Total Foo" → "Total Foo"
//   2. "NNNN-000 - Total Foo"         → "Foo"   (block header, leading "Total" dropped)
//   3. "NNNN-NNN - Foo"               → "Foo"
function cleanLabel(li: string, opts: { stripLeadingTotal?: boolean } = {}): string {
  const raw = String(li || "").trim();
  if (!raw) return "";
  // Subtotal with full numeric code: "Total - NNNN-NNN - Total Foo" →
  // "Total Foo". Strip the prefix entirely; the suffix already starts with
  // "Total ", so the cleaned label reads naturally.
  let s = raw.replace(/^Total\s*-\s*\d{4}-\d{3}\s*-\s*/i, "");
  // Top-level subtotals don't carry a numeric code: "Total - Income" /
  // "Total - Cost Of Sales" / "Total - Operating Expense". Drop the dash
  // and tighten whitespace so they read as "Total Income" / "Total Cost
  // Of Sales".
  s = s.replace(/^Total\s*-\s*/i, "Total ");
  // Header / leaf: strip the bare "NNNN-NNN - " prefix
  s = s.replace(/^\d{4}-\d{3}\s*-\s*/, "");
  // Block header gets its leading "Total" dropped — collapsed row reads as
  // the section name ("RV Income"), expanded view shows "Total RV Income"
  // as the closing subtotal.
  if (opts.stripLeadingTotal) {
    s = s.replace(/^Total\s+/i, "");
  }
  return s;
}

// True when a row carries no numeric content anywhere — these get hidden
// inside expanded blocks so users don't scan past zero rows. Subsidiary
// tag alone (e.g. "Lake Wapusun" attached to a placeholder line) does NOT
// rescue an otherwise-empty row from the filter — the user explicitly
// asked for empties to be dropped on expand.
function isRowEmpty(r: Row): boolean {
  return (
    Math.abs(r.amountMtd || 0) < 0.0001 &&
    Math.abs(r.amountYtd || 0) < 0.0001 &&
    Math.abs(r.budgetMtd || 0) < 0.0001 &&
    Math.abs(r.budgetYtd || 0) < 0.0001
  );
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
  const [view, setView] = useState<"statement" | "budget" | "debt">("statement");
  // Selected historical snapshot. `null` = latest committed period (the
  // useRvFinancials hook treats `undefined` as "latest"). The dropdown lets
  // the user pivot the IS / Budget vs Actuals tables to any past month
  // matching the commercial /financials Period selector pattern.
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const { financials, periods, loading } = useRvFinancials(propertyId, selectedPeriod);
  const { committedAt, period: lastBundlePeriod } = useRvLastUpdated(propertyId);
  const lastUpdated = formatLastUpdated(committedAt, lastBundlePeriod);

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
            Drop the monthly bundle (with the Northgate Financial Package xlsx) in <span className="font-medium">Pipeline Uploads</span>.
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

  // Subtitle reflects the active tab so the page header reads correctly
  // when the user lands on Budget vs Actuals or Debt & DSCR.
  const tabSubtitle =
    view === "budget"
      ? `Budget vs Actuals · ${subtitlePeriod}`
      : view === "debt"
      ? "Debt & DSCR"
      : `Income Statement · ${subtitlePeriod}`;

  return (
    <div>
      <PageHeader
        title="Financials"
        subtitle={`${tabSubtitle}${lastUpdated ? ` · ${lastUpdated}` : ""}`}
      />

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

      {/* Tab switcher — matches the commercial /financials page exactly */}
      <TabbedContent
        lines={lines}
        totals={totals}
        periodLabel={periodLabel}
        propertyId={propertyId}
        view={view}
        onView={setView}
        periods={periods}
        selectedPeriod={selectedPeriod ?? period}
        onChangeSelectedPeriod={setSelectedPeriod}
      />
    </div>
  );
}

type Totals = {
  income: number;
  incomeBudget: number;
  incomeYtd: number;
  incomeYtdBudget: number;
  expense: number;
  expenseBudget: number;
  expenseYtd: number;
  expenseYtdBudget: number;
  noi: number;
  noiBudget: number;
  noiYtd: number;
  noiYtdBudget: number;
};

function TabbedContent({
  lines,
  totals,
  periodLabel,
  propertyId,
  view,
  onView,
  periods,
  selectedPeriod,
  onChangeSelectedPeriod,
}: {
  lines: Row[];
  totals: Totals;
  periodLabel: string;
  propertyId: string;
  view: "statement" | "budget" | "debt";
  onView: (v: "statement" | "budget" | "debt") => void;
  periods: string[];
  selectedPeriod: string | null;
  onChangeSelectedPeriod: (p: string | null) => void;
}) {
  const setView = onView;
  // Period selector only matters for the IS + Budget vs Actuals tabs. Debt &
  // DSCR is sourced from a separate property_debt feed and isn't period-aware.
  const showPeriodSelector = view !== "debt" && periods.length > 0;
  return (
    <>
      {/* Tab switcher styled identically to commercial /financials */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-[#f4f4f5] dark:bg-[#27272a] rounded-md p-0.5 w-fit">
          {(
            [
              { key: "statement", label: "Income Statement" },
              { key: "budget", label: "Budget vs Actuals" },
              { key: "debt", label: "Debt & DSCR" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`text-[12px] font-medium px-3 py-1.5 rounded cursor-pointer transition-colors ${
                view === t.key
                  ? "bg-white dark:bg-[#18181b] text-[#18181b] dark:text-[#fafafa] shadow-sm"
                  : "text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {showPeriodSelector && (
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] font-medium uppercase tracking-wide">
              Period
            </label>
            <select
              value={selectedPeriod || ""}
              onChange={(e) => onChangeSelectedPeriod(e.target.value || null)}
              className="text-[12px] px-2 py-1 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a]"
            >
              {[...periods].sort().reverse().map((p) => (
                <option key={p} value={p}>
                  {formatPeriodLabel(p)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {view === "statement" && (
        <>
          <SummaryPanel totals={totals} periodLabel={periodLabel} />
          <IncomeStatementTable lines={lines} totalIncome={totals.income} periodLabel={periodLabel} />
        </>
      )}
      {view === "budget" && (
        <BudgetVsActualsView lines={lines} totals={totals} periodLabel={periodLabel} />
      )}
      {view === "debt" && (
        <DebtAndDscrView noi={totals.noi} propertyId={propertyId} />
      )}
    </>
  );
}

// Budget vs Actuals — flat IS-style table matching the Hollister/Belgold
// reference. Same hierarchy + row palette as the Income Statement, but no
// collapsibility (every row visible) and the columns are
//   Line Item | <period> Actual | <period> Budget | Var % | YTD Actual | YTD Budget | YTD Var %
function BudgetVsActualsView({
  lines,
  totals: _totals,
  periodLabel,
}: {
  lines: Row[];
  totals: Totals;
  periodLabel: string;
}) {
  void _totals;
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_140px_140px_90px_140px_140px_90px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2.5 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
        <span>Line Item</span>
        <span className="text-right">{periodLabel} Actual</span>
        <span className="text-right">{periodLabel} Budget</span>
        <span className="text-right">Var %</span>
        <span className="text-right">YTD Actual</span>
        <span className="text-right">YTD Budget</span>
        <span className="text-right">Var %</span>
      </div>
      {lines.map((r: Row, i: number) => (
        <BudgetRow key={`${r._id}-${i}`} row={r} />
      ))}
    </div>
  );
}

function BudgetRow({ row }: { row: Row }) {
  const kind = classifyLine(row);
  if (kind === "skip") return null;
  // Budget vs Actuals matches Belgold's high-level layout: ONLY section
  // headers + grand totals. Subgroup openers, leaves, and intermediate
  // subtotals all collapse out so the table reads as a compact P&L summary.
  if (kind === "leaf" || kind === "subgroup") return null;
  const li = String(row.lineItem || "").trim();
  if (/^Ordinary\s+Income\/Expense$/i.test(li)) return null;
  // Closing X-000 subtotals (like "Total RV Income", "Total SRDE Income")
  // are still per-section, so keep the GRAND totals only ("Total Income",
  // "Total Operating Expense", "Net Operating Income", "Net Income").
  // Closing X-000 subtotals match `Total - NNNN-NNN - X`; everything else
  // labelled "Total " without a numeric code is a grand total and stays.
  if (/^Total\s*-\s*\d{4}-\d{3}/i.test(li)) return null;

  const displayLabel = cleanLabel(li);
  // Leaves and subgroups were filtered above; only headers and grand-total
  // subtotals reach here.
  const indent = 0;

  // Grand totals (Total Income, Total Operating Expense, NOI, Net Income (Loss))
  // get the same uppercase + bold + tinted bg treatment as the IS table so
  // both tabs surface the headline numbers identically.
  const isGrandTotal = kind === "subtotal" && !/\d{4}-\d{3}/.test(li);
  const rowClass = [
    "grid grid-cols-[1fr_140px_140px_90px_140px_140px_90px] px-4 py-1.5 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] items-center",
    kind === "header"
      ? "bg-[#f4f4f5] dark:bg-[#27272a] uppercase tracking-wide font-semibold text-[#18181b] dark:text-[#fafafa]"
      : isGrandTotal
      ? "bg-[#f4f4f5] dark:bg-[#27272a] uppercase tracking-wide font-bold text-[#18181b] dark:text-[#fafafa]"
      : "bg-[#fafafa] dark:bg-[#27272a]/60 font-semibold text-[#18181b] dark:text-[#fafafa]",
  ].join(" ");

  const mtd = row.amountMtd || 0;
  const budgetMtd = row.budgetMtd || 0;
  const ytd = row.amountYtd || 0;
  const budgetYtd = row.budgetYtd || 0;
  const varPctMtd = budgetMtd !== 0 ? (mtd - budgetMtd) / Math.abs(budgetMtd) : null;
  const varPctYtd = budgetYtd !== 0 ? (ytd - budgetYtd) / Math.abs(budgetYtd) : null;
  const isExpense = isExpenseContext(li);

  function pctColor(p: number | null) {
    if (p == null || Math.abs(p) < 0.0001) return "text-[#71717a] dark:text-[#a1a1aa]";
    // Income: positive = green, negative = red. Expense: positive = red, negative = green.
    const positive = p >= 0;
    if (isExpense) return positive ? "text-[#dc2626]" : "text-[#16a34a]";
    return positive ? "text-[#16a34a]" : "text-[#dc2626]";
  }

  const showPctMtd =
    varPctMtd != null && Number.isFinite(varPctMtd) && Math.abs(varPctMtd) > 0.0001;
  const showPctYtd =
    varPctYtd != null && Number.isFinite(varPctYtd) && Math.abs(varPctYtd) > 0.0001;
  const showValues = kind !== "header";

  // Render with sign preserved — Net Income / Net Operating Income can be
  // negative when the property's losing money, and stripping the sign with
  // Math.abs flipped a loss into a positive figure ("$8,643" displayed for
  // an actual −$8,643 NOI). Negative actuals now also colour red.
  function fmtSigned(v: number): string {
    if (v === 0) return "—";
    return v < 0 ? `−${formatCurrency(Math.abs(v))}` : formatCurrency(v);
  }
  function actualClass(v: number) {
    return v < 0 ? "text-[#dc2626]" : "text-[#18181b] dark:text-[#fafafa]";
  }

  return (
    <div className={rowClass}>
      <span style={{ paddingLeft: indent }} className="truncate" title={displayLabel}>
        {displayLabel}
      </span>
      <span className={`text-right tabular-nums ${actualClass(mtd)}`}>
        {!showValues ? "—" : fmtSigned(mtd)}
      </span>
      <span className="text-right tabular-nums text-[#71717a] dark:text-[#a1a1aa]">
        {!showValues || budgetMtd === 0 ? "—" : fmtSigned(budgetMtd)}
      </span>
      <span className={`text-right tabular-nums text-[11px] ${pctColor(varPctMtd)}`}>
        {showPctMtd ? formatPctSigned(varPctMtd) : "—"}
      </span>
      <span className={`text-right tabular-nums ${actualClass(ytd)}`}>
        {!showValues ? "—" : fmtSigned(ytd)}
      </span>
      <span className="text-right tabular-nums text-[#71717a] dark:text-[#a1a1aa]">
        {!showValues || budgetYtd === 0 ? "—" : fmtSigned(budgetYtd)}
      </span>
      <span className={`text-right tabular-nums text-[11px] ${pctColor(varPctYtd)}`}>
        {showPctYtd ? formatPctSigned(varPctYtd) : "—"}
      </span>
    </div>
  );
}

// Debt & DSCR — same form layout the commercial /financials page uses,
// inlined here. Persists to property_debt via useDebt. DSCR computed from
// the IS-derived NOI × 12.
type DebtForm = {
  totalDebt: number;
  monthlyDebtService: number;
  monthlyPrincipal?: number;
  interestRate?: number;
  lender?: string;
  loanStartDate?: string;
  loanMaturityDate?: string;
  notes?: string;
};

function DebtAndDscrView({ noi, propertyId }: { noi: number; propertyId: string }) {
  const { debt, upsertDebt, clearDebt } = useDebt(propertyId);
  const [form, setForm] = useState<DebtForm>({
    totalDebt: 0,
    monthlyDebtService: 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (debt) {
      setForm({
        totalDebt: (debt as any).totalDebt ?? 0,
        monthlyDebtService: (debt as any).monthlyDebtService ?? 0,
        monthlyPrincipal: (debt as any).monthlyPrincipal,
        interestRate: (debt as any).interestRate,
        lender: (debt as any).lender,
        loanStartDate: (debt as any).loanStartDate,
        loanMaturityDate: (debt as any).loanMaturityDate,
        notes: (debt as any).notes,
      });
    }
  }, [(debt as any)?._id, (debt as any)?.updatedAt]);

  async function handleSave() {
    setSaving(true);
    try {
      await upsertDebt({
        propertyId: propertyId as any,
        totalDebt: form.totalDebt,
        monthlyDebtService: form.monthlyDebtService,
        monthlyPrincipal: form.monthlyPrincipal,
        interestRate: form.interestRate,
        lender: form.lender,
        loanStartDate: form.loanStartDate,
        loanMaturityDate: form.loanMaturityDate,
        notes: form.notes,
      });
    } finally {
      setSaving(false);
    }
  }

  const annualNOI = noi * 12;
  const annualDS = (form.monthlyDebtService || 0) * 12;
  const dscr = annualDS > 0 ? annualNOI / annualDS : null;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-5">
        <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-4">Loan Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DebtField label="Total Debt (Outstanding Balance)">
            <NumInput value={form.totalDebt} onChange={(v) => setForm({ ...form, totalDebt: v })} prefix="$" />
          </DebtField>
          <DebtField label="Monthly Debt Service (P&I)">
            <NumInput value={form.monthlyDebtService} onChange={(v) => setForm({ ...form, monthlyDebtService: v })} prefix="$" />
          </DebtField>
          <DebtField label="Monthly Principal">
            <NumInput value={form.monthlyPrincipal ?? 0} onChange={(v) => setForm({ ...form, monthlyPrincipal: v })} prefix="$" />
          </DebtField>
          <DebtField label="Interest Rate (%)">
            <NumInput value={form.interestRate ?? 0} onChange={(v) => setForm({ ...form, interestRate: v })} suffix="%" />
          </DebtField>
          <DebtField label="Lender">
            <input
              type="text"
              value={form.lender || ""}
              onChange={(e) => setForm({ ...form, lender: e.target.value })}
              className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
            />
          </DebtField>
          <DebtField label="Loan Start">
            <input
              type="date"
              value={form.loanStartDate || ""}
              onChange={(e) => setForm({ ...form, loanStartDate: e.target.value })}
              className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
            />
          </DebtField>
          <DebtField label="Loan Maturity">
            <input
              type="date"
              value={form.loanMaturityDate || ""}
              onChange={(e) => setForm({ ...form, loanMaturityDate: e.target.value })}
              className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
            />
          </DebtField>
        </div>
        <div className="mt-4">
          <DebtField label="Notes">
            <textarea
              value={form.notes || ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa] resize-none"
            />
          </DebtField>
        </div>
        <div className="flex items-center justify-between mt-5">
          <button
            onClick={async () => {
              await clearDebt({ propertyId: propertyId as any });
            }}
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
      </div>

      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-5">
        <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] mb-3">DSCR Calculation</p>
        <div className="space-y-1.5 text-[12px]">
          <DscrRow label="NOI (current period × 12)" value={formatCurrency(annualNOI)} />
          <DscrRow label="Annual debt service" value={formatCurrency(annualDS)} />
          {(form.monthlyPrincipal || 0) > 0 && (
            <>
              <DscrRow label="Monthly principal repayment" value={formatCurrency(form.monthlyPrincipal || 0)} />
              <DscrRow
                label="Annual principal repayment"
                value={formatCurrency((form.monthlyPrincipal || 0) * 12)}
              />
              <DscrRow
                label="Monthly interest (P&I − Principal)"
                value={formatCurrency(Math.max(0, form.monthlyDebtService - (form.monthlyPrincipal || 0)))}
              />
            </>
          )}
          <div className="border-t border-[#e4e4e7] dark:border-[#3f3f46] pt-2 mt-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa]">DSCR (NOI ÷ Debt Service)</p>
            <p
              className={`text-[18px] font-semibold tracking-tight ${
                dscr === null
                  ? "text-[#a1a1aa]"
                  : dscr >= 1.25
                  ? "text-[#16a34a]"
                  : dscr >= 1.0
                  ? "text-[#d97706]"
                  : "text-[#dc2626]"
              }`}
            >
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
      <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide mb-1 block">
        {label}
      </label>
      {children}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  prefix,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] focus-within:border-[#18181b] dark:focus-within:border-[#fafafa]">
      {prefix && <span className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] pl-2">{prefix}</span>}
      <input
        type="number"
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="flex-1 text-[12px] px-2 py-1.5 bg-transparent text-[#18181b] dark:text-[#fafafa] focus:outline-none"
      />
      {suffix && <span className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] pr-2">{suffix}</span>}
    </div>
  );
}

function DscrRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-[#71717a] dark:text-[#a1a1aa]">{label}</p>
      <p className="text-[#18181b] dark:text-[#fafafa] tabular-nums">{value}</p>
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
  // `highlight: true` flags grand-total rows the asset manager should land on
  // first — NOI and Net Income — rendered with a tinted bg so they read as
  // headline numbers, matching the Belgold IS look.
  const rows = [
    {
      label: "Total Income",
      mtd: t.income,
      budget: t.incomeBudget,
      ytd: t.incomeYtd,
      ytdBudget: t.incomeYtdBudget,
      goodWhenPositive: true,
      highlight: false,
    },
    {
      label: "Total Operating Expense",
      mtd: t.expense,
      budget: t.expenseBudget,
      ytd: t.expenseYtd,
      ytdBudget: t.expenseYtdBudget,
      goodWhenPositive: false,
      highlight: false,
    },
    {
      label: "NOI (Net Operating Income)",
      mtd: t.noi,
      budget: t.noiBudget,
      ytd: t.noiYtd,
      ytdBudget: t.noiYtdBudget,
      goodWhenPositive: true,
      highlight: true,
    },
    {
      label: "Net Income (Loss)",
      mtd: t.noi,
      budget: t.noiBudget,
      ytd: t.noiYtd,
      ytdBudget: t.noiYtdBudget,
      goodWhenPositive: true,
      highlight: true,
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
        const rowBg = r.highlight ? "bg-[#fafafa] dark:bg-[#27272a]/60" : "";
        const labelClass = r.highlight ? "font-semibold" : "font-medium";
        return (
          <div
            key={idx}
            className={`grid grid-cols-[1fr_120px_120px_90px_120px_120px_90px] px-4 py-2 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] items-center text-[#18181b] dark:text-[#fafafa] ${rowBg}`}
          >
            <span className={labelClass}>{r.label}</span>
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
  // First pass — drop noise rows we never want to render anywhere:
  //  • "Ordinary Income/Expense" — generic Northgate scaffold; the Income /
  //    Expense section labels under it already convey the same grouping.
  //  • Intermediate subtotals matching "Total - NNNN-100 - X" / "Total -
  //    NNNN-200 - X" etc. — they roll up into the X-000 closing subtotal so
  //    showing both reads as duplication ("Total RV Contract" and "Total
  //    RV Income" carrying the same number).
  const cleaned = lines.filter((r) => {
    const li = String(r.lineItem || "").trim();
    if (/^Ordinary\s+Income\/Expense$/i.test(li)) return false;
    const interimMatch = li.match(/^Total\s*-\s*(\d{4}-)(\d{3})/i);
    if (interimMatch && interimMatch[2] !== "000") return false;
    return true;
  });

  const out: (Block | Row)[] = [];
  let current: Block | null = null;
  let currentCode: string | null = null;

  for (const r of cleaned) {
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

  // Merge step — fold the entire SRDE Income family (4200-000 plus the
  // 4220-000 / 4230-000 / etc. sub-blocks AND the orphaned "Total -
  // 4200-000" row that the parser couldn't pair to a closing) under Other
  // Income (4040-000). The xlsx data nests 4220 / 4230 inside 4200, but
  // our flat parseBlocks only handles one level of nesting, which leaves
  // SRDE content scattered across top level. The merge re-binds it.
  const otherIncomeIdx = out.findIndex(
    (item) =>
      isBlock(item) && /^4040-000/.test(String(item.header.lineItem || "")),
  );
  if (otherIncomeIdx >= 0) {
    const otherBlock = out[otherIncomeIdx] as Block;
    const srdeFamily = /^42\d{2}-000/;
    const srdeClosingFamily = /^Total\s*-\s*4200-000/i;
    const indexesToMove: number[] = [];
    for (let i = 0; i < out.length; i++) {
      if (i === otherIncomeIdx) continue;
      const item = out[i];
      const li = isBlock(item) ? String(item.header.lineItem || "") : String(item.lineItem || "");
      if (isBlock(item) && srdeFamily.test(li)) indexesToMove.push(i);
      else if (!isBlock(item) && srdeClosingFamily.test(li)) indexesToMove.push(i);
    }
    const itemsToMove = indexesToMove.map((i) => out[i]);
    // Splice highest-index-first to keep earlier indexes valid.
    for (let i = indexesToMove.length - 1; i >= 0; i--) {
      out.splice(indexesToMove[i], 1);
    }
    for (const item of itemsToMove) {
      if (isBlock(item)) {
        otherBlock.children.push(item.header);
        otherBlock.children.push(...item.children);
        if (item.closingTotal) otherBlock.children.push(item.closingTotal);
      } else {
        otherBlock.children.push(item);
      }
    }
  }

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
  // Hide rows with no period values, all "Total - X" subtotals, and all
  // empty subgroup headers when a block is expanded. The IS table renders
  // MTD / Budget / Variance / Var % / % Income — period-specific columns
  // — so a row with only YTD amounts (no MTD anywhere) reads as fully
  // empty here. Filter on MTD-side fields only; YTD-only rows still
  // show up on Budget vs Actuals where YTD columns exist.
  const visibleChildren = block.children.filter((c) => {
    const noMtdContent =
      Math.abs(c.amountMtd || 0) < 0.0001 &&
      Math.abs(c.budgetMtd || 0) < 0.0001;
    if (noMtdContent) return false;
    const k = classifyLine(c);
    if (k === "subtotal" || k === "subgroup") return false;
    return true;
  });

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
      {/* Smooth grid-rows 0fr↔1fr expand — same pattern the commercial
          /financials uses. Children stay mounted and animate; no jump. */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden min-h-0">
          {visibleChildren.map((c, i) => (
            <ISRow key={`${c._id}-${i}`} row={c} totalIncome={totalIncome} />
          ))}
        </div>
      </div>
      {/* The closing X-000 subtotal is intentionally NOT rendered when
          expanded — its numbers are already the block header's inline
          values, so re-rendering "Total RV Income $33,960" right under
          "RV Income $33,960" reads as duplication. Children roll up
          visually into the header. */}
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
  // Block-header label (collapsed view of "4020-000 - Total RV Income") drops
  // the leading "Total" so the row reads as the section name. Subtotals keep
  // it ("Total RV Income"); leaves and subgroups have their numeric prefix
  // stripped to read as plain category names.
  const displayLabel = cleanLabel(li, { stripLeadingTotal: !!isBlockHeader });
  // Indent: leaves nest deepest, X-100 subgroups one level in, headers/X-000 at root.
  // Block headers are at root with the chevron drawn alongside.
  const indent = isBlockHeader ? 0 : kind === "leaf" ? 24 : kind === "subgroup" ? 12 : 0;

  // Grand totals (Total Income, Total Operating Expense, NOI, Net Income (Loss))
  // come through as `kind === "subtotal"` but lack the NNNN-NNN account-code
  // prefix that section closers carry — those four rows get the heaviest
  // treatment so they read as headline numbers, matching Belgold's IS.
  const isGrandTotal = kind === "subtotal" && !/\d{4}-\d{3}/.test(li);

  // Row palette mirrors Belgold's IS: top-level sections + closing subtotals
  // sit on tinted backgrounds with uppercase labels; subgroup headers are
  // bold black; LEAF rows are tinted blue (the same #2563eb the Yardi-fed
  // page uses) so the eye reads them as the actual line items inside an
  // expanded section.
  const rowClass = [
    "grid grid-cols-[1fr_120px_120px_120px_90px_90px] px-4 py-1.5 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] items-center",
    isBlockHeader
      ? "uppercase tracking-wide font-medium text-[#18181b] dark:text-[#fafafa]"
      : kind === "header"
      ? "bg-[#f4f4f5] dark:bg-[#27272a] uppercase tracking-wide font-semibold text-[#18181b] dark:text-[#fafafa]"
      : isGrandTotal
      ? "bg-[#f4f4f5] dark:bg-[#27272a] uppercase tracking-wide font-bold text-[#18181b] dark:text-[#fafafa]"
      : kind === "subtotal"
      ? "bg-[#fafafa] dark:bg-[#27272a]/60 font-semibold text-[#18181b] dark:text-[#fafafa]"
      : kind === "subgroup"
      ? "font-medium text-[#18181b] dark:text-[#fafafa]"
      : "text-[#2563eb] dark:text-[#60a5fa]",
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
      <span style={{ paddingLeft: indent }} className="truncate flex items-center gap-1.5" title={displayLabel}>
        {/* Chevron only when there's a toggle handler (i.e. block has values). */}
        {isBlockHeader && onToggle && (
          <span className="text-[10px] text-[#71717a] dark:text-[#a1a1aa] inline-block w-3">
            {isOpen ? "▼" : "▶"}
          </span>
        )}
        {isBlockHeader && !onToggle && <span className="inline-block w-3" />}
        <span className="truncate">{displayLabel}</span>
      </span>
      <span className={`text-right tabular-nums ${isNegMtd ? "text-[#dc2626]" : ""}`}>
        {!showValues || mtd === 0
          ? "—"
          : mtd < 0
          ? `−${formatCurrency(Math.abs(mtd))}`
          : formatCurrency(mtd)}
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

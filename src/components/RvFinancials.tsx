"use client";
import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Search } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useRvFinancials, formatCurrency } from "@/hooks/useConvexData";

// RV park financials — driven by the monthly Northgate xlsx that Max uploads.
// Four discriminated views all keyed off rv_financials.kind:
//   isBudget       → IS vs Budget MTD/YTD (P&L performance)
//   balanceSheet   → end-of-month BS snapshot
//   cashFlow       → month-by-month operating/investing/financing
//   generalLedger  → drill-down rows from the GL detail
//
// Per the user's directive ("highest signal for Redhorn"), the IS-vs-Budget
// section leads with the dollars and variance, not the GL minutiae.

type Row = any;

const KINDS = ["overview", "balanceSheet", "cashFlow", "generalLedger"] as const;
type Kind = (typeof KINDS)[number];

const KIND_LABELS: Record<Kind, string> = {
  overview: "IS vs Budget",
  balanceSheet: "Balance Sheet",
  cashFlow: "Cash Flow",
  generalLedger: "General Ledger",
};

function formatPct(p: number | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const v = p * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

// Income lines (4xxx) drive the "Revenue" rollup. Expense lines (5xxx-9xxx)
// drive Expense. Anything else (totals, subtotals) we exclude from KPIs but
// still show in the IS-vs-Budget table.
function isIncomeLine(lineItem: string): boolean {
  return /^4\d{3}-/.test(lineItem) && !/^Total/i.test(lineItem);
}
function isExpenseLine(lineItem: string): boolean {
  return /^[5-9]\d{3}-/.test(lineItem) && !/^Total/i.test(lineItem);
}

export default function RvFinancials({
  propertyName,
  propertyId,
}: {
  propertyName: string;
  propertyId: string | undefined;
}) {
  const { financials, loading } = useRvFinancials(propertyId);
  const [activeTab, setActiveTab] = useState<Kind>("overview");
  const [glSearch, setGlSearch] = useState("");

  const grouped = useMemo(() => {
    const out: Record<string, Row[]> = {
      isBudget: [],
      balanceSheet: [],
      cashFlow: [],
      generalLedger: [],
    };
    for (const r of financials) {
      if (out[r.kind]) out[r.kind].push(r);
    }
    return out;
  }, [financials]);

  const period = financials[0]?.snapshotPeriod || null;

  // KPIs computed off isBudget rows. Sum the leaf income / expense lines so
  // we don't double-count the "Total - …" subtotal rows the xlsx includes.
  const kpis = useMemo(() => {
    const ib = grouped.isBudget || [];
    let revMtd = 0;
    let revBudget = 0;
    let revYtd = 0;
    let revYtdBudget = 0;
    let expMtd = 0;
    let expYtd = 0;
    for (const r of ib) {
      if (!r.lineItem) continue;
      if (isIncomeLine(r.lineItem)) {
        revMtd += r.amountMtd || 0;
        revBudget += r.budgetMtd || 0;
        revYtd += r.amountYtd || 0;
        revYtdBudget += r.budgetYtd || 0;
      } else if (isExpenseLine(r.lineItem)) {
        expMtd += r.amountMtd || 0;
        expYtd += r.amountYtd || 0;
      }
    }
    const noiMtd = revMtd - expMtd;
    const noiYtd = revYtd - expYtd;
    const revVariancePct = revBudget > 0 ? (revMtd - revBudget) / revBudget : 0;
    return { revMtd, revBudget, revYtd, revYtdBudget, expMtd, expYtd, noiMtd, noiYtd, revVariancePct };
  }, [grouped.isBudget]);

  // Cash Flow rolls up to operating / investing / financing per month.
  const cashFlowByMonth = useMemo(() => {
    const cf = grouped.cashFlow || [];
    const months = new Set<string>();
    for (const r of cf) if (r.cashFlowMonth) months.add(r.cashFlowMonth);
    return Array.from(months).sort();
  }, [grouped.cashFlow]);

  const filteredGl = useMemo(() => {
    const gl = grouped.generalLedger || [];
    if (!glSearch.trim()) return gl;
    const q = glSearch.toLowerCase();
    return gl.filter((r) =>
      [r.glAccountName, r.glDescription, r.glName, r.glDocumentNumber, r.lineItem]
        .filter(Boolean)
        .some((s: string) => String(s).toLowerCase().includes(q)),
    );
  }, [grouped.generalLedger, glSearch]);

  if (!propertyId) return null;

  if (loading) {
    return (
      <div>
        <PageHeader title="Financials" subtitle={`${propertyName} — loading…`} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3 animate-pulse h-[68px]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (financials.length === 0) {
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

  const periodLabel = period
    ? new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

  return (
    <div>
      <PageHeader
        title="Financials"
        subtitle={`${propertyName} — package as of ${periodLabel}`}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        <KpiCard
          label={`Revenue MTD`}
          value={formatCurrency(kpis.revMtd)}
          variance={kpis.revVariancePct}
          sub={kpis.revBudget > 0 ? `Budget ${formatCurrency(kpis.revBudget)}` : undefined}
        />
        <KpiCard
          label={`Revenue YTD`}
          value={formatCurrency(kpis.revYtd)}
          sub={kpis.revYtdBudget > 0 ? `Budget ${formatCurrency(kpis.revYtdBudget)}` : undefined}
        />
        <KpiCard
          label={`Net Income MTD`}
          value={formatCurrency(kpis.noiMtd)}
          valueClass={kpis.noiMtd >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}
          sub={`Expenses ${formatCurrency(kpis.expMtd)}`}
        />
        <KpiCard
          label={`Net Income YTD`}
          value={formatCurrency(kpis.noiYtd)}
          valueClass={kpis.noiYtd >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}
          sub={`Expenses ${formatCurrency(kpis.expYtd)}`}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 border-b border-[#e4e4e7] dark:border-[#3f3f46]">
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setActiveTab(k)}
            className={`text-[12px] font-medium px-3 py-2 cursor-pointer border-b-2 -mb-px transition-colors ${
              activeTab === k
                ? "border-[#18181b] dark:border-[#fafafa] text-[#18181b] dark:text-[#fafafa]"
                : "border-transparent text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
            }`}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {activeTab === "overview" && <IsBudgetTable rows={grouped.isBudget || []} />}
      {activeTab === "balanceSheet" && <BalanceSheetTable rows={grouped.balanceSheet || []} />}
      {activeTab === "cashFlow" && (
        <CashFlowTable rows={grouped.cashFlow || []} months={cashFlowByMonth} />
      )}
      {activeTab === "generalLedger" && (
        <GeneralLedgerTable
          rows={filteredGl}
          totalRows={(grouped.generalLedger || []).length}
          search={glSearch}
          onSearchChange={setGlSearch}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  variance,
  sub,
  valueClass = "text-[#18181b] dark:text-[#fafafa]",
}: {
  label: string;
  value: string;
  variance?: number;
  sub?: string;
  valueClass?: string;
}) {
  const showVariance = variance != null && Number.isFinite(variance);
  const variancePositive = (variance || 0) >= 0;
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-3">
      <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-[20px] sm:text-[22px] font-semibold mt-1 ${valueClass}`}>{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {showVariance && (
          <span
            className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
              variancePositive ? "text-[#16a34a]" : "text-[#dc2626]"
            }`}
          >
            {variancePositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {formatPct(variance)} vs budget
          </span>
        )}
        {sub && <span className="text-[10px] text-[#a1a1aa] dark:text-[#71717a]">{sub}</span>}
      </div>
    </div>
  );
}

function IsBudgetTable({ rows }: { rows: Row[] }) {
  // Order rows by their index in the original file — Convex returns by
  // insertion order, which matches the report layout (parent → child).
  const ordered = rows;
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_120px_120px_100px_120px_120px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
        <span>Line</span>
        <span className="text-right">MTD</span>
        <span className="text-right">Budget</span>
        <span className="text-right">Var %</span>
        <span className="text-right">YTD</span>
        <span className="text-right">YTD Budget</span>
      </div>
      {ordered.length === 0 ? (
        <div className="px-5 py-10 text-center text-[12px] text-[#a1a1aa]">No IS data.</div>
      ) : (
        ordered.map((r, idx) => {
          const isTotal = /^Total/i.test(r.lineItem || "");
          const variance = r.pctVarianceMtd;
          const showVariance = variance != null && Number.isFinite(variance) && Math.abs(variance) > 0.0001;
          return (
            <div
              key={`${r._id}-${idx}`}
              className={`grid grid-cols-[1fr_120px_120px_100px_120px_120px] px-4 py-2 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] items-center ${
                isTotal
                  ? "bg-[#fafafa]/60 dark:bg-[#27272a]/40 font-medium"
                  : "text-[#18181b] dark:text-[#fafafa]"
              }`}
            >
              <span className="truncate" title={r.lineItem}>{r.lineItem}</span>
              <span className="text-right tabular-nums">{r.amountMtd != null ? formatCurrency(r.amountMtd) : "—"}</span>
              <span className="text-right tabular-nums text-[#71717a] dark:text-[#a1a1aa]">
                {r.budgetMtd != null ? formatCurrency(r.budgetMtd) : "—"}
              </span>
              <span
                className={`text-right tabular-nums text-[11px] ${
                  showVariance
                    ? variance >= 0
                      ? "text-[#16a34a]"
                      : "text-[#dc2626]"
                    : "text-[#71717a] dark:text-[#a1a1aa]"
                }`}
              >
                {showVariance ? formatPct(variance) : "—"}
              </span>
              <span className="text-right tabular-nums">{r.amountYtd != null ? formatCurrency(r.amountYtd) : "—"}</span>
              <span className="text-right tabular-nums text-[#71717a] dark:text-[#a1a1aa]">
                {r.budgetYtd != null ? formatCurrency(r.budgetYtd) : "—"}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

function BalanceSheetTable({ rows }: { rows: Row[] }) {
  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_140px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
        <span>Line</span>
        <span className="text-right">Amount</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-[12px] text-[#a1a1aa]">No balance sheet data.</div>
      ) : (
        rows.map((r, idx) => {
          const isTotal = /^Total/i.test(r.lineItem || "");
          return (
            <div
              key={`${r._id}-${idx}`}
              className={`grid grid-cols-[1fr_140px] px-4 py-2 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] items-center ${
                isTotal
                  ? "bg-[#fafafa]/60 dark:bg-[#27272a]/40 font-medium"
                  : "text-[#18181b] dark:text-[#fafafa]"
              }`}
            >
              <span className="truncate" title={r.lineItem}>{r.lineItem}</span>
              <span className="text-right tabular-nums">
                {r.balanceAmount != null ? formatCurrency(r.balanceAmount) : ""}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

function CashFlowTable({ rows, months }: { rows: Row[]; months: string[] }) {
  // Pivot: line × month. Order lines by their first occurrence in the data.
  const lineOrder: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.lineItem && !seen.has(r.lineItem)) {
      seen.add(r.lineItem);
      lineOrder.push(r.lineItem);
    }
  }
  const valueMap = new Map<string, number>();
  for (const r of rows) {
    if (r.lineItem && r.cashFlowMonth) {
      valueMap.set(`${r.lineItem}|${r.cashFlowMonth}`, r.cashFlowAmount || 0);
    }
  }

  return (
    <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
      <div
        className="grid border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider"
        style={{ gridTemplateColumns: `1fr ${months.map(() => "120px").join(" ")}` }}
      >
        <span>Line</span>
        {months.map((m) => (
          <span key={m} className="text-right">{m}</span>
        ))}
      </div>
      {lineOrder.length === 0 ? (
        <div className="px-5 py-10 text-center text-[12px] text-[#a1a1aa]">No cash flow data.</div>
      ) : (
        lineOrder.map((line) => {
          const isTotal = /^Total|^Net Change/i.test(line);
          return (
            <div
              key={line}
              className={`grid px-4 py-2 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] items-center ${
                isTotal
                  ? "bg-[#fafafa]/60 dark:bg-[#27272a]/40 font-medium"
                  : "text-[#18181b] dark:text-[#fafafa]"
              }`}
              style={{ gridTemplateColumns: `1fr ${months.map(() => "120px").join(" ")}` }}
            >
              <span className="truncate" title={line}>{line}</span>
              {months.map((m) => {
                const v = valueMap.get(`${line}|${m}`);
                return (
                  <span key={m} className="text-right tabular-nums">
                    {v != null ? formatCurrency(v) : "—"}
                  </span>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}

function GeneralLedgerTable({
  rows,
  totalRows,
  search,
  onSearchChange,
}: {
  rows: Row[];
  totalRows: number;
  search: string;
  onSearchChange: (s: string) => void;
}) {
  // GL has 631 rows in the sample bundle — cap rendering at 500 for perf,
  // surface the truncation so the user knows to refine the search.
  const RENDER_CAP = 500;
  const sliced = rows.slice(0, RENDER_CAP);
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 sm:flex-initial">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a1a1aa]" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search account, vendor, doc #…"
            className="text-[12px] bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded pl-7 pr-3 py-1.5 text-[#18181b] dark:text-[#fafafa] w-full sm:w-72"
          />
        </div>
        <span className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] ml-auto">
          {rows.length === totalRows
            ? `${totalRows} entries`
            : `${rows.length} of ${totalRows} entries`}
          {rows.length > RENDER_CAP ? ` · showing first ${RENDER_CAP}` : ""}
        </span>
      </div>

      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
        <div className="grid grid-cols-[100px_180px_100px_1fr_140px_100px_100px_110px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
          <span>Date</span>
          <span>Account</span>
          <span>Type</span>
          <span>Vendor / Description</span>
          <span>Doc #</span>
          <span className="text-right">Debit</span>
          <span className="text-right">Credit</span>
          <span className="text-right">Balance</span>
        </div>
        {sliced.length === 0 ? (
          <div className="px-5 py-10 text-center text-[12px] text-[#a1a1aa]">No matching GL entries.</div>
        ) : (
          sliced.map((r, idx) => (
            <div
              key={`${r._id}-${idx}`}
              className="grid grid-cols-[100px_180px_100px_1fr_140px_100px_100px_110px] px-4 py-2 text-[12px] border-t border-[#f4f4f5] dark:border-[#27272a] text-[#18181b] dark:text-[#fafafa] items-center"
            >
              <span className="text-[11px] tabular-nums text-[#71717a] dark:text-[#a1a1aa]">
                {r.glDate || "—"}
              </span>
              <span className="text-[11px] truncate" title={r.glAccountName}>
                {r.glAccountName || r.lineItem || "—"}
              </span>
              <span className="text-[11px] text-[#71717a] dark:text-[#a1a1aa]">{r.glType || "—"}</span>
              <span className="text-[11px] truncate text-[#71717a] dark:text-[#a1a1aa]" title={r.glName}>
                {r.glName || "—"}
              </span>
              <span className="text-[11px] text-[#a1a1aa] dark:text-[#71717a] truncate">
                {r.glDocumentNumber || "—"}
              </span>
              <span className="text-right tabular-nums text-[11px]">
                {r.glDebit ? formatCurrency(r.glDebit) : "—"}
              </span>
              <span className="text-right tabular-nums text-[11px] text-[#dc2626]">
                {r.glCredit ? formatCurrency(r.glCredit) : "—"}
              </span>
              <span className="text-right tabular-nums text-[11px] text-[#71717a] dark:text-[#a1a1aa]">
                {r.glBalance != null ? formatCurrency(r.glBalance) : "—"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

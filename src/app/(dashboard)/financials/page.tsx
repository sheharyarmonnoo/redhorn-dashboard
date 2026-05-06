"use client";
import { useMemo, useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import PageHeader from "@/components/PageHeader";
import { api } from "../../../../convex/_generated/api";
import { useActiveProperty, useIncomeLines, useMonthlyRevenue, useDebt, useLineBudgets, formatCurrency } from "@/hooks/useConvexData";

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
  const { debt, upsertDebt, clearDebt } = useDebt(property?._id);
  const updateProperty = useMutation(api.properties.update);
  const { user } = useUser();

  const [view, setView] = useState<"statement" | "trend" | "budget" | "debt">("statement");
  const [budgetYear, setBudgetYear] = useState<string>(String(new Date().getFullYear()));
  const { budgets, upsertBudget } = useLineBudgets(property?._id, budgetYear);
  const budgetByLine = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of budgets) m.set((b.lineItem || "").trim(), b.annualBudget || 0);
    return m;
  }, [budgets]);

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
      .filter((m: any) => m.month && m.month >= "2026-01" && m.month < cutoff)
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

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 mb-4">
        <KPIBox label="Total Income" value={formatCurrency(totalIncome)} />
        <KPIBox label="Total Expense" value={formatCurrency(totalExpense)} color="text-[#dc2626]" />
        <KPIBox label="NOI" value={formatCurrency(noi)} color={noi >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"} />
        <KPIBox label="Recoveries" value={formatCurrency(recoveries.total)} />
        <KPIBox
          label="DSCR"
          value={dscr === null ? "—" : `${dscr.toFixed(2)}×`}
          color={dscr === null ? undefined : dscr >= 1.25 ? "text-[#16a34a]" : dscr >= 1.0 ? "text-[#d97706]" : "text-[#dc2626]"}
          hint={dscr === null ? "Set debt service" : `NOI ÷ debt service`}
        />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-4 bg-[#f4f4f5] dark:bg-[#27272a] rounded-md p-0.5 w-fit">
        {(["statement", "trend", "budget", "debt"] as const).map(t => (
          <button
            key={t}
            onClick={() => setView(t)}
            className={`text-[12px] font-medium px-3 py-1.5 rounded cursor-pointer transition-colors capitalize ${
              view === t
                ? "bg-white dark:bg-[#18181b] text-[#18181b] dark:text-[#fafafa] shadow-sm"
                : "text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa]"
            }`}
          >
            {t === "statement" ? "Income Statement" : t === "trend" ? "Monthly Trend" : t === "budget" ? "Budget vs Actuals" : "Debt & DSCR"}
          </button>
        ))}
      </div>

      {view === "statement" && (
        <>
          <IncomeStatement lines={lines} totalIncome={totalIncome} />
          {recoveries.items.length > 0 && (
            <RecoveriesPanel items={recoveries.items} total={recoveries.total} />
          )}
        </>
      )}
      {view === "trend" && <TrendTable trend={trend} formatMonth={formatMonth} />}
      {view === "budget" && (
        <BudgetVsActuals
          lines={lines}
          budgetByLine={budgetByLine}
          year={budgetYear}
          setYear={setBudgetYear}
          onSaveBudget={async (lineItem, annualBudget) => {
            if (!property?._id) return;
            await upsertBudget({
              propertyId: property._id as any,
              year: budgetYear,
              lineItem,
              annualBudget,
              updatedBy: user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "User",
            });
          }}
        />
      )}
      {view === "debt" && (
        <div className="space-y-4">
          <PmContactPanel
            property={property}
            onSave={async (form) => {
              if (!property?._id) return;
              await updateProperty({ id: property._id as any, ...form });
            }}
          />
          <DebtPanel
            debt={debt}
            noi={noi}
            dscr={dscr}
            onSave={async (form) => {
              if (!property?._id) return;
              await upsertDebt({
                propertyId: property._id as any,
                ...form,
                updatedBy: user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "User",
              });
            }}
            onClear={async () => {
              if (!property?._id) return;
              if (!window.confirm("Remove debt info for this property? DSCR will stop calculating until re-entered.")) return;
              await clearDebt({ propertyId: property._id as any });
            }}
          />
        </div>
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
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-2">
            Lender covenant typically requires DSCR ≥ 1.20–1.25×. Below 1.0× means NOI alone doesn't cover debt service.
          </p>
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
  year,
  setYear,
  onSaveBudget,
}: {
  lines: any[];
  budgetByLine: Map<string, number>;
  year: string;
  setYear: (y: string) => void;
  onSaveBudget: (lineItem: string, annualBudget: number) => Promise<void>;
}) {
  // Skip subtotals + net rows. They're computed from children, not budgeted.
  const budgetableLines = useMemo(() => {
    return lines.filter((l: any) => {
      const li = (l.lineItem || "").trim();
      if (!li) return false;
      if (/^\s*total\b|^\s*net\b/i.test(li)) return false;
      return true;
    });
  }, [lines]);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [String(y - 1), String(y), String(y + 1)];
  }, []);

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

  // Total budget vs total YTD actual to give a roll-up at the top.
  const totals = useMemo(() => {
    let budgetSum = 0;
    let ytdSum = 0;
    for (const l of budgetableLines) {
      const li = (l.lineItem || "").trim();
      const b = budgetByLine.get(li) || 0;
      budgetSum += b;
      ytdSum += l.yearToDate || 0;
    }
    return { budgetSum, ytdSum };
  }, [budgetableLines, budgetByLine]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[12px] text-[#71717a] dark:text-[#a1a1aa]">
            Enter annual budget per line item; actuals come from the latest income statement YTD.
          </p>
          <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-0.5">
            Budgeted: <span className="font-medium text-[#18181b] dark:text-[#fafafa]">{formatCurrency(totals.budgetSum)}</span> ·
            YTD Actual: <span className="font-medium text-[#18181b] dark:text-[#fafafa]">{formatCurrency(totals.ytdSum)}</span> ·
            Variance: <span className={`font-medium ${totals.ytdSum - totals.budgetSum > 0 ? "text-[#dc2626]" : "text-[#16a34a]"}`}>
              {formatCurrency(totals.ytdSum - totals.budgetSum)}
            </span>
          </p>
        </div>
        <select
          value={year}
          onChange={e => setYear(e.target.value)}
          className="text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
        >
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_140px_140px_140px_140px_80px] border-b border-[#e4e4e7] dark:border-[#3f3f46] bg-[#fafafa] dark:bg-[#27272a] px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wider">
          <span>Line Item</span>
          <span className="text-right">Annual Budget</span>
          <span className="text-right">YTD Actual</span>
          <span className="text-right">Variance $</span>
          <span className="text-right">% Used</span>
          <span></span>
        </div>
        {budgetableLines.map((line: any, i: number) => {
          const li = (line.lineItem || "").trim();
          const indent = Math.max(0, (line.hierarchyLevel - 1)) * 16;
          const budget = budgetByLine.get(li) || 0;
          const ytd = line.yearToDate || 0;
          const variance = ytd - budget;
          const pctUsed = budget > 0 ? (ytd / budget) * 100 : 0;
          const draft = drafts[li];
          const editing = draft !== undefined;
          return (
            <div
              key={i}
              className="grid grid-cols-[1fr_140px_140px_140px_140px_80px] px-4 py-1.5 text-[12px] text-[#18181b] dark:text-[#fafafa] border-t border-[#f4f4f5] dark:border-[#27272a] items-center"
            >
              <span style={{ paddingLeft: indent }} className="truncate">{li}</span>
              <span className="text-right">
                <input
                  type="number"
                  value={editing ? draft : (budget || "")}
                  placeholder="—"
                  onChange={e => setDrafts(d => ({ ...d, [li]: e.target.value }))}
                  className="w-full text-[12px] text-right px-2 py-1 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
                />
              </span>
              <span className="text-right text-[#71717a] dark:text-[#a1a1aa]">{ytd !== 0 ? formatCurrency(ytd) : "—"}</span>
              <span className={`text-right ${variance > 0 ? "text-[#dc2626]" : variance < 0 ? "text-[#16a34a]" : "text-[#a1a1aa]"}`}>
                {budget > 0 ? formatCurrency(variance) : "—"}
              </span>
              <span className={`text-right ${pctUsed > 100 ? "text-[#dc2626] font-medium" : pctUsed > 80 ? "text-[#d97706]" : "text-[#71717a] dark:text-[#a1a1aa]"}`}>
                {budget > 0 ? `${Math.round(pctUsed)}%` : "—"}
              </span>
              <span className="text-right">
                {editing && (
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
        })}
      </div>
      <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-2">
        Tip: paste budget figures directly into each row. Variance is YTD actual minus budget — positive means over budget on expense rows, under on income rows.
      </p>
    </div>
  );
}

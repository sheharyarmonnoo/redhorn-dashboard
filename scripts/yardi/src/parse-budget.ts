import * as xlsx from "xlsx";

export interface BudgetLine {
  lineItem: string;
  hierarchyLevel: number;
  parentLine?: string;
  monthlyBudgets: number[];   // 12 entries, in column order from the report
  annualBudget: number;       // sum of the 12 months (matches the "Total" col)
}

export interface ParsedBudget {
  propertyHeader: string;     // "Hollister BP1 LLC (hol)"
  reportTitle: string;        // "Budget"
  periodHeader: string;       // "Period = Jun 2025-May 2026"
  bookHeader: string;         // "Book = Accrual"
  monthLabels: string[];      // ["Jun 2025", "Jul 2025", ..., "May 2026"]
  year: string;               // calendar year owning most months in the period
  rows: BudgetLine[];
}

/**
 * Parse a Yardi 12 Month Budget Excel into structured budget rows.
 *
 * Layout:
 *   row 0: "Hollister BP1 LLC (hol)"
 *   row 1: "Budget"
 *   row 2: "Period = Jun 2025-May 2026"
 *   row 3: "Book = Accrual"
 *   row 4: ["", "Jun 2025", "Jul 2025", …, "May 2026", "Total"]
 *   row 5+: line items with leading spaces for hierarchy + 13 numeric cols
 *
 * Section headers (rows like "INCOME", "RENTAL INCOME") have empty
 * numeric cells and are skipped — they don't carry a budget value.
 *
 * Subtotal / total rows ("TOTAL EXPENSE & OTHER", "NET INCOME (LOSS)")
 * are also skipped because the dashboard computes those from leaves.
 */
export function parseBudget(filePath: string): ParsedBudget {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

  const propertyHeader = String(grid[0]?.[0] ?? "").trim();
  const reportTitle = String(grid[1]?.[0] ?? "").trim();
  const periodHeader = String(grid[2]?.[0] ?? "").trim();
  const bookHeader = String(grid[3]?.[0] ?? "").trim();

  // Parse the header row of months
  const headerRow = grid[4] || [];
  const monthLabels: string[] = [];
  for (let c = 1; c <= 12; c++) {
    const lbl = String(headerRow[c] ?? "").trim();
    if (lbl) monthLabels.push(lbl);
  }

  // Pick the calendar year that owns the most months
  const year = pickDominantYear(monthLabels);

  const rows: BudgetLine[] = [];
  // Track ancestors per indent level so we can attach a parentLine pointer
  const ancestors: Record<number, string> = {};

  for (let i = 5; i < grid.length; i++) {
    const r = grid[i];
    const rawLabel = String(r?.[0] ?? "");
    if (!rawLabel.trim()) continue;

    const trimmedLabel = rawLabel.trim();

    // Skip subtotals/totals — Yardi adds these as leading-space-padded TOTAL rows
    if (/^total\b|^net\s+income|^net\s+operating/i.test(trimmedLabel)) {
      // Still register as ancestor at its indent level so child lookup works
      const indent = rawLabel.length - rawLabel.trimStart().length;
      const lvl = Math.max(0, Math.floor(indent / 1));
      ancestors[lvl] = trimmedLabel;
      continue;
    }

    const indent = rawLabel.length - rawLabel.trimStart().length;
    // Yardi's report uses 1-space indent per level. Leading-space-padded TOTAL
    // lines have wider indents — we already skip those above, so the natural
    // level math here lines up with the visible hierarchy.
    const hierarchyLevel = Math.max(0, Math.floor(indent / 1));

    // Collect 12 monthly numbers
    const monthlyBudgets: number[] = [];
    let allEmpty = true;
    for (let c = 1; c <= 12; c++) {
      const cellRaw = r?.[c];
      const isBlank = cellRaw === "" || cellRaw === null || cellRaw === undefined;
      if (!isBlank) allEmpty = false;
      monthlyBudgets.push(toNumber(cellRaw));
    }

    // Skip section headers — they have empty numeric cells (e.g. "INCOME",
    // "PROPERTY MANAGEMENT/LEASING REVENUE", "RENTAL INCOME"). We still
    // register them as ancestors so child rows know their parent.
    if (allEmpty) {
      ancestors[hierarchyLevel] = trimmedLabel;
      // Drop deeper ancestors so siblings don't leak
      for (const k of Object.keys(ancestors)) {
        const lvl = Number(k);
        if (lvl > hierarchyLevel) delete ancestors[lvl];
      }
      continue;
    }

    // Resolve parent: closest ancestor at a strictly shallower level
    let parentLine: string | undefined;
    for (let lvl = hierarchyLevel - 1; lvl >= 0; lvl--) {
      if (ancestors[lvl]) {
        parentLine = ancestors[lvl];
        break;
      }
    }
    ancestors[hierarchyLevel] = trimmedLabel;
    for (const k of Object.keys(ancestors)) {
      const lvl = Number(k);
      if (lvl > hierarchyLevel) delete ancestors[lvl];
    }

    // Sum the 12 months. Use the report's "Total" column when present
    // (col 13) as a sanity check; fall back to the sum we computed.
    const reportedTotal = r?.[13];
    let annualBudget = monthlyBudgets.reduce((a, b) => a + b, 0);
    if (typeof reportedTotal === "number" || (typeof reportedTotal === "string" && reportedTotal !== "")) {
      const reported = toNumber(reportedTotal);
      // Prefer the reported total if it exists (handles rounding edge cases).
      if (reported !== 0 || annualBudget !== 0) annualBudget = reported;
    }

    rows.push({
      lineItem: trimmedLabel,
      hierarchyLevel,
      parentLine,
      monthlyBudgets,
      annualBudget,
    });
  }

  return {
    propertyHeader,
    reportTitle,
    periodHeader,
    bookHeader,
    monthLabels,
    year,
    rows,
  };
}

function toNumber(v: any): number {
  if (typeof v === "number") return v;
  if (v === "" || v === null || v === undefined) return 0;
  const s = String(v).replace(/,/g, "").replace(/\$/g, "").trim();
  if (s === "" || s === "-") return 0;
  const neg = /^\(.*\)$/.test(s);
  const n = Number(neg ? s.slice(1, -1) : s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

/**
 * Pick the calendar year for the budget rows. The Budget vs Actuals tab
 * compares this against the dashboard's current-year income_lines, so we
 * default to the LATEST year covered by the period — "FY 2026" reads more
 * naturally than "FY 2025" for a 06/2025-05/2026 budget. If the period
 * lives entirely in one calendar year, that year is returned.
 */
function pickDominantYear(monthLabels: string[]): string {
  const years = new Set<string>();
  for (const lbl of monthLabels) {
    const m = lbl.match(/(\d{4})/);
    if (m) years.add(m[1]);
  }
  if (years.size === 0) return String(new Date().getFullYear());
  // Latest year wins
  return Array.from(years).sort((a, b) => Number(b) - Number(a))[0];
}

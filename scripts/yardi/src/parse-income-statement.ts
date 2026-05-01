import * as xlsx from "xlsx";

export interface IncomeLine {
  lineItem: string;
  hierarchyLevel: number;
  parentLine?: string;
  currentPeriod: number;
  yearToDate: number;
  sinceInception?: number;
}

export interface ParsedIncomeStatement {
  propertyHeader: string;     // raw "Property = ..." line
  templateHeader: string;
  periodHeader: string;
  rows: IncomeLine[];
}

/**
 * Parse a Yardi Custom Financials Excel into structured income_lines rows.
 *
 * Layout (observed for IS_CFTem template):
 *   row 0: "Hollister BP1 LLC (hol)"          ← property header
 *   row 1: "Income statement custom financial template"
 *   row 2: "Period = Mar 2026"
 *   row 3: "Book = Cash ; Tree = ysi_is"
 *   row 4: ["", "Current Period", "Year to Date", "Since Inception"]
 *   row 5+: line items, indented by leading spaces, with numeric columns
 */
export function parseIncomeStatement(filePath: string): ParsedIncomeStatement {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

  const propertyHeader = String(grid[0]?.[0] ?? "").trim();
  const templateHeader = String(grid[1]?.[0] ?? "").trim();
  const periodHeader = String(grid[2]?.[0] ?? "").trim();

  const rows: IncomeLine[] = [];
  // Track parent line for each hierarchy level so we can attach a parentLine pointer
  const ancestors: Record<number, string> = {};

  for (let i = 5; i < grid.length; i++) {
    const r = grid[i];
    const rawLabel = String(r?.[0] ?? "");
    if (!rawLabel.trim()) continue;

    const trimmedLabel = rawLabel.trim();
    const indent = rawLabel.length - rawLabel.trimStart().length;
    // Yardi indents 1 leading space per level, with 3-space groups for total lines
    const hierarchyLevel = Math.max(0, Math.floor(indent / 1));

    const currentPeriod = toNumber(r?.[1]);
    const yearToDate = toNumber(r?.[2]);
    const sinceInception = r?.[3] !== undefined && r?.[3] !== "" ? toNumber(r?.[3]) : undefined;

    // Resolve parent: closest ancestor at a strictly shallower level
    let parentLine: string | undefined;
    for (let lvl = hierarchyLevel - 1; lvl >= 0; lvl--) {
      if (ancestors[lvl]) { parentLine = ancestors[lvl]; break; }
    }
    ancestors[hierarchyLevel] = trimmedLabel;
    // Drop deeper ancestors so they don't bleed into siblings
    for (const k of Object.keys(ancestors)) {
      const lvl = Number(k);
      if (lvl > hierarchyLevel) delete ancestors[lvl];
    }

    rows.push({
      lineItem: trimmedLabel,
      hierarchyLevel,
      parentLine,
      currentPeriod,
      yearToDate,
      sinceInception,
    });
  }

  return { propertyHeader, templateHeader, periodHeader, rows };
}

function toNumber(v: any): number {
  if (typeof v === "number") return v;
  if (v === "" || v === null || v === undefined) return 0;
  const s = String(v).replace(/,/g, "").replace(/\$/g, "").trim();
  if (s === "" || s === "-") return 0;
  // Handle parenthesized negatives: (1,234) → -1234
  const neg = /^\(.*\)$/.test(s);
  const n = Number(neg ? s.slice(1, -1) : s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

import * as xlsx from "xlsx";

export interface ParsedPastDue {
  rows: Array<{
    leaseName: string;
    unit?: string;
    pastDueAmount: number;
    lastPaymentDate?: string;
  }>;
}

/**
 * Parse a Yardi "Past Due Amount" dashboard panel export into per-tenant
 * outstanding balances. Used to populate the Past Due column on the rent
 * roll page after a sync.
 *
 * Column shape varies; we auto-detect headers containing a tenant/lease name
 * column and a past-due/balance column. Numeric parsing handles parenthesized
 * negatives, $ signs, commas.
 */
export function parsePastDue(filePath: string): ParsedPastDue {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const cells = (grid[i] || []).map(c => String(c).trim().toLowerCase());
    const hasLease = cells.some(c => /lease\s*name|customer|tenant|lessee/.test(c));
    const hasPastDue = cells.some(c => /past\s*due|balance|amount|owed/.test(c));
    if (hasLease && hasPastDue) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) return { rows: [] };

  const headers = (grid[headerRowIdx] || []).map(c => String(c).trim().toLowerCase());
  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex(h => h === n.toLowerCase() || h.includes(n.toLowerCase()));
      if (i !== -1) return i;
    }
    return -1;
  };
  const cols = {
    leaseName: idx("lease name", "customer", "tenant", "lessee", "lease"),
    unit: idx("unit id", "unit", "unit #"),
    pastDue: idx("past due", "balance", "amount", "owed"),
    lastPay: idx("last payment", "last paid", "pay date"),
  };

  const rows: ParsedPastDue["rows"] = [];
  for (let i = headerRowIdx + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const leaseName = cols.leaseName >= 0 ? String(r[cols.leaseName] ?? "").trim() : "";
    if (!leaseName) continue;
    if (/^total\b|grand\s*total|^sum\b/i.test(leaseName)) continue;
    const amt = cols.pastDue >= 0 ? toNumber(r[cols.pastDue]) : 0;
    rows.push({
      leaseName,
      unit: cols.unit >= 0 ? String(r[cols.unit] ?? "").trim() : "",
      pastDueAmount: amt,
      lastPaymentDate: cols.lastPay >= 0 ? formatDate(r[cols.lastPay]) : "",
    });
  }
  return { rows };
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

function formatDate(v: any): string {
  if (!v) return "";
  if (typeof v === "number") {
    const d = xlsx.SSF.parse_date_code(v);
    if (!d) return String(v);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [, mo, d, y] = m;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s;
}

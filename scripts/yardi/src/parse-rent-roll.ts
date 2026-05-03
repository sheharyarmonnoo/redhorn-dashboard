import * as xlsx from "xlsx";

export interface ParsedRentRoll {
  propertyHeader: string;
  asOfHeader: string;
  rows: RentRollRow[];
}

export interface RentRollRow {
  unit: string;
  building?: string;
  tenant?: string;
  leaseType?: string;
  sqft?: number;
  leaseFrom?: string;
  leaseTo?: string;
  monthlyRent?: number;
  monthlyElectric?: number;
  securityDeposit?: number;
  status?: string;
  pastDueAmount?: number;
}

/**
 * Parse a Yardi commercial rent-roll Excel into structured rows.
 *
 * Yardi's CMRentRoll output varies slightly between instances. We:
 *  1. Find the header row by matching column labels we expect ("Unit", "Tenant", "Sq Ft" or similar)
 *  2. Build a column→index map from that header
 *  3. Walk the data rows below until we hit a totals/blank section
 *
 * Robust against minor header naming differences (e.g. "Unit" vs "Unit ID",
 * "Sq Ft" vs "Sqft" vs "Area"). Numeric parsing handles parenthesized
 * negatives, $ signs, and commas.
 */
export function parseRentRoll(filePath: string): ParsedRentRoll {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

  // Top-of-report header lines (property + as-of) before the data table starts
  const propertyHeader = String(grid[0]?.[0] ?? "").trim();
  const asOfHeader = grid.slice(0, 6).map(r => String(r?.[0] ?? "")).find(s => /as ?of|period/i.test(s)) ?? "";

  // Find the header row — the first row containing both "unit" and "tenant" labels
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const cells = (grid[i] || []).map(c => String(c).trim().toLowerCase());
    const hasUnit = cells.some(c => c === "unit" || /^unit\s*(id|#)?$/.test(c));
    const hasTenant = cells.some(c => /tenant|customer|lessee/.test(c));
    if (hasUnit && hasTenant) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) {
    return { propertyHeader, asOfHeader, rows: [] };
  }

  const headers = (grid[headerRowIdx] || []).map(c => String(c).trim().toLowerCase());
  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex(h => h === n.toLowerCase() || h.includes(n.toLowerCase()));
      if (i !== -1) return i;
    }
    return -1;
  };

  const cols = {
    unit: idx("unit", "unit id", "unit #"),
    building: idx("building", "bldg"),
    tenant: idx("tenant", "customer", "lessee"),
    leaseType: idx("lease type", "type"),
    sqft: idx("sqft", "sq ft", "area", "square feet"),
    leaseFrom: idx("lease from", "start", "begin", "lease start", "from date"),
    leaseTo: idx("lease to", "end", "expire", "lease end", "to date"),
    monthlyRent: idx("monthly rent", "rent", "base rent"),
    monthlyElectric: idx("electric", "utility"),
    securityDeposit: idx("deposit", "security"),
    status: idx("status"),
    pastDueAmount: idx("past due", "balance"),
  };

  const rows: RentRollRow[] = [];
  for (let i = headerRowIdx + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const unit = cols.unit >= 0 ? String(r[cols.unit] ?? "").trim() : "";
    if (!unit) continue;
    // Skip subtotal rows ("Total", "Grand Total", "Sum", etc.)
    if (/^total\b|grand\s*total|^sum\b/i.test(unit)) continue;
    rows.push({
      unit,
      building: cols.building >= 0 ? String(r[cols.building] ?? "").trim() : "",
      tenant: cols.tenant >= 0 ? String(r[cols.tenant] ?? "").trim() : "",
      leaseType: cols.leaseType >= 0 ? String(r[cols.leaseType] ?? "").trim() : "",
      sqft: cols.sqft >= 0 ? toNumber(r[cols.sqft]) : 0,
      leaseFrom: cols.leaseFrom >= 0 ? formatDate(r[cols.leaseFrom]) : "",
      leaseTo: cols.leaseTo >= 0 ? formatDate(r[cols.leaseTo]) : "",
      monthlyRent: cols.monthlyRent >= 0 ? toNumber(r[cols.monthlyRent]) : 0,
      monthlyElectric: cols.monthlyElectric >= 0 ? toNumber(r[cols.monthlyElectric]) : 0,
      securityDeposit: cols.securityDeposit >= 0 ? toNumber(r[cols.securityDeposit]) : 0,
      status: cols.status >= 0 ? String(r[cols.status] ?? "").trim().toLowerCase() : "",
      pastDueAmount: cols.pastDueAmount >= 0 ? toNumber(r[cols.pastDueAmount]) : 0,
    });
  }

  return { propertyHeader, asOfHeader, rows };
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
    // Excel serial date — convert
    const d = xlsx.SSF.parse_date_code(v);
    if (!d) return String(v);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // Pass through ISO; convert MM/DD/YYYY to YYYY-MM-DD if possible
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [, mo, d, y] = m;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s;
}

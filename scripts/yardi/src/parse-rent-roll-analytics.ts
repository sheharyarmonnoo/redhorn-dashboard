import * as xlsx from "xlsx";
import type { ParsedRentRoll, RentRollRow } from "./parse-rent-roll.js";

/**
 * Parse the Commercial Analytics Rent Roll Excel (CommReportPropertySummary.aspx).
 *
 * Layout (verified 2026-05; "Show Detail" enabled):
 *   R0:   Title "Rent Roll"
 *   R1:   "All Selected Properties  From Date: 05/01/2026"
 *   R2-4: Three-row column header (Yardi wraps long labels onto multiple rows)
 *         Col 0  Property
 *         Col 1  Unit(s)
 *         Col 2  Lease  (tenant name)
 *         Col 3  Lease Type
 *         Col 4  Area
 *         Col 5  Lease From  (Excel serial date)
 *         Col 6  Lease To    (Excel serial date)
 *         Col 7  Term  (months)
 *         Col 8  Monthly Rent
 *         Col 9  Monthly Rent Per Area
 *         Col 10 Annual Rent
 *         Col 11 Annual Rent Per Area
 *         Col 12 Annual Rec. Per Area
 *         Col 13 Annual Misc Per Area
 *         Col 14 Security Deposit             ← THE KEY COLUMN
 *         Col 15 LOC Amount/Bank Guarantee
 *
 *   Rows R5+ alternate between:
 *     - Property header row: e.g. "bel - 7012 Belgold Business Park LLC,Houston" (col 0 only)
 *     - "Current Leases" sub-header row (col 0 only)
 *     - Lease rows: 16 columns of data, col 0 = property code (e.g. "bel" / "hol")
 *     - Subtotal row: col 0 = "Total Current"
 *     - Summary block (Total Units / Occupied / Vacant / Total)
 *     - Repeat per property
 *     - Final "Grand Total" row
 *
 *   Vacant units appear with col 2 = "VACANT" and zero rents/term.
 *
 * Numbers are stored natively (Excel numeric cells), so no $/comma stripping
 * needed. Dates are Excel serials — convert via xlsx.SSF.parse_date_code.
 */
export function parseRentRollAnalytics(filePath: string): ParsedRentRoll {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

  const propertyHeader = String(grid[0]?.[0] ?? "").trim();
  const asOfHeader = String(grid[1]?.[0] ?? "").trim();

  // Fixed column indices — Yardi's Commercial Analytics export is
  // structurally stable. We don't need header sniffing because the report
  // template is identical every time.
  const COL = {
    property: 0,
    unit: 1,
    tenant: 2,
    leaseType: 3,
    sqft: 4,
    leaseFrom: 5,
    leaseTo: 6,
    term: 7,
    monthlyRent: 8,
    monthlyRentPerSF: 9,
    annualRent: 10,
    annualRentPerSF: 11,
    annualRecPerSF: 12,
    annualMiscPerSF: 13,
    securityDeposit: 14,
    locAmount: 15,
  };

  const rows: RentRollRow[] = [];

  // Find the first data row by walking past the multi-row header. Yardi's
  // header occupies rows 2-4 (0-indexed); a data row has a numeric Area
  // value (col 4) — that's the simplest fingerprint.
  let dataStart = 2;
  for (let i = 2; i < grid.length; i++) {
    const r = grid[i] || [];
    const c0 = String(r[COL.property] ?? "").trim();
    if (c0 && typeof r[COL.sqft] === "number") {
      dataStart = i;
      break;
    }
    // Property section header reached (e.g. "bel - 7012 Belgold...") means
    // we've passed the column header rows
    if (c0 && /^\S+\s+-\s+/.test(c0) && !r[COL.unit]) {
      dataStart = i + 1;
      break;
    }
  }

  for (let i = dataStart; i < grid.length; i++) {
    const r = grid[i] || [];
    const c0 = String(r[COL.property] ?? "").trim();
    const c1 = String(r[COL.unit] ?? "").trim();
    const c2 = String(r[COL.tenant] ?? "").trim();

    // Skip totals / sub-headers / blank rows
    if (!c0) continue;
    if (/^total\b|grand\s*total|^summary/i.test(c0)) continue;
    if (/^current leases$/i.test(c0)) continue;
    // Property section headers ("bel - 7012 Belgold ...") — skip
    if (/^\S+\s+-\s+/.test(c0) && !c1) continue;
    // Occupancy summary block — col 0 is "Occupied" / "Vacant" / "Total"
    // and col 2 is numeric (the sqft total) instead of a tenant name.
    // Distinguish from VACANT data rows (which have col 2 === "VACANT").
    if (/^(occupied|vacant|total)$/i.test(c0) && c2 !== "VACANT") continue;
    // Multi-row column-header continuation cells
    if (!c1 && !c2) continue;
    // Defensive: header strings that survived ("Unit(s)" / "Lease" etc.)
    // — a real data row always has a numeric Area
    if (typeof r[COL.sqft] !== "number") continue;

    const unit = c1;
    if (!unit) continue;

    const tenant = c2;
    const leaseType = String(r[COL.leaseType] ?? "").trim();
    const isVacant = /^vacant$/i.test(tenant);

    rows.push({
      unit,
      // The property code itself lives in col 0 (e.g. "bel", "hol").
      // Building isn't in this report — the unit string carries it as a prefix.
      building: deriveBuilding(unit),
      tenant: isVacant ? "VACANT" : tenant,
      leaseType,
      sqft: toNumber(r[COL.sqft]),
      leaseFrom: formatDate(r[COL.leaseFrom]),
      leaseTo: formatDate(r[COL.leaseTo]),
      leaseTermMonths: toNumber(r[COL.term]),
      monthlyRent: toNumber(r[COL.monthlyRent]),
      monthlyRentPerSF: toNumber(r[COL.monthlyRentPerSF]),
      annualRent: toNumber(r[COL.annualRent]),
      annualRentPerSF: toNumber(r[COL.annualRentPerSF]),
      annualRecPerSF: toNumber(r[COL.annualRecPerSF]),
      annualMiscPerSF: toNumber(r[COL.annualMiscPerSF]),
      monthlyElectric: 0,                              // not in this report
      securityDeposit: toNumber(r[COL.securityDeposit]),
      locAmount: toNumber(r[COL.locAmount]),
      status: isVacant ? "vacant" : "current",
      pastDueAmount: 0,                                // not in this report
    });
  }

  return { propertyHeader, asOfHeader, rows };
}

/**
 * Some unit strings are comma-separated lists (e.g. "A-103,  A-112,  A-85"
 * → that lease occupies three units). The first segment is the canonical
 * unit; we strip whitespace and use that as the building hint.
 *
 * Building letters in Redhorn properties are always the first character
 * before the dash (A-103 → "A"). For numeric-only units this returns "".
 */
function deriveBuilding(unit: string): string {
  if (!unit) return "";
  const first = unit.split(",")[0].trim();
  const m = first.match(/^([A-Za-z]+)(?:\d|-)/);
  return m ? m[1].toUpperCase() : "";
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

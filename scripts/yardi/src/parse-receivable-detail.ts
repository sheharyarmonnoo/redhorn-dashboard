import * as xlsx from "xlsx";

export interface ParsedReceivableDetail {
  rows: Array<{
    tenantName: string;
    unit?: string;
    controlNumber?: string;
    transactionDate?: string;
    postMonth?: string;
    chargeCode?: string;
    description?: string;
    charges: number;
    receipts: number;
    balance: number;
  }>;
  // Per-lease metadata extracted from each "Lease Information" block. The
  // Lease Ledger carries lease term + monthly rent + sqft data the rent-roll
  // dashboard panel doesn't expose — use this to enrich tenant rows on ingest.
  // Also includes the aging bucket row at the end of each section.
  leases: Array<{
    tenantName: string;
    unit?: string;
    leaseType?: string;
    sqft?: number;
    leaseFrom?: string;
    leaseTo?: string;
    monthlyRent?: number;
    // Aging buckets from the row that closes each lease section. Sourced
    // from columns: c1=0-30, c4=31-60, c6=61-90, c9=above 90, c15=Amount Due.
    aging0_30?: number;
    aging31_60?: number;
    aging61_90?: number;
    agingOver90?: number;
    amountDue?: number;
  }>;
}

/**
 * Parse a Yardi Commercial Lease Ledger SSRS export.
 *
 * The Lease Ledger format is a sectioned report — each lease has a metadata
 * block, a transaction-detail table, and an aging row. We walk row-by-row
 * extracting the tenant name + unit from each "Lease Information" block, then
 * the transactions until we hit the aging row or the next Lease Information.
 *
 * Column layout (verified against rs_Comm_Lease_Ledger output):
 *   Col 1: Date (e.g. "03/01/26")
 *   Col 2: Description ("CAM-CY Est CAM/Escalation (03/2026)")
 *   Col 7: Charges
 *   Col 10: Payments / Receipts
 *   Col 16: Running Balance
 */
export function parseReceivableDetail(filePath: string): ParsedReceivableDetail {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

  const rows: ParsedReceivableDetail["rows"] = [];
  const leases: ParsedReceivableDetail["leases"] = [];
  let i = 0;
  while (i < grid.length) {
    const row = grid[i] || [];
    const c1 = (row[1] || "").toString().trim();
    if (c1 === "Lease Information") {
      const meta = readLeaseMetadata(grid, i);
      if (meta.tenantName) {
        leases.push({
          tenantName: meta.tenantName,
          unit: meta.unit || undefined,
          leaseType: meta.leaseType || undefined,
          sqft: meta.sqft || undefined,
          leaseFrom: meta.leaseFrom || undefined,
          leaseTo: meta.leaseTo || undefined,
          monthlyRent: meta.monthlyRent || undefined,
        });
      }
      const tx = readTransactions(grid, meta.nextRow, meta.tenantName, meta.unit);
      rows.push(...tx.rows);
      // Back-fill aging data into the lease entry we just pushed.
      if (tx.aging && leases.length > 0) {
        const last = leases[leases.length - 1];
        last.aging0_30 = tx.aging.aging0_30;
        last.aging31_60 = tx.aging.aging31_60;
        last.aging61_90 = tx.aging.aging61_90;
        last.agingOver90 = tx.aging.agingOver90;
        last.amountDue = tx.aging.amountDue;
      }
      i = tx.nextRow;
    } else {
      i++;
    }
  }
  return { rows, leases };
}

interface LeaseMeta {
  tenantName: string;
  unit: string;
  leaseType: string;
  sqft: number;
  leaseFrom: string;
  leaseTo: string;
  monthlyRent: number;
  nextRow: number;
}

function readLeaseMetadata(grid: any[][], startIdx: number): LeaseMeta {
  let tenantName = "";
  let unit = "";
  let leaseType = "";
  let sqft = 0;
  let leaseFrom = "";
  let leaseTo = "";
  let monthlyRent = 0;
  let i = startIdx + 1;
  const limit = Math.min(grid.length, startIdx + 25);
  while (i < limit) {
    const row = grid[i] || [];
    const c1 = (row[1] || "").toString();
    const c8 = (row[8] || "").toString().trim();
    const c11 = (row[11] || "").toString().trim();
    const c12 = (row[12] || "").toString().trim();
    const c13 = (row[13] || "").toString().trim();
    const c20 = (row[20] || "").toString().trim();
    const c2 = (row[2] || "").toString().trim();

    // Tenant name lives in col 1 as a multi-line cell; first line is the name.
    if (!tenantName && c1.trim().length > 0 && c1.trim() !== "Lease Information") {
      const firstLine = (c1.split("\n")[0] || "").trim();
      if (firstLine.length > 0 && firstLine.length < 120) tenantName = firstLine;
    }

    // Assigned Space(s) → unit
    if (c8 === "Assigned Space(s)" && c12) unit = c12;

    // Lease Type (col 11) — e.g. "Office Net Lease", "Office Gross Lease"
    if (c8 === "Lease Type" && c11) leaseType = c11;

    // Lease Term — From (col 13) … To (col 20). Both MM/DD/YYYY.
    if (c8 === "Lease Term") {
      if (c13) leaseFrom = formatDate(c13);
      if (c20) leaseTo = formatDate(c20);
    }

    // Lease Area (col 11) — e.g. "3,600(Net Lease)" → 3600
    if (c8 === "Lease Area" && c11) {
      const m = c11.replace(/,/g, "").match(/(\d+)/);
      if (m) sqft = Number(m[1]) || 0;
    }

    // Monthly Rent (col 11) — numeric or numeric-string
    if (c8 === "Monthly Rent" && c11) {
      const cleaned = c11.replace(/[$,]/g, "").trim();
      const n = Number(cleaned);
      if (Number.isFinite(n)) monthlyRent = n;
    }

    // Transaction header marks the boundary
    if (c1.trim() === "Date" && c2.startsWith("Description")) {
      return { tenantName, unit, leaseType, sqft, leaseFrom, leaseTo, monthlyRent, nextRow: i + 1 };
    }
    i++;
  }
  return { tenantName, unit, leaseType, sqft, leaseFrom, leaseTo, monthlyRent, nextRow: i };
}

interface AgingData {
  aging0_30: number;
  aging31_60: number;
  aging61_90: number;
  agingOver90: number;
  amountDue: number;
}

function readTransactions(
  grid: any[][],
  startIdx: number,
  tenantName: string,
  unit: string
): { rows: ParsedReceivableDetail["rows"]; nextRow: number; aging?: AgingData } {
  const rows: ParsedReceivableDetail["rows"] = [];
  let i = startIdx;
  let aging: AgingData | undefined;
  while (i < grid.length) {
    const row = grid[i] || [];
    const c1 = (row[1] || "").toString().trim();
    const c2 = (row[2] || "").toString().trim();

    // Aging row closes each lease section. Read bucket amounts then stop.
    // Column layout (verified from Yardi SSRS): c1=0-30 label, c4=31-60,
    // c6=61-90, c9=over90, c15=Amount Due (total balance outstanding).
    if (/^0-?\s*30/.test(c1) || /Days/i.test(c1)) {
      aging = {
        aging0_30: toNumber(row[1]),
        aging31_60: toNumber(row[4]),
        aging61_90: toNumber(row[6]),
        agingOver90: toNumber(row[9]),
        amountDue: toNumber(row[15]),
      };
      // If c1 is the "0-30 Days" label (text not number), the 0-30 amount
      // may be in c2 or c3 instead. Fallback: use c2 if c1 parsed as 0.
      if (aging.aging0_30 === 0) aging.aging0_30 = toNumber(row[2]);
      i++;
      break;
    }
    if (c1 === "Lease Information") break;

    const dateRaw = c1;
    const desc = c2;
    const charges = toNumber(row[7]);
    const receipts = toNumber(row[10]);
    const balance = toNumber(row[16]);

    if (dateRaw || desc || charges !== 0 || receipts !== 0) {
      const transactionDate = formatDate(dateRaw);
      // Skip totally empty rows (Yardi pads sections with blank rows)
      if (!transactionDate && !desc && charges === 0 && receipts === 0) {
        i++;
        continue;
      }
      // Pull a charge code prefix if the description looks like "CAM-Electric ..." etc.
      const chargeCode = (desc.split(/\s+/)[0] || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 32) || undefined;
      rows.push({
        tenantName,
        unit: unit || undefined,
        transactionDate: transactionDate || undefined,
        postMonth: transactionDate ? transactionDate.slice(0, 7) : undefined,
        description: desc || undefined,
        chargeCode: chargeCode && chargeCode.length > 1 ? chargeCode : undefined,
        charges,
        receipts,
        balance,
      });
    }
    i++;
  }
  return { rows, nextRow: i, aging };
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
    if (!d) return "";
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // "03/01/26" → "2026-03-01"
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [, mo, d, y] = m;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

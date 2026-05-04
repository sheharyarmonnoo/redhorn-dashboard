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
}

/**
 * Parse a Yardi Receivable Detail Excel into per-tenant transaction rows.
 *
 * Auto-detects header row by looking for tenant + charge/receipt columns. Then
 * maps columns by fuzzy header match. Skips subtotal rows and any rows that
 * lack a tenant identifier.
 */
export function parseReceivableDetail(filePath: string): ParsedReceivableDetail {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const cells = (grid[i] || []).map(c => String(c).trim().toLowerCase());
    const hasTenant = cells.some(c => /tenant|customer|lessee|lease\s*name/.test(c));
    const hasMoney = cells.some(c => /charges|receipts|charge|receipt|amount|balance/.test(c));
    if (hasTenant && hasMoney) {
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
    tenantName: idx("lease name", "tenant", "customer", "lessee", "name"),
    unit: idx("unit id", "unit"),
    controlNumber: idx("control", "control number", "doc", "reference"),
    transactionDate: idx("trans date", "transaction date", "post date", "date"),
    postMonth: idx("post month", "post period", "period"),
    chargeCode: idx("charge code", "code", "type"),
    description: idx("description", "memo", "notes"),
    charges: idx("charges", "charge", "billed"),
    receipts: idx("receipts", "receipt", "payments", "paid"),
    balance: idx("balance", "open", "outstanding"),
    amount: idx("amount", "net"),
  };

  const rows: ParsedReceivableDetail["rows"] = [];
  for (let i = headerRowIdx + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const tenant = cols.tenantName >= 0 ? String(r[cols.tenantName] ?? "").trim() : "";
    if (!tenant) continue;
    if (/^total\b|grand\s*total|^sum\b/i.test(tenant)) continue;

    const transDate = cols.transactionDate >= 0 ? formatDate(r[cols.transactionDate]) : "";
    const postMonthRaw = cols.postMonth >= 0 ? String(r[cols.postMonth] ?? "").trim() : "";
    const postMonth = postMonthRaw && /^\d{4}-\d{2}/.test(postMonthRaw)
      ? postMonthRaw.slice(0, 7)
      : (transDate ? transDate.slice(0, 7) : undefined);

    let charges = cols.charges >= 0 ? toNumber(r[cols.charges]) : 0;
    let receipts = cols.receipts >= 0 ? toNumber(r[cols.receipts]) : 0;
    // Some exports collapse charges + receipts into a single signed amount.
    if (charges === 0 && receipts === 0 && cols.amount >= 0) {
      const amt = toNumber(r[cols.amount]);
      if (amt > 0) charges = amt;
      else if (amt < 0) receipts = -amt;
    }
    const balance = cols.balance >= 0 ? toNumber(r[cols.balance]) : (charges - receipts);

    if (charges === 0 && receipts === 0 && balance === 0) continue;

    rows.push({
      tenantName: tenant,
      unit: cols.unit >= 0 ? String(r[cols.unit] ?? "").trim() : undefined,
      controlNumber: cols.controlNumber >= 0 ? String(r[cols.controlNumber] ?? "").trim() : undefined,
      transactionDate: transDate || undefined,
      postMonth,
      chargeCode: cols.chargeCode >= 0 ? String(r[cols.chargeCode] ?? "").trim() : undefined,
      description: cols.description >= 0 ? String(r[cols.description] ?? "").trim() : undefined,
      charges,
      receipts,
      balance,
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
    if (!d) return "";
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [, mo, d, y] = m;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

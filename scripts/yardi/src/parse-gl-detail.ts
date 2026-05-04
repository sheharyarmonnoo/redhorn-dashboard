import * as xlsx from "xlsx";

export interface ParsedGlDetail {
  rows: Array<{
    postingDate: string;
    postMonth?: string;
    accountCode: string;
    accountName: string;
    description: string;
    reference?: string;
    vendor?: string;
    debit: number;
    credit: number;
    amount: number;
  }>;
}

/**
 * Parse a Yardi GL Transaction Detail Excel into structured rows.
 *
 * Yardi's GL detail output varies between instances. We auto-detect the header
 * row by matching expected column labels (date + account + debit/credit), then
 * map columns by fuzzy header match. Numeric parsing handles parenthesized
 * negatives, $ signs, and commas.
 */
export function parseGlDetail(filePath: string): ParsedGlDetail {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const cells = (grid[i] || []).map(c => String(c).trim().toLowerCase());
    const hasDate = cells.some(c => /post\s*date|date|trans\s*date/.test(c));
    const hasAccount = cells.some(c => /account|gl|acct/.test(c));
    const hasDebitOrAmount = cells.some(c => /debit|credit|amount/.test(c));
    if (hasDate && hasAccount && hasDebitOrAmount) {
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
    postingDate: idx("post date", "post_date", "trans date", "transaction date", "date"),
    accountCode: idx("account code", "acct code", "gl account", "account #", "account"),
    accountName: idx("account name", "acct name", "description"),
    description: idx("notes", "description", "memo", "remarks"),
    reference: idx("reference", "ref", "control", "doc"),
    vendor: idx("vendor", "payee"),
    debit: idx("debit"),
    credit: idx("credit"),
    amount: idx("amount", "net"),
  };

  // Some Yardi GL Detail exports use one column for "Description" that doubles
  // as account name + JE memo. If we matched the same column twice, keep the
  // first hit only and clear the duplicate.
  if (cols.description === cols.accountName) cols.description = -1;

  const rows: ParsedGlDetail["rows"] = [];
  for (let i = headerRowIdx + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const dateRaw = cols.postingDate >= 0 ? r[cols.postingDate] : "";
    const postingDate = formatDate(dateRaw);
    if (!postingDate) continue;

    const acctCode = cols.accountCode >= 0 ? String(r[cols.accountCode] ?? "").trim() : "";
    const acctName = cols.accountName >= 0 ? String(r[cols.accountName] ?? "").trim() : "";
    if (!acctCode && !acctName) continue;
    // Skip subtotal/total rows
    if (/^total\b|grand\s*total|^sum\b/i.test(acctName)) continue;

    const debit = cols.debit >= 0 ? toNumber(r[cols.debit]) : 0;
    const credit = cols.credit >= 0 ? toNumber(r[cols.credit]) : 0;
    const explicit = cols.amount >= 0 ? toNumber(r[cols.amount]) : 0;
    const amount = explicit !== 0 ? explicit : (debit - credit);

    rows.push({
      postingDate,
      postMonth: postingDate.slice(0, 7),
      accountCode: acctCode,
      accountName: acctName,
      description: cols.description >= 0 ? String(r[cols.description] ?? "").trim() : "",
      reference: cols.reference >= 0 ? String(r[cols.reference] ?? "").trim() : undefined,
      vendor: cols.vendor >= 0 ? String(r[cols.vendor] ?? "").trim() : undefined,
      debit,
      credit,
      amount,
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

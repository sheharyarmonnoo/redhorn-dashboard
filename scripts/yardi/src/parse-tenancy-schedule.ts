import * as xlsx from "xlsx";

/**
 * Parse the Yardi Tenancy Schedule (CommTenancyScheduleSummary.aspx) Excel.
 *
 * Layout (verified 2026-05; with RentSchedule + ChargeSchedule + Amendments
 * + FutureAmendment checkboxes enabled):
 *
 *   R0:  "Tenancy Schedule I"
 *   R1:  "Property: hol  As of Date: 05/07/2026  ..."
 *   R2-4 (header rows):
 *        Col 0  Property
 *        Col 1  Unit(s)
 *        Col 2  Lease (tenant name + lease code in parens)
 *        Col 3  Lease Type
 *        Col 4  Area
 *        Col 5  Lease From  (Excel serial)
 *        Col 6  Lease To    (Excel serial)
 *        Col 7  Term (months)
 *        Col 8  Tenancy Years
 *        Col 9  Monthly Rent
 *        Col 10 Monthly Rent/Area
 *        Col 11 Annual Rent
 *        Col 12 Annual Rent/Area
 *        Col 13 Annual Rec/Area
 *        Col 14 Annual Misc/Area
 *        Col 15 Security Deposit Received
 *        Col 16 LOC Amount/Bank Guarantee
 *
 *   Then per lease (alternating block):
 *     LEASE_ROW: cols 0-16 populated (col 0 has property name + code)
 *     blank row
 *     "Rent Steps" header row: col 1 = "Rent Steps"
 *     RNT step rows: col 2 = "RNT", col 7=From (serial), col 8=To (serial),
 *                    col 9 = Monthly Amt
 *     blank row
 *     "Charge Schedules" header row: col 1 = "Charge Schedules"
 *     Charge schedule rows for CAM/CAM-ELE/RNT (we ignore — Rent Steps is
 *     the canonical escalation source)
 *     blank row
 *     "Amendment" header row: col 1 = "Amendment"
 *     Amendment rows (we ignore)
 *     blank row
 *
 * Goal: for each lease, find the NEXT rent step with From > asOfDate. Output
 * `{ unit, tenant, nextRentIncrease (ISO date), nextRentIncreaseAmount }`.
 */

export interface TenancyScheduleRow {
  unit: string;     // comma-separated as-is (matches rent-roll-full)
  tenant: string;   // tenant name (lease code stripped)
  nextRentIncrease: string;       // ISO YYYY-MM-DD
  nextRentIncreaseAmount: number; // monthly $
}

export interface ParsedTenancySchedule {
  asOfHeader: string;
  asOfDate: string;          // ISO YYYY-MM-DD
  rows: TenancyScheduleRow[];
}

const COL = {
  property: 0,
  unit: 1,
  tenant: 2,
  leaseType: 3,
  area: 4,
  leaseFrom: 5,
  leaseTo: 6,
  term: 7,
  monthlyRent: 9,
  // Step row columns (when col 1 = "" but col 2 = "RNT")
  stepCharge: 2,
  stepType: 3,
  stepUnit: 4,
  stepAreaLabel: 5,
  stepArea: 6,
  stepFrom: 7,
  stepTo: 8,
  stepMonthlyAmt: 9,
};

export function parseTenancySchedule(filePath: string): ParsedTenancySchedule {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

  const asOfHeader = String(grid[1]?.[0] ?? "").trim();
  const asOfDate = parseAsOfDate(asOfHeader) || new Date().toISOString().slice(0, 10);
  const asOfSerial = isoToSerial(asOfDate);

  const rows: TenancyScheduleRow[] = [];

  // Walk every row. When we hit a lease header (col 0 has "(...)"  i.e.
  // "Property Name (code)" pattern), capture lease info and then scan
  // subsequent rows for "Rent Steps" → RNT step rows. Stop when we hit
  // a blank row followed by another lease header.
  let i = 0;
  while (i < grid.length) {
    const r = grid[i] || [];
    const c0 = String(r[COL.property] ?? "").trim();
    const c1 = String(r[COL.unit] ?? "").trim();

    // Lease header row: col 0 has "(code)" pattern AND col 1 is non-empty (unit)
    const isLeaseHeader = c0 && /\([^)]+\)$/.test(c0) && c1.length > 0;
    if (!isLeaseHeader) {
      i++;
      continue;
    }

    const unit = c1;
    const tenantRaw = String(r[COL.tenant] ?? "").trim();
    const tenant = tenantRaw.replace(/\s*\([^)]+\)\s*$/, "").trim();

    // Scan following rows until we hit a blank row with no continuation OR
    // another lease header. Within that window, look for "Rent Steps" subhead
    // followed by RNT rows with valid From/Monthly Amt.
    let nextRentIncrease = "";
    let nextRentIncreaseAmount = 0;
    let inRentSteps = false;
    let j = i + 1;
    while (j < grid.length) {
      const sr = grid[j] || [];
      const sc0 = String(sr[COL.property] ?? "").trim();
      const sc1 = String(sr[COL.unit] ?? "").trim();
      const sc2 = String(sr[COL.tenant] ?? "").trim();
      // Hit the next lease header — stop
      if (sc0 && /\([^)]+\)$/.test(sc0) && sc1.length > 0) break;
      // Section header: col 1 has "Rent Steps" / "Charge Schedules" / "Amendment"
      if (/^rent\s*steps$/i.test(sc1)) {
        inRentSteps = true;
        j++;
        continue;
      }
      if (/^charge\s*schedules?$/i.test(sc1) || /^amendment$/i.test(sc1)) {
        inRentSteps = false;
        j++;
        continue;
      }
      if (inRentSteps && /^rnt$/i.test(sc2)) {
        // Step row. Cols 7=From, 8=To, 9=MonthlyAmt
        const fromVal = sr[COL.stepFrom];
        const monthlyVal = sr[COL.stepMonthlyAmt];
        const fromSerial = typeof fromVal === "number" ? fromVal : Number(fromVal);
        const monthly = toNumber(monthlyVal);
        if (Number.isFinite(fromSerial) && fromSerial > asOfSerial && monthly > 0) {
          // Pick the EARLIEST future step with the smallest From > asOf
          if (!nextRentIncrease || fromSerial < isoToSerial(nextRentIncrease)) {
            nextRentIncrease = serialToIso(fromSerial);
            nextRentIncreaseAmount = monthly;
          }
        }
      }
      j++;
    }

    if (nextRentIncrease) {
      rows.push({
        unit,
        tenant,
        nextRentIncrease,
        nextRentIncreaseAmount,
      });
    }

    i = j;
  }

  return { asOfHeader, asOfDate, rows };
}

// "Property: hol  As of Date: 05/07/2026  Book: ..." → "2026-05-07"
function parseAsOfDate(header: string): string | null {
  const m = header.match(/As\s*of\s*Date\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (!m) return null;
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// Excel serial date → ISO. xlsx's SSF handles the Excel 1900 leap-year quirk.
function serialToIso(serial: number): string {
  const dc = xlsx.SSF.parse_date_code(serial);
  if (!dc) return "";
  return `${dc.y}-${String(dc.m).padStart(2, "0")}-${String(dc.d).padStart(2, "0")}`;
}

function isoToSerial(iso: string): number {
  // Inverse of serialToIso. We use the same epoch xlsx uses (1899-12-30).
  if (!iso) return 0;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return 0;
  const utc = Date.UTC(y, m - 1, d);
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((utc - epoch) / (24 * 60 * 60 * 1000));
}

function toNumber(v: any): number {
  if (typeof v === "number") return v;
  if (v === "" || v == null) return 0;
  const s = String(v).replace(/,/g, "").replace(/\$/g, "").trim();
  if (s === "" || s === "-") return 0;
  const neg = /^\(.*\)$/.test(s);
  const n = Number(neg ? s.slice(1, -1) : s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

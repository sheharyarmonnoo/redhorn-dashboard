import * as xlsx from "xlsx";

export interface ParsedTotalUnits {
  rows: Array<{
    unit: string;
    building?: string;
    sqft?: number;
    amps?: number;
    hvacType?: string;
  }>;
}

/**
 * Parse a Yardi Total Units listing Excel into structured rows.
 *
 * Yardi's "Total Units" listing format varies — common columns: Unit, Building,
 * Sq Ft (or Area), and sometimes HVAC, AMP, Status. We auto-detect a header row
 * containing "Unit", then map known columns by fuzzy header match.
 */
export function parseTotalUnits(filePath: string): ParsedTotalUnits {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const cells = (grid[i] || []).map(c => String(c).trim().toLowerCase());
    if (cells.some(c => c === "unit" || /^unit\s*(id|#)?$/.test(c))) {
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
    unit: idx("unit", "unit id", "unit #"),
    building: idx("building", "bldg"),
    sqft: idx("sqft", "sq ft", "area", "square feet"),
    amps: idx("amp", "amps", "amperage"),
    hvac: idx("hvac", "ac type"),
  };

  const rows: ParsedTotalUnits["rows"] = [];
  for (let i = headerRowIdx + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const unit = cols.unit >= 0 ? String(r[cols.unit] ?? "").trim() : "";
    if (!unit) continue;
    if (/^total|grand\s*total|^sum/i.test(unit)) continue;
    rows.push({
      unit,
      building: cols.building >= 0 ? String(r[cols.building] ?? "").trim() : "",
      sqft: cols.sqft >= 0 ? toNumber(r[cols.sqft]) : 0,
      amps: cols.amps >= 0 ? toNumber(r[cols.amps]) : 0,
      hvacType: cols.hvac >= 0 ? String(r[cols.hvac] ?? "").trim() : "",
    });
  }
  return { rows };
}

function toNumber(v: any): number {
  if (typeof v === "number") return v;
  if (v === "" || v === null || v === undefined) return 0;
  const s = String(v).replace(/,/g, "").replace(/\$/g, "").trim();
  if (s === "" || s === "-") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

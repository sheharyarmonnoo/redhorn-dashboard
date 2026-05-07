import * as xlsx from "xlsx";

/** Excel serial number → ISO date string. Returns undefined for blank/invalid. */
function excelSerialToIso(serial: any): string | undefined {
  if (serial === "" || serial === null || serial === undefined) return undefined;
  const n = typeof serial === "number" ? serial : Number(serial);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // Excel epoch: 1899-12-30 (Lotus bug). 25569 = 1970-01-01.
  const ms = (n - 25569) * 86400 * 1000;
  return new Date(ms).toISOString();
}

function toNumber(v: any): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const cleaned = String(v).replace(/[$,]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function toString(v: any): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

const SECTION_TO_STAGE: Array<{ pattern: RegExp; stage: string }> = [
  { pattern: /^closed deals$|^closed won$|^closed$/i, stage: "closed" },
  { pattern: /^closed lost|^dead/i, stage: "dead" },
  { pattern: /^loi sent|^loi$/i, stage: "loi" },
  { pattern: /^under review|^underwriting/i, stage: "underwriting" },
  { pattern: /^due diligence/i, stage: "due_diligence" },
  { pattern: /^closing$/i, stage: "closing" },
  { pattern: /^working|^active$/i, stage: "outreach" },
  { pattern: /^cold outreach|^prospect|^prospecting/i, stage: "lead" },
];

const DEAL_STAGE_TO_STAGE: Array<{ pattern: RegExp; stage: string }> = [
  { pattern: /negotiation|loi/i, stage: "loi" },
  { pattern: /closed lost|dead/i, stage: "dead" },
  { pattern: /closed won|closed$/i, stage: "closed" },
  { pattern: /due diligence/i, stage: "due_diligence" },
  { pattern: /under review|underwriting/i, stage: "underwriting" },
  { pattern: /closing/i, stage: "closing" },
  { pattern: /prospect/i, stage: "lead" },
  { pattern: /outreach|active|working/i, stage: "outreach" },
];

function mapStage(sectionLabel: string | undefined, dealStageCol: string | undefined): string {
  if (dealStageCol) {
    for (const { pattern, stage } of DEAL_STAGE_TO_STAGE) {
      if (pattern.test(dealStageCol)) return stage;
    }
  }
  if (sectionLabel) {
    for (const { pattern, stage } of SECTION_TO_STAGE) {
      if (pattern.test(sectionLabel)) return stage;
    }
  }
  return "lead";
}

export interface ParsedDeal {
  mondayItemId: string;
  name: string;
  address?: string;
  sqft?: number;
  askingPrice?: number;
  stage: string;
  source?: string;
  assignedTo?: string;
  createdAt?: string;
  contacts: Array<{ name: string; role: string; email: string; phone?: string }>;
  seedNote?: string;
  customFields: Record<string, any>;
}

export interface ParsedUpdate {
  itemId: string;
  author: string;
  text: string;
  createdAt: string;
}

/**
 * Walk the "deal flow tracker" sheet. The sheet is sectioned by stage, with
 * each section starting with a label row (e.g. "LOI Sent"), followed by a
 * column-header row, then deal rows, then a blank row before the next section.
 */
export function parseDealFlow(filePath: string): {
  deals: ParsedDeal[];
  updates: ParsedUpdate[];
} {
  const wb = xlsx.readFile(filePath);
  const dealsSheet = wb.Sheets["deal flow tracker"];
  const updatesSheet = wb.Sheets["updates"];
  if (!dealsSheet) throw new Error('Sheet "deal flow tracker" not found');

  const grid = xlsx.utils.sheet_to_json<any[]>(dealsSheet, { header: 1, defval: "" });

  // Pass 1: find all "Name | Subitems | Date Entered ..." header rows. Their
  // row index gives us the column→index map for the section beneath. The
  // section label is the row immediately above the header row (or further
  // up if there are blank rows).
  const headers: Array<{ row: number; cols: string[]; sectionLabel: string }> = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!Array.isArray(row)) continue;
    const cell = String(row[0] ?? "").trim();
    if (cell === "Name") {
      // Look up for nearest non-blank section label.
      let sectionLabel = "";
      for (let up = r - 1; up >= 0; up--) {
        const upCell = String(grid[up]?.[0] ?? "").trim();
        if (upCell && upCell !== "Name") { sectionLabel = upCell; break; }
      }
      headers.push({ row: r, cols: row.map((v: any) => String(v ?? "").trim()), sectionLabel });
    }
  }

  const deals: ParsedDeal[] = [];

  for (let h = 0; h < headers.length; h++) {
    const { row: headerRow, cols, sectionLabel } = headers[h];
    const nextHeaderRow = h + 1 < headers.length ? headers[h + 1].row : grid.length;
    const colIdx: Record<string, number> = {};
    for (let i = 0; i < cols.length; i++) {
      if (cols[i]) colIdx[cols[i]] = i;
    }

    // Skip section labels themselves
    for (let r = headerRow + 1; r < nextHeaderRow; r++) {
      const row = grid[r];
      if (!Array.isArray(row)) continue;
      // Stop at blank-row gap before the next section's title.
      // A row counts as a deal row if either Name or Address is non-blank
      // and Item ID is set (skip section sub-totals which are the row ranges
      // shown as "2026-02-24 to 2026-04-13").
      const name = toString(row[colIdx["Name"]]);
      const address = toString(row[colIdx["Address"]]);
      const itemId = toString(row[colIdx["Item ID (auto generated)"]]);
      if (!itemId) continue;
      if (!name && !address) continue;
      // The dataset has trailing summary rows where Name is blank but the
      // numeric columns aggregate ranges (string like "2026-02-24 to ...").
      // Those have no Item ID either, so the check above already filters them.

      const dealStageColRaw = toString(row[colIdx["Deal Stage"]]);
      const stage = mapStage(sectionLabel, dealStageColRaw);

      const contacts: ParsedDeal["contacts"] = [];
      const sourceName = toString(row[colIdx["Deal Source"]]);
      const sourceType = toString(row[colIdx["Source Type"]]);
      const sourcePhone = toString(row[colIdx["Source Phone"]]);
      const sourceEmail = toString(row[colIdx["Source Email"]]);
      if (sourceName || sourceEmail) {
        contacts.push({
          name: sourceName || "Unknown",
          role: sourceType || "Source",
          email: sourceEmail || "",
          phone: sourcePhone,
        });
      }
      const tdlrName = toString(row[colIdx["TDLR Contact Name"]]);
      const tdlrPhone = toString(row[colIdx["TDLR Phone"]]);
      const tdlrEmail = toString(row[colIdx["TDLR Email"]]);
      const tdlrSource = toString(row[colIdx["TDLR Source"]]);
      if (tdlrName || tdlrEmail || tdlrPhone) {
        contacts.push({
          name: tdlrName || "TDLR Contact",
          role: tdlrSource || "TDLR",
          email: tdlrEmail || "",
          phone: tdlrPhone,
        });
      }

      const customFields: Record<string, any> = {};
      const setIfPresent = (key: string, val: any) => {
        if (val !== undefined && val !== null && val !== "") customFields[key] = val;
      };
      setIfPresent("contactStatus", toString(row[colIdx["Contact Status"]]));
      setIfPresent("lastContactDate", excelSerialToIso(row[colIdx["Last Contact Date"]])?.slice(0, 10));
      setIfPresent("priority", toString(row[colIdx["Priority"]]));
      setIfPresent("nextStep", toString(row[colIdx["Next Step"]]));
      setIfPresent("followUpCount", toNumber(row[colIdx["Follow-Up Count"]]));
      setIfPresent("leadTier", toNumber(row[colIdx["Lead Tier"]]));
      setIfPresent("leadScore", toNumber(row[colIdx["Lead Score"]]));
      setIfPresent("lastSalePrice", toNumber(row[colIdx["Last Sale Price"]]));
      setIfPresent("lastSaleDate", excelSerialToIso(row[colIdx["Last Sale Date"]])?.slice(0, 10));
      setIfPresent("appraisedValue", toNumber(row[colIdx["Appraised Value"]]));
      setIfPresent("hcadAccount", toString(row[colIdx["HCAD Account #"]]));
      setIfPresent("ownerEntity", toString(row[colIdx["Owner Entity"]]));
      setIfPresent("rates", toString(row[colIdx["Rates"]]));
      setIfPresent("brokerNotes", toString(row[colIdx["Broker Notes"]]));

      deals.push({
        mondayItemId: itemId,
        name: name || address || "Unnamed",
        address: address,
        sqft: toNumber(row[colIdx["SF"]]),
        askingPrice: toNumber(row[colIdx["Deal Value"]]),
        stage,
        source: sourceName,
        assignedTo: toString(row[colIdx["Lead Partner"]]),
        createdAt: excelSerialToIso(row[colIdx["Date Entered"]]),
        contacts,
        seedNote: toString(row[colIdx["Contact Notes"]]),
        customFields,
      });
    }
  }

  // Updates sheet: each row = one Monday update. Columns:
  // 0=Item ID, 1=Item Name, 2=Content Type, 3=Content Type, 4=User,
  // 5=Created At, 6=Update Content, 7=Likes Count, 8=Asset IDs,
  // 9=Post ID, 10=Parent Post ID
  const updates: ParsedUpdate[] = [];
  if (updatesSheet) {
    const u = xlsx.utils.sheet_to_json<any[]>(updatesSheet, { header: 1, defval: "" });
    // First two rows are title / header.
    for (let r = 2; r < u.length; r++) {
      const row = u[r];
      if (!Array.isArray(row)) continue;
      const itemId = toString(row[0]);
      const author = toString(row[4]) || "Unknown";
      const createdAtRaw = toString(row[5]) || "";
      const text = toString(row[6]);
      if (!itemId || !text) continue;
      // "22/April/2026  03:57:39 PM" → ISO
      const iso = parseMondayDate(createdAtRaw);
      updates.push({ itemId, author, text, createdAt: iso });
    }
  }

  return { deals, updates };
}

/** "22/April/2026  03:57:39 PM" → ISO. Falls back to original string when parse fails. */
function parseMondayDate(s: string): string {
  if (!s) return new Date().toISOString();
  // Replace double spaces and split.
  const cleaned = s.replace(/\s+/g, " ").trim();
  const parts = cleaned.match(/^(\d{1,2})\/([A-Za-z]+)\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i);
  if (!parts) return cleaned; // fall back as-is
  const [, dd, monthName, yyyy, hh, mm, ss, ampm] = parts;
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const mIdx = months[monthName.toLowerCase().slice(0, 3)];
  if (mIdx === undefined) return cleaned;
  let h = Number(hh);
  if (ampm) {
    if (ampm.toUpperCase() === "PM" && h < 12) h += 12;
    if (ampm.toUpperCase() === "AM" && h === 12) h = 0;
  }
  return new Date(Date.UTC(Number(yyyy), mIdx, Number(dd), h, Number(mm), Number(ss))).toISOString();
}

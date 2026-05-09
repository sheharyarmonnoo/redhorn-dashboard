"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import * as XLSX from "xlsx";

// ---------- Tiny RFC-4180-ish CSV parser ----------
// Avoids adding a new dep just for this. Handles double-quoted fields with
// embedded commas/quotes. Trailing CR is stripped; empty trailing rows dropped.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += c;
        i++;
      }
    } else if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (c === "\r") {
      i++;
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += c;
      i++;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c && c.length > 0));
}

function num(s: string | undefined | null): number {
  if (s == null) return 0;
  const t = String(s).replace(/[$,\s]/g, "").trim();
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function str(s: any): string {
  return s == null ? "" : String(s).trim();
}

// MM-DD-YYYY → YYYY-MM-DD; passes through ISO; returns "" for empty.
function isoDate(s: string): string {
  const t = str(s);
  if (!t) return "";
  const m1 = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[1]}-${m1[2]}`;
  const m2 = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return t;
}

function isoMonth(d: string): string {
  const iso = isoDate(d);
  return iso ? iso.slice(0, 7) : "";
}

// Pick the most-frequent month from a list — used to derive a bundle period
// from the data inside a file (POS line dates, GL posting dates, etc.).
function modeMonth(months: string[]): string | null {
  const counts = new Map<string, number>();
  for (const m of months) {
    if (!m) continue;
    counts.set(m, (counts.get(m) || 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [m, c] of Array.from(counts.entries())) {
    if (c > bestCount) {
      best = m;
      bestCount = c;
    }
  }
  return best;
}

// ---------- Rent Roll ----------
function parseRentRoll(text: string, bundleId: string, propertyId: string, period: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { reservations: [], sites: [] };
  const headers = rows[0].map((h) => h.toLowerCase());
  const idx = (name: string) => headers.indexOf(name.toLowerCase());

  const reservations: any[] = [];
  const seenSites = new Map<string, any>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const confirmation = str(row[idx("Confirmation")]);
    if (!confirmation) continue;
    const siteCode = str(row[idx("Unit Site Name")]);
    const siteType = str(row[idx("Unit Site Type")]);
    const siteClass = str(row[idx("Unit Site Class")]);
    const arrivalDate = isoDate(str(row[idx("Arrival Date")]));
    const departureDate = isoDate(str(row[idx("Departure Date")]));

    const reservationCharges = num(row[idx("Reservation Charges")]);
    const occupancyCharges = num(row[idx("Occupancy Charges")]);
    const surcharges = num(row[idx("Surcharges")]);
    const discounts = num(row[idx("Discounts")]);
    const tax = num(row[idx("Tax")]);
    const total = num(row[idx("Total")]);
    const totalChargesOnInvoice = num(row[idx("Total Charges on Invoice")]);
    const totalPaymentsOnInvoice = num(row[idx("Total Payments on Invoice")]);
    const percentPaid = num(row[idx("Percent Paid")]);
    const balanceOnReservation = num(row[idx("Balance on Reservation")]);
    const balanceOnInvoice = num(row[idx("Balance on Invoice")]);
    const utilityCharges = num(row[idx("Utility Charges")]);
    const posCharges = num(row[idx("POS Charges")]);

    reservations.push({
      bundleId,
      propertyId,
      snapshotPeriod: period,
      isLatest: true,
      confirmation,
      siteCode,
      siteName: siteCode,
      siteType,
      siteClass,
      firstName: str(row[idx("First Name")]),
      lastName: str(row[idx("Last Name")]),
      email: str(row[idx("Email")]) || undefined,
      postalCode: str(row[idx("Postal Code")]) || undefined,
      arrivalDate,
      departureDate,
      nights: num(row[idx("Nights")]),
      reservationCharges,
      occupancyCharges,
      surcharges,
      discounts,
      tax,
      total,
      totalChargesOnInvoice,
      totalPaymentsOnInvoice,
      percentPaid,
      balanceOnReservation,
      balanceOnInvoice,
      utilityCharges,
      posCharges,
      packageApplied: str(row[idx("Package Applied")]) || undefined,
      promoCode: str(row[idx("Promo Code")]) || undefined,
      reservationSource: str(row[idx("Reservation Source")]) || undefined,
      createdBy: str(row[idx("Created By")]) || undefined,
      invoiceLink: str(row[idx("Invoice Link")]) || undefined,
    });

    if (siteCode && !seenSites.has(siteCode)) {
      seenSites.set(siteCode, {
        siteCode,
        displayName: `${siteType} ${siteCode}`.trim(),
        siteType,
        siteClass: siteClass || undefined,
        snapshotDate: arrivalDate || `${period}-01`,
      });
    }
  }
  return { reservations, sites: Array.from(seenSites.values()) };
}

// ---------- Guests with Balance ----------
function parseBalances(text: string, bundleId: string, propertyId: string, period: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.toLowerCase());
  const idx = (name: string) => headers.indexOf(name.toLowerCase());

  const out: any[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const balance = num(row[idx("Balance")]);
    const firstName = str(row[idx("First Name")]);
    const lastName = str(row[idx("Last Name")]);
    if (!firstName && !lastName && balance === 0) continue;
    out.push({
      bundleId,
      propertyId,
      snapshotPeriod: period,
      isLatest: true,
      firstName,
      lastName,
      email: str(row[idx("Email")]) || undefined,
      phone: str(row[idx("Phone")]) || undefined,
      city: str(row[idx("City")]) || undefined,
      state: str(row[idx("State")]) || undefined,
      postalCode: str(row[idx("Postal Code")]) || undefined,
      totalCharges: num(row[idx("Total Charges")]),
      totalPayments: num(row[idx("Total Payments")]),
      balance,
      campsiteType: str(row[idx("Main Campsite Type")]) || undefined,
      campsiteNames: str(row[idx("Campsite Names")]) || undefined,
      arrivalDate: isoDate(str(row[idx("Arrival Date")])) || undefined,
      departureDate: isoDate(str(row[idx("Departure Date")])) || undefined,
      confirmation: str(row[idx("Confirmation Number")]) || undefined,
      status: str(row[idx("Status")]) || undefined,
      invoiceNumber: str(row[idx("Invoice Number")]) || undefined,
    });
  }
  return out;
}

// ---------- POS Category Sales ----------
function parsePos(text: string, bundleId: string, propertyId: string, period: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.toLowerCase());
  const idx = (name: string) => headers.indexOf(name.toLowerCase());

  const out: any[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const saleDate = isoDate(str(row[idx("Purchase Date")]));
    if (!saleDate) continue;
    out.push({
      bundleId,
      propertyId,
      snapshotPeriod: period,
      isLatest: true,
      saleDate,
      saleMonth: isoMonth(saleDate),
      financialAccount: str(row[idx("Financial Account")]),
      productCategory: str(row[idx("Product Category")]),
      netQuantitySold: num(row[idx("Net Quantity Sold")]),
      subTotal: num(row[idx("Sub Total")]),
      totalDiscount: num(row[idx("Total Discount Given")]),
      totalTax: num(row[idx("Total Tax")]),
      total: num(row[idx("Total")]),
      defaultCost: num(row[idx("Total Default Cost")]),
    });
  }
  return out;
}

// ---------- Total Payment summary ----------
function parsePayments(text: string, bundleId: string, propertyId: string, period: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.toLowerCase());
  const idx = (name: string) => headers.indexOf(name.toLowerCase());

  const out: any[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const paymentType = str(row[idx("Payment Type")]);
    if (!paymentType) continue;
    out.push({
      bundleId,
      propertyId,
      snapshotPeriod: period,
      isLatest: true,
      paymentType,
      cardType: str(row[idx("Card Type")]) || undefined,
      reservationSystem: num(row[idx("Reservation System")]),
      posSystem: num(row[idx("POS System")]),
      totalPayments: num(row[idx("Total Payments")]),
    });
  }
  return out;
}

// ---------- Financial Package (xlsx) ----------
// 4 sheets: FPAGLSummaryISvsBudgetMTD, BalanceSheet, GeneralLedger, CashFlow.
// We flatten each into rv_financials rows tagged with kind.
function parseFinancialPackage(buffer: ArrayBuffer, bundleId: string, propertyId: string, period: string) {
  const wb = XLSX.read(buffer, { type: "array" });
  const out: any[] = [];

  const sheetIs = wb.Sheets["FPAGLSummaryISvsBudgetMTD"];
  if (sheetIs) {
    const aoa: any[][] = XLSX.utils.sheet_to_json(sheetIs, { header: 1, blankrows: false });
    let headerRow = -1;
    for (let i = 0; i < Math.min(20, aoa.length); i++) {
      const cell0 = String(aoa[i]?.[0] || "").toLowerCase();
      if (cell0.includes("financial row")) {
        headerRow = i;
        break;
      }
    }
    if (headerRow >= 0) {
      for (let r = headerRow + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const lineItem = str(row[0]);
        if (!lineItem) continue;
        const subsidiary = str(row[1]);
        const amountMtd = num(row[2]);
        const budgetMtd = num(row[3]);
        const varianceMtd = num(row[4]);
        const pctVarianceMtd = num(row[5]);
        const amountYtd = num(row[6]);
        const budgetYtd = num(row[7]);
        if (
          amountMtd === 0 && budgetMtd === 0 && amountYtd === 0 && budgetYtd === 0 &&
          !subsidiary
        ) {
          continue;
        }
        out.push({
          bundleId,
          propertyId,
          snapshotPeriod: period,
          isLatest: true,
          kind: "isBudget",
          lineItem,
          subsidiary: subsidiary || undefined,
          amountMtd,
          budgetMtd,
          varianceMtd,
          pctVarianceMtd,
          amountYtd,
          budgetYtd,
        });
      }
    }
  }

  const sheetBs = wb.Sheets["BalanceSheet"];
  if (sheetBs) {
    const aoa: any[][] = XLSX.utils.sheet_to_json(sheetBs, { header: 1, blankrows: false });
    let headerRow = -1;
    for (let i = 0; i < Math.min(20, aoa.length); i++) {
      const cell0 = String(aoa[i]?.[0] || "").toLowerCase();
      if (cell0.includes("financial row")) {
        headerRow = i;
        break;
      }
    }
    if (headerRow >= 0) {
      for (let r = headerRow + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const lineItem = str(row[0]);
        if (!lineItem) continue;
        out.push({
          bundleId,
          propertyId,
          snapshotPeriod: period,
          isLatest: true,
          kind: "balanceSheet",
          lineItem,
          balanceAmount: row[1] != null && row[1] !== "" ? num(row[1]) : undefined,
        });
      }
    }
  }

  const sheetCf = wb.Sheets["CashFlow"];
  if (sheetCf) {
    const aoa: any[][] = XLSX.utils.sheet_to_json(sheetCf, { header: 1, blankrows: false });
    let headerRow = -1;
    let monthLabels: string[] = [];
    for (let i = 0; i < Math.min(20, aoa.length); i++) {
      const cell0 = String(aoa[i]?.[0] || "").toLowerCase();
      if (cell0.includes("financial row")) {
        headerRow = i;
        monthLabels = (aoa[i] || []).slice(1).map((c: any) => str(c));
        break;
      }
    }
    if (headerRow >= 0) {
      for (let r = headerRow + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const lineItem = str(row[0]);
        if (!lineItem || lineItem === "Amount") continue;
        for (let c = 0; c < monthLabels.length; c++) {
          const label = monthLabels[c];
          if (!label) continue;
          const val = row[c + 1];
          if (val == null || val === "") continue;
          out.push({
            bundleId,
            propertyId,
            snapshotPeriod: period,
            isLatest: true,
            kind: "cashFlow",
            lineItem,
            cashFlowMonth: label,
            cashFlowAmount: num(val),
          });
        }
      }
    }
  }

  const sheetGl = wb.Sheets["GeneralLedger"];
  if (sheetGl) {
    const aoa: any[][] = XLSX.utils.sheet_to_json(sheetGl, { header: 1, blankrows: false });
    let headerRow = -1;
    for (let i = 0; i < Math.min(20, aoa.length); i++) {
      const cell0 = String(aoa[i]?.[0] || "").toLowerCase();
      if (cell0 === "account") {
        headerRow = i;
        break;
      }
    }
    let currentAccount = "";
    let currentAccountCode = "";
    if (headerRow >= 0) {
      for (let r = headerRow + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const accountCell = str(row[0]);
        const typeCell = str(row[1]);
        if (accountCell && !typeCell) {
          currentAccount = accountCell;
          const codeMatch = accountCell.match(/^([\d-]+)/);
          currentAccountCode = codeMatch ? codeMatch[1] : "";
          continue;
        }
        if (!typeCell) continue;
        const dateCell = row[2];
        let glDate = "";
        if (dateCell instanceof Date) {
          glDate = `${dateCell.getUTCFullYear()}-${String(dateCell.getUTCMonth() + 1).padStart(2, "0")}-${String(dateCell.getUTCDate()).padStart(2, "0")}`;
        } else if (dateCell) {
          glDate = isoDate(str(dateCell));
        }
        out.push({
          bundleId,
          propertyId,
          snapshotPeriod: period,
          isLatest: true,
          kind: "generalLedger",
          lineItem: currentAccount || undefined,
          glAccountCode: currentAccountCode || undefined,
          glAccountName: currentAccount.replace(/^[\d-]+\s*-\s*/, "") || undefined,
          glDate: glDate || undefined,
          glDocumentNumber: str(row[3]) || undefined,
          glName: str(row[4]) || undefined,
          glDebit: num(row[5]),
          glCredit: num(row[6]),
          glBalance: num(row[7]),
          glType: typeCell || undefined,
        });
      }
    }
  }

  return out;
}

// ---------- Content-based period detection ----------
// Peek inside each staged file to derive the bundle period. POS dates, GL
// posting dates, and the financial xlsx header all carry the period directly,
// which is more reliable than the filename.
function detectPeriodFromFinancialXlsx(buffer: ArrayBuffer): string | null {
  try {
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets["FPAGLSummaryISvsBudgetMTD"] || wb.Sheets["BalanceSheet"];
    if (!sheet) return null;
    const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
    for (let i = 0; i < Math.min(10, aoa.length); i++) {
      const cell = String(aoa[i]?.[0] || "");
      const m = cell.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
      if (m) {
        const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
        const monthIdx = months.indexOf(m[1].toLowerCase().slice(0, 3));
        return `${m[2]}-${String(monthIdx + 1).padStart(2, "0")}`;
      }
      const m2 = cell.match(/End of\s+(\w+)\s+(\d{4})/i);
      if (m2) {
        const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
        const monthIdx = months.indexOf(m2[1].toLowerCase().slice(0, 3));
        if (monthIdx >= 0) return `${m2[2]}-${String(monthIdx + 1).padStart(2, "0")}`;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function detectPeriodFromPosCsv(text: string): string | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const headers = rows[0].map((h) => h.toLowerCase());
  const dateIdx = headers.indexOf("purchase date");
  if (dateIdx < 0) return null;
  const months: string[] = [];
  for (let r = 1; r < rows.length; r++) {
    const m = isoMonth(rows[r][dateIdx]);
    if (m) months.push(m);
  }
  return modeMonth(months);
}

export const detectBundlePeriod = action({
  args: { bundleId: v.id("rv_upload_bundles") },
  handler: async (ctx, args) => {
    const bundle: any = await ctx.runQuery(internal.rv._getBundle, { bundleId: args.bundleId });
    if (!bundle) throw new Error("Bundle not found");

    const votes: { source: string; period: string }[] = [];
    for (const f of bundle.files) {
      try {
        const blob = await ctx.storage.get(f.storageId);
        if (!blob) continue;
        if (f.fileType === "financial") {
          const buf = await blob.arrayBuffer();
          const p = detectPeriodFromFinancialXlsx(buf);
          if (p) votes.push({ source: f.name, period: p });
        } else if (f.fileType === "pos") {
          const text = await blob.text();
          const p = detectPeriodFromPosCsv(text);
          if (p) votes.push({ source: f.name, period: p });
        }
      } catch {
        /* ignore parse errors during detection */
      }
    }

    const detected = modeMonth(votes.map((v) => v.period));
    if (detected && detected !== bundle.period) {
      await ctx.runMutation(internal.rv._patchBundlePeriod, {
        bundleId: args.bundleId,
        period: detected,
      });
    }
    return { detected, votes };
  },
});

// ---------- Commit pipeline ----------
export const commitBundle = action({
  args: {
    bundleId: v.id("rv_upload_bundles"),
    committedBy: v.optional(v.string()),
    bypassLock: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const bundle: any = await ctx.runQuery(internal.rv._getBundle, { bundleId: args.bundleId });
    if (!bundle) throw new Error("Bundle not found");
    if (bundle.status === "committed") throw new Error("Bundle already committed");

    // Period must already have ended — Max can't upload May data on May 9.
    // Bypass exists for admin re-runs / tests.
    if (!args.bypassLock) {
      const check: any = await ctx.runQuery(internal.rv._checkPeriodUploadable, {
        propertyId: bundle.propertyId,
        period: bundle.period,
      });
      if (!check.isUploadable) {
        throw new Error(
          `Period ${bundle.period} hasn't ended yet (current month is ${check.currentMonth}). Wait until the 1st of the following month, or fix the period in the bundle.`,
        );
      }
    }

    // Replace semantics: if a committed bundle already exists for this
    // (property, period), wipe its rows + delete the bundle so this commit
    // becomes the canonical one. Lets Max fix mistakes himself.
    const priorBundles: any[] = await ctx.runQuery(internal.rv._findPriorBundleForPeriod, {
      propertyId: bundle.propertyId,
      period: bundle.period,
      excludeBundleId: args.bundleId,
    });
    for (const prior of priorBundles) {
      await ctx.runMutation(internal.rv._deleteRowsForBundle, { bundleId: prior.id });
      await ctx.runMutation(internal.rv._deleteBundle, { bundleId: prior.id });
    }

    const period: string = bundle.period;
    const bundleId: string = bundle._id;
    const propertyId: string = bundle.propertyId;

    let totalReservations = 0;
    let totalBalances = 0;
    let totalPos = 0;
    let totalPayments = 0;
    let totalFinancials = 0;
    const allSites: any[] = [];

    for (const f of bundle.files) {
      try {
        const blob = await ctx.storage.get(f.storageId);
        if (!blob) {
          await ctx.runMutation(internal.rv._markFileParsed, {
            bundleId: args.bundleId,
            fileId: f.id,
            parseError: "Storage object missing",
          });
          continue;
        }

        if (f.fileType === "financial") {
          const buf = await blob.arrayBuffer();
          const rows = parseFinancialPackage(buf, bundleId, propertyId, period);
          if (rows.length > 0) {
            // Insert in chunks to keep mutations small.
            for (let i = 0; i < rows.length; i += 200) {
              await ctx.runMutation(internal.rv._bulkInsertFinancials, {
                rows: rows.slice(i, i + 200),
              });
            }
          }
          totalFinancials += rows.length;
          await ctx.runMutation(internal.rv._markFileParsed, {
            bundleId: args.bundleId,
            fileId: f.id,
            rowsParsed: rows.length,
          });
          continue;
        }

        const text = await blob.text();
        if (f.fileType === "rentRoll") {
          const { reservations, sites } = parseRentRoll(text, bundleId, propertyId, period);
          for (let i = 0; i < reservations.length; i += 200) {
            await ctx.runMutation(internal.rv._bulkInsertReservations, {
              rows: reservations.slice(i, i + 200),
            });
          }
          allSites.push(...sites);
          totalReservations += reservations.length;
          await ctx.runMutation(internal.rv._markFileParsed, {
            bundleId: args.bundleId,
            fileId: f.id,
            rowsParsed: reservations.length,
          });
        } else if (f.fileType === "balances") {
          const balances = parseBalances(text, bundleId, propertyId, period);
          for (let i = 0; i < balances.length; i += 200) {
            await ctx.runMutation(internal.rv._bulkInsertBalances, {
              rows: balances.slice(i, i + 200),
            });
          }
          totalBalances += balances.length;
          await ctx.runMutation(internal.rv._markFileParsed, {
            bundleId: args.bundleId,
            fileId: f.id,
            rowsParsed: balances.length,
          });
        } else if (f.fileType === "pos") {
          const pos = parsePos(text, bundleId, propertyId, period);
          for (let i = 0; i < pos.length; i += 200) {
            await ctx.runMutation(internal.rv._bulkInsertPos, {
              rows: pos.slice(i, i + 200),
            });
          }
          totalPos += pos.length;
          await ctx.runMutation(internal.rv._markFileParsed, {
            bundleId: args.bundleId,
            fileId: f.id,
            rowsParsed: pos.length,
          });
        } else if (f.fileType === "payments") {
          const payments = parsePayments(text, bundleId, propertyId, period);
          for (let i = 0; i < payments.length; i += 200) {
            await ctx.runMutation(internal.rv._bulkInsertPayments, {
              rows: payments.slice(i, i + 200),
            });
          }
          totalPayments += payments.length;
          await ctx.runMutation(internal.rv._markFileParsed, {
            bundleId: args.bundleId,
            fileId: f.id,
            rowsParsed: payments.length,
          });
        } else {
          await ctx.runMutation(internal.rv._markFileParsed, {
            bundleId: args.bundleId,
            fileId: f.id,
            parseError: `Unknown file type "${f.fileType}"`,
          });
        }
      } catch (err: any) {
        await ctx.runMutation(internal.rv._markFileParsed, {
          bundleId: args.bundleId,
          fileId: f.id,
          parseError: String(err?.message || err),
        });
      }
    }

    if (allSites.length > 0) {
      // Dedupe sites collected across multiple files.
      const seen = new Map<string, any>();
      for (const s of allSites) seen.set(s.siteCode, s);
      await ctx.runMutation(internal.rv._upsertSites, {
        propertyId: bundle.propertyId,
        sites: Array.from(seen.values()),
      });
    }

    await ctx.runMutation(internal.rv._flipLatestForBundle, {
      propertyId: bundle.propertyId,
      bundleId: args.bundleId,
      period,
    });
    await ctx.runMutation(internal.rv._commitBundleStatus, {
      bundleId: args.bundleId,
      committedBy: args.committedBy,
    });

    return {
      reservations: totalReservations,
      balances: totalBalances,
      pos: totalPos,
      payments: totalPayments,
      financials: totalFinancials,
    };
  },
});

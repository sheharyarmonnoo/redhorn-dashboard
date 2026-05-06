import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { config } from "./config.js";
import { parseIncomeStatement } from "./parse-income-statement.js";
import { parseRentRollAnalytics } from "./parse-rent-roll-analytics.js";
import { parseTotalUnits } from "./parse-total-units.js";
import { parsePastDue } from "./parse-past-due.js";
import { parseGlDetail } from "./parse-gl-detail.js";
import { parseReceivableDetail } from "./parse-receivable-detail.js";
import { parseBudget } from "./parse-budget.js";
import { sendSyncDigest, type DigestProperty } from "./digest.js";

// Generated API surface lives in the parent project. We reference functions by
// path so this script doesn't need its own Convex codegen.
const FN = {
  generateUploadUrl: "files:generateUploadUrl",
  createSyncJob: "syncJobs:create",
  completeSyncJob: "syncJobs:complete",
  logActivity: "activityLog:log",
  bulkInsertIncomeLines: "incomeLines:bulkInsertByCode",
  bulkReplaceTenants: "tenants:bulkReplaceByCode",
  bulkReplaceUnits: "units:bulkReplaceByCode",
  applyPastDue: "tenants:applyPastDueByCode",
  enrichRent: "tenants:enrichRentByCode",
  bulkInsertGlTransactions: "glTransactions:bulkInsertByCode",
  bulkInsertReceivableDetails: "receivableDetails:bulkInsertByCode",
  bulkUpsertLineBudgets: "lineBudgets:bulkUpsertByCode",
  recomputeMonthlyRevenue: "monthlyRevenue:recomputeFromLatest",
  recomputeMonthlyRevenueFromMonth: "monthlyRevenue:recomputeFromMonth",
  // extractInsights / getPropertyByCode no longer used — insights moved
  // to the local /yardi-run skill (Claude on the laptop, not the server).
  setFileRecords: "syncJobs:setFileRecords",
} as const;

export interface UploadedFile {
  storageId: string;
  fileName: string;
  reportType: string;
  propertyCode: string;
  filePath: string;
}

export interface SyncBundle {
  jobId: string;
  uploaded: UploadedFile[];
  failed: Array<{ filePath: string; error: string }>;
}

/**
 * Upload a list of (filePath, propertyCode, reportType) tuples to Convex file
 * storage, then record them as a single sync_jobs entry. Returns the job id +
 * per-file results so the caller can drive any follow-up parsing.
 */
export async function uploadRunToConvex(
  files: Array<{ filePath: string; propertyCode: string; reportType: string }>,
  opts: { source?: string; historical?: boolean; month?: string } = {}
): Promise<SyncBundle> {
  const convexUrl = config.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL not set in .env.local — required to upload to Convex.");
  }

  const client = new ConvexHttpClient(convexUrl);
  const uploaded: UploadedFile[] = [];
  const failed: SyncBundle["failed"] = [];

  for (const file of files) {
    try {
      const storageId = await uploadOneFile(client, file.filePath);
      uploaded.push({
        storageId,
        fileName: basename(file.filePath),
        reportType: file.reportType,
        propertyCode: file.propertyCode,
        filePath: file.filePath,
      });
      console.log(`   uploaded → storageId ${storageId.slice(0, 8)}…  (${basename(file.filePath)})`);
    } catch (err: any) {
      failed.push({ filePath: file.filePath, error: err?.message || String(err) });
      console.error(`   upload failed: ${file.filePath} — ${err?.message || err}`);
    }
  }

  // Create one sync_jobs row per scraper run, with all uploaded files attached.
  const reportTypes = Array.from(new Set(uploaded.map(u => u.reportType)));
  const jobId = await client.mutation(FN.createSyncJob as any, {
    source: opts.source ?? "yardi_sync",
    reportTypes,
    files: uploaded.map(u => ({
      storageId: u.storageId,
      fileName: u.fileName,
      reportType: u.reportType,
    })),
  });

  // Phase 2 — parse each uploaded report and insert rows into the right Convex
  // table (income_statement → income_lines, rent_roll → tenants). Track which
  // properties got an income_statement update so we know who to run insights on.
  let totalRowsIngested = 0;
  const ingestErrors: string[] = [];
  // For historical backfill, anchor the snapshot to the END of the report's
  // period so monthly_revenue:recomputeFromMonth can find these rows by month
  // prefix. For live syncs, today's timestamp is fine.
  const snapshotDate = opts.historical && opts.month
    ? endOfMonthIso(opts.month)
    : new Date().toISOString();
  const ingestedProperties: string[] = [];
  // Track each property's actual reporting period (e.g. "2026-04") so the
  // monthly_revenue rollup writes to the correct month — independent of
  // when the sync ran.
  const periodByProperty: Record<string, string> = {};
  for (const u of uploaded) {
    let perFileRows = 0;
    try {
      if (u.reportType === "income_statement") {
        const parsed = parseIncomeStatement(u.filePath);
        const period = periodHeaderToYYYYMM(parsed.periodHeader);
        console.log(`   parsed IS ${u.fileName}: ${parsed.rows.length} rows (${parsed.periodHeader}${period ? ` → ${period}` : ""})`);
        if (period) periodByProperty[u.propertyCode] = period;
        const result: any = await client.mutation(FN.bulkInsertIncomeLines as any, {
          propertyCode: u.propertyCode,
          syncId: jobId,
          snapshotDate,
          period,
          rows: parsed.rows,
          historical: opts.historical === true,
        });
        console.log(`   ingested IS → ${result.inserted} rows · superseded ${result.supersededPrior}${opts.historical ? "  (historical)" : ""}`);
        perFileRows = result.inserted;
        totalRowsIngested += result.inserted;
        if (!ingestedProperties.includes(u.propertyCode)) ingestedProperties.push(u.propertyCode);
      } else if (u.reportType === "total_units") {
        const parsed = parseTotalUnits(u.filePath);
        console.log(`   parsed TU ${u.fileName}: ${parsed.rows.length} units`);
        if (parsed.rows.length === 0) {
          console.warn(`   warning: total-units parser returned 0 rows — header likely didn't match expected columns`);
        }
        const result: any = await client.mutation(FN.bulkReplaceUnits as any, {
          propertyCode: u.propertyCode,
          rows: parsed.rows,
        });
        console.log(`   ingested TU → ${result.inserted} units · replaced ${result.supersededPrior}`);
        perFileRows = result.inserted;
        totalRowsIngested += result.inserted;
      } else if (u.reportType === "past_due") {
        const parsed = parsePastDue(u.filePath);
        console.log(`   parsed PD ${u.fileName}: ${parsed.rows.length} delinquent leases`);
        const result: any = await client.mutation(FN.applyPastDue as any, {
          propertyCode: u.propertyCode,
          rows: parsed.rows,
        });
        console.log(`   applied PD → matched ${result.matched}/${result.tenants} tenants · cleared ${result.cleared}`);
        perFileRows = result.matched;
        totalRowsIngested += result.matched;
      } else if (u.reportType === "rent_roll_full") {
        // Commercial Analytics > Property > Rent Roll xlsx (the rich format
        // with Security Deposit + LOC + Annual Rec/SF). This is now the
        // single authoritative rent-roll source — it carries every column
        // the dashboard "Current Leases" panel was missing, so we route it
        // through bulkReplaceTenants (insert-or-replace) instead of just
        // patching. VACANT rows are excluded so we don't pollute the
        // tenants table with placeholder rows.
        const parsed = parseRentRollAnalytics(u.filePath);
        const activeRows = parsed.rows.filter(r => r.status !== "vacant" && r.tenant !== "VACANT");
        console.log(`   parsed RR-full ${u.fileName}: ${parsed.rows.length} rows (${activeRows.length} active leases, ${parsed.rows.length - activeRows.length} vacant)`);

        const result: any = await client.mutation(FN.bulkReplaceTenants as any, {
          propertyCode: u.propertyCode,
          syncId: jobId,
          snapshotDate,
          rows: activeRows.map(r => ({
            unit: r.unit,
            building: r.building,
            tenant: r.tenant,
            leaseType: r.leaseType,
            sqft: r.sqft,
            leaseFrom: r.leaseFrom,
            leaseTo: r.leaseTo,
            leaseTermMonths: r.leaseTermMonths,
            monthlyRent: r.monthlyRent,
            monthlyRentPerSF: r.monthlyRentPerSF,
            annualRent: r.annualRent,
            annualRentPerSF: r.annualRentPerSF,
            annualRecPerSF: r.annualRecPerSF,
            annualMiscPerSF: r.annualMiscPerSF,
            monthlyElectric: r.monthlyElectric,
            securityDeposit: r.securityDeposit,
            locAmount: r.locAmount,
            status: r.status,
            pastDueAmount: r.pastDueAmount,
          })),
        });
        console.log(`   ingested RR-full → ${result.inserted} tenants · superseded ${result.supersededPrior}`);
        perFileRows = result.inserted;
        totalRowsIngested += result.inserted;
      } else if (u.reportType === "gl_detail") {
        const parsed = parseGlDetail(u.filePath);
        console.log(`   parsed GL ${u.fileName}: ${parsed.rows.length} JE rows`);
        if (parsed.rows.length === 0) {
          console.warn(`   warning: GL detail parser returned 0 rows — header likely didn't match expected columns`);
        }
        // Derive month from the rows themselves; falls back to the snapshot month.
        const rowMonth = parsed.rows[0]?.postMonth || snapshotDate.slice(0, 7);
        const result: any = await client.mutation(FN.bulkInsertGlTransactions as any, {
          propertyCode: u.propertyCode,
          syncId: jobId,
          month: rowMonth,
          rows: parsed.rows,
        });
        console.log(`   ingested GL → ${result.inserted} rows · replaced ${result.replaced}`);
        perFileRows = result.inserted;
        totalRowsIngested += result.inserted;
      } else if (u.reportType === "receivable_detail") {
        const parsed = parseReceivableDetail(u.filePath);
        console.log(`   parsed RD ${u.fileName}: ${parsed.rows.length} transactions, ${parsed.leases.length} lease blocks`);
        if (parsed.rows.length === 0) {
          console.warn(`   warning: receivable detail parser returned 0 rows — header likely didn't match expected columns`);
        }
        const rowMonth = parsed.rows[0]?.postMonth || snapshotDate.slice(0, 7);
        const result: any = await client.mutation(FN.bulkInsertReceivableDetails as any, {
          propertyCode: u.propertyCode,
          syncId: jobId,
          month: rowMonth,
          rows: parsed.rows,
        });
        console.log(`   ingested RD → ${result.inserted} rows · replaced ${result.replaced}`);
        perFileRows = result.inserted;
        totalRowsIngested += result.inserted;

        // Enrich tenants from the lease metadata in the Lease Ledger. The
        // rent-roll dashboard panel doesn't carry monthly rent or sqft, but
        // the Lease Ledger does — this is the single source for that data
        // until Yardi gives us a richer rent-roll export.
        if (parsed.leases.length > 0) {
          const enrichRows = parsed.leases
            .filter(l => l.unit || l.tenantName)
            .map(l => ({
              unit: (l.unit || "").trim(),
              tenant: l.tenantName,
              monthlyRent: l.monthlyRent,
              leaseType: l.leaseType,
              sqft: l.sqft,
              leaseFrom: l.leaseFrom,
              leaseTo: l.leaseTo,
            }))
            .filter(r => r.unit.length > 0);
          if (enrichRows.length > 0) {
            try {
              const er: any = await client.mutation(FN.enrichRent as any, {
                propertyCode: u.propertyCode,
                rows: enrichRows,
              });
              console.log(`   enriched RR from RD → matched ${er.matched}/${er.tenants} tenants (lease type, term, sqft, rent)`);
            } catch (err: any) {
              console.error(`   enrich-from-RD failed: ${err?.message || err}`);
            }
          }

          // Apply past-due balances from aging data. The Lease Ledger's aging
          // row at the end of each section is the authoritative balance — use
          // it to auto-derive status instead of requiring a separate panel export.
          const pastDueRows = parsed.leases
            .filter(l => (l.unit || l.tenantName) && typeof l.amountDue === "number")
            .map(l => ({
              leaseName: l.tenantName,
              unit: (l.unit || "").trim() || undefined,
              pastDueAmount: l.amountDue ?? 0,
            }));
          if (pastDueRows.length > 0) {
            try {
              const pd: any = await client.mutation(FN.applyPastDue as any, {
                propertyCode: u.propertyCode,
                rows: pastDueRows,
              });
              console.log(`   applied past-due from RD → matched ${pd.matched}/${pd.tenants} tenants · cleared ${pd.cleared}`);
            } catch (err: any) {
              console.error(`   apply-past-due-from-RD failed: ${err?.message || err}`);
            }
          }
        }
      } else if (u.reportType === "twelve_month_budget") {
        // Yardi 12-Month Budget → line_budgets table. The parser drops
        // section headers + total/net rows; only leaf line items make it
        // into Convex so the Budget vs Actuals UI can compare them
        // directly against income_lines.
        const parsed = parseBudget(u.filePath);
        console.log(
          `   parsed Budget ${u.fileName}: ${parsed.rows.length} line items (${parsed.periodHeader} → year=${parsed.year})`
        );
        if (parsed.rows.length === 0) {
          console.warn(`   warning: budget parser returned 0 rows — Excel layout may not match expected`);
        }
        try {
          const result: any = await client.mutation(FN.bulkUpsertLineBudgets as any, {
            propertyCode: u.propertyCode,
            year: parsed.year,
            syncId: jobId,
            snapshotDate,
            rows: parsed.rows.map((r) => ({
              lineItem: r.lineItem,
              annualBudget: r.annualBudget,
              monthlyBudgets: r.monthlyBudgets,
              hierarchyLevel: r.hierarchyLevel,
              parentLine: r.parentLine,
            })),
          });
          console.log(
            `   ingested Budget → ${result.inserted} rows · superseded ${result.supersededPrior} (year=${result.year})`
          );
          perFileRows = result.inserted;
          totalRowsIngested += result.inserted;
        } catch (err: any) {
          console.error(`   budget upsert failed: ${err?.message || err}`);
          throw err;
        }
      }
      await client.mutation(FN.setFileRecords as any, {
        id: jobId,
        storageId: u.storageId,
        rowsIngested: perFileRows,
      });
    } catch (err: any) {
      const msg = `${u.fileName}: ${err?.message || err}`;
      ingestErrors.push(msg);
      console.error(`   ingest failed: ${msg}`);
    }
  }

  // Phase 2.5 — recompute monthly_revenue rollup. The month key MUST come
  // from the income statement's actual reporting period (e.g. "Period =
  // Apr 2026" → "2026-04"), not today's date. Otherwise the chart and KPI
  // cards label April's numbers as May because the sync ran in May.
  for (const code of ingestedProperties) {
    const propertyPeriod = periodByProperty[code];
    const monthKey = (opts.historical && opts.month)
      ? opts.month
      : (propertyPeriod || snapshotDate.slice(0, 7));
    try {
      const fnPath = opts.historical
        ? FN.recomputeMonthlyRevenueFromMonth
        : FN.recomputeMonthlyRevenue;
      const result: any = await client.mutation(fnPath as any, {
        propertyCode: code,
        month: monthKey,
      });
      console.log(`   monthly_revenue ${code} ${monthKey}: rent=$${result.rent.toLocaleString()} total=$${result.total.toLocaleString()} occ=${result.occupancy}%${opts.historical ? "  (historical)" : ""}`);
    } catch (err: any) {
      console.error(`   monthly_revenue recompute failed for ${code}: ${err?.message || err}`);
    }
  }

  // Phase 3 — insights are NOT generated during the sync anymore. The
  // Anthropic API key was removed from Convex; analysis now runs locally
  // (via the /yardi-run skill) so the user can curate the output before
  // it lands as alerts. The sync just leaves data fresh in Convex; the
  // local Claude reads it and writes alerts.create() mutations as needed.
  const totalInsights = 0;
  const totalAlertsCreated = 0;
  const digestProperties: DigestProperty[] = [];
  const insightSummaries: Array<{ propertyCode: string; summary: string }> = [];

  await client.mutation(FN.completeSyncJob as any, {
    id: jobId,
    status: failed.length === 0 && ingestErrors.length === 0
      ? "completed"
      : (uploaded.length === 0 ? "failed" : "partial"),
    recordsCreated: totalRowsIngested,
    errorMessage:
      [
        ...failed.map(f => `${basename(f.filePath)}: ${f.error}`),
        ...ingestErrors,
      ].join("; ") || undefined,
  });

  console.log(
    `Convex sync_job ${jobId} — ${uploaded.length} files uploaded, ${totalRowsIngested} income_lines rows ingested, ${totalInsights} insights generated (${totalAlertsCreated} alerts), ${ingestErrors.length} errors.`
  );
  if (insightSummaries.length > 0) {
    console.log(`\n=== Insights ===`);
    for (const s of insightSummaries) {
      console.log(`\n[${s.propertyCode}]`);
      console.log(s.summary);
    }
  }

  // Phase 4 — email digest. Sends an HTML summary of the run to whoever is on
  // YARDI_DIGEST_TO. Skipped silently if the env var isn't set, so unconfigured
  // local runs don't blow up. Also skipped on historical backfills.
  // Aggregate "month" for digest + activity log: prefer the actual reporting
  // period of any property, fall back to historical month or today.
  const summaryMonth =
    Object.values(periodByProperty)[0]
    || (opts.historical ? opts.month : undefined)
    || snapshotDate.slice(0, 7);

  if (digestProperties.length > 0 && !opts.historical) {
    try {
      await sendSyncDigest({
        syncJobId: jobId,
        month: summaryMonth,
        rowsIngested: totalRowsIngested,
        filesUploaded: uploaded.length,
        properties: digestProperties,
      });
    } catch (err: any) {
      console.error(`   email digest failed: ${err?.message || err}`);
    }
  }

  // Phase 5 — log the sync to the Activity feed so the dashboard's Activity
  // page shows a paper trail of every run, not just the alerts created by it.
  try {
    const propsLabel = ingestedProperties.join(", ") || "—";
    const desc = opts.historical
      ? `Yardi historical backfill · ${summaryMonth} · ${uploaded.length} files · ${totalRowsIngested} rows (${propsLabel})`
      : `Yardi sync · ${uploaded.length} files · ${totalRowsIngested} rows · ${totalInsights} insights · ${totalAlertsCreated} alerts (${propsLabel})`;
    await client.mutation(FN.logActivity as any, {
      type: "sync",
      description: desc,
      user: "System",
    });
  } catch {
    /* non-fatal */
  }

  return { jobId, uploaded, failed };
}

// "Period = Apr 2026" → "2026-04". Returns undefined if header doesn't match.
function periodHeaderToYYYYMM(header: string): string | undefined {
  if (!header) return undefined;
  const m = header.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i);
  if (!m) return undefined;
  const monthMap: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const mm = monthMap[m[1].toLowerCase().slice(0, 3)];
  if (!mm) return undefined;
  return `${m[2]}-${mm}`;
}

function endOfMonthIso(month: string): string {
  // "2026-04" → "2026-04-30T23:59:59.000Z"
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return new Date(Date.UTC(y, m - 1, lastDay, 23, 59, 59)).toISOString();
}

async function uploadOneFile(client: ConvexHttpClient, filePath: string): Promise<string> {
  const uploadUrl = await client.mutation(FN.generateUploadUrl as any, {});
  const buffer = readFileSync(filePath);
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    body: buffer,
  });
  if (!res.ok) {
    throw new Error(`Convex upload failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const { storageId } = await res.json();
  return storageId;
}

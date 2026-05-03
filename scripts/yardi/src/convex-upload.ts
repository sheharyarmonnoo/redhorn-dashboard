import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { config } from "./config.js";
import { parseIncomeStatement } from "./parse-income-statement.js";
import { parseRentRoll } from "./parse-rent-roll.js";
import { parseTotalUnits } from "./parse-total-units.js";
import { parsePastDue } from "./parse-past-due.js";
import { sendSyncDigest, type DigestProperty } from "./digest.js";

// Generated API surface lives in the parent project. We reference functions by
// path so this script doesn't need its own Convex codegen.
const FN = {
  generateUploadUrl: "files:generateUploadUrl",
  createSyncJob: "syncJobs:create",
  completeSyncJob: "syncJobs:complete",
  bulkInsertIncomeLines: "incomeLines:bulkInsertByCode",
  bulkReplaceTenants: "tenants:bulkReplaceByCode",
  bulkReplaceUnits: "units:bulkReplaceByCode",
  applyPastDue: "tenants:applyPastDueByCode",
  recomputeMonthlyRevenue: "monthlyRevenue:recomputeFromLatest",
  extractInsights: "insights:extractForProperty",
  getPropertyByCode: "properties:getByCode",
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
  opts: { source?: string } = {}
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
  const snapshotDate = new Date().toISOString();
  const ingestedProperties: string[] = [];
  for (const u of uploaded) {
    let perFileRows = 0;
    try {
      if (u.reportType === "income_statement") {
        const parsed = parseIncomeStatement(u.filePath);
        console.log(`   parsed IS ${u.fileName}: ${parsed.rows.length} rows (${parsed.periodHeader})`);
        const result: any = await client.mutation(FN.bulkInsertIncomeLines as any, {
          propertyCode: u.propertyCode,
          syncId: jobId,
          snapshotDate,
          rows: parsed.rows,
        });
        console.log(`   ingested IS → ${result.inserted} rows · superseded ${result.supersededPrior}`);
        perFileRows = result.inserted;
        totalRowsIngested += result.inserted;
        if (!ingestedProperties.includes(u.propertyCode)) ingestedProperties.push(u.propertyCode);
      } else if (u.reportType === "rent_roll") {
        const parsed = parseRentRoll(u.filePath);
        console.log(`   parsed RR ${u.fileName}: ${parsed.rows.length} leases`);
        if (parsed.rows.length === 0) {
          console.warn(`   warning: rent-roll parser returned 0 rows — header likely didn't match expected columns`);
        }
        const result: any = await client.mutation(FN.bulkReplaceTenants as any, {
          propertyCode: u.propertyCode,
          syncId: jobId,
          snapshotDate,
          rows: parsed.rows,
        });
        console.log(`   ingested RR → ${result.inserted} tenants · superseded ${result.supersededPrior}`);
        perFileRows = result.inserted;
        totalRowsIngested += result.inserted;
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

  // Phase 2.5 — recompute monthly_revenue rollup from the latest income_lines +
  // tenants + units. Powers the dashboard KPI cards and revenue chart from real data.
  // We derive the month from the snapshotDate (YYYY-MM-DD → YYYY-MM).
  const monthKey = snapshotDate.slice(0, 7);
  for (const code of ingestedProperties) {
    try {
      const result: any = await client.mutation(FN.recomputeMonthlyRevenue as any, {
        propertyCode: code,
        month: monthKey,
      });
      console.log(`   monthly_revenue ${code} ${monthKey}: rent=$${result.rent.toLocaleString()} total=$${result.total.toLocaleString()} occ=${result.occupancy}%`);
    } catch (err: any) {
      console.error(`   monthly_revenue recompute failed for ${code}: ${err?.message || err}`);
    }
  }

  // Phase 3 — run Claude insights against each freshly ingested property. This is
  // what makes the sync deliver real value: each run produces narrative analysis
  // that references prior snapshots and prior insights for continuity.
  let totalInsights = 0;
  let totalAlertsCreated = 0;
  const digestProperties: DigestProperty[] = [];
  const insightSummaries: Array<{ propertyCode: string; summary: string }> = [];
  for (const code of ingestedProperties) {
    try {
      console.log(`   running insights for ${code}…`);
      const result: any = await client.action(FN.extractInsights as any, {
        propertyCode: code,
        syncJobId: jobId,
      });
      totalInsights += result.insightsCount || 0;
      totalAlertsCreated += result.alertsCreated || 0;
      insightSummaries.push({ propertyCode: code, summary: result.summary });
      const property: any = await client.query(FN.getPropertyByCode as any, { code });
      digestProperties.push({
        name: property?.name || code,
        code,
        summary: result.summary || "",
        insights: (result.insights || []).map((i: any) => ({
          severity: i.severity || "info",
          title: i.title || "",
        })),
        alertsCreated: result.alertsCreated || 0,
      });
      console.log(`   ${code}: ${result.insightsCount} insights, ${result.alertsCreated} alerts written`);
      console.log(`      → ${result.summary.slice(0, 200)}`);
    } catch (err: any) {
      const msg = `insights for ${code}: ${err?.message || err}`;
      ingestErrors.push(msg);
      console.error(`   ${msg}`);
    }
  }

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
  // local runs don't blow up.
  if (digestProperties.length > 0) {
    try {
      await sendSyncDigest({
        syncJobId: jobId,
        month: monthKey,
        rowsIngested: totalRowsIngested,
        filesUploaded: uploaded.length,
        properties: digestProperties,
      });
    } catch (err: any) {
      console.error(`   email digest failed: ${err?.message || err}`);
    }
  }

  return { jobId, uploaded, failed };
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

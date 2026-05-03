import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { config } from "./config.js";
import { parseIncomeStatement } from "./parse-income-statement.js";

// Generated API surface lives in the parent project. We reference functions by
// path so this script doesn't need its own Convex codegen.
const FN = {
  generateUploadUrl: "files:generateUploadUrl",
  createSyncJob: "syncJobs:create",
  completeSyncJob: "syncJobs:complete",
  bulkInsertIncomeLines: "incomeLines:bulkInsertByCode",
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

  // Phase 2 — parse each uploaded income statement and insert rows into income_lines.
  let totalRowsIngested = 0;
  const ingestErrors: string[] = [];
  const snapshotDate = new Date().toISOString();
  for (const u of uploaded) {
    if (u.reportType !== "income_statement") continue;
    try {
      const parsed = parseIncomeStatement(u.filePath);
      console.log(`   parsed ${u.fileName}: ${parsed.rows.length} rows (${parsed.periodHeader})`);
      const result: any = await client.mutation(FN.bulkInsertIncomeLines as any, {
        propertyCode: u.propertyCode,
        syncId: jobId,
        snapshotDate,
        rows: parsed.rows,
      });
      console.log(`   ingested → propertyId ${result.propertyId} · ${result.inserted} rows · superseded ${result.supersededPrior}`);
      totalRowsIngested += result.inserted;
    } catch (err: any) {
      const msg = `${u.fileName}: ${err?.message || err}`;
      ingestErrors.push(msg);
      console.error(`   ingest failed: ${msg}`);
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
    `Convex sync_job ${jobId} — ${uploaded.length} files uploaded, ${totalRowsIngested} income_lines rows ingested, ${ingestErrors.length} ingest errors.`
  );
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

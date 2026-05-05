import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("sync_jobs").order("desc").take(50);
  },
});

export const get = query({
  args: { id: v.id("sync_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Cascade-delete a sync_jobs row + all its attached _storage blobs. Used by
 * the /yardi-cleanup skill to nuke a bad run without leaving orphan files.
 *
 * Does NOT touch derived rows (income_lines / tenants / receivable_details
 * / monthly_revenue) — those are snapshot tables and rolling them back is a
 * separate concern. If the job's data is currently driving the dashboard,
 * the dashboard keeps showing it after this call.
 *
 * Returns the storage ids + filenames it deleted so the caller can also
 * remove the local .xlsx files that mirror them.
 */
export const deleteWithFiles = mutation({
  args: { id: v.id("sync_jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job) return { deleted: false, storageIds: [], fileNames: [] as string[] };
    const files = (job.files || []) as Array<{ storageId: any; fileName: string; reportType: string }>;
    const storageIds = files.map(f => f.storageId);
    const fileNames = files.map(f => f.fileName);
    for (const storageId of storageIds) {
      try { await ctx.storage.delete(storageId); } catch { /* already gone — fine */ }
    }
    await ctx.db.delete(args.id);
    return { deleted: true, jobId: args.id, fileCount: files.length, storageIds, fileNames };
  },
});

/**
 * Returns the most recent sync_jobs row regardless of source. Convenience
 * for cleanup tooling that wants to nuke "the last run" without the caller
 * having to hand-pick an id.
 */
export const latest = query({
  handler: async (ctx) => {
    const rows = await ctx.db.query("sync_jobs").order("desc").take(1);
    return rows[0] ?? null;
  },
});

export const create = mutation({
  args: {
    source: v.string(),
    propertyCode: v.optional(v.string()),
    reportTypes: v.optional(v.array(v.string())),
    files: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          fileName: v.string(),
          reportType: v.string(),
          rowsIngested: v.optional(v.number()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sync_jobs", {
      ...args,
      status: "pending",
      recordsCreated: 0,
      startedAt: new Date().toISOString(),
    });
  },
});

/**
 * Mark long-running pending sync_jobs as failed. A row stays "pending" if the
 * scraper crashed after createSyncJob but before completeSyncJob — these rows
 * pollute the Data Pipeline grid with stale state. Any pending job older than
 * `olderThanMinutes` (default 30) is marked failed with an "abandoned" message.
 *
 * Returns how many it patched. Safe to run repeatedly.
 */
export const failAbandonedPending = mutation({
  args: {
    olderThanMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoffMs = Date.now() - (args.olderThanMinutes ?? 30) * 60 * 1000;
    const cutoffIso = new Date(cutoffMs).toISOString();
    const pending = await ctx.db
      .query("sync_jobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    let patched = 0;
    for (const job of pending) {
      const startedAt = job.startedAt || "";
      if (startedAt && startedAt < cutoffIso) {
        await ctx.db.patch(job._id, {
          status: "failed",
          errorMessage: job.errorMessage || "Abandoned — sync did not call complete (crash, timeout, or network error).",
          completedAt: new Date().toISOString(),
        });
        patched++;
      }
    }
    return { patched, totalPending: pending.length };
  },
});

/**
 * Demo cleanup: keeps only the latest successful "yardi_sync" job (live) and
 * one successful "yardi_sync_historical" job per month. Deletes everything
 * else — including failed runs, duplicates from today's testing, and any
 * stale 0-record rows. Returns counts for sanity-checking.
 *
 * Idempotent. Safe to run any time.
 */
export const cleanForDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("sync_jobs").collect();

    // Bucket by (source, monthKey). Keep the most-recently-completed
    // SUCCESSFUL job in each bucket; delete the rest.
    const isSuccess = (j: any) =>
      j.status === "completed" && (j.recordsCreated || 0) > 0 && Array.isArray(j.files) && j.files.length > 0;

    const buckets: Record<string, any[]> = {};
    for (const j of all) {
      const month = (j.completedAt || j.startedAt || "").slice(0, 7) || "unknown";
      const key = `${j.source || "unknown"}|${month}`;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(j);
    }

    const keep = new Set<string>();
    for (const [, jobs] of Object.entries(buckets)) {
      const successes = jobs.filter(isSuccess);
      if (successes.length === 0) continue;
      // Latest by completedAt
      successes.sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
      keep.add(successes[0]._id);
    }

    // For "yardi_sync" (live) keep only the SINGLE most recent overall
    // — Max + Ori don't need to see daily history yet, just the latest.
    const liveJobs = all.filter(j => j.source === "yardi_sync" && isSuccess(j));
    liveJobs.sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
    const liveKeepId = liveJobs[0]?._id;
    // Drop the per-month live keepers other than the absolute latest
    for (const j of liveJobs) {
      if (j._id !== liveKeepId) keep.delete(j._id);
    }
    if (liveKeepId) keep.add(liveKeepId);

    let deleted = 0;
    for (const j of all) {
      if (!keep.has(j._id)) {
        await ctx.db.delete(j._id);
        deleted++;
      }
    }

    return {
      total: all.length,
      kept: keep.size,
      deleted,
    };
  },
});

/**
 * Patch a single file's rowsIngested count after that file's parse + insert
 * has finished. Lets the Data Pipeline grid show real per-file counts instead
 * of the job's lump sum against every row.
 */
export const setFileRecords = mutation({
  args: {
    id: v.id("sync_jobs"),
    storageId: v.id("_storage"),
    rowsIngested: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job || !Array.isArray(job.files)) return;
    const updated = job.files.map((f) =>
      f.storageId === args.storageId ? { ...f, rowsIngested: args.rowsIngested } : f
    );
    await ctx.db.patch(args.id, { files: updated });
  },
});

export const complete = mutation({
  args: {
    id: v.id("sync_jobs"),
    status: v.string(),
    recordsCreated: v.number(),
    errorMessage: v.optional(v.string()),
    anomalies: v.optional(
      v.array(
        v.object({
          type: v.string(),
          severity: v.string(),
          title: v.string(),
          detail: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, {
      ...updates,
      completedAt: new Date().toISOString(),
    });
  },
});

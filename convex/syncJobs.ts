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

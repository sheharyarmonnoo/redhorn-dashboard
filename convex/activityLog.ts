import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: { limit: v.optional(v.number()), type: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.type) {
      const q = ctx.db
        .query("activity_log")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .order("desc");
      return args.limit ? await q.take(args.limit) : await q.collect();
    }
    const q = ctx.db.query("activity_log").order("desc");
    return args.limit ? await q.take(args.limit) : await q.collect();
  },
});

/**
 * Demo cleanup: nukes activity log entries from the test-and-iterate phase.
 * Cutoff = the most recent LIVE sync_job's creation time (not the earliest)
 * so only post-final-sync entries survive. Max + Ori land on a clean feed.
 */
export const cleanForDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const liveSyncs = await ctx.db
      .query("sync_jobs")
      .filter((q) => q.eq(q.field("source"), "yardi_sync"))
      .collect();
    if (liveSyncs.length === 0) {
      // No live sync left at all — wipe everything older than 5 minutes ago
      const cutoff = Date.now() - 5 * 60 * 1000;
      const all = await ctx.db.query("activity_log").collect();
      let deleted = 0;
      for (const entry of all) {
        if (entry._creationTime < cutoff) { await ctx.db.delete(entry._id); deleted++; }
      }
      return { total: all.length, deleted, kept: all.length - deleted, cutoff };
    }
    const latestLive = liveSyncs.sort((a, b) => b._creationTime - a._creationTime)[0];
    const cutoff = latestLive._creationTime;
    const all = await ctx.db.query("activity_log").collect();
    let deleted = 0;
    for (const entry of all) {
      if (entry._creationTime < cutoff) {
        await ctx.db.delete(entry._id);
        deleted++;
      }
    }
    return { total: all.length, deleted, kept: all.length - deleted, cutoff };
  },
});

export const log = mutation({
  args: {
    type: v.string(),
    description: v.string(),
    user: v.string(),
    unit: v.optional(v.string()),
    dealId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("activity_log", {
      ...args,
      createdAt: new Date().toISOString(),
    });
  },
});

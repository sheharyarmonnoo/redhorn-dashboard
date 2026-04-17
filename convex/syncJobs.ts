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

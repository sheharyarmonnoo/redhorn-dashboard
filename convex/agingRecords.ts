import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aging_records")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", args.propertyId).eq("isLatest", true)
      )
      .collect();
  },
});

export const insert = mutation({
  args: {
    propertyId: v.id("properties"),
    tenantName: v.string(),
    leaseCode: v.optional(v.string()),
    currentOwed: v.number(),
    days0_30: v.number(),
    days31_60: v.number(),
    days61_90: v.number(),
    over90: v.number(),
    prepayments: v.number(),
    totalOwed: v.number(),
    snapshotDate: v.string(),
    isLatest: v.boolean(),
    syncId: v.optional(v.id("sync_jobs")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("aging_records", args);
  },
});

export const markNotLatest = mutation({
  args: { id: v.id("aging_records") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isLatest: false });
  },
});

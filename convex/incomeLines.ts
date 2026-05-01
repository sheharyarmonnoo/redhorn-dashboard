import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Bulk-insert income statement rows for a property. Server-side resolves
 * propertyId from the Yardi property code and flips isLatest on prior rows so
 * the dashboard always shows the most recent snapshot.
 */
export const bulkInsertByCode = mutation({
  args: {
    propertyCode: v.string(),
    syncId: v.optional(v.id("sync_jobs")),
    snapshotDate: v.string(), // ISO timestamp — also serves as updated_time
    rows: v.array(
      v.object({
        lineItem: v.string(),
        hierarchyLevel: v.number(),
        parentLine: v.optional(v.string()),
        currentPeriod: v.number(),
        yearToDate: v.number(),
        sinceInception: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const property = await ctx.db
      .query("properties")
      .withIndex("by_code", (q) => q.eq("code", args.propertyCode))
      .first();
    if (!property) {
      throw new Error(`Unknown property code: ${args.propertyCode}`);
    }

    // Mark prior latest rows for this property as not-latest so the new snapshot wins
    const prior = await ctx.db
      .query("income_lines")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", property._id).eq("isLatest", true)
      )
      .collect();
    for (const row of prior) {
      await ctx.db.patch(row._id, { isLatest: false });
    }

    let inserted = 0;
    for (const r of args.rows) {
      await ctx.db.insert("income_lines", {
        syncId: args.syncId,
        propertyId: property._id,
        lineItem: r.lineItem,
        hierarchyLevel: r.hierarchyLevel,
        parentLine: r.parentLine,
        currentPeriod: r.currentPeriod,
        yearToDate: r.yearToDate,
        sinceInception: r.sinceInception,
        snapshotDate: args.snapshotDate,
        isLatest: true,
      });
      inserted++;
    }

    return { propertyId: property._id, inserted, supersededPrior: prior.length };
  },
});

export const listByProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("income_lines")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", args.propertyId).eq("isLatest", true)
      )
      .collect();
  },
});

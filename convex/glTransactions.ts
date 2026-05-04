import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Bulk-insert GL Transaction Detail rows for a property + month. Replaces
 * any rows previously synced for the same property + post month so re-runs
 * are idempotent. Aggregating these reproduces the income statement and
 * surfaces posting timing at the entry level.
 */
export const bulkInsertByCode = mutation({
  args: {
    propertyCode: v.string(),
    syncId: v.optional(v.id("sync_jobs")),
    month: v.string(), // YYYY-MM — the report's period
    rows: v.array(
      v.object({
        postingDate: v.string(),
        postMonth: v.optional(v.string()),
        accountCode: v.string(),
        accountName: v.string(),
        description: v.string(),
        reference: v.optional(v.string()),
        vendor: v.optional(v.string()),
        debit: v.number(),
        credit: v.number(),
        amount: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const property = await ctx.db
      .query("properties")
      .withIndex("by_code", (q) => q.eq("code", args.propertyCode))
      .first();
    if (!property) throw new Error(`Unknown property code: ${args.propertyCode}`);

    // Wipe prior rows for this property + month so re-runs replace cleanly.
    const prior = await ctx.db
      .query("gl_transactions")
      .withIndex("by_property_month", (q) =>
        q.eq("propertyId", property._id).eq("postMonth", args.month)
      )
      .collect();
    for (const row of prior) await ctx.db.delete(row._id);

    let inserted = 0;
    for (const r of args.rows) {
      await ctx.db.insert("gl_transactions", {
        syncId: args.syncId,
        propertyId: property._id,
        postingDate: r.postingDate,
        postMonth: r.postMonth || args.month,
        accountCode: r.accountCode,
        accountName: r.accountName,
        description: r.description,
        reference: r.reference,
        vendor: r.vendor,
        debit: r.debit,
        credit: r.credit,
        amount: r.amount,
      });
      inserted++;
    }

    return { propertyId: property._id, inserted, replaced: prior.length };
  },
});

export const listByProperty = query({
  args: {
    propertyId: v.id("properties"),
    month: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.month) {
      return await ctx.db
        .query("gl_transactions")
        .withIndex("by_property_month", (q) =>
          q.eq("propertyId", args.propertyId).eq("postMonth", args.month!)
        )
        .collect();
    }
    return await ctx.db
      .query("gl_transactions")
      .withIndex("by_property_date", (q) => q.eq("propertyId", args.propertyId))
      .order("desc")
      .take(500);
  },
});

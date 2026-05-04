import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Bulk-insert Receivable Detail rows (per-tenant charge + payment activity)
 * for a property + month. Replaces prior rows for the same property + month
 * so re-runs are idempotent. Powers per-tenant utility-posting checks,
 * aging buckets, and AR timing analysis.
 */
export const bulkInsertByCode = mutation({
  args: {
    propertyCode: v.string(),
    syncId: v.optional(v.id("sync_jobs")),
    month: v.string(),
    rows: v.array(
      v.object({
        tenantName: v.string(),
        unit: v.optional(v.string()),
        controlNumber: v.optional(v.string()),
        transactionDate: v.optional(v.string()),
        postMonth: v.optional(v.string()),
        chargeCode: v.optional(v.string()),
        description: v.optional(v.string()),
        charges: v.number(),
        receipts: v.number(),
        balance: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const property = await ctx.db
      .query("properties")
      .withIndex("by_code", (q) => q.eq("code", args.propertyCode))
      .first();
    if (!property) throw new Error(`Unknown property code: ${args.propertyCode}`);

    const prior = await ctx.db
      .query("receivable_details")
      .withIndex("by_property_month", (q) =>
        q.eq("propertyId", property._id).eq("postMonth", args.month)
      )
      .collect();
    for (const row of prior) await ctx.db.delete(row._id);

    let inserted = 0;
    for (const r of args.rows) {
      await ctx.db.insert("receivable_details", {
        syncId: args.syncId,
        propertyId: property._id,
        tenantName: r.tenantName,
        unit: r.unit,
        controlNumber: r.controlNumber,
        transactionDate: r.transactionDate,
        postMonth: r.postMonth || args.month,
        chargeCode: r.chargeCode,
        description: r.description,
        charges: r.charges,
        receipts: r.receipts,
        balance: r.balance,
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
    tenantName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.month) {
      return await ctx.db
        .query("receivable_details")
        .withIndex("by_property_month", (q) =>
          q.eq("propertyId", args.propertyId).eq("postMonth", args.month!)
        )
        .collect();
    }
    if (args.tenantName) {
      return await ctx.db
        .query("receivable_details")
        .withIndex("by_property_tenant", (q) =>
          q.eq("propertyId", args.propertyId).eq("tenantName", args.tenantName!)
        )
        .collect();
    }
    return await ctx.db
      .query("receivable_details")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .order("desc")
      .take(500);
  },
});

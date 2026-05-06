import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const OVERRIDE_FIELDS = v.object({
  monthlyRent: v.optional(v.number()),
  monthlyElectric: v.optional(v.number()),
  securityDeposit: v.optional(v.number()),
  leaseFrom: v.optional(v.string()),
  leaseTo: v.optional(v.string()),
  status: v.optional(v.string()),
  notes: v.optional(v.string()),
  pastDueAmount: v.optional(v.number()),
  delinquencyStage: v.optional(v.string()),
  nextRentIncrease: v.optional(v.string()),
  nextRentIncreaseAmount: v.optional(v.number()),
  tenantEmail: v.optional(v.string()),
  tenantPhone: v.optional(v.string()),
  tenantContactName: v.optional(v.string()),
});

/**
 * Upsert a manual override on a tenant unit. Edits stick across syncs because
 * tenants:listByProperty merges this layer on top of the synced rows. Only
 * defined fields apply; undefined fields fall back to the synced value.
 */
export const setOverride = mutation({
  args: {
    propertyId: v.id("properties"),
    unit: v.string(),
    fields: OVERRIDE_FIELDS,
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("tenant_overrides")
      .withIndex("by_property_unit", (q) =>
        q.eq("propertyId", args.propertyId).eq("unit", args.unit)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args.fields,
        updatedAt: now,
        updatedBy: args.updatedBy,
      });
      return existing._id;
    }
    return await ctx.db.insert("tenant_overrides", {
      propertyId: args.propertyId,
      unit: args.unit,
      ...args.fields,
      updatedAt: now,
      updatedBy: args.updatedBy,
    });
  },
});

/**
 * Revert a unit to the pipeline values. Deletes the override row entirely;
 * next read of the tenant will be the synced data straight from Yardi.
 */
export const clearOverride = mutation({
  args: {
    propertyId: v.id("properties"),
    unit: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tenant_overrides")
      .withIndex("by_property_unit", (q) =>
        q.eq("propertyId", args.propertyId).eq("unit", args.unit)
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { cleared: true };
    }
    return { cleared: false };
  },
});

export const listByProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tenant_overrides")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect();
  },
});

export const listAll = query({
  handler: async (ctx) => {
    return await ctx.db.query("tenant_overrides").collect();
  },
});

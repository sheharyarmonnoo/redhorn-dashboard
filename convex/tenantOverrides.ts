import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const OVERRIDE_FIELDS = v.object({
  notes: v.optional(v.string()),
  tenantEmail: v.optional(v.string()),
  tenantPhone: v.optional(v.string()),
  tenantContactName: v.optional(v.string()),
  // Manual delinquency status. Slice 2 introduces this for asset
  // managers to set states the synced data can't represent (Auction
  // Posted, In Eviction, Needs Review, etc.). Empty string is treated
  // by setOverride as "clear this field" so callers can revert just
  // the status without nuking notes/contact overrides.
  status: v.optional(v.string()),
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
    // Empty string in the incoming fields means "clear this column" so the
    // synced value falls through again. Patch() treats undefined as "leave
    // as-is", so we map "" → undefined-via-explicit-delete by re-inserting
    // without the cleared key. Easier: split into a write patch with the
    // non-empty fields and a clear patch with the empty ones nulled out.
    const incoming = args.fields as Record<string, string | undefined>;
    const writePatch: Record<string, string | undefined> = {};
    const clearPatch: Record<string, undefined> = {};
    for (const [k, v] of Object.entries(incoming)) {
      if (v === undefined) continue;
      if (v === "") clearPatch[k] = undefined;
      else writePatch[k] = v;
    }
    const existing = await ctx.db
      .query("tenant_overrides")
      .withIndex("by_property_unit", (q) =>
        q.eq("propertyId", args.propertyId).eq("unit", args.unit)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...clearPatch,
        ...writePatch,
        updatedAt: now,
        updatedBy: args.updatedBy,
      });
      return existing._id;
    }
    return await ctx.db.insert("tenant_overrides", {
      propertyId: args.propertyId,
      unit: args.unit,
      ...writePatch,
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

/**
 * One-shot migration: clear Yardi-sourced fields off every tenant_overrides
 * row before the schema narrows. Convex schema validation is strict; a row
 * carrying e.g. a `status` value will reject the new schema, so we null
 * those fields first. Safe to re-run — no-op once everything is clean.
 */
export const clearStaleFields = mutation({
  handler: async (ctx) => {
    const rows = await ctx.db.query("tenant_overrides").collect();
    let cleared = 0;
    for (const r of rows) {
      const patch: any = {};
      const staleKeys = [
        "monthlyRent", "monthlyElectric", "securityDeposit",
        "leaseFrom", "leaseTo", "status",
        "pastDueAmount", "delinquencyStage",
        "nextRentIncrease", "nextRentIncreaseAmount",
      ];
      let dirty = false;
      for (const k of staleKeys) {
        if ((r as any)[k] !== undefined) {
          patch[k] = undefined;
          dirty = true;
        }
      }
      if (dirty) {
        await ctx.db.patch(r._id, patch);
        cleared++;
      }
    }
    return { totalRows: rows.length, cleared };
  },
});

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tenants")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", args.propertyId).eq("isLatest", true)
      )
      .collect();
  },
});

export const listAll = query({
  handler: async (ctx) => {
    const tenants = await ctx.db
      .query("tenants")
      .filter((q) => q.eq(q.field("isLatest"), true))
      .collect();
    const properties = await ctx.db.query("properties").collect();
    const propMap: Record<string, { name: string; code: string }> = {};
    for (const p of properties) {
      propMap[p._id] = { name: p.name, code: p.code };
    }
    return tenants.map((t) => ({
      ...t,
      propertyName: propMap[t.propertyId]?.name || "Unknown",
      propertyCode: propMap[t.propertyId]?.code || "",
    }));
  },
});

export const getByUnit = query({
  args: { propertyId: v.id("properties"), unit: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tenants")
      .withIndex("by_unit", (q) =>
        q
          .eq("propertyId", args.propertyId)
          .eq("unit", args.unit)
          .eq("isLatest", true)
      )
      .first();
  },
});

export const updateStatus = mutation({
  args: { id: v.id("tenants"), status: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const updateNotes = mutation({
  args: { id: v.id("tenants"), notes: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { notes: args.notes });
  },
});

export const updateDelinquency = mutation({
  args: {
    id: v.id("tenants"),
    delinquencyStage: v.string(),
    delinquencyDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      delinquencyStage: args.delinquencyStage,
      delinquencyDate: args.delinquencyDate,
    });
  },
});

export const updateElectricPosted = mutation({
  args: { id: v.id("tenants"), electricPosted: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { electricPosted: args.electricPosted });
  },
});

export const markNotLatest = mutation({
  args: { id: v.id("tenants") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isLatest: false });
  },
});

export const insertOne = mutation({
  args: {
    propertyId: v.id("properties"),
    unit: v.string(),
    building: v.string(),
    tenant: v.string(),
    leaseType: v.string(),
    sqft: v.number(),
    leaseFrom: v.string(),
    leaseTo: v.string(),
    monthlyRent: v.number(),
    monthlyElectric: v.number(),
    securityDeposit: v.number(),
    status: v.string(),
    pastDueAmount: v.number(),
    electricPosted: v.boolean(),
    lastPaymentDate: v.string(),
    notes: v.optional(v.string()),
    delinquencyStage: v.optional(v.string()),
    delinquencyDate: v.optional(v.string()),
    snapshotDate: v.optional(v.string()),
    isLatest: v.boolean(),
    syncId: v.optional(v.id("sync_jobs")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tenants", args);
  },
});

export const bulkInsert = mutation({
  args: {
    tenants: v.array(
      v.object({
        propertyId: v.id("properties"),
        unit: v.string(),
        building: v.string(),
        tenant: v.string(),
        leaseType: v.string(),
        sqft: v.number(),
        leaseFrom: v.string(),
        leaseTo: v.string(),
        monthlyRent: v.number(),
        monthlyElectric: v.number(),
        securityDeposit: v.number(),
        status: v.string(),
        pastDueAmount: v.number(),
        electricPosted: v.boolean(),
        lastPaymentDate: v.string(),
        notes: v.optional(v.string()),
        delinquencyStage: v.optional(v.string()),
        delinquencyDate: v.optional(v.string()),
        snapshotDate: v.optional(v.string()),
        isLatest: v.boolean(),
        syncId: v.optional(v.id("sync_jobs")),
      })
    ),
  },
  handler: async (ctx, args) => {
    const ids = [];
    for (const t of args.tenants) {
      const id = await ctx.db.insert("tenants", t);
      ids.push(id);
    }
    return ids;
  },
});

/**
 * Bulk replacement of tenants for a single property. Server resolves
 * propertyCode → propertyId, marks all current rows as `isLatest=false`
 * (preserving history), inserts the new snapshot. Manual overrides on
 * tenants (notes, delinquency stage, posting status) are NOT carried
 * over here — those should be re-applied on top of the fresh data
 * via the override layer or merged client-side. This matches the
 * income_lines approach.
 */
export const bulkReplaceByCode = mutation({
  args: {
    propertyCode: v.string(),
    syncId: v.optional(v.id("sync_jobs")),
    snapshotDate: v.string(),
    rows: v.array(
      v.object({
        unit: v.string(),
        building: v.optional(v.string()),
        tenant: v.optional(v.string()),
        leaseType: v.optional(v.string()),
        sqft: v.optional(v.number()),
        leaseFrom: v.optional(v.string()),
        leaseTo: v.optional(v.string()),
        monthlyRent: v.optional(v.number()),
        monthlyElectric: v.optional(v.number()),
        securityDeposit: v.optional(v.number()),
        status: v.optional(v.string()),
        pastDueAmount: v.optional(v.number()),
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
      .query("tenants")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", property._id).eq("isLatest", true)
      )
      .collect();
    for (const row of prior) {
      await ctx.db.patch(row._id, { isLatest: false });
    }

    let inserted = 0;
    for (const r of args.rows) {
      await ctx.db.insert("tenants", {
        syncId: args.syncId,
        propertyId: property._id,
        unit: r.unit,
        building: r.building || "",
        tenant: r.tenant || "",
        leaseType: r.leaseType || "",
        sqft: r.sqft ?? 0,
        leaseFrom: r.leaseFrom || "",
        leaseTo: r.leaseTo || "",
        monthlyRent: r.monthlyRent ?? 0,
        monthlyElectric: r.monthlyElectric ?? 0,
        securityDeposit: r.securityDeposit ?? 0,
        status: r.status || "current",
        pastDueAmount: r.pastDueAmount ?? 0,
        electricPosted: false,
        lastPaymentDate: "",
        snapshotDate: args.snapshotDate,
        isLatest: true,
      });
      inserted++;
    }

    if (inserted > 0 && !property.hasData) {
      await ctx.db.patch(property._id, { hasData: true });
    }

    return { propertyId: property._id, inserted, supersededPrior: prior.length };
  },
});

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

/**
 * Patch the latest tenants snapshot for a property with per-lease past-due
 * dollar amounts pulled from the Past Due dashboard panel. We match by lease
 * name (case-insensitive, trimmed) since the rent-roll panel uses
 * "Lease Name(Id)" and the past-due panel uses "Lease Name" / "Customer".
 *
 * Tenants that don't have a matching past-due row are zeroed out so a paid-off
 * tenant doesn't keep its prior balance forever. Status is also flipped to
 * "past_due" for any tenant with a positive balance.
 */
export const applyPastDueByCode = mutation({
  args: {
    propertyCode: v.string(),
    rows: v.array(
      v.object({
        leaseName: v.string(),
        unit: v.optional(v.string()),
        pastDueAmount: v.number(),
        lastPaymentDate: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const property = await ctx.db
      .query("properties")
      .withIndex("by_code", (q) => q.eq("code", args.propertyCode))
      .first();
    if (!property) throw new Error(`Unknown property code: ${args.propertyCode}`);

    const tenants = await ctx.db
      .query("tenants")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", property._id).eq("isLatest", true)
      )
      .collect();

    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/[.,]/g, " ")
        .replace(/\b(llc|inc|corp|co|ltd|llp)\b\.?/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const byName: Record<string, { pastDueAmount: number; lastPaymentDate?: string }> = {};
    for (const r of args.rows) {
      byName[norm(r.leaseName)] = {
        pastDueAmount: r.pastDueAmount,
        lastPaymentDate: r.lastPaymentDate,
      };
    }

    let matched = 0;
    let cleared = 0;
    for (const t of tenants) {
      const key = norm(t.tenant || "");
      const hit = byName[key];
      const newAmount = hit?.pastDueAmount ?? 0;
      const newStatus =
        newAmount > 0 ? "past_due" : (t.status === "past_due" ? "current" : t.status);
      const patch: any = {
        pastDueAmount: newAmount,
        status: newStatus,
      };
      if (hit?.lastPaymentDate) patch.lastPaymentDate = hit.lastPaymentDate;
      await ctx.db.patch(t._id, patch);
      if (hit) matched++;
      else if ((t.pastDueAmount || 0) > 0) cleared++;
    }

    return {
      propertyId: property._id,
      tenants: tenants.length,
      matched,
      cleared,
      pastDueRows: args.rows.length,
    };
  },
});

/**
 * Enrich the latest tenants snapshot with monthly rent + lease start +
 * security deposit pulled from the full Commercial Rent Roll report. The
 * dashboard "Current Leases" panel doesn't carry these fields, so we get them
 * from the proper rent roll and merge them in.
 *
 * Match strategy: unit first (cheapest, exact), then lease-name fallback.
 * Numbers only overwrite when the new value is non-zero so we don't blank
 * existing values when the rent-roll-full source omits a field.
 */
export const enrichRentByCode = mutation({
  args: {
    propertyCode: v.string(),
    rows: v.array(
      v.object({
        unit: v.string(),
        tenant: v.optional(v.string()),
        monthlyRent: v.optional(v.number()),
        monthlyElectric: v.optional(v.number()),
        securityDeposit: v.optional(v.number()),
        leaseFrom: v.optional(v.string()),
        leaseTo: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const property = await ctx.db
      .query("properties")
      .withIndex("by_code", (q) => q.eq("code", args.propertyCode))
      .first();
    if (!property) throw new Error(`Unknown property code: ${args.propertyCode}`);

    const tenants = await ctx.db
      .query("tenants")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", property._id).eq("isLatest", true)
      )
      .collect();

    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/[.,]/g, " ")
        .replace(/\b(llc|inc|corp|co|ltd|llp)\b\.?/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const byUnit: Record<string, (typeof args.rows)[number]> = {};
    const byTenant: Record<string, (typeof args.rows)[number]> = {};
    for (const r of args.rows) {
      if (r.unit) byUnit[r.unit.trim().toLowerCase()] = r;
      if (r.tenant) byTenant[norm(r.tenant)] = r;
    }

    let matched = 0;
    for (const t of tenants) {
      const key = (t.unit || "").trim().toLowerCase();
      const tkey = norm(t.tenant || "");
      const hit = byUnit[key] || byTenant[tkey];
      if (!hit) continue;
      const patch: any = {};
      if (typeof hit.monthlyRent === "number" && hit.monthlyRent > 0) patch.monthlyRent = hit.monthlyRent;
      if (typeof hit.monthlyElectric === "number" && hit.monthlyElectric > 0) patch.monthlyElectric = hit.monthlyElectric;
      if (typeof hit.securityDeposit === "number" && hit.securityDeposit > 0) patch.securityDeposit = hit.securityDeposit;
      if (hit.leaseFrom && hit.leaseFrom.trim()) patch.leaseFrom = hit.leaseFrom;
      if (hit.leaseTo && hit.leaseTo.trim()) patch.leaseTo = hit.leaseTo;
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(t._id, patch);
        matched++;
      }
    }

    return {
      propertyId: property._id,
      tenants: tenants.length,
      matched,
      enrichmentRows: args.rows.length,
    };
  },
});

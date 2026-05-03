import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("monthly_revenue")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect();
    return rows.sort((a, b) => a.month.localeCompare(b.month));
  },
});

export const upsert = mutation({
  args: {
    propertyId: v.id("properties"),
    month: v.string(),
    rent: v.number(),
    cam: v.number(),
    electric: v.number(),
    lateFees: v.number(),
    total: v.number(),
    occupancy: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("monthly_revenue")
      .withIndex("by_month", (q) =>
        q.eq("propertyId", args.propertyId).eq("month", args.month)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("monthly_revenue", args);
  },
});

/**
 * Recompute the monthly_revenue rollup for a property + month from the latest
 * income_lines snapshot, the latest tenants snapshot (rent roll), and the
 * units list. Triggered by the scraper after each ingest so the dashboard's
 * KPI cards and revenue chart are derived from real Yardi data.
 */
export const recomputeFromLatest = mutation({
  args: {
    propertyCode: v.string(),
    month: v.string(), // "YYYY-MM"
  },
  handler: async (ctx, args) => {
    const property = await ctx.db
      .query("properties")
      .withIndex("by_code", (q) => q.eq("code", args.propertyCode))
      .first();
    if (!property) throw new Error(`Unknown property code: ${args.propertyCode}`);

    // Latest income_lines snapshot
    const lines = await ctx.db
      .query("income_lines")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", property._id).eq("isLatest", true)
      )
      .collect();

    // Tally revenue categories from current-period column
    let rent = 0, cam = 0, electric = 0, lateFees = 0, totalIncome = 0;
    for (const r of lines) {
      const li = (r.lineItem || "").toLowerCase();
      const cp = r.currentPeriod || 0;
      // Skip subtotals / TOTAL lines so we don't double-count
      if (/^\s*total\b/i.test(r.lineItem) || /^\s*net\b/i.test(r.lineItem)) continue;
      if (/rent|rental income|storage rent/.test(li) && !/expense/.test(li)) rent += cp;
      else if (/electric|utility/.test(li) && !/expense/.test(li)) electric += cp;
      else if (/cam|common area/.test(li) && !/expense/.test(li)) cam += cp;
      else if (/late fee/.test(li)) lateFees += cp;
      // Sum any positive income line for total
      if (cp > 0 && /income|rent|recovery|fee/i.test(li) && !/expense/i.test(li)) {
        totalIncome += cp;
      }
    }

    // Occupancy = current leases / total units
    const tenants = await ctx.db
      .query("tenants")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", property._id).eq("isLatest", true)
      )
      .collect();
    const units = await ctx.db
      .query("units")
      .withIndex("by_property", (q) => q.eq("propertyId", property._id))
      .collect();
    const occupancy = units.length > 0 ? Math.round((tenants.length / units.length) * 100) : 0;

    const total = totalIncome > 0 ? totalIncome : (rent + cam + electric + lateFees);

    // Upsert
    const existing = await ctx.db
      .query("monthly_revenue")
      .withIndex("by_month", (q) =>
        q.eq("propertyId", property._id).eq("month", args.month)
      )
      .first();
    const row = {
      propertyId: property._id,
      month: args.month,
      rent,
      cam,
      electric,
      lateFees,
      total,
      occupancy,
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return { id: existing._id, ...row, supersededExisting: true };
    }
    const id = await ctx.db.insert("monthly_revenue", row);
    return { id, ...row, supersededExisting: false };
  },
});

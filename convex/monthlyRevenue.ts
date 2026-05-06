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

    // Tally revenue categories from current-period column for the chart
    // breakdown. Skip subtotal / NET lines so we don't double-count when
    // we're walking individual line items.
    let rent = 0, cam = 0, electric = 0, lateFees = 0;
    for (const r of lines) {
      const li = (r.lineItem || "").toLowerCase();
      const cp = r.currentPeriod || 0;
      if (/^\s*total\b/i.test(r.lineItem) || /^\s*net\b/i.test(r.lineItem)) continue;
      if (/rent|rental income|storage rent/.test(li) && !/expense/.test(li)) rent += cp;
      else if (/electric|utility/.test(li) && !/expense/.test(li)) electric += cp;
      else if (/cam|common area/.test(li) && !/expense/.test(li)) cam += cp;
      else if (/late fee/.test(li)) lateFees += cp;
    }

    // Headline total comes from the income statement's own "TOTAL INCOME"
    // line — that's what matches the GL and what the Yardi user expects to
    // see on the dashboard. Falls back to a category sum if no such line
    // exists (e.g. on partial / non-standard income statements).
    const totalIncomeLine = lines.find(r =>
      /^\s*total\s+income\s*$/i.test((r.lineItem || "").trim())
    );
    const total = totalIncomeLine && (totalIncomeLine.currentPeriod || 0) > 0
      ? totalIncomeLine.currentPeriod
      : (rent + cam + electric + lateFees);

    // Occupancy is unit-level: expand multi-unit leases (tenant.unit can be
    // "A-103, A-112, A-85" — three units in one lease row) before counting.
    // Otherwise multi-unit leases under-count and Hollister reads 65% when
    // the real number is 82%.
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
    const leasedKeys = new Set<string>();
    for (const t of tenants) {
      const raw = (t.unit || "").trim();
      if (!raw) continue;
      for (const part of raw.split(",")) {
        const k = part.trim().toLowerCase();
        if (k) leasedKeys.add(k);
      }
    }
    const occupancy = units.length > 0 ? Math.round((leasedKeys.size / units.length) * 100) : 0;

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

/**
 * Recompute the monthly_revenue rollup for a SPECIFIC historical month using
 * the income_lines snapshot whose snapshotDate falls within that month. Used
 * by the scraper's --historical mode to backfill prior months without
 * disturbing the "latest" pointer.
 *
 * Tenants + units are read from the current latest snapshot since we don't
 * have a per-month snapshot of those — occupancy is treated as today's value
 * for the historical month, which is fine for a YTD chart and matches what
 * the user would expect when looking back.
 */
export const recomputeFromMonth = mutation({
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

    // Find income_lines whose snapshotDate is in the requested month, then keep
    // only the rows from the most recent snapshot within that month so a
    // re-run replaces, not appends.
    const all = await ctx.db
      .query("income_lines")
      .withIndex("by_property_latest", (q) => q.eq("propertyId", property._id).eq("isLatest", false))
      .collect();
    const inMonth = all.filter((r) => (r.snapshotDate || "").startsWith(args.month));
    if (inMonth.length === 0) {
      throw new Error(`No income_lines found for ${args.propertyCode} in ${args.month}. Did the historical scrape run?`);
    }
    const latestSnapshot = inMonth
      .map((r) => r.snapshotDate)
      .sort()
      .reverse()[0];
    const lines = inMonth.filter((r) => r.snapshotDate === latestSnapshot);

    let rent = 0, cam = 0, electric = 0, lateFees = 0;
    for (const r of lines) {
      const li = (r.lineItem || "").toLowerCase();
      const cp = r.currentPeriod || 0;
      if (/^\s*total\b/i.test(r.lineItem) || /^\s*net\b/i.test(r.lineItem)) continue;
      if (/rent|rental income|storage rent/.test(li) && !/expense/.test(li)) rent += cp;
      else if (/electric|utility/.test(li) && !/expense/.test(li)) electric += cp;
      else if (/cam|common area/.test(li) && !/expense/.test(li)) cam += cp;
      else if (/late fee/.test(li)) lateFees += cp;
    }

    const totalIncomeLine = lines.find(r =>
      /^\s*total\s+income\s*$/i.test((r.lineItem || "").trim())
    );
    const total = totalIncomeLine && (totalIncomeLine.currentPeriod || 0) > 0
      ? totalIncomeLine.currentPeriod
      : (rent + cam + electric + lateFees);

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
    const leasedKeys = new Set<string>();
    for (const t of tenants) {
      const raw = (t.unit || "").trim();
      if (!raw) continue;
      for (const part of raw.split(",")) {
        const k = part.trim().toLowerCase();
        if (k) leasedKeys.add(k);
      }
    }
    const occupancy = units.length > 0 ? Math.round((leasedKeys.size / units.length) * 100) : 0;

    const existing = await ctx.db
      .query("monthly_revenue")
      .withIndex("by_month", (q) =>
        q.eq("propertyId", property._id).eq("month", args.month)
      )
      .first();
    const row = { propertyId: property._id, month: args.month, rent, cam, electric, lateFees, total, occupancy };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return { id: existing._id, ...row, supersededExisting: true, snapshotDate: latestSnapshot };
    }
    const id = await ctx.db.insert("monthly_revenue", row);
    return { id, ...row, supersededExisting: false, snapshotDate: latestSnapshot };
  },
});

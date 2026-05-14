import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * One-shot maintenance: copy `snapshotDate.slice(0,7)` into the `period`
 * field for rows where `period` is blank. Historical backfills run before
 * the period-from-IS-header logic landed wrote snapshotDate but no period,
 * which made those rows invisible to the Financials page period switcher.
 */
export const backfillPeriodFromSnapshotDate = mutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cap = args.limit ?? 2000;
    const rows = await ctx.db.query("income_lines").take(cap);
    let patched = 0;
    let skippedHasPeriod = 0;
    let skippedNoSnap = 0;
    for (const r of rows) {
      if (r.period && r.period.length > 0) { skippedHasPeriod++; continue; }
      const stamp = (r.snapshotDate || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(stamp)) { skippedNoSnap++; continue; }
      await ctx.db.patch(r._id, { period: stamp });
      patched++;
    }
    return { scanned: rows.length, patched, skippedHasPeriod, skippedNoSnap, more: rows.length === cap };
  },
});

/**
 * One-shot maintenance: drop income_lines rows with a specific (period,
 * isLatest) combination — used for clearing phantom in-progress-month
 * snapshots that older syncs wrote when the IS header parsing was off.
 * E.g. clearByExactPeriod({period: "2026-05"}) drops every 2026-05 row
 * across both isLatest=true and isLatest=false.
 */
export const clearByExactPeriod = mutation({
  args: { period: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("income_lines").collect();
    let removed = 0;
    for (const r of all) {
      if (r.period === args.period) {
        await ctx.db.delete(r._id);
        removed++;
      }
    }
    return { scanned: all.length, removed };
  },
});

/**
 * One-shot: drop income_lines rows where period is blank/null AND the
 * snapshotDate falls in the given month (e.g. "2026-05"). Used to clear
 * phantom rows from runs that didn't parse the IS period header.
 */
export const clearBlankPeriodInSnapMonth = mutation({
  args: { snapMonth: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cap = args.limit ?? 2000;
    const rows = await ctx.db.query("income_lines").take(cap);
    let removed = 0;
    for (const r of rows) {
      if (r.period && r.period.length > 0) continue;
      const stamp = (r.snapshotDate || "").slice(0, 7);
      if (stamp !== args.snapMonth) continue;
      await ctx.db.delete(r._id);
      removed++;
    }
    return { scanned: rows.length, removed, more: rows.length === cap };
  },
});

/**
 * Diagnostic: list distinct (propertyId, period, snapshotDate-month) and
 * count rows. Helps audit whether historical backfills actually wrote
 * the `period` field or only `snapshotDate`.
 */
export const periodInventory = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("income_lines").collect();
    const buckets = new Map<string, number>();
    for (const r of all) {
      const period = r.period || "";
      const snapMonth = (r.snapshotDate || "").slice(0, 7);
      const key = `${r.propertyId}|period=${period}|snap=${snapMonth}|isLatest=${r.isLatest}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return Array.from(buckets.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key));
  },
});

/**
 * One-shot cleanup: nuke all income_lines rows whose `period` (or fallback
 * `snapshotDate`) is older than `keepFromMonth`. Used to drop prior-year
 * historical backfills the dashboard no longer surfaces.
 */
export const clearOlderThanMonth = mutation({
  args: { keepFromMonth: v.string() }, // "2026-01" → keep 2026-01 onward
  handler: async (ctx, args) => {
    const all = await ctx.db.query("income_lines").collect();
    let removed = 0;
    for (const r of all) {
      const stamp = (r.period || r.snapshotDate || "").slice(0, 7);
      if (!stamp) continue;
      if (stamp < args.keepFromMonth) {
        await ctx.db.delete(r._id);
        removed++;
      }
    }
    return { scanned: all.length, removed };
  },
});

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
    period: v.optional(v.string()), // YYYY-MM the report's CP column actually covers
    historical: v.optional(v.boolean()), // when true, insert as isLatest=false; don't bump prior latest
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

    const isHistorical = args.historical === true;

    // Only flip the prior latest pointer when we're ingesting current data
    // AND this call actually carries new rows. A failed Yardi parse that
    // passes rows:[] would otherwise demote every prior latest row and
    // leave the property with NO income statement on the dashboard until
    // the next clean sync. Guard against that.
    let priorCount = 0;
    if (!isHistorical && args.rows.length > 0) {
      const prior = await ctx.db
        .query("income_lines")
        .withIndex("by_property_latest", (q) =>
          q.eq("propertyId", property._id).eq("isLatest", true)
        )
        .collect();
      for (const row of prior) {
        await ctx.db.patch(row._id, { isLatest: false });
      }
      priorCount = prior.length;
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
        period: args.period,
        snapshotDate: args.snapshotDate,
        isLatest: !isHistorical,
      });
      inserted++;
    }

    if (inserted > 0 && !property.hasData) {
      await ctx.db.patch(property._id, { hasData: true });
    }

    return { propertyId: property._id, inserted, supersededPrior: priorCount, historical: isHistorical };
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

/**
 * All income_lines rows for a property across every snapshot — used by the
 * insights action to build prior-period comparisons.
 */
export const allForProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    // Use the by_property_latest index (which includes propertyId as first key)
    // and pull both isLatest=true and isLatest=false rows.
    const latest = await ctx.db
      .query("income_lines")
      .withIndex("by_property_latest", (q) => q.eq("propertyId", args.propertyId).eq("isLatest", true))
      .collect();
    const prior = await ctx.db
      .query("income_lines")
      .withIndex("by_property_latest", (q) => q.eq("propertyId", args.propertyId).eq("isLatest", false))
      .collect();
    return [...latest, ...prior];
  },
});

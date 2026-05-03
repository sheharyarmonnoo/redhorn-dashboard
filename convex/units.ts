import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listByProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("units")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect();
  },
});

/**
 * Replace the unit list for a property from a Yardi Total Units export.
 * The `units` table is physical-attribute history (sqft, building, amps, etc.) —
 * not a snapshot table — so we delete-then-insert by (propertyId, unit) match.
 *
 * Yardi's commercial Total Units listing has fewer fields than our schema; we
 * fill required fields with sensible defaults and leave the rest empty.
 */
export const bulkReplaceByCode = mutation({
  args: {
    propertyCode: v.string(),
    rows: v.array(
      v.object({
        unit: v.string(),
        building: v.optional(v.string()),
        sqft: v.optional(v.number()),
        amps: v.optional(v.number()),
        hvacType: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const property = await ctx.db
      .query("properties")
      .withIndex("by_code", (q) => q.eq("code", args.propertyCode))
      .first();
    if (!property) throw new Error(`Unknown property code: ${args.propertyCode}`);

    // Delete existing units for this property (replace, not append)
    const existing = await ctx.db
      .query("units")
      .withIndex("by_property", (q) => q.eq("propertyId", property._id))
      .collect();
    for (const u of existing) {
      await ctx.db.delete(u._id);
    }

    let inserted = 0;
    for (const r of args.rows) {
      await ctx.db.insert("units", {
        propertyId: property._id,
        unit: r.unit,
        building: r.building || "",
        sqft: r.sqft ?? 0,
        amps: r.amps ?? 0,
        hasBathroom: false,
        hasOffice: false,
        hasLoadingDock: false,
        ceilingHeight: 0,
        hvacType: r.hvacType || "",
        makeReady: false,
        splittable: false,
      });
      inserted++;
    }

    if (inserted > 0 && !property.hasData) {
      await ctx.db.patch(property._id, { hasData: true });
    }

    return { propertyId: property._id, inserted, supersededPrior: existing.length };
  },
});

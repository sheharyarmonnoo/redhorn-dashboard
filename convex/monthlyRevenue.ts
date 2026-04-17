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

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listByPropertyYear = query({
  args: { propertyId: v.id("properties"), year: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("line_budgets")
      .withIndex("by_property_year", (q) =>
        q.eq("propertyId", args.propertyId).eq("year", args.year)
      )
      .collect();
  },
});

export const upsert = mutation({
  args: {
    propertyId: v.id("properties"),
    year: v.string(),
    lineItem: v.string(),
    annualBudget: v.number(),
    notes: v.optional(v.string()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("line_budgets")
      .withIndex("by_property_year", (q) =>
        q.eq("propertyId", args.propertyId).eq("year", args.year)
      )
      .filter((q) => q.eq(q.field("lineItem"), args.lineItem))
      .first();
    const updatedAt = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        annualBudget: args.annualBudget,
        notes: args.notes,
        updatedAt,
        updatedBy: args.updatedBy,
      });
      return existing._id;
    }
    return await ctx.db.insert("line_budgets", { ...args, updatedAt });
  },
});

export const remove = mutation({
  args: { id: v.id("line_budgets") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const bulkUpsert = mutation({
  args: {
    propertyId: v.id("properties"),
    year: v.string(),
    rows: v.array(
      v.object({
        lineItem: v.string(),
        annualBudget: v.number(),
        notes: v.optional(v.string()),
      })
    ),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updatedAt = new Date().toISOString();
    let updated = 0;
    let inserted = 0;
    for (const r of args.rows) {
      const existing = await ctx.db
        .query("line_budgets")
        .withIndex("by_property_year", (q) =>
          q.eq("propertyId", args.propertyId).eq("year", args.year)
        )
        .filter((q) => q.eq(q.field("lineItem"), r.lineItem))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          annualBudget: r.annualBudget,
          notes: r.notes,
          updatedAt,
          updatedBy: args.updatedBy,
        });
        updated++;
      } else {
        await ctx.db.insert("line_budgets", {
          propertyId: args.propertyId,
          year: args.year,
          lineItem: r.lineItem,
          annualBudget: r.annualBudget,
          notes: r.notes,
          updatedAt,
          updatedBy: args.updatedBy,
        });
        inserted++;
      }
    }
    return { updated, inserted };
  },
});

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("property_debt")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .first();
  },
});

export const upsert = mutation({
  args: {
    propertyId: v.id("properties"),
    totalDebt: v.number(),
    monthlyDebtService: v.number(),
    interestRate: v.optional(v.number()),
    lender: v.optional(v.string()),
    loanStartDate: v.optional(v.string()),
    loanMaturityDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("property_debt")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .first();
    const updatedAt = new Date().toISOString();
    const { propertyId, ...rest } = args;
    if (existing) {
      await ctx.db.patch(existing._id, { ...rest, updatedAt });
      return existing._id;
    }
    return await ctx.db.insert("property_debt", { propertyId, ...rest, updatedAt });
  },
});

export const clear = mutation({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("property_debt")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

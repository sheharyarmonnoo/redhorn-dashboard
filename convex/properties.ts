import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("properties").collect();
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("properties")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
  },
});

export const create = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    location: v.string(),
    sqft: v.optional(v.string()),
    propertyType: v.optional(v.string()),
    hasData: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("properties", { ...args, isActive: true });
  },
});

export const update = mutation({
  args: {
    id: v.id("properties"),
    name: v.optional(v.string()),
    location: v.optional(v.string()),
    sqft: v.optional(v.string()),
    hasData: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(id, filtered);
  },
});

export const remove = mutation({
  args: { id: v.id("properties") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

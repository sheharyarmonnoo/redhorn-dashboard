import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByUnit = query({
  args: { propertyId: v.id("properties"), unit: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("unit_notes")
      .withIndex("by_unit", (q) =>
        q.eq("propertyId", args.propertyId).eq("unit", args.unit)
      )
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    propertyId: v.id("properties"),
    unit: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("unit_notes", {
      ...args,
      createdAt: new Date().toISOString(),
    });
  },
});

export const update = mutation({
  args: { id: v.id("unit_notes"), text: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      text: args.text,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("unit_notes") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

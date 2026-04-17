import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("action_items").collect();
  },
});

export const create = mutation({
  args: {
    text: v.string(),
    priority: v.string(),
    unit: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
    propertyId: v.optional(v.id("properties")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("action_items", {
      ...args,
      column: "todo",
      createdAt: new Date().toISOString(),
    });
  },
});

export const move = mutation({
  args: { id: v.id("action_items"), column: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { column: args.column });
  },
});

export const update = mutation({
  args: {
    id: v.id("action_items"),
    text: v.optional(v.string()),
    priority: v.optional(v.string()),
    unit: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
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
  args: { id: v.id("action_items") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

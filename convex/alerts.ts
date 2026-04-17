import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("alerts")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    }
    return await ctx.db.query("alerts").collect();
  },
});

export const create = mutation({
  args: {
    propertyId: v.optional(v.id("properties")),
    alertType: v.string(),
    severity: v.string(),
    title: v.string(),
    body: v.string(),
    aiAnalysis: v.optional(v.string()),
    dataContext: v.optional(v.any()),
    status: v.string(),
    unit: v.optional(v.string()),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("alerts", args);
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("alerts"),
    status: v.string(),
    resolvedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, string> = { status: args.status };
    if (args.status === "resolved" || args.status === "dismissed") {
      updates.resolvedAt = new Date().toISOString();
      if (args.resolvedBy) updates.resolvedBy = args.resolvedBy;
    }
    await ctx.db.patch(args.id, updates);
  },
});

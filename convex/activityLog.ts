import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: { limit: v.optional(v.number()), type: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.type) {
      const q = ctx.db
        .query("activity_log")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .order("desc");
      return args.limit ? await q.take(args.limit) : await q.collect();
    }
    const q = ctx.db.query("activity_log").order("desc");
    return args.limit ? await q.take(args.limit) : await q.collect();
  },
});

export const log = mutation({
  args: {
    type: v.string(),
    description: v.string(),
    user: v.string(),
    unit: v.optional(v.string()),
    dealId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("activity_log", {
      ...args,
      createdAt: new Date().toISOString(),
    });
  },
});

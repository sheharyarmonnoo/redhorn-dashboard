import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

async function logActivity(ctx: any, entry: { type: string; description: string; user: string; unit?: string }) {
  await ctx.db.insert("activity_log", { ...entry, createdAt: new Date().toISOString() });
}

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

/**
 * Pull recent alerts for a property, optionally filtered by alertType.
 * Used by the insights action to give Claude continuity of prior findings.
 */
export const listForProperty = query({
  args: {
    propertyId: v.id("properties"),
    alertType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // The schema has by_property indexed as (propertyId, status). To get all alerts
    // for a property regardless of status, scan and filter.
    const all = await ctx.db
      .query("alerts")
      .filter((q) => q.eq(q.field("propertyId"), args.propertyId))
      .order("desc")
      .take(args.limit ?? 20);
    if (args.alertType) {
      return all.filter((a) => a.alertType === args.alertType);
    }
    return all;
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
    const id = await ctx.db.insert("alerts", args);
    await logActivity(ctx, {
      type: "alert_created",
      description: `Alert: ${args.title}`,
      user: "System",
      unit: args.unit,
    });
    return id;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("alerts"),
    status: v.string(),
    resolvedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const alert = await ctx.db.get(args.id);
    const updates: Record<string, string> = { status: args.status };
    if (args.status === "resolved" || args.status === "dismissed") {
      updates.resolvedAt = new Date().toISOString();
      if (args.resolvedBy) updates.resolvedBy = args.resolvedBy;
    }
    await ctx.db.patch(args.id, updates);
    await logActivity(ctx, {
      type: "alert_resolved",
      description: `Alert ${args.status}: ${alert?.title || ""}`,
      user: args.resolvedBy || "System",
      unit: alert?.unit,
    });
  },
});

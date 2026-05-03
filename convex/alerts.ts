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

/**
 * Mark an insight (or any alert) as a false flag with a human-supplied reason.
 * Stored in dataContext.falseFlagReason so the next run's insights prompt can
 * include it as a suppression hint — Claude won't re-flag the same pattern
 * unless something materially changed.
 */
export const markFalseFlag = mutation({
  args: {
    id: v.id("alerts"),
    reason: v.string(),
    markedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const alert = await ctx.db.get(args.id);
    if (!alert) throw new Error("Alert not found");
    const dataContext = { ...(alert.dataContext || {}), falseFlagReason: args.reason, falseFlaggedAt: new Date().toISOString() };
    await ctx.db.patch(args.id, {
      status: "false_flag",
      resolvedAt: new Date().toISOString(),
      resolvedBy: args.markedBy ?? "User",
      dataContext,
    });
    await logActivity(ctx, {
      type: "alert_resolved",
      description: `False flag: ${alert.title} — ${args.reason.slice(0, 120)}`,
      user: args.markedBy ?? "User",
      unit: alert.unit,
    });
  },
});

/**
 * Reverse a false-flag tag. Use when the user changed their mind — re-opens
 * the alert and clears the suppression so future Claude runs see it again.
 */
export const undoFalseFlag = mutation({
  args: { id: v.id("alerts") },
  handler: async (ctx, args) => {
    const alert = await ctx.db.get(args.id);
    if (!alert) throw new Error("Alert not found");
    const dataContext = { ...(alert.dataContext || {}) };
    delete dataContext.falseFlagReason;
    delete dataContext.falseFlaggedAt;
    await ctx.db.patch(args.id, {
      status: "new",
      resolvedAt: undefined,
      resolvedBy: undefined,
      dataContext,
    });
  },
});

/**
 * Append a comment to an alert. Comments add long-form context on top of the
 * original false-flag reason — useful when the team learns more later. Future
 * Claude insight runs read these comments alongside the original reason.
 */
/**
 * Resolve all open income_insight alerts whose title or body mentions a frozen
 * data feed / identical-snapshot pattern. Used as a one-off cleanup after the
 * suppression rule was added to the prompt — those alerts are now history, not
 * active issues. Reports how many it resolved.
 */
export const resolveStaleFrozenFeedAlerts = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db
      .query("alerts")
      .filter((q) => q.eq(q.field("alertType"), "income_insight"))
      .collect();
    const matches = all.filter((a) => {
      if (a.status === "resolved" || a.status === "false_flag") return false;
      const blob = `${a.title} ${a.body}`.toLowerCase();
      return /frozen\s+data\s+feed|identical\s+snapshot|byte-for-byte|consecutive\s+identical|consecutive\s+run|unchanged\s+for/.test(
        blob
      );
    });
    const now = new Date().toISOString();
    for (const a of matches) {
      await ctx.db.patch(a._id, {
        status: "resolved",
        resolvedAt: now,
        resolvedBy: "system_cleanup",
      });
    }
    return { resolved: matches.length };
  },
});

export const addComment = mutation({
  args: {
    id: v.id("alerts"),
    text: v.string(),
    author: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const alert = await ctx.db.get(args.id);
    if (!alert) throw new Error("Alert not found");
    const text = args.text.trim();
    if (!text) return;
    const existing = (alert.dataContext as any)?.comments;
    const comments = Array.isArray(existing) ? [...existing] : [];
    comments.push({
      text: text.slice(0, 2000),
      author: args.author?.slice(0, 80) || "User",
      createdAt: new Date().toISOString(),
    });
    const dataContext = { ...(alert.dataContext || {}), comments };
    await ctx.db.patch(args.id, { dataContext });
    await logActivity(ctx, {
      type: "note_added",
      description: `Comment on "${alert.title}": ${text.slice(0, 120)}`,
      user: args.author || "User",
      unit: alert.unit,
    });
  },
});

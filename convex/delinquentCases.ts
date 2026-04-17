import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

async function logActivity(ctx: any, entry: { type: string; description: string; user: string; unit?: string }) {
  await ctx.db.insert("activity_log", { ...entry, createdAt: new Date().toISOString() });
}

export const listActive = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("delinquent_cases")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

export const create = mutation({
  args: {
    propertyId: v.id("properties"),
    unitId: v.optional(v.id("units")),
    unit: v.string(),
    tenantName: v.string(),
    amountOwed: v.number(),
    stage: v.string(),
    deadline: v.optional(v.string()),
    notes: v.optional(v.string()),
    user: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, ...data } = args;
    const id = await ctx.db.insert("delinquent_cases", {
      ...data,
      isActive: true,
      stageEnteredAt: new Date().toISOString(),
      history: [{ toStage: args.stage, at: new Date().toISOString() }],
    });
    await logActivity(ctx, {
      type: "status_change",
      description: `Delinquent case created: ${args.tenantName} (${args.unit}) — ${args.stage}`,
      user: user || "System",
      unit: args.unit,
    });
    return id;
  },
});

export const advanceStage = mutation({
  args: {
    id: v.id("delinquent_cases"),
    stage: v.string(),
    changedBy: v.optional(v.string()),
    note: v.optional(v.string()),
    deadline: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.id);
    if (!c) return;
    const history = c.history || [];
    history.push({
      fromStage: c.stage,
      toStage: args.stage,
      changedBy: args.changedBy,
      note: args.note,
      at: new Date().toISOString(),
    });
    await ctx.db.patch(args.id, {
      stage: args.stage,
      stageEnteredAt: new Date().toISOString(),
      deadline: args.deadline,
      history,
      isActive: args.stage !== "resolved",
    });
    await logActivity(ctx, {
      type: "status_change",
      description: `${c.tenantName} (${c.unit}): ${c.stage} → ${args.stage}`,
      user: args.changedBy || "System",
      unit: c.unit,
    });
  },
});

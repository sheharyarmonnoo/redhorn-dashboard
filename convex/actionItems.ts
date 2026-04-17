import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

async function logActivity(ctx: any, entry: { type: string; description: string; user: string; unit?: string }) {
  await ctx.db.insert("activity_log", { ...entry, createdAt: new Date().toISOString() });
}

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
    user: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, ...data } = args;
    const id = await ctx.db.insert("action_items", {
      ...data,
      column: "todo",
      createdAt: new Date().toISOString(),
    });
    await logActivity(ctx, {
      type: "task_added",
      description: `Task added: ${args.text}`,
      user: user || args.assignedTo || "System",
      unit: args.unit,
    });
    return id;
  },
});

export const move = mutation({
  args: { id: v.id("action_items"), column: v.string(), user: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id);
    await ctx.db.patch(args.id, { column: args.column });
    if (args.column === "done") {
      await logActivity(ctx, {
        type: "task_completed",
        description: `Task completed: ${item?.text || ""}`,
        user: args.user || item?.assignedTo || "System",
        unit: item?.unit,
      });
    }
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

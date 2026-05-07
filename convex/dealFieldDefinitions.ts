import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const FIELD_TYPE = v.union(
  v.literal("text"),
  v.literal("longtext"),
  v.literal("number"),
  v.literal("currency"),
  v.literal("date"),
  v.literal("select"),
);

export const list = query({
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("deal_field_definitions")
      .withIndex("by_order")
      .collect();
    return rows.sort((a, b) => a.order - b.order);
  },
});

export const upsertByKey = mutation({
  args: {
    key: v.string(),
    label: v.string(),
    type: FIELD_TYPE,
    options: v.optional(v.array(v.string())),
    order: v.optional(v.number()),
    showOnCard: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("deal_field_definitions")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        label: args.label,
        type: args.type,
        options: args.options,
        order: args.order ?? existing.order,
        showOnCard: args.showOnCard ?? existing.showOnCard,
        updatedAt: now,
      });
      return existing._id;
    }
    const allDefs = await ctx.db.query("deal_field_definitions").collect();
    const order = args.order ?? allDefs.length;
    return await ctx.db.insert("deal_field_definitions", {
      key: args.key,
      label: args.label,
      type: args.type,
      options: args.options,
      order,
      showOnCard: args.showOnCard,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("deal_field_definitions"),
    label: v.optional(v.string()),
    type: v.optional(FIELD_TYPE),
    options: v.optional(v.array(v.string())),
    order: v.optional(v.number()),
    showOnCard: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    const cleaned: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const [k, v2] of Object.entries(patch)) {
      if (v2 !== undefined) cleaned[k] = v2;
    }
    await ctx.db.patch(id, cleaned);
  },
});

/**
 * Reorder the full definitions list in one call. Pass ordered array of ids;
 * each row's `order` is rewritten to its index. Cheaper than N patches when
 * the user drags the list around.
 */
export const reorder = mutation({
  args: { ids: v.array(v.id("deal_field_definitions")) },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    for (let i = 0; i < args.ids.length; i++) {
      await ctx.db.patch(args.ids[i], { order: i, updatedAt: now });
    }
  },
});

/**
 * Delete a definition AND clear the matching key from every deal's
 * customFields blob so we don't leave orphaned values that can't be
 * surfaced anywhere.
 */
export const remove = mutation({
  args: { id: v.id("deal_field_definitions") },
  handler: async (ctx, args) => {
    const def = await ctx.db.get(args.id);
    if (!def) return { removed: 0, dealsCleared: 0 };
    const deals = await ctx.db.query("deals").collect();
    let dealsCleared = 0;
    for (const d of deals) {
      const cf = (d as any).customFields as Record<string, any> | undefined;
      if (!cf || !(def.key in cf)) continue;
      const next = { ...cf };
      delete next[def.key];
      await ctx.db.patch(d._id, { customFields: next, updatedAt: new Date().toISOString() } as any);
      dealsCleared++;
    }
    await ctx.db.delete(args.id);
    return { removed: 1, dealsCleared };
  },
});

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
    pmName: v.optional(v.string()),
    pmEmail: v.optional(v.string()),
    pmPhone: v.optional(v.string()),
    pmCompany: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(id, filtered);
  },
});

/**
 * Refuse to delete a property that still has child rows attached. The data
 * model is wide (tenants, units, income_lines, aging, receivable_details,
 * unit_notes, deals, alerts, etc.) so a silent delete would orphan whole
 * tables. Caller should bulk-clear children first or use `removeWithCascade`
 * if/when that gets implemented.
 */
export const remove = mutation({
  args: { id: v.id("properties") },
  handler: async (ctx, args) => {
    const childTables = [
      "tenants",
      "units",
      "income_lines",
      "aging_records",
      "receivable_details",
      "unit_notes",
      "alerts",
      "monthly_revenue",
      "line_budgets",
      "delinquent_cases",
    ] as const;
    for (const t of childTables) {
      // Properties with `by_property` indexes are scanned via that index;
      // others fall back to a single-row first() probe via `q.eq("propertyId")`.
      const probe = await ctx.db
        .query(t as any)
        .filter((q: any) => q.eq(q.field("propertyId"), args.id))
        .first();
      if (probe) {
        throw new Error(
          `Cannot delete property: still has ${t} rows. Clear those first.`
        );
      }
    }
    await ctx.db.delete(args.id);
  },
});

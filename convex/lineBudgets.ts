import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listByPropertyYear = query({
  args: { propertyId: v.id("properties"), year: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("line_budgets")
      .withIndex("by_property_year", (q) =>
        q.eq("propertyId", args.propertyId).eq("year", args.year)
      )
      .collect();
  },
});

export const upsert = mutation({
  args: {
    propertyId: v.id("properties"),
    year: v.string(),
    lineItem: v.string(),
    annualBudget: v.number(),
    notes: v.optional(v.string()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("line_budgets")
      .withIndex("by_property_year", (q) =>
        q.eq("propertyId", args.propertyId).eq("year", args.year)
      )
      .filter((q) => q.eq(q.field("lineItem"), args.lineItem))
      .first();
    const updatedAt = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        annualBudget: args.annualBudget,
        notes: args.notes,
        updatedAt,
        updatedBy: args.updatedBy,
      });
      return existing._id;
    }
    return await ctx.db.insert("line_budgets", { ...args, updatedAt });
  },
});

export const remove = mutation({
  args: { id: v.id("line_budgets") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const bulkUpsert = mutation({
  args: {
    propertyId: v.id("properties"),
    year: v.string(),
    rows: v.array(
      v.object({
        lineItem: v.string(),
        annualBudget: v.number(),
        notes: v.optional(v.string()),
        monthlyBudgets: v.optional(v.array(v.number())),
        hierarchyLevel: v.optional(v.number()),
        parentLine: v.optional(v.string()),
      })
    ),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updatedAt = new Date().toISOString();
    let updated = 0;
    let inserted = 0;
    for (const r of args.rows) {
      const existing = await ctx.db
        .query("line_budgets")
        .withIndex("by_property_year", (q) =>
          q.eq("propertyId", args.propertyId).eq("year", args.year)
        )
        .filter((q) => q.eq(q.field("lineItem"), r.lineItem))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          annualBudget: r.annualBudget,
          notes: r.notes,
          monthlyBudgets: r.monthlyBudgets,
          hierarchyLevel: r.hierarchyLevel,
          parentLine: r.parentLine,
          updatedAt,
          updatedBy: args.updatedBy,
        });
        updated++;
      } else {
        await ctx.db.insert("line_budgets", {
          propertyId: args.propertyId,
          year: args.year,
          lineItem: r.lineItem,
          annualBudget: r.annualBudget,
          notes: r.notes,
          monthlyBudgets: r.monthlyBudgets,
          hierarchyLevel: r.hierarchyLevel,
          parentLine: r.parentLine,
          updatedAt,
          updatedBy: args.updatedBy,
        });
        inserted++;
      }
    }
    return { updated, inserted };
  },
});

/**
 * Bulk-replace all line_budgets for a property+year, server-side resolving
 * the propertyId from the Yardi property code. Mirrors the
 * `incomeLines:bulkInsertByCode` pattern: the scraper just sends the parsed
 * rows, no need to query Convex for the propertyId first.
 *
 * Strategy:
 *   - Delete every prior line_budgets row for the same (propertyId, year)
 *   - Insert the new rows in one batch
 *
 * This is the right shape for a Yardi sync because the budget report
 * IS authoritative — manually-entered budgets get overwritten when Yardi
 * sends a new snapshot. Manual entry is preserved only when no Yardi sync
 * has happened yet for that property+year.
 */
export const bulkUpsertByCode = mutation({
  args: {
    propertyCode: v.string(),
    year: v.string(),
    syncId: v.optional(v.id("sync_jobs")),
    snapshotDate: v.optional(v.string()),
    rows: v.array(
      v.object({
        lineItem: v.string(),
        annualBudget: v.number(),
        monthlyBudgets: v.optional(v.array(v.number())),
        hierarchyLevel: v.optional(v.number()),
        parentLine: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const property = await ctx.db
      .query("properties")
      .withIndex("by_code", (q) => q.eq("code", args.propertyCode))
      .first();
    if (!property) {
      throw new Error(`Unknown property code: ${args.propertyCode}`);
    }

    // Delete prior rows for the same property+year so the Yardi snapshot
    // becomes the single source of truth.
    const prior = await ctx.db
      .query("line_budgets")
      .withIndex("by_property_year", (q) =>
        q.eq("propertyId", property._id).eq("year", args.year)
      )
      .collect();
    for (const row of prior) {
      await ctx.db.delete(row._id);
    }

    const updatedAt = args.snapshotDate ?? new Date().toISOString();
    let inserted = 0;
    for (const r of args.rows) {
      await ctx.db.insert("line_budgets", {
        propertyId: property._id,
        year: args.year,
        lineItem: r.lineItem,
        annualBudget: r.annualBudget,
        monthlyBudgets: r.monthlyBudgets,
        hierarchyLevel: r.hierarchyLevel,
        parentLine: r.parentLine,
        syncId: args.syncId,
        snapshotDate: args.snapshotDate,
        updatedAt,
        updatedBy: "yardi",
      });
      inserted++;
    }

    return {
      propertyId: property._id,
      inserted,
      supersededPrior: prior.length,
      year: args.year,
    };
  },
});

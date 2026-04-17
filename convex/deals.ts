import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  handler: async (ctx) => {
    const deals = await ctx.db.query("deals").collect();
    return deals.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },
});

export const get = query({
  args: { id: v.id("deals") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    propertyType: v.string(),
    sqft: v.number(),
    units: v.number(),
    askingPrice: v.number(),
    pricePerSF: v.optional(v.number()),
    capRate: v.optional(v.number()),
    stage: v.string(),
    source: v.string(),
    assignedTo: v.string(),
    contacts: v.array(
      v.object({
        name: v.string(),
        role: v.string(),
        email: v.string(),
        phone: v.optional(v.string()),
      })
    ),
    closingDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("deals", {
      ...args,
      notes: [],
      emails: [],
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStage = mutation({
  args: { id: v.id("deals"), stage: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      stage: args.stage,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const addNote = mutation({
  args: {
    id: v.id("deals"),
    text: v.string(),
    author: v.string(),
  },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.id);
    if (!deal) return;
    const notes = [
      {
        id: `n-${Date.now()}`,
        text: args.text,
        author: args.author,
        createdAt: new Date().toISOString(),
      },
      ...deal.notes,
    ];
    await ctx.db.patch(args.id, {
      notes,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const addEmail = mutation({
  args: {
    id: v.id("deals"),
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    sentBy: v.string(),
  },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.id);
    if (!deal) return;
    const emails = [
      {
        id: `e-${Date.now()}`,
        to: args.to,
        subject: args.subject,
        body: args.body,
        sentAt: new Date().toISOString(),
        sentBy: args.sentBy,
      },
      ...deal.emails,
    ];
    await ctx.db.patch(args.id, {
      emails,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("deals") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

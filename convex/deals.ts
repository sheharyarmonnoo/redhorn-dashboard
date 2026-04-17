import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

async function logActivity(ctx: any, entry: { type: string; description: string; user: string; dealId?: string; unit?: string }) {
  await ctx.db.insert("activity_log", { ...entry, createdAt: new Date().toISOString() });
}

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
    const id = await ctx.db.insert("deals", {
      ...args,
      notes: [],
      emails: [],
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      type: "deal_update",
      description: `New deal added: ${args.name} — $${(args.askingPrice / 1000000).toFixed(1)}M`,
      user: args.assignedTo,
      dealId: id,
    });
    return id;
  },
});

export const updateStage = mutation({
  args: { id: v.id("deals"), stage: v.string(), user: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.id);
    await ctx.db.patch(args.id, {
      stage: args.stage,
      updatedAt: new Date().toISOString(),
    });
    await logActivity(ctx, {
      type: "deal_update",
      description: `${deal?.name || "Deal"} moved to ${args.stage}`,
      user: args.user || deal?.assignedTo || "System",
      dealId: args.id,
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
    await logActivity(ctx, {
      type: "note_added",
      description: `Note added to ${deal.name}`,
      user: args.author,
      dealId: args.id,
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
    await logActivity(ctx, {
      type: "email_sent",
      description: `Email sent to ${args.to} — ${args.subject}`,
      user: args.sentBy,
      dealId: args.id,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("deals"), user: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);
    await logActivity(ctx, {
      type: "deal_update",
      description: `Deal deleted: ${deal?.name || "Unknown"}`,
      user: args.user || "System",
    });
  },
});

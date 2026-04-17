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

export const addTask = mutation({
  args: {
    id: v.id("deals"),
    text: v.string(),
    assignedTo: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.id);
    if (!deal) return;
    const tasks = [
      ...(deal.tasks || []),
      {
        id: `t-${Date.now()}`,
        text: args.text,
        done: false,
        assignedTo: args.assignedTo,
        dueDate: args.dueDate,
        createdAt: new Date().toISOString(),
      },
    ];
    await ctx.db.patch(args.id, { tasks, updatedAt: new Date().toISOString() });
    await logActivity(ctx, {
      type: "task_added",
      description: `Task added to ${deal.name}: ${args.text}`,
      user: args.createdBy || "System",
      dealId: args.id,
    });
  },
});

export const toggleTask = mutation({
  args: {
    id: v.id("deals"),
    taskId: v.string(),
    user: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.id);
    if (!deal || !deal.tasks) return;
    const tasks = deal.tasks.map((t: any) =>
      t.id === args.taskId
        ? { ...t, done: !t.done, completedAt: !t.done ? new Date().toISOString() : undefined }
        : t
    );
    await ctx.db.patch(args.id, { tasks, updatedAt: new Date().toISOString() });
    const task = tasks.find((t: any) => t.id === args.taskId);
    if (task?.done) {
      await logActivity(ctx, {
        type: "task_completed",
        description: `Task completed on ${deal.name}: ${task.text}`,
        user: args.user || "System",
        dealId: args.id,
      });
    }
  },
});

export const removeTask = mutation({
  args: { id: v.id("deals"), taskId: v.string() },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.id);
    if (!deal || !deal.tasks) return;
    const tasks = deal.tasks.filter((t: any) => t.id !== args.taskId);
    await ctx.db.patch(args.id, { tasks, updatedAt: new Date().toISOString() });
  },
});

export const addDocument = mutation({
  args: {
    id: v.id("deals"),
    name: v.string(),
    storageId: v.optional(v.id("_storage")),
    type: v.string(),
    uploadedBy: v.string(),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.id);
    if (!deal) return;
    const documents = [
      ...(deal.documents || []),
      {
        id: `d-${Date.now()}`,
        name: args.name,
        storageId: args.storageId,
        type: args.type,
        uploadedBy: args.uploadedBy,
        uploadedAt: new Date().toISOString(),
        size: args.size,
      },
    ];
    await ctx.db.patch(args.id, { documents, updatedAt: new Date().toISOString() });
    await logActivity(ctx, {
      type: "note_added",
      description: `Document added to ${deal.name}: ${args.name}`,
      user: args.uploadedBy,
      dealId: args.id,
    });
  },
});

export const removeDocument = mutation({
  args: { id: v.id("deals"), docId: v.string() },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.id);
    if (!deal || !deal.documents) return;
    const doc = deal.documents.find((d: any) => d.id === args.docId);
    const documents = deal.documents.filter((d: any) => d.id !== args.docId);
    await ctx.db.patch(args.id, { documents, updatedAt: new Date().toISOString() });
    if (doc?.storageId) {
      try { await ctx.storage.delete(doc.storageId); } catch {}
    }
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

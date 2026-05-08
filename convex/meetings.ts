import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listByProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("meetings")
      .withIndex("by_property_date", (q) => q.eq("propertyId", args.propertyId))
      .collect();
    return rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  },
});

export const create = mutation({
  args: {
    propertyId: v.id("properties"),
    date: v.string(),
    title: v.string(),
    attendees: v.optional(v.array(v.string())),
    discussion: v.optional(v.string()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("meetings", {
      ...args,
      actionItems: [],
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("meetings"),
    date: v.optional(v.string()),
    title: v.optional(v.string()),
    attendees: v.optional(v.array(v.string())),
    discussion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) clean[k] = v;
    }
    clean.updatedAt = Date.now();
    await ctx.db.patch(id, clean);
  },
});

export const remove = mutation({
  args: { id: v.id("meetings") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const addActionItem = mutation({
  args: {
    id: v.id("meetings"),
    text: v.string(),
    assignee: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return;
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: args.text,
      assignee: args.assignee,
      done: false,
      createdAt: Date.now(),
    };
    const next = [...(row.actionItems || []), item];
    await ctx.db.patch(args.id, { actionItems: next, updatedAt: Date.now() });
    return item;
  },
});

export const toggleActionItem = mutation({
  args: { id: v.id("meetings"), itemId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return;
    const next = (row.actionItems || []).map((i) =>
      i.id === args.itemId ? { ...i, done: !i.done } : i,
    );
    await ctx.db.patch(args.id, { actionItems: next, updatedAt: Date.now() });
  },
});

export const removeActionItem = mutation({
  args: { id: v.id("meetings"), itemId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return;
    const next = (row.actionItems || []).filter((i) => i.id !== args.itemId);
    await ctx.db.patch(args.id, { actionItems: next, updatedAt: Date.now() });
  },
});

// Mint a one-shot upload URL for the meeting file uploader. Client POSTs
// the file to this URL, gets a storageId back, then calls addFile with
// the metadata. Standard Convex file-storage flow.
export const generateFileUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const addFile = mutation({
  args: {
    id: v.id("meetings"),
    storageId: v.id("_storage"),
    name: v.string(),
    size: v.number(),
    mimeType: v.optional(v.string()),
    category: v.optional(v.string()),
    uploadedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return;
    const file = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      storageId: args.storageId,
      name: args.name,
      size: args.size,
      mimeType: args.mimeType,
      category: args.category,
      uploadedAt: Date.now(),
      uploadedBy: args.uploadedBy,
    };
    const next = [...(row.files || []), file];
    await ctx.db.patch(args.id, { files: next, updatedAt: Date.now() });
    return file;
  },
});

export const removeFile = mutation({
  args: { id: v.id("meetings"), fileId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return;
    const file = (row.files || []).find((f) => f.id === args.fileId);
    const next = (row.files || []).filter((f) => f.id !== args.fileId);
    await ctx.db.patch(args.id, { files: next, updatedAt: Date.now() });
    // Best-effort: drop the underlying _storage object too so we don't
    // leak orphan files. If storage delete fails we still want the
    // meeting metadata cleaned up.
    if (file) {
      try {
        await ctx.storage.delete(file.storageId);
      } catch {
        /* non-fatal */
      }
    }
  },
});

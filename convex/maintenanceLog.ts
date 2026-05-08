import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// All maintenance items for a property, newest first. Frontend slices into
// Active / Completed / Routine tabs from this single list — Convex
// deduplicates so this is cheaper than three separate queries.
export const listByProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("maintenance_log")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect();
    return rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  },
});

export const create = mutation({
  args: {
    propertyId: v.id("properties"),
    unit: v.optional(v.string()),
    date: v.string(),
    category: v.optional(v.string()),
    type: v.string(),
    description: v.string(),
    status: v.string(),
    vendor: v.optional(v.string()),
    cost: v.optional(v.number()),
    isRecurring: v.optional(v.boolean()),
    recurFrequency: v.optional(v.string()),
    nextDueDate: v.optional(v.string()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Auto-fill nextDueDate for recurring items if caller didn't provide one.
    let nextDueDate = args.nextDueDate;
    if (args.isRecurring && !nextDueDate && args.recurFrequency) {
      nextDueDate = advanceDate(args.date, args.recurFrequency);
    }
    return await ctx.db.insert("maintenance_log", {
      propertyId: args.propertyId,
      unit: args.unit,
      date: args.date,
      category: args.category,
      type: args.type,
      description: args.description,
      status: args.status,
      vendor: args.vendor,
      cost: args.cost,
      isRecurring: args.isRecurring,
      recurFrequency: args.recurFrequency,
      nextDueDate,
      updatedAt: Date.now(),
      createdBy: args.createdBy,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("maintenance_log"),
    date: v.optional(v.string()),
    category: v.optional(v.string()),
    type: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    unit: v.optional(v.string()),
    vendor: v.optional(v.string()),
    cost: v.optional(v.number()),
    isRecurring: v.optional(v.boolean()),
    recurFrequency: v.optional(v.string()),
    nextDueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    // Drop undefined fields so we don't overwrite stored values with null
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) clean[k] = v;
    }
    clean.updatedAt = Date.now();
    await ctx.db.patch(id, clean);
  },
});

export const remove = mutation({
  args: { id: v.id("maintenance_log") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Mark a maintenance item complete. For recurring items the row stays
// open: we advance nextDueDate by the recurrence interval and bump
// the most recent service date. That way the same template keeps
// showing up on the upcoming list without spawning a fresh row each
// cycle.
export const markCompleted = mutation({
  args: {
    id: v.id("maintenance_log"),
    completedDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return;
    const completedDate = args.completedDate || new Date().toISOString().slice(0, 10);
    if (row.isRecurring && row.recurFrequency) {
      const baseDate = row.nextDueDate || completedDate;
      const next = advanceDate(baseDate, row.recurFrequency);
      await ctx.db.patch(args.id, {
        date: completedDate,
        nextDueDate: next,
        status: "scheduled",
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(args.id, {
        status: "completed",
        date: completedDate,
        updatedAt: Date.now(),
      });
    }
  },
});

export const addMeetingNote = mutation({
  args: {
    id: v.id("maintenance_log"),
    text: v.string(),
    author: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return;
    const note = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: args.text,
      author: args.author,
      createdAt: Date.now(),
    };
    const next = [...(row.meetingNotes || []), note];
    await ctx.db.patch(args.id, { meetingNotes: next, updatedAt: Date.now() });
    return note;
  },
});

export const removeMeetingNote = mutation({
  args: {
    id: v.id("maintenance_log"),
    noteId: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return;
    const next = (row.meetingNotes || []).filter((n) => n.id !== args.noteId);
    await ctx.db.patch(args.id, { meetingNotes: next, updatedAt: Date.now() });
  },
});

// Add `frequency` to an ISO yyyy-mm-dd date and return the new ISO date.
// Falls back to "annually" if the frequency string isn't recognized so the
// item still gets a valid future due date instead of silently breaking.
function advanceDate(iso: string, frequency: string): string {
  const months = monthsFor(frequency);
  // Parse as UTC to keep the day component stable regardless of TZ.
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) {
    // If `iso` isn't a clean yyyy-mm-dd, just return today + interval.
    const dt = new Date();
    dt.setUTCMonth(dt.getUTCMonth() + months);
    return dt.toISOString().slice(0, 10);
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  return dt.toISOString().slice(0, 10);
}

function monthsFor(frequency: string): number {
  switch (frequency) {
    case "monthly": return 1;
    case "quarterly": return 3;
    case "biannually": return 6;
    case "annually": return 12;
    default: return 12;
  }
}

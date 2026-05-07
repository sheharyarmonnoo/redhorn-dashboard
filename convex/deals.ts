import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

async function logActivity(ctx: any, entry: { type: string; description: string; user: string; dealId?: string; unit?: string }) {
  await ctx.db.insert("activity_log", { ...entry, createdAt: new Date().toISOString() });
}

/**
 * Parse "[street], [city], [state] [zip]" → { city, state }. Returns null
 * when we can't extract both. Loose matcher — trims whitespace, accepts
 * 2-letter state codes (TX, KY, etc.), zip optional.
 */
function parseCityStateFromAddress(address: string): { city: string; state: string } | null {
  if (!address) return null;
  // Strip a trailing zip if present so the regex doesn't have to handle it.
  // "9007 North Fwy, Houston, Tx 77037" → "9007 North Fwy, Houston, Tx"
  const cleaned = address.replace(/\s+\d{5}(-\d{4})?\s*$/, "").trim();
  // Match the LAST ", word(s), STATE" tail.
  const m = cleaned.match(/,\s*([^,]+?),\s*([A-Za-z]{2})\s*$/);
  if (!m) return null;
  const city = m[1].trim();
  const state = m[2].trim().toUpperCase();
  if (!city || !state) return null;
  return { city, state };
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

export const updateField = mutation({
  args: {
    id: v.id("deals"),
    field: v.string(),
    value: v.any(),
    user: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.id);
    if (!deal) return;
    const patch: any = { [args.field]: args.value, updatedAt: new Date().toISOString() };
    // Auto-calculate pricePerSF when askingPrice or sqft changes
    if (args.field === "askingPrice" && deal.sqft > 0) {
      patch.pricePerSF = Math.round(Number(args.value) / deal.sqft);
    }
    if (args.field === "sqft" && Number(args.value) > 0) {
      patch.pricePerSF = Math.round(deal.askingPrice / Number(args.value));
    }
    await ctx.db.patch(args.id, patch);
    await logActivity(ctx, {
      type: "deal_update",
      description: `${deal.name}: ${args.field} updated`,
      user: args.user || "System",
      dealId: args.id,
    });
  },
});

export const updateTask = mutation({
  args: {
    id: v.id("deals"),
    taskId: v.string(),
    text: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
    dueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.id);
    if (!deal || !deal.tasks) return;
    const tasks = deal.tasks.map((t: any) =>
      t.id === args.taskId
        ? {
            ...t,
            ...(args.text !== undefined ? { text: args.text } : {}),
            ...(args.assignedTo !== undefined ? { assignedTo: args.assignedTo || undefined } : {}),
            ...(args.dueDate !== undefined ? { dueDate: args.dueDate || undefined } : {}),
          }
        : t
    );
    await ctx.db.patch(args.id, { tasks, updatedAt: new Date().toISOString() });
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

/**
 * Set or clear a single custom-field value on a deal. Pass `value: undefined`
 * to remove the key entirely (so we don't leave dead keys around when the user
 * clears an input). The customFields blob is merged, not replaced, so
 * concurrent edits to different keys don't clobber each other.
 */
export const setCustomField = mutation({
  args: {
    id: v.id("deals"),
    key: v.string(),
    value: v.any(),
  },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.id);
    if (!deal) throw new Error("Deal not found");
    const current = ((deal as any).customFields ?? {}) as Record<string, any>;
    const next = { ...current };
    if (args.value === undefined || args.value === null || args.value === "") {
      delete next[args.key];
    } else {
      next[args.key] = args.value;
    }
    await ctx.db.patch(args.id, {
      customFields: next,
      updatedAt: new Date().toISOString(),
    } as any);
  },
});

const IMPORT_ROW = v.object({
  mondayItemId: v.string(),
  name: v.string(),
  address: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  propertyType: v.optional(v.string()),
  sqft: v.optional(v.number()),
  units: v.optional(v.number()),
  askingPrice: v.optional(v.number()),
  stage: v.string(),
  source: v.optional(v.string()),
  assignedTo: v.optional(v.string()),
  createdAt: v.optional(v.string()),
  contacts: v.optional(
    v.array(
      v.object({
        name: v.string(),
        role: v.string(),
        email: v.string(),
        phone: v.optional(v.string()),
      })
    )
  ),
  seedNote: v.optional(v.string()),
  customFields: v.optional(v.any()),
  updatesFromMonday: v.optional(
    v.array(
      v.object({
        author: v.string(),
        text: v.string(),
        createdAt: v.string(),
      })
    )
  ),
});

/**
 * One-shot maintenance: walk every deal whose city/state are blank and try
 * to derive them from the address string. Safe to re-run — only patches
 * deals where (city is empty OR state is empty) AND the address parses.
 */
export const backfillCityStateFromAddress = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("deals").collect();
    const now = new Date().toISOString();
    let scanned = 0, patched = 0, unparseable = 0;
    for (const d of all) {
      scanned++;
      const hasCity = !!(d.city && d.city.trim());
      const hasState = !!(d.state && d.state.trim());
      if (hasCity && hasState) continue;
      const parsed = parseCityStateFromAddress(d.address || d.name || "");
      if (!parsed) { unparseable++; continue; }
      const patch: any = { updatedAt: now };
      if (!hasCity) patch.city = parsed.city;
      if (!hasState) patch.state = parsed.state;
      await ctx.db.patch(d._id, patch);
      patched++;
    }
    return { scanned, patched, unparseable };
  },
});

/**
 * Idempotent bulk import for deals coming out of the Monday Deal Flow Tracker
 * xlsx export. Dedupe key is `mondayItemId`. Existing deals are patched in
 * place (customFields merged, not replaced) and any new "updates from Monday"
 * are appended to the notes log if they don't already exist (matched by
 * createdAt + first 80 chars of text).
 */
export const bulkImport = mutation({
  args: { rows: v.array(IMPORT_ROW) },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of args.rows) {
      if (!row.mondayItemId || !row.name) {
        skipped++;
        continue;
      }

      const existing = await ctx.db
        .query("deals")
        .withIndex("by_monday_id", (q) => q.eq("mondayItemId", row.mondayItemId))
        .first();

      const seedNoteEntry = row.seedNote
        ? [{
            id: `imported-seed-${row.mondayItemId}`,
            text: row.seedNote,
            author: "Imported from Monday",
            createdAt: row.createdAt || now,
          }]
        : [];

      const updateNotes = (row.updatesFromMonday || []).map((u, i) => ({
        id: `monday-${row.mondayItemId}-${i}`,
        text: u.text,
        author: u.author,
        createdAt: u.createdAt,
      }));

      if (!existing) {
        await ctx.db.insert("deals", {
          name: row.name,
          address: row.address || row.name,
          city: row.city || "",
          state: row.state || "",
          propertyType: row.propertyType || "industrial",
          sqft: row.sqft || 0,
          units: row.units || 0,
          askingPrice: row.askingPrice || 0,
          stage: row.stage,
          source: row.source || "Monday import",
          assignedTo: row.assignedTo || "",
          contacts: row.contacts || [],
          notes: [...seedNoteEntry, ...updateNotes],
          emails: [],
          tasks: [],
          documents: [],
          mondayItemId: row.mondayItemId,
          customFields: row.customFields || {},
          createdAt: row.createdAt || now,
          updatedAt: now,
        } as any);
        inserted++;
      } else {
        const existingNotes = (existing as any).notes || [];
        const existingTexts = new Set(
          existingNotes.map((n: any) => `${n.createdAt}|${(n.text || "").slice(0, 80)}`)
        );
        const newNotes = [...seedNoteEntry, ...updateNotes].filter((n) => {
          return !existingTexts.has(`${n.createdAt}|${(n.text || "").slice(0, 80)}`);
        });
        const mergedCustom = {
          ...((existing as any).customFields || {}),
          ...(row.customFields || {}),
        };
        const patch: any = {
          stage: row.stage,
          updatedAt: now,
          customFields: mergedCustom,
        };
        if (row.address) patch.address = row.address;
        if (row.sqft) patch.sqft = row.sqft;
        if (row.askingPrice) patch.askingPrice = row.askingPrice;
        if (row.source) patch.source = row.source;
        if (row.assignedTo) patch.assignedTo = row.assignedTo;
        if (row.contacts && row.contacts.length > 0) patch.contacts = row.contacts;
        if (newNotes.length > 0) {
          patch.notes = [...existingNotes, ...newNotes];
        }
        await ctx.db.patch(existing._id, patch);
        updated++;
      }
    }

    return { inserted, updated, skipped };
  },
});


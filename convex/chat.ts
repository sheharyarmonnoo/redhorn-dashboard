import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";

/**
 * AI chat persistence. Threads are scoped to the Clerk userId; messages live
 * under a thread. The action in chatAction.ts writes the assistant reply via
 * the internal `appendMessage` mutation after calling Claude, so the UI just
 * subscribes to `getThread` and reactively re-renders.
 */

export const listThreads = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const threads = await ctx.db
      .query("chat_threads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    // Most-recent first by updatedAt.
    return threads.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  },
});

export const getThread = query({
  args: { id: v.id("chat_threads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.id);
    if (!thread) return null;
    const messages = await ctx.db
      .query("chat_messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.id))
      .collect();
    // Convex insertion order is preserved by _creationTime; sort defensively.
    messages.sort((a, b) => a._creationTime - b._creationTime);
    return { ...thread, messages };
  },
});

export const createThread = mutation({
  args: { userId: v.string(), title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("chat_threads", {
      userId: args.userId,
      title: args.title?.trim() || "New conversation",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Public mutation used by the chat UI to write the user's question. The
 * assistant reply is written by the action via the internal mutation below.
 * On the first user message we also patch the thread title so the sidebar
 * reads as something more useful than "New conversation".
 */
export const addUserMessage = mutation({
  args: {
    threadId: v.id("chat_threads"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const id = await ctx.db.insert("chat_messages", {
      threadId: args.threadId,
      role: "user",
      content: args.content,
      createdAt: now,
    });
    // Bump thread updatedAt and seed the title from the first user message
    // (truncated) when the title is still the placeholder.
    const thread = await ctx.db.get(args.threadId);
    if (thread) {
      const patch: Record<string, string> = { updatedAt: now };
      if (!thread.title || thread.title === "New conversation") {
        const title = args.content.replace(/\s+/g, " ").trim().slice(0, 60);
        if (title) patch.title = title;
      }
      await ctx.db.patch(args.threadId, patch);
    }
    return id;
  },
});

/**
 * Internal so only chatAction can write assistant replies — keeps the API
 * surface clean and prevents the client from spoofing assistant turns.
 */
export const appendMessage = internalMutation({
  args: {
    threadId: v.id("chat_threads"),
    role: v.string(),
    content: v.string(),
    dataContext: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const id = await ctx.db.insert("chat_messages", {
      threadId: args.threadId,
      role: args.role,
      content: args.content,
      createdAt: now,
      dataContext: args.dataContext,
    });
    await ctx.db.patch(args.threadId, { updatedAt: now });
    return id;
  },
});

export const removeThread = mutation({
  args: { id: v.id("chat_threads") },
  handler: async (ctx, args) => {
    // Delete all messages first so we don't leave orphans.
    const messages = await ctx.db
      .query("chat_messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.id))
      .collect();
    for (const m of messages) await ctx.db.delete(m._id);
    await ctx.db.delete(args.id);
  },
});

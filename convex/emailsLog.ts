import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

/**
 * Public mutation: record that the user opened a compose window in their
 * webmail provider for an outbound email. We don't actually send anything
 * server-side — the provider's UI handles that — but we still want an
 * audit trail of "intent to send". Status is "compose_opened".
 */
export const logCompose = mutation({
  args: {
    propertyId: v.optional(v.id("properties")),
    relatedType: v.optional(v.string()),
    relatedId: v.optional(v.string()),
    toEmail: v.string(),
    toName: v.optional(v.string()),
    cc: v.optional(v.array(v.string())),
    subject: v.string(),
    body: v.string(),
    sentBy: v.string(),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("email_log", {
      propertyId: args.propertyId,
      relatedType: args.relatedType,
      relatedId: args.relatedId,
      toEmail: args.toEmail,
      toName: args.toName,
      cc: args.cc,
      subject: args.subject,
      body: args.body,
      sentBy: args.sentBy,
      status: "compose_opened",
      // Repurpose smtpMessageId to record which provider was used.
      smtpMessageId: `provider:${args.provider}`,
      sentAt: new Date().toISOString(),
    });
  },
});

export const logSend = internalMutation({
  args: {
    propertyId: v.optional(v.id("properties")),
    relatedType: v.optional(v.string()),
    relatedId: v.optional(v.string()),
    toEmail: v.string(),
    toName: v.optional(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    subject: v.string(),
    body: v.string(),
    isHtml: v.optional(v.boolean()),
    sentBy: v.string(),
    status: v.string(),
    smtpMessageId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("email_log", {
      ...args,
      sentAt: new Date().toISOString(),
    });
  },
});

export const listForProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("email_log")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .order("desc")
      .take(100);
  },
});

export const listForRelated = query({
  args: { relatedType: v.string(), relatedId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("email_log")
      .withIndex("by_related", (q) =>
        q.eq("relatedType", args.relatedType).eq("relatedId", args.relatedId)
      )
      .order("desc")
      .collect();
  },
});

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db.query("email_log").order("desc").take(args.limit ?? 50);
  },
});

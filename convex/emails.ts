"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import nodemailer from "nodemailer";

/**
 * Send an email via SMTP and log the result. Reads SMTP credentials from
 * Convex env vars:
 *   SMTP_HOST     — e.g. smtp.office365.com, smtp.gmail.com
 *   SMTP_PORT     — typically 587 (STARTTLS) or 465 (SSL)
 *   SMTP_USER     — username (full email for most providers)
 *   SMTP_PASS     — app password / SMTP token
 *   SMTP_SECURE   — "true" for 465 SSL, omit/false for 587 STARTTLS
 *   SMTP_FROM     — display "From" header (e.g. 'Redhorn Capital <noreply@...>'),
 *                   falls back to SMTP_USER
 *
 * Set with:  npx convex env set SMTP_HOST smtp.office365.com  etc.
 */
export const send = action({
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
  },
  handler: async (ctx, args): Promise<{ ok: boolean; messageId?: string; error?: string; logId?: string }> => {
    const host = process.env.SMTP_HOST;
    const portStr = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secureStr = process.env.SMTP_SECURE;
    const from = process.env.SMTP_FROM || user;

    if (!host || !portStr || !user || !pass) {
      const error = "SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS via `npx convex env set`.";
      const logId: any = await ctx.runMutation(internal.emailsLog.logSend, {
        ...sanitizeForLog(args),
        status: "failed",
        errorMessage: error,
      });
      return { ok: false, error, logId };
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(portStr),
      secure: secureStr === "true" || Number(portStr) === 465,
      auth: { user, pass },
    });

    try {
      const info = await transporter.sendMail({
        from,
        to: args.toName ? `"${args.toName}" <${args.toEmail}>` : args.toEmail,
        cc: args.cc?.join(", "),
        bcc: args.bcc?.join(", "),
        subject: args.subject,
        [args.isHtml ? "html" : "text"]: args.body,
      });
      const logId: any = await ctx.runMutation(internal.emailsLog.logSend, {
        ...sanitizeForLog(args),
        status: "sent",
        smtpMessageId: info.messageId,
      });
      return { ok: true, messageId: info.messageId, logId };
    } catch (err: any) {
      const error = err?.message || String(err);
      const logId: any = await ctx.runMutation(internal.emailsLog.logSend, {
        ...sanitizeForLog(args),
        status: "failed",
        errorMessage: error,
      });
      return { ok: false, error, logId };
    }
  },
});

function sanitizeForLog(args: any) {
  return {
    propertyId: args.propertyId,
    relatedType: args.relatedType,
    relatedId: args.relatedId,
    toEmail: args.toEmail,
    toName: args.toName,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    body: args.body,
    isHtml: args.isHtml,
    sentBy: args.sentBy,
  };
}

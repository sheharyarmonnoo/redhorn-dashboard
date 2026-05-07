"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";

/**
 * Claude-powered analytics chat for a user's property data.
 *
 * The action gathers a slice of the active property's Convex data (tenants,
 * monthly_revenue, income_lines, alerts, and the previous turns of the
 * thread), wraps it in a <data> block, and calls the Anthropic Messages API.
 * Reply is persisted via the internal `chat.appendMessage` mutation.
 *
 * Env: ANTHROPIC_API_KEY must be set on the Convex deployment
 *   (npx convex env set ANTHROPIC_API_KEY sk-ant-...)
 *
 * Note: this calls the Anthropic REST API via fetch directly so we don't
 * need to add the @anthropic-ai/sdk dependency.
 */

// Cheapest tier for the in-app assistant. Haiku 4.5 is ~$1/MTok input ·
// $5/MTok output and handles the dashboard Q&A workload comfortably; we fall
// back to Haiku 3.5 (older, slightly cheaper) if 4.5 is briefly unavailable.
const PRIMARY_MODEL = "claude-haiku-4-5";
const FALLBACK_MODEL = "claude-3-5-haiku-latest";
const ANTHROPIC_VERSION = "2023-06-01";

type AnthMessage = { role: "user" | "assistant"; content: string };

function fmt$(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "$0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  return `${sign}$${abs.toLocaleString("en-US")}`;
}

function trimList<T>(items: T[], n: number): T[] {
  return items.length > n ? items.slice(0, n) : items;
}

/**
 * Build the <data> context block from live Convex queries. We deliberately
 * cap each section so the prompt fits comfortably in the context window even
 * on properties with hundreds of tenants / dozens of months of history.
 */
async function buildContext(ctx: any, propertyId: string | undefined): Promise<{ contextText: string; propertyName: string; raw: any }> {
  if (!propertyId) {
    return {
      contextText: "(No property selected — only general dashboard help is available.)",
      propertyName: "(none)",
      raw: {},
    };
  }

  // Run queries in parallel for latency.
  const [properties, tenants, monthlyRevenue, incomeLines, alerts, syncJobs] = await Promise.all([
    ctx.runQuery(api.properties.list, {}),
    ctx.runQuery(api.tenants.listByProperty, { propertyId: propertyId as any }),
    ctx.runQuery(api.monthlyRevenue.listByProperty, { propertyId: propertyId as any }),
    ctx.runQuery(api.incomeLines.listByProperty, { propertyId: propertyId as any }),
    ctx.runQuery(api.alerts.listForProperty, { propertyId: propertyId as any, limit: 12 }),
    ctx.runQuery(api.syncJobs.list, {}),
  ]);

  const property = (properties || []).find((p: any) => p._id === propertyId);
  const propertyName = property?.name || property?.code || "(unknown property)";

  // ---- Past-due tenants ----
  const pastDue = (tenants || [])
    .filter((t: any) => (t.pastDueAmount || 0) > 0)
    .sort((a: any, b: any) => (b.pastDueAmount || 0) - (a.pastDueAmount || 0));
  const pastDueLines = trimList(pastDue, 25).map(
    (t: any) => `- ${t.unit || "?"} | ${t.tenant || "?"} | ${fmt$(t.pastDueAmount)}`
  );

  // ---- Income statement: top-level totals ----
  const findLine = (re: RegExp) =>
    (incomeLines || []).find((r: any) => re.test((r.lineItem || "").trim()));
  const totalIncome = findLine(/^total\s+income$/i);
  const totalOpex = findLine(/^total\s+operating\s+expense/i);
  const noiLine = findLine(/^net\s+operating\s+income$|^noi$/i);
  const period = (incomeLines || []).find((r: any) => r.period)?.period || "current";

  // ---- Monthly revenue trend (last 6 months) ----
  const recent = trimList([...(monthlyRevenue || [])].reverse(), 6).reverse();
  const trendLines = recent.map(
    (m: any) =>
      `- ${m.month}: total ${fmt$(m.total)} (rent ${fmt$(m.rent)}, cam ${fmt$(m.cam)}, electric ${fmt$(m.electric)}, occ ${m.occupancy ?? 0}%)`
  );

  // ---- Lease expirations within 90 days ----
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 90);
  const expiringSoon = (tenants || [])
    .filter((t: any) => {
      if (!t.leaseTo) return false;
      const d = new Date(t.leaseTo);
      return !Number.isNaN(d.getTime()) && d >= today && d <= cutoff;
    })
    .sort((a: any, b: any) => (a.leaseTo || "").localeCompare(b.leaseTo || ""));
  const expLines = trimList(expiringSoon, 15).map(
    (t: any) => `- ${t.unit} | ${t.tenant} | ends ${t.leaseTo} | ${fmt$(t.monthlyRent)}/mo`
  );

  // ---- Active alerts ----
  const openAlerts = (alerts || []).filter((a: any) => a.status !== "resolved" && a.status !== "false_flag");
  const alertLines = trimList(openAlerts, 10).map(
    (a: any) => `- [${a.severity || "info"}] ${a.title}${a.unit ? ` (unit ${a.unit})` : ""}`
  );

  // ---- Latest sync ----
  const lastSyncForProp = (syncJobs || []).find((j: any) =>
    !j.propertyCode || j.propertyCode === property?.code
  );
  const syncLine = lastSyncForProp
    ? `Last sync: ${lastSyncForProp.source} | ${lastSyncForProp.status} | ${lastSyncForProp.completedAt || lastSyncForProp.startedAt || ""}`
    : "Last sync: (none)";

  // ---- Headline counts so Claude can reference totals without the full list ----
  const occupied = (tenants || []).filter((t: any) => t.status !== "vacant" && (t.monthlyRent || 0) > 0).length;
  const totalTenants = (tenants || []).length;

  const sections: string[] = [];
  sections.push(`Property: ${propertyName} (${property?.code || "?"}) — ${property?.location || ""}`);
  sections.push(syncLine);
  sections.push(`Tenants on rent roll: ${totalTenants} (occupied: ${occupied})`);
  sections.push("");

  sections.push(`Past-due tenants (${pastDue.length}):`);
  sections.push(pastDueLines.length ? pastDueLines.join("\n") : "- (none)");
  sections.push("");

  sections.push(`Latest income statement (period ${period}):`);
  sections.push(`- TOTAL INCOME: ${fmt$(totalIncome?.currentPeriod)} (YTD ${fmt$(totalIncome?.yearToDate)})`);
  sections.push(`- TOTAL OPERATING EXPENSE: ${fmt$(totalOpex?.currentPeriod)} (YTD ${fmt$(totalOpex?.yearToDate)})`);
  sections.push(`- NOI: ${fmt$(noiLine?.currentPeriod ?? ((totalIncome?.currentPeriod || 0) - (totalOpex?.currentPeriod || 0)))}`);
  sections.push("");

  sections.push("Monthly revenue trend (last 6 months):");
  sections.push(trendLines.length ? trendLines.join("\n") : "- (no monthly_revenue rows)");
  sections.push("");

  sections.push(`Upcoming lease expirations (within 90 days, ${expiringSoon.length}):`);
  sections.push(expLines.length ? expLines.join("\n") : "- (none)");
  sections.push("");

  sections.push(`Active alerts (${openAlerts.length}):`);
  sections.push(alertLines.length ? alertLines.join("\n") : "- (none)");

  return {
    contextText: sections.join("\n"),
    propertyName,
    raw: {
      propertyId,
      propertyCode: property?.code,
      counts: {
        tenants: totalTenants,
        pastDue: pastDue.length,
        expiringSoon: expiringSoon.length,
        openAlerts: openAlerts.length,
      },
    },
  };
}

export const ask = action({
  args: {
    threadId: v.id("chat_threads"),
    userQuestion: v.string(),
    propertyId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ ok: boolean; reply?: string; error?: string }> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      const error =
        "ANTHROPIC_API_KEY not set. Run `npx convex env set ANTHROPIC_API_KEY sk-ant-...` to enable the chat.";
      await ctx.runMutation(internal.chat.appendMessage, {
        threadId: args.threadId,
        role: "assistant",
        content: error,
      });
      return { ok: false, error };
    }

    // 1) Load Convex context for the active property.
    const { contextText, propertyName, raw } = await buildContext(ctx, args.propertyId);

    // 2) Pull prior messages on this thread for conversation continuity.
    const thread: any = await ctx.runQuery(api.chat.getThread, { id: args.threadId });
    const priorMessages: AnthMessage[] = (thread?.messages || [])
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // The just-stored user question is already in the thread — no need to
    // re-add it. If it isn't (e.g. legacy callers), append it now so Claude
    // sees the question.
    const lastUser = [...priorMessages].reverse().find((m) => m.role === "user");
    if (!lastUser || lastUser.content !== args.userQuestion) {
      priorMessages.push({ role: "user", content: args.userQuestion });
    }

    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = `You are a real-estate analytics assistant for Redhorn Capital. The user manages commercial properties in Yardi. Answer questions concisely using ONLY the data provided in <data> tags below. If a fact isn't in the data, say so plainly — never make up numbers, tenants, or dates.

Today is ${today}. The user's active property is ${propertyName}.

<data>
${contextText}
</data>

Format guidance:
- Plain text with bullets ("- ") where helpful.
- All dollar figures with a "$" prefix and comma separators.
- Be specific: cite tenant names, units, and amounts from the data.
- If the user asks something the data doesn't cover, say "I don't have that in the current snapshot" and suggest where to look.`;

    // 3) Call the Anthropic API. Fall back to sonnet on a model-unknown error.
    async function callClaude(model: string): Promise<string> {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey!,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          system: systemPrompt,
          messages: priorMessages,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Anthropic ${res.status}: ${text.slice(0, 400)}`);
      }
      const json: any = await res.json();
      const block = (json?.content || []).find((b: any) => b.type === "text");
      return (block?.text || "").trim() || "(empty response)";
    }

    let reply: string;
    try {
      reply = await callClaude(PRIMARY_MODEL);
    } catch (err: any) {
      const msg = err?.message || String(err);
      // Retry on model-not-found / not_found / 404s with the fallback model.
      if (/not_found|model|404/i.test(msg)) {
        try {
          reply = await callClaude(FALLBACK_MODEL);
        } catch (err2: any) {
          const error = `Claude API failed: ${err2?.message || String(err2)}`;
          await ctx.runMutation(internal.chat.appendMessage, {
            threadId: args.threadId,
            role: "assistant",
            content: error,
          });
          return { ok: false, error };
        }
      } else {
        const error = `Claude API failed: ${msg}`;
        await ctx.runMutation(internal.chat.appendMessage, {
          threadId: args.threadId,
          role: "assistant",
          content: error,
        });
        return { ok: false, error };
      }
    }

    // 4) Persist the assistant turn with a small dataContext footprint.
    await ctx.runMutation(internal.chat.appendMessage, {
      threadId: args.threadId,
      role: "assistant",
      content: reply,
      dataContext: raw,
    });

    return { ok: true, reply };
  },
});

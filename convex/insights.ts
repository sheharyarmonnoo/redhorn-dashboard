"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

/**
 * Extract financial insights for a property from the latest income_lines snapshot,
 * comparing against the previous snapshot AND referencing prior AI insights so the
 * dashboard tells a coherent story month-over-month.
 *
 * Writes each anomaly into the `alerts` table (alertType="income_insight") and
 * returns a structured summary for the orchestrator.
 *
 * Triggers:
 *   - Automatically by the Playwright scraper after upload + ingest
 *   - Manually from the Data Pipeline "Run insights" button
 */
export const extractForProperty = action({
  args: {
    propertyCode: v.string(),
    syncJobId: v.optional(v.id("sync_jobs")),
  },
  handler: async (ctx, args): Promise<{
    propertyCode: string;
    summary: string;
    insightsCount: number;
    alertsCreated: number;
    insights: Array<{ severity: string; title: string; detail: string; lineItem?: string }>;
  }> => {
    const property: any = await ctx.runQuery(api.properties.getByCode, { code: args.propertyCode });
    if (!property) throw new Error(`Unknown property code: ${args.propertyCode}`);

    // Latest snapshot rows (the ones we just ingested)
    const latest: any[] = await ctx.runQuery(api.incomeLines.listByProperty, { propertyId: property._id });
    if (!latest || latest.length === 0) {
      return { propertyCode: args.propertyCode, summary: "No income statement data yet for this property.", insightsCount: 0, alertsCreated: 0, insights: [] };
    }

    // Prior snapshots — for month-over-month comparison
    const allHistorical: any[] = await ctx.runQuery(api.incomeLines.allForProperty, { propertyId: property._id });
    const priorBySnapshot = groupBySnapshot(allHistorical);
    const latestDate = latest[0]?.snapshotDate;
    const priorDates = Object.keys(priorBySnapshot).filter(d => d !== latestDate).sort().reverse();
    const priorSnapshot = priorDates.length > 0 ? priorBySnapshot[priorDates[0]] : null;

    // Prior insights for this property — give Claude continuity
    const allPriorAlerts: any[] = await ctx.runQuery(api.alerts.listForProperty, {
      propertyId: property._id,
      alertType: "income_insight",
      limit: 30,
    });
    // Split into "still active" (history Claude should reference) vs "false flags"
    // (suppression list — these patterns should NOT be re-flagged unless materially worse).
    const priorAlerts = allPriorAlerts.filter((a: any) => a.status !== "false_flag");
    const falseFlags = allPriorAlerts.filter((a: any) => a.status === "false_flag");

    const prompt = buildPrompt(property.name, latestDate, latest, priorSnapshot, priorAlerts, falseFlags);
    const rawAnalysis: string = await callClaude(prompt);
    const parsed = parseClaudeJson(rawAnalysis);

    let alertsCreated = 0;
    for (const ins of parsed.insights || []) {
      try {
        await ctx.runMutation(api.alerts.create, {
          propertyId: property._id,
          alertType: "income_insight",
          severity: ins.severity || "info",
          title: (ins.title || "").slice(0, 120),
          body: (ins.detail || "").slice(0, 1000),
          aiAnalysis: parsed.summary?.slice(0, 2000),
          dataContext: { syncJobId: args.syncJobId, snapshotDate: latestDate, lineItem: ins.lineItem, mom: ins.mom },
          status: "new",
          unit: ins.lineItem,
          date: new Date().toISOString(),
        });
        alertsCreated++;
      } catch { /* skip malformed insight */ }
    }

    return {
      propertyCode: args.propertyCode,
      summary: parsed.summary || rawAnalysis.slice(0, 500),
      insightsCount: (parsed.insights || []).length,
      alertsCreated,
      insights: parsed.insights || [],
    };
  },
});

function groupBySnapshot(rows: any[]): Record<string, any[]> {
  const out: Record<string, any[]> = {};
  for (const r of rows) {
    const d = r.snapshotDate || "";
    if (!d) continue;
    if (!out[d]) out[d] = [];
    out[d].push(r);
  }
  return out;
}

function rowsToTable(rows: any[]): string {
  return rows
    .filter(r => r.lineItem && (r.currentPeriod !== 0 || r.yearToDate !== 0))
    .slice(0, 80)
    .map(r => `${"  ".repeat(r.hierarchyLevel || 0)}${r.lineItem.trim()}: CP=${Math.round(r.currentPeriod).toLocaleString()} YTD=${Math.round(r.yearToDate).toLocaleString()}`)
    .join("\n");
}

function buildPrompt(propertyName: string, latestDate: string, latest: any[], priorSnapshot: any[] | null, priorAlerts: any[], falseFlags: any[]): string {
  const latestTable = rowsToTable(latest);
  const priorTable = priorSnapshot ? rowsToTable(priorSnapshot) : "(no prior snapshot — this is the first sync)";
  const priorInsightLog = priorAlerts.length === 0
    ? "(no prior insights recorded yet)"
    : priorAlerts.slice(0, 8).map(a => `- [${a.severity}] ${a.title} — ${a.body.slice(0, 200)}`).join("\n");
  const falseFlagLog = falseFlags.length === 0
    ? "(none yet)"
    : falseFlags.slice(0, 12).map(a => {
        const reason = a.dataContext?.falseFlagReason || "(no reason provided)";
        const comments = Array.isArray(a.dataContext?.comments) ? a.dataContext.comments : [];
        const commentBlock = comments.length === 0
          ? ""
          : "\n  Additional context (comments added later):\n" + comments.slice(0, 6).map((c: any) => `    • ${c.author}: ${c.text}`).join("\n");
        return `- "${a.title}" — REASON THIS IS NOT AN ISSUE: ${reason}${commentBlock}`;
      }).join("\n\n");

  return [
    `You are a senior CRE asset-management analyst reviewing the latest income statement for "${propertyName}".`,
    `Snapshot date: ${latestDate}`,
    ``,
    `=== LATEST INCOME STATEMENT (this run) ===`,
    `\`\`\``,
    latestTable,
    `\`\`\``,
    ``,
    `=== PRIOR SNAPSHOT (for month-over-month comparison) ===`,
    `\`\`\``,
    priorTable,
    `\`\`\``,
    ``,
    `=== PRIOR INSIGHTS LOGGED FOR THIS PROPERTY (continuity) ===`,
    priorInsightLog,
    ``,
    `=== ITEMS PREVIOUSLY MARKED AS FALSE FLAGS BY THE TEAM ===`,
    `These patterns have been confirmed by the asset manager as expected behavior or already-explained.`,
    `DO NOT re-flag them unless the data has materially changed (e.g. magnitude doubled, sign flipped, new occurrence outside the explained context).`,
    `If you DO see something that looks similar but is genuinely different, explain why it's different.`,
    falseFlagLog,
    ``,
    `Your job: surface 3–6 specific, actionable insights. Each one must:`,
    `1. Cite a specific line item (or pair of line items) by name`,
    `2. Cite the actual numbers — both this period AND the prior period when relevant`,
    `3. Tell the asset manager exactly what to do or check`,
    ``,
    `Prioritize:`,
    `- Material month-over-month changes (>5% on revenue lines, >10% on expense lines)`,
    `- Posting errors / suspect signs (negative revenue, missing recurring categories, large variances)`,
    `- NOI compression — revenue trend vs. expense trend`,
    `- Continuation or resolution of prior insights — if a prior alert is now fixed or worsening, flag that explicitly`,
    `- Anomalies that appeared this month and weren't there before`,
    ``,
    `IMPORTANT — title format:`,
    `Each title MUST be a short imperative action item, 4–8 words, telling the user what TO DO.`,
    `Good examples: "Investigate negative electricity expense" · "Reconcile lump real-estate-tax accrual" · "Confirm $8,500 well/septic capitalization"`,
    `Bad examples: "Electricity Expense Negative -$12,904 CP / -$47,014 YTD — Verify Credit or Mispost" (too long, descriptive not imperative)`,
    `Save the numbers, magnitudes, and full context for the "detail" field.`,
    ``,
    `Return ONLY this JSON, no prose:`,
    `{`,
    `  "summary": "2-4 sentence executive summary citing the top finding(s)",`,
    `  "insights": [`,
    `    {`,
    `      "severity": "critical" | "warning" | "info",`,
    `      "title": "4-8 word imperative action item",`,
    `      "detail": "1-3 sentences with line items, dollar figures, recommended action",`,
    `      "lineItem": "the primary line item this references",`,
    `      "mom": "concise month-over-month delta if applicable, e.g. '+18% vs March'"`,
    `    }`,
    `  ]`,
    `}`,
  ].join("\n");
}

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in Convex env. Run: npx convex env --prod set ANTHROPIC_API_KEY <key>");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude API error ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.content?.[0]?.text;
  if (typeof content !== "string") throw new Error("Unexpected Claude response shape");
  return content;
}

function parseClaudeJson(text: string): { summary: string; insights: any[] } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { summary: text.slice(0, 500), insights: [] };
  try {
    const parsed = JSON.parse(match[0]);
    return { summary: parsed.summary || "", insights: Array.isArray(parsed.insights) ? parsed.insights : [] };
  } catch {
    return { summary: text.slice(0, 500), insights: [] };
  }
}

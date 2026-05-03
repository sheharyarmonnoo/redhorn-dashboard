"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

/**
 * Extract financial insights from the latest income_lines snapshot for a
 * property. Calls Claude with the structured rows (cheap — we already parsed
 * the Excel) and writes any flagged anomalies into the `alerts` table.
 *
 * Triggers:
 *   - Manually from the Data Pipeline page ("Run insights" button)
 *   - Automatically by the scraper after a successful upload (next iteration)
 */
export const extractForProperty = action({
  args: {
    propertyCode: v.string(),
    syncJobId: v.optional(v.id("sync_jobs")),
  },
  handler: async (ctx, args): Promise<{ propertyCode: string; insightsCount: number; alertsCreated: number; analysis: string }> => {
    const property: any = await ctx.runQuery(api.properties.getByCode, { code: args.propertyCode });
    if (!property) throw new Error(`Unknown property code: ${args.propertyCode}`);

    const rows: any[] = await ctx.runQuery(api.incomeLines.listByProperty, { propertyId: property._id });
    if (!rows || rows.length === 0) {
      return { propertyCode: args.propertyCode, insightsCount: 0, alertsCreated: 0, analysis: "No income statement rows for this property yet." };
    }

    const compact = rows
      .filter((r: any) => r.lineItem && (r.currentPeriod !== 0 || r.yearToDate !== 0))
      .map((r: any) => ({
        line: r.lineItem.trim(),
        level: r.hierarchyLevel,
        cp: Math.round(r.currentPeriod),
        ytd: Math.round(r.yearToDate),
      }));

    const prompt = buildInsightPrompt(property.name, compact);
    const analysis: string = await callClaude(prompt);
    const parsed: { summary: string; insights: Array<{ severity: string; title: string; detail: string; lineItem?: string }> } = parseClaudeJson(analysis);

    let alertsCreated = 0;
    for (const ins of parsed.insights || []) {
      try {
        await ctx.runMutation(api.alerts.create, {
          propertyId: property._id,
          alertType: "income_insight",
          severity: ins.severity || "info",
          title: ins.title.slice(0, 120),
          body: ins.detail.slice(0, 1000),
          aiAnalysis: parsed.summary?.slice(0, 2000),
          status: "new",
          unit: ins.lineItem,
          date: new Date().toISOString(),
        });
        alertsCreated++;
      } catch { /* skip malformed insight */ }
    }

    return {
      propertyCode: args.propertyCode,
      insightsCount: (parsed.insights || []).length,
      alertsCreated,
      analysis: parsed.summary || analysis.slice(0, 500),
    };
  },
});

function buildInsightPrompt(propertyName: string, rows: Array<{ line: string; level: number; cp: number; ytd: number }>): string {
  const table = rows.slice(0, 80).map(r => `${"  ".repeat(r.level)}${r.line}: CP=${r.cp.toLocaleString()} YTD=${r.ytd.toLocaleString()}`).join("\n");
  return [
    `You are a CRE asset-management analyst reviewing this month's income statement for "${propertyName}".`,
    `The data below is structured: each row is one G/L line. CP = current period (this month), YTD = year-to-date.`,
    ``,
    `\`\`\``,
    table,
    `\`\`\``,
    ``,
    `Identify up to 5 specific, actionable anomalies, risks, or trends. Examples of what to flag:`,
    `- A revenue line dropped meaningfully vs. its YTD-implied monthly run-rate`,
    `- A specific expense line spiked vs. expectation`,
    `- A material balance that suggests posting errors (e.g. negative revenue, missing recurring categories)`,
    `- NOI compression relative to revenue change`,
    ``,
    `Return ONLY this JSON (no prose before or after):`,
    `{`,
    `  "summary": "1-3 sentence executive summary",`,
    `  "insights": [`,
    `    { "severity": "critical" | "warning" | "info", "title": "short headline", "detail": "1-2 sentence explanation tied to specific line items", "lineItem": "exact line item if relevant" }`,
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
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Claude API error ${res.status}: ${errText.slice(0, 300)}`);
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

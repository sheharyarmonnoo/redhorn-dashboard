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

    // Reporting periods (e.g. "2026-04" for the latest CP, "2026-03" for prior)
    const latestPeriod = latest[0]?.period as string | undefined;
    const priorPeriod = priorSnapshot?.[0]?.period as string | undefined;

    // Per-tenant transactional data (Lease Ledger) — the AR-side view that
    // unlocks delinquency, utility-posting, and aging analysis. May be empty
    // if Receivable Detail hasn't synced yet.
    const receivables: any[] = await ctx.runQuery(api.receivableDetails.listByProperty, {
      propertyId: property._id,
    });
    // Tenants table — rounds out the picture of who's leased
    const tenants: any[] = await ctx.runQuery(api.tenants.listByProperty, {
      propertyId: property._id,
    });

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

    const prompt = buildPrompt(property.name, latestDate, latestPeriod, priorPeriod, latest, priorSnapshot, receivables, tenants, priorAlerts, falseFlags);
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

// Summarize receivable_details into a per-tenant view: latest balance, last
// payment date, this-month charge codes posted, late-fee count. This is what
// Claude reasons over for delinquency / utility-posting / payment-pattern
// findings.
function summarizeReceivables(receivables: any[], tenants: any[]): string {
  if (!receivables || receivables.length === 0) return "(no receivable detail synced yet for this property)";

  // Group transactions by tenant; track latest balance + last payment + charge codes seen this period
  const byTenant: Record<string, { latestBalance: number; lastTxDate: string; lastPayDate: string; charges: number; receipts: number; chargeCodes: Set<string>; lateFees: number; }> = {};
  for (const tx of receivables) {
    const t = (tx.tenantName || "").trim();
    if (!t) continue;
    if (!byTenant[t]) {
      byTenant[t] = { latestBalance: 0, lastTxDate: "", lastPayDate: "", charges: 0, receipts: 0, chargeCodes: new Set(), lateFees: 0 };
    }
    const b = byTenant[t];
    const d = (tx.transactionDate || "").trim();
    if (d && d > b.lastTxDate) {
      b.lastTxDate = d;
      b.latestBalance = Number(tx.balance) || 0;
    }
    if ((tx.receipts || 0) > 0 && d > b.lastPayDate) b.lastPayDate = d;
    b.charges += Number(tx.charges) || 0;
    b.receipts += Number(tx.receipts) || 0;
    if (tx.chargeCode) b.chargeCodes.add(tx.chargeCode);
    if (/late\s*fee/i.test(tx.description || "")) b.lateFees++;
  }

  const today = new Date().toISOString().slice(0, 10);
  const tenantList = tenants.filter((t: any) => (t.tenant || "").trim().length > 0);
  const netLeaseTenants = tenantList.filter((t: any) => /net/i.test(t.leaseType || ""));

  // Delinquent tenants: positive latest balance
  const delinquent = Object.entries(byTenant)
    .filter(([_, b]) => b.latestBalance > 0)
    .sort(([, a], [, b]) => b.latestBalance - a.latestBalance);

  const totalAR = delinquent.reduce((s, [, b]) => s + b.latestBalance, 0);
  const lateFeesPosted = Object.values(byTenant).reduce((s, b) => s + b.lateFees, 0);
  const totalReceipts = Object.values(byTenant).reduce((s, b) => s + b.receipts, 0);

  // Electric posting check: which net-lease tenants did NOT have a CAM-Electric (or similar) charge this period?
  const tenantsWithElectric = new Set<string>();
  for (const [name, b] of Object.entries(byTenant)) {
    const hasElectric = Array.from(b.chargeCodes).some(c => /electric|cam-?elec|elec-?recovery/i.test(c));
    if (hasElectric) tenantsWithElectric.add(name);
  }
  const electricMissing = netLeaseTenants
    .filter((t: any) => !tenantsWithElectric.has(t.tenant.split("(")[0].trim()))
    .map((t: any) => `${t.unit} — ${t.tenant.split("(")[0].trim()}`)
    .slice(0, 12);

  const lines: string[] = [];
  lines.push(`Total tenants leased: ${tenantList.length} (${netLeaseTenants.length} net-lease)`);
  lines.push(`Total AR outstanding: $${Math.round(totalAR).toLocaleString()} across ${delinquent.length} tenants`);
  lines.push(`Total receipts this period: $${Math.round(totalReceipts).toLocaleString()}`);
  lines.push(`Late fees triggered: ${lateFeesPosted}`);
  if (electricMissing.length > 0) {
    lines.push(`Net-lease tenants missing electric charge this period (${electricMissing.length}): ${electricMissing.slice(0, 6).join("; ")}${electricMissing.length > 6 ? ", …" : ""}`);
  } else if (netLeaseTenants.length > 0) {
    lines.push(`Net-lease electric posting: all ${netLeaseTenants.length} tenants have an electric charge this period`);
  }

  if (delinquent.length > 0) {
    lines.push(``);
    lines.push(`Top 10 delinquent tenants (sorted by balance):`);
    for (const [name, b] of delinquent.slice(0, 10)) {
      const daysSincePay = b.lastPayDate ? daysBetween(b.lastPayDate, today) : null;
      const payInfo = b.lastPayDate ? `last paid ${b.lastPayDate}${daysSincePay !== null ? ` (${daysSincePay}d ago)` : ""}` : "no payment on record";
      lines.push(`  - ${name}: $${Math.round(b.latestBalance).toLocaleString()} owed · ${payInfo}`);
    }
  }

  return lines.join("\n");
}

function daysBetween(a: string, b: string): number | null {
  const da = new Date(a);
  const db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function periodLabel(yyyymm: string | undefined): string {
  if (!yyyymm || !/^\d{4}-\d{2}$/.test(yyyymm)) return "current period";
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function buildPrompt(propertyName: string, latestDate: string, latestPeriod: string | undefined, priorPeriod: string | undefined, latest: any[], priorSnapshot: any[] | null, receivables: any[], tenants: any[], priorAlerts: any[], falseFlags: any[]): string {
  const latestTable = rowsToTable(latest);
  const priorTable = priorSnapshot ? rowsToTable(priorSnapshot) : "(no prior snapshot — this is the first sync)";
  const receivableSummary = summarizeReceivables(receivables, tenants);
  const latestLabel = periodLabel(latestPeriod);
  const priorLabel = priorPeriod ? periodLabel(priorPeriod) : "the prior month";
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
    `Reporting period: **${latestLabel}** (CP column reflects ${latestLabel} totals).`,
    `Prior period for MoM comparison: **${priorLabel}**.`,
    `Snapshot ingested: ${latestDate}`,
    ``,
    `When you cite "CP" or current-period numbers, prefix them with the month name (e.g. "${latestLabel.split(" ")[0]} CP rent dropped to $X" or "$X this ${latestLabel.split(" ")[0]}"). Same for prior — say "${priorLabel.split(" ")[0]}" instead of "prior".`,
    ``,
    `=== ${latestLabel.toUpperCase()} INCOME STATEMENT (this run) ===`,
    `\`\`\``,
    latestTable,
    `\`\`\``,
    ``,
    `=== ${priorLabel.toUpperCase()} INCOME STATEMENT (for month-over-month comparison) ===`,
    `\`\`\``,
    priorTable,
    `\`\`\``,
    ``,
    `=== PER-TENANT AR / LEASE LEDGER (this period) ===`,
    `Source: Yardi Commercial Lease Ledger SSRS export. This is the AR-side view that the income statement aggregates upward. Use it to flag tenant-specific delinquency, missed utility postings, payment timing, and concentration risk.`,
    `\`\`\``,
    receivableSummary,
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
    `- Tenant-specific delinquency from the AR section: name the tenant, dollars owed, days since last payment. Concentration risk if one tenant >20% of total AR.`,
    `- Missed utility postings: if net-lease tenants are listed as missing an electric charge this period, flag them by unit + tenant name.`,
    `- Payment-pattern shifts: tenants who used to pay on time and are now late (compare to prior insights for the same tenant).`,
    ``,
    `IMPORTANT — title format:`,
    `Each title MUST be a short imperative action item, 4–8 words, telling the user what TO DO.`,
    `Good examples: "Investigate negative electricity expense" · "Reconcile lump real-estate-tax accrual" · "Confirm $8,500 well/septic capitalization"`,
    `Bad examples: "Electricity Expense Negative -$12,904 CP / -$47,014 YTD — Verify Credit or Mispost" (too long, descriptive not imperative)`,
    `Save the numbers, magnitudes, and full context for the "detail" field.`,
    ``,
    `IMPORTANT — avoid alert fatigue:`,
    `If the latest snapshot is byte-for-byte identical to the prior snapshot, DO NOT generate a "frozen data feed" or "data refresh failure" insight — the user has already been told. The prior insights log will show this finding from earlier runs. Focus only on net-new findings or material changes.`,
    `If there are genuinely no new findings worth flagging this run, return an empty insights array (zero entries). Better to return nothing than to repeat the same alert from prior runs.`,
    `Each finding you flag MUST be either (a) net-new this run, (b) materially worse than its prior occurrence, or (c) a confirmed resolution of a prior issue.`,
    ``,
    `IMPORTANT — markdown formatting (applies to BOTH "summary" AND each "detail" field):`,
    `These fields render as markdown on the dashboard. Use:`,
    `- **bold** for tenant names, dollar figures, percentages, units, line item names, and account codes`,
    `  (e.g. **Eco-Comfort Foam Insulation** owes **$25,579** = **45%** of AR; investigate **Janitorial Supplies** posting)`,
    `- For "summary" only: two newlines (\\n\\n) between paragraphs to break into 2-4 short scannable paragraphs.`,
    `  One paragraph for income-statement story, one for AR/tenant story, one for prior-issue continuation.`,
    `- For "detail" fields: one paragraph is fine, but bold every key number/name/percentage so the reader's`,
    `  eye lands on what matters at a glance.`,
    `- Don't bold filler words. Bold ONLY data points: dollars, percents, dates, names, line items.`,
    ``,
    `Return ONLY this JSON, no prose:`,
    `{`,
    `  "summary": "2-4 short markdown paragraphs separated by \\n\\n. Use **bold** on numbers, names, and percentages.",`,
    `  "insights": [`,
    `    {`,
    `      "severity": "critical" | "warning" | "info",`,
    `      "title": "4-8 word imperative action item (no markdown — plain text)",`,
    `      "detail": "1-3 sentences with **bolded** line items, dollar figures, percentages, and recommended action",`,
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

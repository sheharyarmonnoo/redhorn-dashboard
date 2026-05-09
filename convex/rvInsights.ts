"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

/**
 * Claude-powered insights generator for RV park monthly bundles.
 *
 * Fires after `commitBundle` finishes ingesting a Campspot+Northgate upload.
 * Builds a compact data context for the just-committed period, asks Claude
 * for 3–7 operational/financial findings, and persists each as a row in the
 * `alerts` table — same shape as commercial property insights so the
 * existing /alerts page renders them with no UI work.
 *
 * Env: ANTHROPIC_API_KEY must be set on the Convex deployment.
 */

const PRIMARY_MODEL = "claude-haiku-4-5";
const FALLBACK_MODEL = "claude-3-5-haiku-latest";
const ANTHROPIC_VERSION = "2023-06-01";

function fmt$(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "$0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  return `${sign}$${abs.toLocaleString("en-US")}`;
}

function trimList<T>(items: T[], n: number): T[] {
  return items.length > n ? items.slice(0, n) : items;
}

function cleanRvLabel(li: string | undefined): string {
  const raw = String(li || "").trim();
  let s = raw.replace(/^Total\s*-\s*\d{4}-\d{3}\s*-\s*/i, "Total ");
  s = s.replace(/^\d{4}-\d{3}\s*-\s*/, "");
  return s;
}

async function buildContext(
  ctx: any,
  propertyId: string,
  period: string,
): Promise<{ contextText: string; propertyCode: string; propertyName: string; rawCounts: any }> {
  const properties = await ctx.runQuery(api.properties.list, {});
  const property = (properties || []).find((p: any) => p._id === propertyId);
  const propertyName = property?.name || "(unknown)";
  const propertyCode = property?.code || "";

  const [reservations, balances, sites, pos, payments, financials, priorAlerts] = await Promise.all([
    ctx.runQuery(api.rv.listLatestReservations, { propertyId: propertyId as any }),
    ctx.runQuery(api.rv.listLatestBalances, { propertyId: propertyId as any }),
    ctx.runQuery(api.rv.listSites, { propertyId: propertyId as any }),
    ctx.runQuery(api.rv.listLatestPos, { propertyId: propertyId as any }),
    ctx.runQuery(api.rv.listLatestPayments, { propertyId: propertyId as any }),
    ctx.runQuery(api.rv.listFinancials, { propertyId: propertyId as any }),
    ctx.runQuery(api.alerts.listForProperty, {
      propertyId: propertyId as any,
      alertType: "income_insight",
      limit: 12,
    }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const sections: string[] = [];
  sections.push(`Property: ${propertyName} (RV park, code ${propertyCode})`);
  sections.push(`Just-committed monthly bundle for period ${period}.`);
  sections.push("");

  // ---- Occupancy snapshot ----
  const bySite = new Map<string, any[]>();
  for (const r of (reservations || []) as any[]) {
    if (!bySite.has(r.siteCode)) bySite.set(r.siteCode, []);
    bySite.get(r.siteCode)!.push(r);
  }
  let occupied = 0;
  let upcomingWeek = 0;
  for (const s of (sites || []) as any[]) {
    const rs = bySite.get(s.siteCode) || [];
    if (rs.find((x: any) => x.arrivalDate <= today && today <= x.departureDate)) occupied += 1;
    const next = rs
      .filter((x: any) => x.arrivalDate > today)
      .sort((a: any, b: any) => a.arrivalDate.localeCompare(b.arrivalDate))[0];
    if (next) {
      const days = (Date.parse(next.arrivalDate) - Date.parse(today)) / 86400000;
      if (days <= 7) upcomingWeek += 1;
    }
  }
  const totalSites = (sites || []).length;
  sections.push(
    `Occupancy: ${occupied}/${totalSites} sites occupied today, ${upcomingWeek} arriving in next 7 days.`,
  );
  sections.push("");

  // ---- A/R ----
  const balancesArr = ((balances || []) as any[]).filter((b) => (b.balance || 0) > 0.5);
  const totalAr = balancesArr.reduce((s, b) => s + (b.balance || 0), 0);
  sections.push(
    `Open balances: ${balancesArr.length} guests, ${fmt$(totalAr)} total A/R.`,
  );
  if (balancesArr.length > 0) {
    const top = [...balancesArr].sort((a, b) => (b.balance || 0) - (a.balance || 0));
    for (const b of trimList(top, 8)) {
      const name = `${b.firstName || ""} ${b.lastName || ""}`.trim() || "(unknown)";
      sections.push(`- ${name}: ${fmt$(b.balance)} (charges ${fmt$(b.totalCharges)})`);
    }
  }
  sections.push("");

  // ---- POS month roll-up ----
  const posArr = (pos || []) as any[];
  const monthTotals = new Map<string, number>();
  const categoryTotals = new Map<string, number>();
  for (const p of posArr) {
    monthTotals.set(p.saleMonth, (monthTotals.get(p.saleMonth) || 0) + (p.total || 0));
    const key = `${p.financialAccount} / ${p.productCategory}`;
    categoryTotals.set(key, (categoryTotals.get(key) || 0) + (p.total || 0));
  }
  const monthsSorted = Array.from(monthTotals.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  if (monthsSorted.length > 0) {
    sections.push("POS revenue trend:");
    for (const [m, total] of monthsSorted) sections.push(`- ${m}: ${fmt$(total)}`);
    sections.push("");
  }
  const topCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (topCategories.length > 0) {
    sections.push("POS top categories:");
    for (const [cat, total] of topCategories) sections.push(`- ${cat}: ${fmt$(total)}`);
    sections.push("");
  }

  // ---- Payment mix ----
  const paymentsArr = ((payments || []) as any[]).filter((p) => (p.totalPayments || 0) !== 0);
  if (paymentsArr.length > 0) {
    const grandTotal = paymentsArr.reduce((s, p) => s + (p.totalPayments || 0), 0);
    sections.push(`Payment mix (${fmt$(grandTotal)} total):`);
    const sorted = [...paymentsArr].sort((a, b) => (b.totalPayments || 0) - (a.totalPayments || 0));
    for (const p of trimList(sorted, 8)) {
      const label = p.cardType ? `${p.paymentType} (${p.cardType})` : p.paymentType;
      sections.push(`- ${label}: ${fmt$(p.totalPayments)}`);
    }
    sections.push("");
  }

  // ---- Income statement + variance ----
  const isLines = ((financials || []) as any[]).filter((f) => f.kind === "isBudget");
  let totals: any = {};
  if (isLines.length > 0) {
    const isPeriod = isLines[0]?.snapshotPeriod || period;
    let income = 0;
    let incomeBudget = 0;
    let incomeYtd = 0;
    let expense = 0;
    let expenseBudget = 0;
    let expenseYtd = 0;
    for (const r of isLines) {
      const li = String(r.lineItem || "");
      if (/^Total\s*-/i.test(li)) continue;
      if (/^4\d{3}-/.test(li)) {
        income += r.amountMtd || 0;
        incomeBudget += r.budgetMtd || 0;
        incomeYtd += r.amountYtd || 0;
      } else if (/^[5-9]\d{3}-/.test(li)) {
        expense += r.amountMtd || 0;
        expenseBudget += r.budgetMtd || 0;
        expenseYtd += r.amountYtd || 0;
      }
    }
    const noi = income - expense;
    totals = { income, incomeBudget, expense, expenseBudget, noi, period: isPeriod };
    sections.push(`Income Statement (period ${isPeriod}):`);
    sections.push(`- Total Income: ${fmt$(income)} vs budget ${fmt$(incomeBudget)}`);
    sections.push(`- Total Expense: ${fmt$(expense)} vs budget ${fmt$(expenseBudget)}`);
    sections.push(`- NOI period: ${fmt$(noi)} (YTD income ${fmt$(incomeYtd)}, YTD expense ${fmt$(expenseYtd)})`);
    const variances = isLines
      .map((r) => ({
        label: cleanRvLabel(r.lineItem),
        actual: r.amountMtd || 0,
        budget: r.budgetMtd || 0,
        variance: (r.amountMtd || 0) - (r.budgetMtd || 0),
        isExpense: /^[5-9]\d{3}-/.test(String(r.lineItem || "")),
      }))
      .filter((v) => Math.abs(v.variance) > 25 && !/^Total/i.test(v.label))
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    if (variances.length > 0) {
      sections.push("Largest budget variances:");
      for (const v of trimList(variances, 10)) {
        const sign = v.variance >= 0 ? "+" : "−";
        sections.push(
          `- ${v.label}: actual ${fmt$(v.actual)} vs budget ${fmt$(v.budget)} → ${sign}${fmt$(Math.abs(v.variance))} (${v.isExpense ? "expense" : "income"})`,
        );
      }
    }
    sections.push("");
  }

  // ---- Prior insights for continuity ----
  if ((priorAlerts || []).length > 0) {
    sections.push("Prior RV insights (last few — avoid duplicate findings unless materially worse):");
    for (const a of trimList(priorAlerts as any[], 6)) {
      const note = a.dataContext?.falseFlagReason ? ` [previously false-flagged: ${a.dataContext.falseFlagReason}]` : "";
      sections.push(`- [${a.severity}] ${a.title}${note}`);
    }
    sections.push("");
  }

  return {
    contextText: sections.join("\n"),
    propertyCode,
    propertyName,
    rawCounts: {
      occupied,
      totalSites,
      balances: balancesArr.length,
      totalAr,
      ...totals,
    },
  };
}

// Severity vocabulary matches the existing commercial income_insight pipeline
// (critical / warning / info) so the /alerts page + LatestRvInsights render
// the right colored dot without a separate mapping table.
type Insight = {
  severity: "critical" | "warning" | "info";
  title: string;
  body: string;
  category: string;
  unit?: string;
};

async function callClaude(apiKey: string, model: string, system: string, user: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 400)}`);
  }
  const data: any = await res.json();
  const block = (data.content || []).find((b: any) => b.type === "text");
  return block?.text || "";
}

function parseInsightsJson(text: string): Insight[] {
  // Claude usually wraps JSON in ```json fences; strip them.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed) ? parsed : parsed?.insights;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((row) => ({
        severity: (["critical", "warning", "info"].includes(row?.severity)
          ? row.severity
          : "warning") as Insight["severity"],
        title: String(row?.title || "").slice(0, 160),
        body: String(row?.body || "").slice(0, 1200),
        category: String(row?.category || "operational").slice(0, 40),
        unit: row?.unit ? String(row.unit).slice(0, 40) : undefined,
      }))
      .filter((i) => i.title && i.body);
  } catch {
    return [];
  }
}

export const extractInsightsForBundle = action({
  args: {
    bundleId: v.id("rv_upload_bundles"),
    propertyId: v.id("properties"),
    period: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; written: number; reason?: string }> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { ok: false, written: 0, reason: "ANTHROPIC_API_KEY not set" };
    }

    const { contextText, propertyCode } = await buildContext(ctx, args.propertyId, args.period);

    const system = `You are an analytics assistant reviewing a freshly-loaded month of RV park operating data for Redhorn Capital. Read the <data> block and surface 3–7 specific findings the asset manager should know about: budget variance drivers, A/R concentration, POS revenue swings, occupancy red flags, payment-mix shifts. Each finding must reference real numbers from the data — never invent. Suppress findings that are simply a prior false-flagged pattern with no material change.

Return ONLY a JSON array — no prose, no markdown fences. Each element:
{
  "severity": "critical" | "warning" | "info",
  "title": "<=12 word headline",
  "body": "2–4 sentences with specific numbers",
  "category": "income" | "expense" | "occupancy" | "ar" | "pos" | "operational",
  "unit": "<specific Campspot site code (e.g. 003, 207) OR guest name if and only if the finding is scoped to one site or one guest. Omit the field entirely otherwise — DO NOT use the property code or any portfolio-wide identifier here>"
}`;

    const user = `<data>\n${contextText}\n</data>\n\nReturn the JSON array of insights now.`;

    let raw = "";
    try {
      raw = await callClaude(apiKey, PRIMARY_MODEL, system, user);
    } catch (err: any) {
      if (/model/i.test(String(err?.message || ""))) {
        raw = await callClaude(apiKey, FALLBACK_MODEL, system, user);
      } else {
        return { ok: false, written: 0, reason: String(err?.message || err) };
      }
    }

    const insights = parseInsightsJson(raw);
    if (insights.length === 0) {
      return { ok: false, written: 0, reason: "Claude returned no parseable insights" };
    }

    // Belt-and-suspenders guard: even with the prompt update, drop any
    // unit value that came back as the property code (Claude has been
    // observed putting "rv-ohio" there when the finding isn't unit-scoped).
    // The alerts grid then renders a clean "—" instead of repeating the
    // property identifier on every row.
    for (const ins of insights) {
      if (
        ins.unit &&
        propertyCode &&
        ins.unit.toLowerCase() === propertyCode.toLowerCase()
      ) {
        ins.unit = undefined;
      }
    }

    const today = new Date().toISOString();
    let written = 0;
    for (const ins of insights) {
      await ctx.runMutation(api.alerts.create, {
        propertyId: args.propertyId,
        alertType: "income_insight",
        severity: ins.severity,
        title: ins.title,
        body: ins.body,
        aiAnalysis: `Generated from monthly bundle ${args.period}.`,
        dataContext: {
          period: args.period,
          bundleId: args.bundleId,
          category: ins.category,
          propertyCode,
        },
        status: "new",
        unit: ins.unit,
        date: today,
      });
      written += 1;
    }

    return { ok: true, written };
  },
});

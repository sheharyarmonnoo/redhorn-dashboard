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

// Per-user cap: 10 user-role messages per rolling 24 hours. Stops a runaway
// loop or a chatty user from racking up surprise Anthropic bills. Counted
// across every thread the user owns, not per-thread.
const DAILY_MESSAGE_LIMIT = 10;
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

// Mirrors the per-property + per-unit allowlist from src/hooks/useConvexData.ts
// (`ELECTRIC_INDICATOR_UNITS`). Without it the chatbot would flag every
// tenant whose electricPosted=false even though the dashboard's
// "Electric Not Posted" indicator only renders for these specific units.
const ELECTRIC_INDICATOR_UNITS: Record<string, Set<string>> = {
  hollister: new Set([
    "abd",
    "c-100", "c-194", "c-200", "c-202", "c-204", "c-210",
    "d-150", "d-160",
  ]),
};
function showsElectricIndicator(tenant: any, propertyCode: string | undefined): boolean {
  if (!tenant || tenant.status === "vacant") return false;
  const code = (propertyCode || "").toLowerCase();
  const allow = ELECTRIC_INDICATOR_UNITS[code];
  if (!allow) return false;
  const raw = (tenant.unit || "").trim().toLowerCase();
  if (!raw) return false;
  for (const part of raw.split(",")) {
    if (allow.has(part.trim())) return true;
  }
  return false;
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

  // Resolve the property first so we can branch on propertyType. RV park
  // doesn't have Yardi-fed tenants / income_lines / aging — its data flows
  // from the monthly Campspot+Northgate bundle into rv_* tables — so we
  // route to an RV-specific context builder instead of running empty
  // commercial queries.
  const properties = await ctx.runQuery(api.properties.list, {});
  const property = (properties || []).find((p: any) => p._id === propertyId);
  const propertyName = property?.name || property?.code || "(unknown property)";
  if (property?.propertyType === "rv_park") {
    return buildRvContext(ctx, property, propertyName);
  }

  // Run remaining queries in parallel for latency.
  const [tenants, monthlyRevenue, incomeLines, alerts, syncJobs, deals, aging] = await Promise.all([
    ctx.runQuery(api.tenants.listByProperty, { propertyId: propertyId as any }),
    ctx.runQuery(api.monthlyRevenue.listByProperty, { propertyId: propertyId as any }),
    ctx.runQuery(api.incomeLines.listByProperty, { propertyId: propertyId as any }),
    ctx.runQuery(api.alerts.listForProperty, { propertyId: propertyId as any, limit: 12 }),
    ctx.runQuery(api.syncJobs.list, {}),
    ctx.runQuery(api.deals.list, {}),
    ctx.runQuery(api.agingRecords.listByProperty, { propertyId: propertyId as any }),
  ]);

  // ---- Past-due tenants ----
  // Join the rent-roll past-due list with the aging snapshot so each row
  // carries the bucket breakdown (0-30 / 31-60 / 61-90 / 90+) and the
  // dominant bucket label. Without aging we couldn't answer "how long
  // are they past due" — only "how much".
  const pastDue = (tenants || [])
    .filter((t: any) => (t.pastDueAmount || 0) > 0)
    .sort((a: any, b: any) => (b.pastDueAmount || 0) - (a.pastDueAmount || 0));
  const agingByName = new Map<string, any>();
  const normName = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const a of (aging || []) as any[]) {
    agingByName.set(normName(a.tenantName || ""), a);
  }
  function agingForTenant(tenantName: string) {
    const k = normName(tenantName);
    if (agingByName.has(k)) return agingByName.get(k);
    // Fuzzy: try matching on the first 2 word tokens (handles things like
    // "Beacon Restoration and Cleaning of Houston" vs "Beacon Restoration")
    const tokens = k.split(" ");
    if (tokens.length >= 2) {
      const prefix = tokens.slice(0, 2).join(" ");
      const entries = Array.from(agingByName.entries());
      for (const [n, a] of entries) {
        if (n.startsWith(prefix)) return a;
      }
    }
    return null;
  }
  function dominantBucket(a: any): string {
    if (!a) return "unknown age";
    const buckets = [
      { label: "90+ days", v: a.over90 || 0 },
      { label: "61-90 days", v: a.days61_90 || 0 },
      { label: "31-60 days", v: a.days31_60 || 0 },
      { label: "0-30 days", v: a.days0_30 || 0 },
    ];
    const top = buckets.reduce((m, b) => (b.v > m.v ? b : m), buckets[0]);
    return top.v > 0 ? top.label : "current";
  }
  const pastDueLines = trimList(pastDue, 25).map((t: any) => {
    const a = agingForTenant(t.tenant || "");
    const total = fmt$(t.pastDueAmount);
    if (!a) return `- ${t.unit || "?"} | ${t.tenant || "?"} | ${total} | aging: unknown`;
    const breakdown = `0-30 ${fmt$(a.days0_30)} · 31-60 ${fmt$(a.days31_60)} · 61-90 ${fmt$(a.days61_90)} · 90+ ${fmt$(a.over90)}`;
    return `- ${t.unit || "?"} | ${t.tenant || "?"} | ${total} | dominant bucket: ${dominantBucket(a)} | breakdown: ${breakdown}`;
  });

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

  // ---- Lease expirations within 90 days + already-expired holdovers ----
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 90);
  const expiringSoon = (tenants || [])
    .filter((t: any) => {
      if (t.status === "vacant" || !t.leaseTo) return false;
      const d = new Date(t.leaseTo);
      return !Number.isNaN(d.getTime()) && d >= today && d <= cutoff;
    })
    .sort((a: any, b: any) => (a.leaseTo || "").localeCompare(b.leaseTo || ""));
  const expLines = trimList(expiringSoon, 15).map(
    (t: any) => `- ${t.unit} | ${t.tenant} | ends ${t.leaseTo} | ${fmt$(t.monthlyRent)}/mo`
  );
  // Holdovers — lease end date already passed but tenant is still active.
  // Surfaced as the "Expired Leases" KPI on the dashboard, so the chatbot
  // needs the same data to answer "which leases are expired?" / "who's on a
  // month-to-month?".
  const expired = (tenants || [])
    .filter((t: any) => {
      if (t.status === "vacant" || !t.leaseTo) return false;
      const d = new Date(t.leaseTo);
      return !Number.isNaN(d.getTime()) && d < today;
    })
    .sort((a: any, b: any) => (a.leaseTo || "").localeCompare(b.leaseTo || ""));
  const expiredLines = trimList(expired, 15).map(
    (t: any) => `- ${t.unit} | ${t.tenant} | ended ${t.leaseTo} | ${fmt$(t.monthlyRent)}/mo`
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
  const occupiedTenants = (tenants || []).filter((t: any) => t.status !== "vacant" && (t.monthlyRent || 0) > 0);
  const occupied = occupiedTenants.length;
  const totalTenants = (tenants || []).length;

  // ---- Full rent roll (occupied tenants only) ----
  // Every unit that has a tenant and a rent. Without this, questions like
  // "what's the in-place rent for unit A-102" return "I don't have that
  // unit" because the past-due / expiring slices only surface a subset.
  // We sort by unit so Claude can scan it. Cap at 200 occupied units —
  // properties beyond that should switch to a tool-based lookup, but our
  // current portfolio (Hollister ~80, Belgold ~20, Bradenburg none) fits
  // comfortably below the cap.
  const sortedRoll = [...occupiedTenants].sort((a: any, b: any) =>
    String(a.unit || "").localeCompare(String(b.unit || ""), undefined, { numeric: true })
  );
  const rollLines = trimList(sortedRoll, 200).map((t: any) => {
    const rent = t.monthlyRent ? fmt$(t.monthlyRent) : "—";
    const sf = t.sqft ? `${t.sqft.toLocaleString()} SF` : "—";
    const rentPerSf = (t.monthlyRent && t.sqft && t.sqft > 0)
      ? `$${(t.monthlyRent / t.sqft).toFixed(2)}/SF`
      : "—";
    const leaseEnd = t.leaseTo || "—";
    const status = t.status || "—";
    // Electric posting flag — only meaningful for tenants on the allowlist;
    // for everyone else it's "n/a" so the chatbot doesn't hallucinate.
    const electricFlag = showsElectricIndicator(t, property?.code)
      ? (t.electricPosted ? "electric: posted" : "electric: NOT posted")
      : "electric: n/a";
    const electricAmount = t.monthlyElectric ? `${fmt$(t.monthlyElectric)}/mo elec` : "";
    return `- ${t.unit || "?"} | ${t.tenant || "?"} | ${rent}/mo | ${sf} | ${rentPerSf} | lease ends ${leaseEnd} | ${status} | ${electricFlag}${electricAmount ? " | " + electricAmount : ""}`;
  });

  const sections: string[] = [];
  sections.push(`Property: ${propertyName} (${property?.code || "?"}) — ${property?.location || ""}`);
  sections.push(syncLine);
  sections.push(`Tenants on rent roll: ${totalTenants} (occupied: ${occupied})`);
  sections.push("");

  sections.push(`Full rent roll — occupied units (${rollLines.length}):`);
  sections.push("Format: unit | tenant | rent/mo | sqft | rent/SF | lease end | status");
  sections.push(rollLines.length ? rollLines.join("\n") : "- (none)");
  if (sortedRoll.length > rollLines.length) {
    sections.push(`…and ${sortedRoll.length - rollLines.length} more occupied units (truncated for context size).`);
  }
  sections.push("");

  sections.push(`Past-due tenants (${pastDue.length}):`);
  sections.push("Each row: unit | tenant | total past due | dominant aging bucket | bucket breakdown");
  sections.push("Aging buckets = days since charge posted (0-30 / 31-60 / 61-90 / 90+). Use the dominant bucket to answer 'how long is X past due'.");
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

  sections.push(`Expired leases / holdovers (lease end already passed, ${expired.length}):`);
  sections.push(expiredLines.length ? expiredLines.join("\n") : "- (none)");
  sections.push("");

  sections.push(`Active alerts (${openAlerts.length}):`);
  sections.push(alertLines.length ? alertLines.join("\n") : "- (none)");
  sections.push("");

  // ---- Electric Not Posted ----
  // Triple-net tenants on the per-property allowlist whose electric charge
  // hasn't been posted this month. The dashboard surfaces this as the
  // orange-dot indicator on the rent roll + site plan; the chatbot needs
  // it to answer questions like "who hasn't been billed for electric".
  const electricNotPosted = (tenants || []).filter(
    (t: any) =>
      t.status !== "vacant" &&
      !t.electricPosted &&
      t.tenant &&
      !String(t.tenant).includes("Owner") &&
      showsElectricIndicator(t, property?.code),
  );
  const electricLines = trimList(electricNotPosted, 20).map((t: any) => {
    const electric = t.monthlyElectric ? `${fmt$(t.monthlyElectric)}/mo electric` : "no electric on record";
    return `- ${t.unit || "?"} | ${t.tenant || "?"} | ${electric}`;
  });
  sections.push(`Electric Not Posted (NNN tenants on allowlist whose electric charge isn't posted this month, ${electricNotPosted.length}):`);
  sections.push(electricLines.length ? electricLines.join("\n") : "- (none)");
  sections.push("");

  // ---- Acquisitions deal pipeline (portfolio-wide, not per-property) ----
  // Group by stage and emit a count + sample of deals so the assistant can
  // answer "what deals are in outreach", "how many in LOI", etc.
  const dealsArr = (deals || []) as any[];
  const stageOrder = ["lead", "outreach", "underwriting", "loi", "due_diligence", "closing", "closed", "dead"];
  const stageLabels: Record<string, string> = {
    lead: "Lead",
    outreach: "Outreach",
    underwriting: "Underwriting",
    loi: "LOI",
    due_diligence: "Due Diligence",
    closing: "Closing",
    closed: "Closed",
    dead: "Dead",
  };
  const dealsByStage: Record<string, any[]> = {};
  for (const d of dealsArr) {
    const s = (d.stage || "lead") as string;
    (dealsByStage[s] = dealsByStage[s] || []).push(d);
  }
  sections.push(`Deal pipeline (${dealsArr.length} total deals across all stages):`);
  for (const stage of stageOrder) {
    const list = dealsByStage[stage] || [];
    if (list.length === 0) continue;
    sections.push(`${stageLabels[stage]} (${list.length}):`);
    // Sort by updatedAt desc, sample top 12 per stage so big buckets don't
    // blow the context but the user can still ask for specifics.
    const sample = [...list]
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .slice(0, 12);
    for (const d of sample) {
      const name = d.name || d.address || "(unnamed)";
      const loc = [d.city, d.state].filter(Boolean).join(", ");
      const price = d.askingPrice ? ` | ask ${fmt$(d.askingPrice)}` : "";
      const sf = d.sqft ? ` | ${d.sqft.toLocaleString()} SF` : "";
      const assignee = d.assignedTo ? ` | ${d.assignedTo}` : "";
      sections.push(`- ${name}${loc ? ` (${loc})` : ""}${sf}${price}${assignee}`);
    }
    if (list.length > sample.length) {
      sections.push(`  …and ${list.length - sample.length} more in ${stageLabels[stage]}.`);
    }
  }

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
        dealsTotal: dealsArr.length,
        dealsByStage: Object.fromEntries(stageOrder.map(s => [s, (dealsByStage[s] || []).length])),
        expired: expired.length,
        openAlerts: openAlerts.length,
      },
    },
  };
}

// RV park context — data lives in rv_* tables (uploaded monthly from
// Campspot + Northgate), not the Yardi-fed tenants/income_lines/aging that
// commercial properties use. Sections cover: site occupancy, past-due
// guests, monthly POS revenue, payment-mix, and the Income Statement
// roll-ups so the assistant can answer questions like "who's at site 208",
// "how much in A/R", "what was March P&L vs budget".
async function buildRvContext(
  ctx: any,
  property: any,
  propertyName: string,
): Promise<{ contextText: string; propertyName: string; raw: any }> {
  const propertyId = property._id;
  const [reservations, balances, sites, pos, payments, financials] = await Promise.all([
    ctx.runQuery(api.rv.listLatestReservations, { propertyId: propertyId as any }),
    ctx.runQuery(api.rv.listLatestBalances, { propertyId: propertyId as any }),
    ctx.runQuery(api.rv.listSites, { propertyId: propertyId as any }),
    ctx.runQuery(api.rv.listLatestPos, { propertyId: propertyId as any }),
    ctx.runQuery(api.rv.listLatestPayments, { propertyId: propertyId as any }),
    ctx.runQuery(api.rv.listFinancials, { propertyId: propertyId as any }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const sections: string[] = [];

  sections.push(`Property: ${propertyName} (RV park, code ${property.code})`);
  sections.push(
    `Source: monthly Campspot reservation/POS export + Northgate financial xlsx, uploaded by Max once per month via /uploads.`,
  );
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
    const current = rs.find(
      (x: any) => x.arrivalDate <= today && today <= x.departureDate,
    );
    if (current) occupied += 1;
    const next = rs
      .filter((x: any) => x.arrivalDate > today)
      .sort((a: any, b: any) => a.arrivalDate.localeCompare(b.arrivalDate))[0];
    if (next) {
      const days = (Date.parse(next.arrivalDate) - Date.parse(today)) / 86400000;
      if (days <= 7) upcomingWeek += 1;
    }
  }
  const totalSites = (sites || []).length;
  const vacant = Math.max(0, totalSites - occupied);
  sections.push(
    `Occupancy: ${occupied}/${totalSites} sites occupied today, ${upcomingWeek} arriving in the next 7 days, ${vacant} vacant.`,
  );
  sections.push("");

  // ---- Currently in-house guests (sample) ----
  const inHouse = ((reservations || []) as any[])
    .filter((r) => r.arrivalDate <= today && today <= r.departureDate)
    .sort((a, b) => (a.siteCode || "").localeCompare(b.siteCode || "", undefined, { numeric: true }));
  sections.push(`Currently in-house (${inHouse.length}):`);
  if (inHouse.length === 0) {
    sections.push("- (none)");
  } else {
    for (const r of trimList(inHouse, 25)) {
      const guest = `${r.firstName || ""} ${r.lastName || ""}`.trim() || "(unknown)";
      const balance = r.balanceOnInvoice || 0;
      sections.push(
        `- site ${r.siteCode} (${r.siteType || "?"}) | ${guest} | arr ${r.arrivalDate} → dep ${r.departureDate} | charges ${fmt$(r.totalChargesOnInvoice)} | balance ${balance > 0.5 ? fmt$(balance) : "$0"}`,
      );
    }
    if (inHouse.length > 25) sections.push(`- …and ${inHouse.length - 25} more in-house`);
  }
  sections.push("");

  // ---- Past-due / open balances ----
  const balancesArr = ((balances || []) as any[]).filter((b) => (b.balance || 0) > 0.5);
  const totalAr = balancesArr.reduce((s, b) => s + (b.balance || 0), 0);
  sections.push(
    `Open balances (Guests with Balance report — ${balancesArr.length} guests, ${fmt$(totalAr)} total A/R):`,
  );
  if (balancesArr.length === 0) {
    sections.push("- (none)");
  } else {
    const sorted = [...balancesArr].sort((a, b) => (b.balance || 0) - (a.balance || 0));
    for (const b of trimList(sorted, 20)) {
      const name = `${b.firstName || ""} ${b.lastName || ""}`.trim() || "(unknown)";
      const dates = b.arrivalDate ? `${b.arrivalDate} → ${b.departureDate || "?"}` : "(no dates)";
      sections.push(
        `- ${name} | ${b.campsiteType || "?"} ${b.campsiteNames || ""} | ${dates} | balance ${fmt$(b.balance)} | charges ${fmt$(b.totalCharges)} | paid ${fmt$(b.totalPayments)}`,
      );
    }
    if (sorted.length > 20) sections.push(`- …and ${sorted.length - 20} more guests with balances`);
  }
  sections.push("");

  // ---- POS / camp-store revenue ----
  const posArr = (pos || []) as any[];
  const monthTotals = new Map<string, number>();
  const categoryTotals = new Map<string, number>();
  for (const p of posArr) {
    monthTotals.set(p.saleMonth, (monthTotals.get(p.saleMonth) || 0) + (p.total || 0));
    const key = `${p.financialAccount} / ${p.productCategory}`;
    categoryTotals.set(key, (categoryTotals.get(key) || 0) + (p.total || 0));
  }
  const monthsSorted = Array.from(monthTotals.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  sections.push(`Camp-store POS revenue by month:`);
  if (monthsSorted.length === 0) {
    sections.push("- (no POS data)");
  } else {
    for (const [m, total] of monthsSorted) {
      sections.push(`- ${m}: ${fmt$(total)}`);
    }
  }
  const topCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (topCategories.length > 0) {
    sections.push(`POS top categories:`);
    for (const [cat, total] of topCategories) {
      sections.push(`- ${cat}: ${fmt$(total)}`);
    }
  }
  sections.push("");

  // ---- Payment mix ----
  const paymentsArr = ((payments || []) as any[]).filter((p) => (p.totalPayments || 0) !== 0);
  if (paymentsArr.length > 0) {
    const grandTotal = paymentsArr.reduce((s, p) => s + (p.totalPayments || 0), 0);
    sections.push(`Payment mix (${fmt$(grandTotal)} total):`);
    const sorted = [...paymentsArr].sort((a, b) => (b.totalPayments || 0) - (a.totalPayments || 0));
    for (const p of trimList(sorted, 12)) {
      const label = p.cardType ? `${p.paymentType} (${p.cardType})` : p.paymentType;
      sections.push(`- ${label}: ${fmt$(p.totalPayments)}`);
    }
    sections.push("");
  }

  // ---- Income Statement roll-ups (from Northgate financial package) ----
  const isLines = ((financials || []) as any[]).filter((f) => f.kind === "isBudget");
  if (isLines.length > 0) {
    const period = isLines[0]?.snapshotPeriod || "(unknown period)";
    let income = 0;
    let incomeBudget = 0;
    let incomeYtd = 0;
    let expense = 0;
    let expenseBudget = 0;
    let expenseYtd = 0;
    for (const r of isLines) {
      const li = String(r.lineItem || "");
      // Skip subtotals to avoid double-counting; sum leaf lines only.
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
    const noiYtd = incomeYtd - expenseYtd;
    sections.push(
      `Income Statement (period ${period}, derived from monthly Northgate financial package):`,
    );
    sections.push(
      `- Total Income: ${fmt$(income)} (budget ${fmt$(incomeBudget)}, YTD ${fmt$(incomeYtd)})`,
    );
    sections.push(
      `- Total Expense: ${fmt$(expense)} (budget ${fmt$(expenseBudget)}, YTD ${fmt$(expenseYtd)})`,
    );
    sections.push(`- NOI (period): ${fmt$(noi)}; YTD NOI: ${fmt$(noiYtd)}`);
    // Top variance lines so the assistant can call out where budget broke.
    const variances = isLines
      .filter((r) => classifyForVariance(r.lineItem))
      .map((r) => ({
        label: cleanRvLabel(r.lineItem),
        actual: r.amountMtd || 0,
        budget: r.budgetMtd || 0,
        variance: (r.amountMtd || 0) - (r.budgetMtd || 0),
        isExpense: /^[5-9]\d{3}-/.test(String(r.lineItem || "")),
      }))
      .filter((v) => Math.abs(v.variance) > 25)
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    if (variances.length > 0) {
      sections.push(`Largest budget variances (period vs budget):`);
      for (const v of trimList(variances, 8)) {
        const sign = v.variance >= 0 ? "+" : "−";
        sections.push(
          `- ${v.label}: actual ${fmt$(v.actual)} vs budget ${fmt$(v.budget)} → ${sign}${fmt$(Math.abs(v.variance))} (${v.isExpense ? "expense" : "income"})`,
        );
      }
    }
    sections.push("");
  }

  return {
    contextText: sections.join("\n"),
    propertyName,
    raw: {
      propertyId,
      propertyCode: property.code,
      propertyType: "rv_park",
      counts: {
        sites: totalSites,
        occupied,
        vacant,
        upcomingWeek,
        balances: balancesArr.length,
        totalAr,
        posLines: posArr.length,
      },
    },
  };
}

// Strip "NNNN-NNN - " / "Total - NNNN-NNN - " prefixes so the assistant
// quotes plain category names back to the user.
function cleanRvLabel(li: string | undefined): string {
  const raw = String(li || "").trim();
  let s = raw.replace(/^Total\s*-\s*\d{4}-\d{3}\s*-\s*/i, "Total ");
  s = s.replace(/^\d{4}-\d{3}\s*-\s*/, "");
  return s;
}

function classifyForVariance(li: string | undefined): boolean {
  const s = String(li || "");
  if (/^Total/i.test(s)) return false;
  return /^\d{4}-/.test(s);
}

export const ask = action({
  args: {
    threadId: v.id("chat_threads"),
    userQuestion: v.string(),
    propertyId: v.optional(v.string()),
    userName: v.optional(v.string()),
    userEmail: v.optional(v.string()),
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

    // Daily rate limit — count is rolling 24h, scoped to the thread owner so
    // each Clerk user has their own bucket. The user-question itself was
    // written by the client via addUserMessage BEFORE this action fires, so
    // a count == DAILY_MESSAGE_LIMIT means this very message just pushed
    // them to the cap (still allow it through), > LIMIT means they already
    // burned the budget on prior turns and this one is blocked.
    const ownerId: string | null = await ctx.runQuery(api.chat.getThreadOwner, {
      id: args.threadId,
    });
    if (ownerId) {
      const count: number = await ctx.runQuery(api.chat.dailyUserMessageCount, {
        userId: ownerId,
      });
      if (count > DAILY_MESSAGE_LIMIT) {
        const error = `Daily limit reached — ${DAILY_MESSAGE_LIMIT} messages per 24 hours. Try again tomorrow.`;
        await ctx.runMutation(internal.chat.appendMessage, {
          threadId: args.threadId,
          role: "assistant",
          content: error,
        });
        return { ok: false, error };
      }
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
    const userIdentity = args.userName
      ? `The user's name is ${args.userName}${args.userEmail ? ` (${args.userEmail})` : ""}. If they ask "who am I" or refer to themselves by pronoun, you can answer directly.`
      : `(No signed-in user name was passed.)`;

    const systemPrompt = `You are a real-estate analytics assistant for Redhorn Capital. The user manages commercial properties in Yardi.

Answer questions about internal property data (tenants, rent rolls, NOI, alerts, lease expirations) AND the acquisitions deal pipeline (sourcing, outreach, underwriting, LOI, due diligence, closing) using ONLY the data provided in <data> tags below. The deal pipeline section is portfolio-wide, not scoped to the active property — questions like "what deals are in outreach" or "how many LOIs do we have" should be answered from there. Never invent numbers, tenants, dates, or deal names — if a fact isn't in the data, say so.

For external research questions (market trends, news on a tenant, demographics, competitor activity, cap-rate benchmarks, comp pricing in a submarket, etc.) you MAY use the web_search tool to look it up online. Always cite sources, and clearly distinguish external research from the internal snapshot.

Today is ${today}. The user's active property is ${propertyName}.
${userIdentity}

<data>
${contextText}
</data>

Format guidance:
- When listing 3+ items with comparable fields (tenants with units + amounts, leases with dates, alerts with severity, etc.), prefer a GitHub-flavored markdown table:
  | Tenant | Unit(s) | Amount |
  |---|---|---:|
  | Trophy Windows, LLC | C-218, D-150 | $8,013 |
  Right-align numeric columns with \`---:\` in the separator row.
- For 1–2 items or short answers, plain text with "- " bullets is fine.
- Use markdown headings (#, ##) sparingly for multi-section answers.
- Bold key totals with **…**.
- All dollar figures with a "$" prefix and comma separators.
- Be specific: cite tenant names, units, and amounts from the data.`;

    // 3) Call the Anthropic API. Fall back to haiku 3.5 on a model-unknown error.
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
          max_tokens: 2000,
          system: systemPrompt,
          messages: priorMessages,
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 3,
            },
          ],
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Anthropic ${res.status}: ${text.slice(0, 400)}`);
      }
      const json: any = await res.json();
      // Multiple text blocks (e.g. before + after web_search tool use). Concatenate all.
      const textBlocks = (json?.content || []).filter((b: any) => b.type === "text");
      const block = { text: textBlocks.map((b: any) => b.text || "").join("\n") };
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

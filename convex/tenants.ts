import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Apply manual overrides on top of a synced tenant row. Only defined override
// fields win; the synced value falls through otherwise. Adds `hasOverride`
// + `overrideFields` so the UI can show a "modified" badge and revert.
function mergeOverride(tenant: any, override: any): any {
  if (!override) return { ...tenant, hasOverride: false };
  const merged: any = { ...tenant };
  const applied: string[] = [];
  // status is included so Slice 2's manual status override replaces the
  // synced tenant.status. Downstream UI reads tenant.status without
  // caring whether the value came from sync or override; the
  // overrideFields array lets the drawer/grid distinguish for display
  // (Manual Override badge) and the systemStatus field below preserves
  // the synced value for the "system status" caption.
  const fieldKeys = [
    "notes",
    "tenantEmail", "tenantPhone", "tenantContactName",
    "status",
  ];
  for (const k of fieldKeys) {
    if (override[k] !== undefined && override[k] !== null) {
      merged[k] = override[k];
      applied.push(k);
    }
  }
  return {
    ...merged,
    systemStatus: tenant.status,
    hasOverride: applied.length > 0,
    statusOverridden: applied.includes("status"),
    overrideFields: applied,
    overrideUpdatedAt: override.updatedAt,
    overrideUpdatedBy: override.updatedBy,
  };
}

export const listByProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const tenants = await ctx.db
      .query("tenants")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", args.propertyId).eq("isLatest", true)
      )
      .collect();
    const overrides = await ctx.db
      .query("tenant_overrides")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect();
    const byUnit: Record<string, any> = {};
    for (const o of overrides) byUnit[(o.unit || "").trim().toLowerCase()] = o;
    return tenants.map((t) => mergeOverride(t, byUnit[(t.unit || "").trim().toLowerCase()]));
  },
});

export const listAll = query({
  handler: async (ctx) => {
    const tenants = await ctx.db
      .query("tenants")
      .filter((q) => q.eq(q.field("isLatest"), true))
      .collect();
    const properties = await ctx.db.query("properties").collect();
    const overrides = await ctx.db.query("tenant_overrides").collect();
    const propMap: Record<string, { name: string; code: string }> = {};
    for (const p of properties) {
      propMap[p._id] = { name: p.name, code: p.code };
    }
    const overrideKey = (propId: string, unit: string) => `${propId}:${(unit || "").trim().toLowerCase()}`;
    const overrideMap: Record<string, any> = {};
    for (const o of overrides) overrideMap[overrideKey(o.propertyId, o.unit)] = o;
    return tenants.map((t) => {
      const merged = mergeOverride(t, overrideMap[overrideKey(t.propertyId, t.unit)]);
      return {
        ...merged,
        propertyName: propMap[t.propertyId]?.name || "Unknown",
        propertyCode: propMap[t.propertyId]?.code || "",
      };
    });
  },
});

export const getByUnit = query({
  args: { propertyId: v.id("properties"), unit: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tenants")
      .withIndex("by_unit", (q) =>
        q
          .eq("propertyId", args.propertyId)
          .eq("unit", args.unit)
          .eq("isLatest", true)
      )
      .first();
  },
});

export const updateStatus = mutation({
  args: { id: v.id("tenants"), status: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const updateNotes = mutation({
  args: { id: v.id("tenants"), notes: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { notes: args.notes });
  },
});

/**
 * One-off cleanup: wipe `notes` on every tenant row across every property.
 * The drawer no longer surfaces tenant.notes (those values came from Yardi
 * imports + legacy direct writes and the user wants them gone) so this
 * just clears stale data so nothing can pop back up if we ever re-enable
 * that surface. Idempotent.
 */
export const clearAllNotes = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("tenants").collect();
    let cleared = 0;
    for (const t of all) {
      if (t.notes) {
        await ctx.db.patch(t._id, { notes: "" });
        cleared++;
      }
    }
    return { scanned: all.length, cleared };
  },
});

export const updateDelinquency = mutation({
  args: {
    id: v.id("tenants"),
    delinquencyStage: v.string(),
    delinquencyDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      delinquencyStage: args.delinquencyStage,
      delinquencyDate: args.delinquencyDate,
    });
  },
});

export const updateElectricPosted = mutation({
  args: { id: v.id("tenants"), electricPosted: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { electricPosted: args.electricPosted });
  },
});

export const markNotLatest = mutation({
  args: { id: v.id("tenants") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isLatest: false });
  },
});

export const insertOne = mutation({
  args: {
    propertyId: v.id("properties"),
    unit: v.string(),
    building: v.string(),
    tenant: v.string(),
    leaseType: v.string(),
    sqft: v.number(),
    leaseFrom: v.string(),
    leaseTo: v.string(),
    monthlyRent: v.number(),
    monthlyElectric: v.number(),
    securityDeposit: v.number(),
    status: v.string(),
    pastDueAmount: v.number(),
    electricPosted: v.boolean(),
    lastPaymentDate: v.string(),
    notes: v.optional(v.string()),
    delinquencyStage: v.optional(v.string()),
    delinquencyDate: v.optional(v.string()),
    snapshotDate: v.optional(v.string()),
    isLatest: v.boolean(),
    syncId: v.optional(v.id("sync_jobs")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tenants", args);
  },
});

export const bulkInsert = mutation({
  args: {
    tenants: v.array(
      v.object({
        propertyId: v.id("properties"),
        unit: v.string(),
        building: v.string(),
        tenant: v.string(),
        leaseType: v.string(),
        sqft: v.number(),
        leaseFrom: v.string(),
        leaseTo: v.string(),
        monthlyRent: v.number(),
        monthlyElectric: v.number(),
        securityDeposit: v.number(),
        status: v.string(),
        pastDueAmount: v.number(),
        electricPosted: v.boolean(),
        lastPaymentDate: v.string(),
        notes: v.optional(v.string()),
        delinquencyStage: v.optional(v.string()),
        delinquencyDate: v.optional(v.string()),
        snapshotDate: v.optional(v.string()),
        isLatest: v.boolean(),
        syncId: v.optional(v.id("sync_jobs")),
      })
    ),
  },
  handler: async (ctx, args) => {
    const ids = [];
    for (const t of args.tenants) {
      const id = await ctx.db.insert("tenants", t);
      ids.push(id);
    }
    return ids;
  },
});

/**
 * Bulk replacement of tenants for a single property. Server resolves
 * propertyCode → propertyId, marks all current rows as `isLatest=false`
 * (preserving history), inserts the new snapshot. Manual overrides on
 * tenants (notes, delinquency stage, posting status) are NOT carried
 * over here — those should be re-applied on top of the fresh data
 * via the override layer or merged client-side. This matches the
 * income_lines approach.
 */
export const bulkReplaceByCode = mutation({
  args: {
    propertyCode: v.string(),
    syncId: v.optional(v.id("sync_jobs")),
    snapshotDate: v.string(),
    rows: v.array(
      v.object({
        unit: v.string(),
        building: v.optional(v.string()),
        tenant: v.optional(v.string()),
        leaseType: v.optional(v.string()),
        sqft: v.optional(v.number()),
        leaseFrom: v.optional(v.string()),
        leaseTo: v.optional(v.string()),
        monthlyRent: v.optional(v.number()),
        monthlyElectric: v.optional(v.number()),
        securityDeposit: v.optional(v.number()),
        status: v.optional(v.string()),
        pastDueAmount: v.optional(v.number()),
        // Rich Show Detail columns from the Commercial Analytics rent roll.
        // The basic dashboard "Current Leases" panel didn't carry these,
        // but the rent-roll-full export does — and that's now the single
        // ingest path, so bulkReplaceByCode has to accept them all.
        leaseTermMonths: v.optional(v.number()),
        monthlyRentPerSF: v.optional(v.number()),
        annualRent: v.optional(v.number()),
        annualRentPerSF: v.optional(v.number()),
        annualRecPerSF: v.optional(v.number()),
        annualMiscPerSF: v.optional(v.number()),
        locAmount: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const property = await ctx.db
      .query("properties")
      .withIndex("by_code", (q) => q.eq("code", args.propertyCode))
      .first();
    if (!property) throw new Error(`Unknown property code: ${args.propertyCode}`);

    const prior = await ctx.db
      .query("tenants")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", property._id).eq("isLatest", true)
      )
      .collect();
    // Index prior rows by normalized unit so we can carry over fields the
    // rent-roll export doesn't include — past-due amount, last payment date,
    // electric posting flag, and any synced rent-increase data — from the
    // applyPastDueByCode / receivable-detail / tenancy-schedule passes that
    // already ran. Without this, rent-roll-full's bulk-replace wipes those
    // fields back to zero.
    const norm = (s: string) => (s || "").trim().toLowerCase();
    const priorByUnit: Record<string, any> = {};
    for (const row of prior) {
      priorByUnit[norm(row.unit)] = row;
      await ctx.db.patch(row._id, { isLatest: false });
    }

    let inserted = 0;
    for (const r of args.rows) {
      const carry = priorByUnit[norm(r.unit)] || {};
      const doc: any = {
        syncId: args.syncId,
        propertyId: property._id,
        unit: r.unit,
        building: r.building || "",
        tenant: r.tenant || "",
        leaseType: r.leaseType || "",
        sqft: r.sqft ?? 0,
        leaseFrom: r.leaseFrom || "",
        leaseTo: r.leaseTo || "",
        monthlyRent: r.monthlyRent ?? 0,
        monthlyElectric: r.monthlyElectric ?? 0,
        securityDeposit: r.securityDeposit ?? 0,
        status: r.status ?? carry.status ?? "current",
        pastDueAmount: r.pastDueAmount ?? carry.pastDueAmount ?? 0,
        electricPosted: carry.electricPosted ?? false,
        lastPaymentDate: carry.lastPaymentDate || "",
        snapshotDate: args.snapshotDate,
        isLatest: true,
      };
      // Carry over synced tenancy-schedule fields when present
      if (typeof carry.nextRentIncrease === "string" && carry.nextRentIncrease) doc.nextRentIncrease = carry.nextRentIncrease;
      if (typeof carry.nextRentIncreaseAmount === "number" && carry.nextRentIncreaseAmount > 0) doc.nextRentIncreaseAmount = carry.nextRentIncreaseAmount;
      // Optional Show Detail columns — only set when present so we don't
      // store undefined values for properties whose rent roll lacks them.
      if (typeof r.leaseTermMonths === "number" && r.leaseTermMonths > 0) doc.leaseTermMonths = r.leaseTermMonths;
      if (typeof r.monthlyRentPerSF === "number" && r.monthlyRentPerSF > 0) doc.monthlyRentPerSF = r.monthlyRentPerSF;
      if (typeof r.annualRent === "number" && r.annualRent > 0) doc.annualRent = r.annualRent;
      if (typeof r.annualRentPerSF === "number" && r.annualRentPerSF > 0) doc.annualRentPerSF = r.annualRentPerSF;
      if (typeof r.annualRecPerSF === "number" && r.annualRecPerSF > 0) doc.annualRecPerSF = r.annualRecPerSF;
      if (typeof r.annualMiscPerSF === "number" && r.annualMiscPerSF > 0) doc.annualMiscPerSF = r.annualMiscPerSF;
      if (typeof r.locAmount === "number" && r.locAmount > 0) doc.locAmount = r.locAmount;
      await ctx.db.insert("tenants", doc);
      inserted++;
    }

    if (inserted > 0 && !property.hasData) {
      await ctx.db.patch(property._id, { hasData: true });
    }

    return { propertyId: property._id, inserted, supersededPrior: prior.length };
  },
});

/**
 * Patch the latest tenants snapshot for a property with per-lease past-due
 * dollar amounts pulled from the Past Due dashboard panel. We match by lease
 * name (case-insensitive, trimmed) since the rent-roll panel uses
 * "Lease Name(Id)" and the past-due panel uses "Lease Name" / "Customer".
 *
 * Tenants that don't have a matching past-due row are zeroed out so a paid-off
 * tenant doesn't keep its prior balance forever. Status is also flipped to
 * "past_due" for any tenant with a positive balance.
 */
export const applyPastDueByCode = mutation({
  args: {
    propertyCode: v.string(),
    rows: v.array(
      v.object({
        leaseName: v.string(),
        unit: v.optional(v.string()),
        pastDueAmount: v.number(),
        lastPaymentDate: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const property = await ctx.db
      .query("properties")
      .withIndex("by_code", (q) => q.eq("code", args.propertyCode))
      .first();
    if (!property) throw new Error(`Unknown property code: ${args.propertyCode}`);

    const tenants = await ctx.db
      .query("tenants")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", property._id).eq("isLatest", true)
      )
      .collect();

    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/[.,]/g, " ")
        .replace(/\b(llc|inc|corp|co|ltd|llp)\b\.?/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const byName: Record<string, { pastDueAmount: number; lastPaymentDate?: string }> = {};
    for (const r of args.rows) {
      byName[norm(r.leaseName)] = {
        pastDueAmount: r.pastDueAmount,
        lastPaymentDate: r.lastPaymentDate,
      };
    }

    let matched = 0;
    let cleared = 0;
    for (const t of tenants) {
      const key = norm(t.tenant || "");
      const hit = byName[key];
      const newAmount = hit?.pastDueAmount ?? 0;
      const newStatus =
        newAmount > 0 ? "past_due" : (t.status === "past_due" ? "current" : t.status);
      const patch: any = {
        pastDueAmount: newAmount,
        status: newStatus,
      };
      if (hit?.lastPaymentDate) patch.lastPaymentDate = hit.lastPaymentDate;
      await ctx.db.patch(t._id, patch);
      if (hit) matched++;
      else if ((t.pastDueAmount || 0) > 0) cleared++;
    }

    return {
      propertyId: property._id,
      tenants: tenants.length,
      matched,
      cleared,
      pastDueRows: args.rows.length,
    };
  },
});

/**
 * Re-derive past-due amounts from the *latest* receivable_details snapshot
 * already in Convex, then re-apply via the same logic as applyPastDueByCode.
 * This is the safety net for syncs that ingested rent-roll-full WITHOUT a
 * fresh receivable_detail (which would otherwise wipe past-due to 0 because
 * bulkReplaceTenants writes pastDueAmount: 0 for new rows).
 *
 * Aggregates per tenantName: sum of `balance` from receivable_details — that's
 * the running AR balance. Treats positive balances as past-due.
 */
export const recomputePastDueFromAR = mutation({
  args: { propertyCode: v.string() },
  handler: async (ctx, args) => {
    const property = await ctx.db
      .query("properties")
      .withIndex("by_code", (q) => q.eq("code", args.propertyCode))
      .first();
    if (!property) return { propertyId: null, applied: 0, skipped: "unknown_property" };

    // Pull every receivable_details row for the property in one shot. The
    // table is small per property (typically <200 rows) so a full scan is
    // fine; .order("desc").take(2000) bounds the worst case.
    const rd = await ctx.db
      .query("receivable_details")
      .withIndex("by_property", (q) => q.eq("propertyId", property._id))
      .order("desc")
      .take(2000);

    if (rd.length === 0) return { propertyId: property._id, applied: 0, skipped: "no_receivable_details" };

    // Aggregate balance per tenant. Use the latest postMonth's running balance.
    // Receivable detail rows already represent end-of-month state per tenant,
    // so we sum balances grouped by (tenantName, postMonth) and pick the most
    // recent month's total per tenant.
    const byTenant = new Map<string, { latestMonth: string; balance: number; unit?: string }>();
    for (const row of rd) {
      const tenant = row.tenantName || "";
      if (!tenant) continue;
      const month = row.postMonth || "";
      const cur = byTenant.get(tenant);
      if (!cur || month > cur.latestMonth) {
        byTenant.set(tenant, { latestMonth: month, balance: row.balance || 0, unit: row.unit });
      } else if (month === cur.latestMonth) {
        cur.balance += row.balance || 0;
      }
    }

    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/[.,]/g, " ")
        .replace(/\b(llc|inc|corp|co|ltd|llp)\b\.?/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const tenants = await ctx.db
      .query("tenants")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", property._id).eq("isLatest", true)
      )
      .collect();

    const byName = new Map<string, number>();
    byTenant.forEach((v, k) => byName.set(norm(k), Math.max(0, v.balance)));

    let applied = 0;
    for (const t of tenants) {
      const key = norm(t.tenant || "");
      const newAmount = byName.get(key) ?? 0;
      const newStatus = newAmount > 0 ? "past_due" : (t.status === "past_due" ? "current" : t.status);
      await ctx.db.patch(t._id, { pastDueAmount: newAmount, status: newStatus });
      if (newAmount > 0) applied++;
    }

    return { propertyId: property._id, applied, tenantsScanned: tenants.length };
  },
});

/**
 * Enrich the latest tenants snapshot with monthly rent + lease start +
 * security deposit pulled from the full Commercial Rent Roll report. The
 * dashboard "Current Leases" panel doesn't carry these fields, so we get them
 * from the proper rent roll and merge them in.
 *
 * Match strategy: unit first (cheapest, exact), then lease-name fallback.
 * Numbers only overwrite when the new value is non-zero so we don't blank
 * existing values when the rent-roll-full source omits a field.
 */
export const enrichRentByCode = mutation({
  args: {
    propertyCode: v.string(),
    rows: v.array(
      v.object({
        unit: v.string(),
        tenant: v.optional(v.string()),
        monthlyRent: v.optional(v.number()),
        monthlyElectric: v.optional(v.number()),
        securityDeposit: v.optional(v.number()),
        leaseFrom: v.optional(v.string()),
        leaseTo: v.optional(v.string()),
        leaseType: v.optional(v.string()),
        sqft: v.optional(v.number()),
        // Show Detail rent roll fields
        leaseTermMonths: v.optional(v.number()),
        monthlyRentPerSF: v.optional(v.number()),
        annualRent: v.optional(v.number()),
        annualRentPerSF: v.optional(v.number()),
        annualRecPerSF: v.optional(v.number()),
        annualMiscPerSF: v.optional(v.number()),
        locAmount: v.optional(v.number()),
        // Tenancy Schedule fields — next scheduled rent step.
        nextRentIncrease: v.optional(v.string()),
        nextRentIncreaseAmount: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const property = await ctx.db
      .query("properties")
      .withIndex("by_code", (q) => q.eq("code", args.propertyCode))
      .first();
    if (!property) throw new Error(`Unknown property code: ${args.propertyCode}`);

    const tenants = await ctx.db
      .query("tenants")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", property._id).eq("isLatest", true)
      )
      .collect();

    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/[.,]/g, " ")
        .replace(/\b(llc|inc|corp|co|ltd|llp)\b\.?/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const byUnit: Record<string, (typeof args.rows)[number]> = {};
    const byTenant: Record<string, (typeof args.rows)[number]> = {};
    for (const r of args.rows) {
      if (r.unit) byUnit[r.unit.trim().toLowerCase()] = r;
      if (r.tenant) byTenant[norm(r.tenant)] = r;
    }

    let matched = 0;
    for (const t of tenants) {
      const key = (t.unit || "").trim().toLowerCase();
      const tkey = norm(t.tenant || "");
      const hit = byUnit[key] || byTenant[tkey];
      if (!hit) continue;
      const patch: any = {};
      if (typeof hit.monthlyRent === "number" && hit.monthlyRent > 0) patch.monthlyRent = hit.monthlyRent;
      if (typeof hit.monthlyElectric === "number" && hit.monthlyElectric > 0) patch.monthlyElectric = hit.monthlyElectric;
      if (typeof hit.securityDeposit === "number" && hit.securityDeposit > 0) patch.securityDeposit = hit.securityDeposit;
      if (hit.leaseFrom && hit.leaseFrom.trim()) patch.leaseFrom = hit.leaseFrom;
      if (hit.leaseTo && hit.leaseTo.trim()) patch.leaseTo = hit.leaseTo;
      if (hit.leaseType && hit.leaseType.trim() && (!t.leaseType || t.leaseType.trim() === "")) {
        patch.leaseType = hit.leaseType;
      }
      if (typeof hit.sqft === "number" && hit.sqft > 0 && (!t.sqft || t.sqft === 0)) {
        patch.sqft = hit.sqft;
      }
      // Show Detail rent roll fields — write whenever the source has them.
      if (typeof hit.leaseTermMonths === "number" && hit.leaseTermMonths > 0) patch.leaseTermMonths = hit.leaseTermMonths;
      if (typeof hit.monthlyRentPerSF === "number" && hit.monthlyRentPerSF > 0) patch.monthlyRentPerSF = hit.monthlyRentPerSF;
      if (typeof hit.annualRent === "number" && hit.annualRent > 0) patch.annualRent = hit.annualRent;
      if (typeof hit.annualRentPerSF === "number" && hit.annualRentPerSF > 0) patch.annualRentPerSF = hit.annualRentPerSF;
      if (typeof hit.annualRecPerSF === "number" && hit.annualRecPerSF > 0) patch.annualRecPerSF = hit.annualRecPerSF;
      if (typeof hit.annualMiscPerSF === "number" && hit.annualMiscPerSF > 0) patch.annualMiscPerSF = hit.annualMiscPerSF;
      if (typeof hit.locAmount === "number" && hit.locAmount > 0) patch.locAmount = hit.locAmount;
      // Tenancy Schedule fields — write whenever present. These are sparse
      // (only leases with a future step have them) so missing source value
      // means "no scheduled bump" not "preserve old value" — we leave the
      // tenant's existing value alone in that case.
      if (hit.nextRentIncrease && hit.nextRentIncrease.trim()) patch.nextRentIncrease = hit.nextRentIncrease;
      if (typeof hit.nextRentIncreaseAmount === "number" && hit.nextRentIncreaseAmount > 0) {
        patch.nextRentIncreaseAmount = hit.nextRentIncreaseAmount;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(t._id, patch);
        matched++;
      }
    }

    return {
      propertyId: property._id,
      tenants: tenants.length,
      matched,
      enrichmentRows: args.rows.length,
    };
  },
});

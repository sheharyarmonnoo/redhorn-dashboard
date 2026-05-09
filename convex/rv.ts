import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";

// ---------- Upload window gating ----------
// Rule: a period (YYYY-MM) can be uploaded only after it has fully ended —
// i.e. uploadable iff period < current calendar month. So on May 9 Max can
// upload Jan/Feb/Mar/Apr 2026, but not May 2026 (still in progress). This
// matches the "disabled until the 1st" intent: the May bundle becomes
// uploadable on June 1. Re-uploads for a prior period are allowed (replace
// semantics) so Max can fix mistakes himself without an admin override.
function isoMonth(ts: number) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isPeriodUploadable(period: string, nowMs: number): boolean {
  if (!/^\d{4}-\d{2}$/.test(period)) return false;
  return period < isoMonth(nowMs);
}

export const getCurrentWindow = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const currentMonth = isoMonth(now);
    const committed = await ctx.db
      .query("rv_upload_bundles")
      .withIndex("by_property_status", (q) =>
        q.eq("propertyId", args.propertyId).eq("status", "committed"),
      )
      .collect();
    const lastCommitted = committed
      .filter((b) => b.committedAt !== undefined)
      .sort((a, b) => (b.committedAt || 0) - (a.committedAt || 0))[0];

    const draft = await ctx.db
      .query("rv_upload_bundles")
      .withIndex("by_property_status", (q) =>
        q.eq("propertyId", args.propertyId).eq("status", "draft"),
      )
      .first();

    const committedPeriods = committed.map((b) => b.period).sort();

    return {
      currentMonth,
      committedPeriods,
      lastCommitted: lastCommitted
        ? {
            id: lastCommitted._id,
            period: lastCommitted.period,
            committedAt: lastCommitted.committedAt,
            committedBy: lastCommitted.committedBy,
          }
        : null,
      draft: draft
        ? {
            id: draft._id,
            period: draft.period,
            files: draft.files,
            createdAt: draft.createdAt,
            isPeriodValid: isPeriodUploadable(draft.period, now),
          }
        : null,
    };
  },
});

export const listBundles = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("rv_upload_bundles")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect();
    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },
});

// Most recent committed bundle for a property — drives the "Last updated"
// subtitle that appears on RV-park pages so the user always knows how
// fresh the manually-uploaded data is.
export const latestBundleForProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const bundles = await ctx.db
      .query("rv_upload_bundles")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect();
    const committed = bundles.filter((b) => b.status === "committed");
    if (committed.length === 0) return null;
    committed.sort((a, b) => (b.committedAt || 0) - (a.committedAt || 0));
    const latest = committed[0];
    return {
      committedAt: latest.committedAt || null,
      committedBy: latest.committedBy || null,
      period: latest.period,
      bundleId: latest._id,
    };
  },
});

// Cross-property feed for the Data Pipeline page — every committed bundle
// across the portfolio so RV park's monthly uploads appear in the same
// file-history grid as Yardi sync jobs. Joins each bundle to its property
// name so the grid's Property column populates without a second lookup.
export const listAllCommittedBundles = query({
  args: {},
  handler: async (ctx) => {
    const bundles = await ctx.db.query("rv_upload_bundles").collect();
    const committed = bundles.filter((b) => b.status === "committed");
    if (committed.length === 0) return [];
    const properties = await ctx.db.query("properties").collect();
    const propById = new Map(properties.map((p) => [p._id as string, p]));
    return committed
      .map((b) => ({
        ...b,
        propertyName: propById.get(b.propertyId as unknown as string)?.name || "",
        propertyCode: propById.get(b.propertyId as unknown as string)?.code || "",
      }))
      .sort((a, b) => (b.committedAt || 0) - (a.committedAt || 0));
  },
});

// ---------- File staging ----------
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

// Heuristic: detect what kind of file this is from the filename. Used to
// route the file to the correct parser. Falls back to "unknown" if nothing
// matches; the user can fix the type in the UI before committing.
function detectFileType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("rent roll")) return "rentRoll";
  if (n.includes("guests with balance") || n.includes("guest balance")) return "balances";
  if (n.includes("pos category") || (n.includes("pos") && n.includes("sales"))) return "pos";
  if (n.includes("total payment") || n.includes("payment summary")) return "payments";
  if (n.includes("financial package") || n.endsWith(".xlsx") || n.endsWith(".xls")) {
    return "financial";
  }
  return "unknown";
}

// Auto-detect period (YYYY-MM) from filename. POS/payments have explicit
// 20260401-20260430 ranges; financial package says "March". Falls back to
// previous calendar month if nothing matches — the UI lets the user override.
function detectPeriodFromFilename(name: string): string | null {
  const m1 = name.match(/(\d{4})(\d{2})\d{2}-\d{8}/);
  if (m1) return `${m1[1]}-${m1[2]}`;
  const m2 = name.match(/(\d{4})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  const months = [
    "january","february","march","april","may","june",
    "july","august","september","october","november","december",
  ];
  const lower = name.toLowerCase();
  for (let i = 0; i < months.length; i++) {
    if (lower.includes(months[i])) {
      const yearMatch = name.match(/(20\d{2})/);
      if (yearMatch) return `${yearMatch[1]}-${String(i + 1).padStart(2, "0")}`;
    }
  }
  return null;
}

export const stageFile = mutation({
  args: {
    propertyId: v.id("properties"),
    storageId: v.id("_storage"),
    name: v.string(),
    size: v.number(),
    uploadedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let draft = await ctx.db
      .query("rv_upload_bundles")
      .withIndex("by_property_status", (q) =>
        q.eq("propertyId", args.propertyId).eq("status", "draft"),
      )
      .first();

    const detectedPeriod = detectPeriodFromFilename(args.name);
    const fileEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      storageId: args.storageId,
      name: args.name,
      size: args.size,
      fileType: detectFileType(args.name),
      uploadedAt: Date.now(),
    };

    if (!draft) {
      const id = await ctx.db.insert("rv_upload_bundles", {
        propertyId: args.propertyId,
        period: detectedPeriod || isoMonth(Date.now()),
        status: "draft",
        files: [fileEntry],
        uploadedBy: args.uploadedBy,
        createdAt: Date.now(),
      });
      return { bundleId: id, file: fileEntry };
    }

    const period = draft.period || detectedPeriod || isoMonth(Date.now());
    await ctx.db.patch(draft._id, {
      files: [...draft.files, fileEntry],
      period,
      uploadedBy: draft.uploadedBy || args.uploadedBy,
    });
    return { bundleId: draft._id, file: fileEntry };
  },
});

export const removeStagedFile = mutation({
  args: { bundleId: v.id("rv_upload_bundles"), fileId: v.string() },
  handler: async (ctx, args) => {
    const bundle = await ctx.db.get(args.bundleId);
    if (!bundle || bundle.status !== "draft") return;
    const file = bundle.files.find((f) => f.id === args.fileId);
    const next = bundle.files.filter((f) => f.id !== args.fileId);
    await ctx.db.patch(args.bundleId, { files: next });
    if (file) {
      try {
        await ctx.storage.delete(file.storageId);
      } catch {
        /* non-fatal */
      }
    }
    if (next.length === 0) {
      await ctx.db.delete(args.bundleId);
    }
  },
});

export const updateDraftFileType = mutation({
  args: {
    bundleId: v.id("rv_upload_bundles"),
    fileId: v.string(),
    fileType: v.string(),
  },
  handler: async (ctx, args) => {
    const bundle = await ctx.db.get(args.bundleId);
    if (!bundle || bundle.status !== "draft") return;
    const next = bundle.files.map((f) =>
      f.id === args.fileId ? { ...f, fileType: args.fileType } : f,
    );
    await ctx.db.patch(args.bundleId, { files: next });
  },
});

export const updateDraftPeriod = mutation({
  args: { bundleId: v.id("rv_upload_bundles"), period: v.string() },
  handler: async (ctx, args) => {
    const bundle = await ctx.db.get(args.bundleId);
    if (!bundle || bundle.status !== "draft") return;
    if (!/^\d{4}-\d{2}$/.test(args.period)) {
      throw new Error("Period must be YYYY-MM");
    }
    await ctx.db.patch(args.bundleId, { period: args.period });
  },
});

export const cancelDraft = mutation({
  args: { bundleId: v.id("rv_upload_bundles") },
  handler: async (ctx, args) => {
    const bundle = await ctx.db.get(args.bundleId);
    if (!bundle || bundle.status !== "draft") return;
    for (const f of bundle.files) {
      try {
        await ctx.storage.delete(f.storageId);
      } catch {
        /* non-fatal */
      }
    }
    await ctx.db.delete(args.bundleId);
  },
});

// ---------- Internal helpers used by the parser action ----------
export const _getBundle = internalQuery({
  args: { bundleId: v.id("rv_upload_bundles") },
  handler: async (ctx, args) => ctx.db.get(args.bundleId),
});

export const _checkPeriodUploadable = internalQuery({
  args: { propertyId: v.id("properties"), period: v.string() },
  handler: async (_ctx, args) => {
    const now = Date.now();
    return {
      currentMonth: isoMonth(now),
      isUploadable: isPeriodUploadable(args.period, now),
    };
  },
});

// When committing a bundle for period X, look up any prior committed bundle
// for the same (propertyId, period). If one exists, return its id + the
// rows it inserted so the action can wipe them before inserting fresh.
export const _findPriorBundleForPeriod = internalQuery({
  args: { propertyId: v.id("properties"), period: v.string(), excludeBundleId: v.id("rv_upload_bundles") },
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("rv_upload_bundles")
      .withIndex("by_property_period", (q) =>
        q.eq("propertyId", args.propertyId).eq("period", args.period),
      )
      .collect();
    return matches
      .filter((b) => b._id !== args.excludeBundleId && b.status === "committed")
      .map((b) => ({ id: b._id, files: b.files, committedAt: b.committedAt }));
  },
});

// Wipe the row inserts a prior bundle made. Annual scale stays small (a few
// hundred rows per file × 12 months), so a full-table scan is acceptable.
// If RV park scale grows, swap to a by_bundle index per table.
export const _deleteRowsForBundle = internalMutation({
  args: { bundleId: v.id("rv_upload_bundles") },
  handler: async (ctx, args) => {
    const tables = [
      "rv_reservations",
      "rv_balances",
      "rv_payments",
      "rv_financials",
      "rv_pos_sales",
    ] as const;
    for (const t of tables) {
      const all = await ctx.db.query(t).collect();
      for (const r of all) {
        if ((r as any).bundleId === args.bundleId) {
          await ctx.db.delete(r._id);
        }
      }
    }
  },
});

export const _deleteBundle = internalMutation({
  args: { bundleId: v.id("rv_upload_bundles") },
  handler: async (ctx, args) => {
    const bundle = await ctx.db.get(args.bundleId);
    if (!bundle) return;
    for (const f of bundle.files) {
      try {
        await ctx.storage.delete(f.storageId);
      } catch {
        /* non-fatal */
      }
    }
    await ctx.db.delete(args.bundleId);
  },
});

export const _patchBundlePeriod = internalMutation({
  args: { bundleId: v.id("rv_upload_bundles"), period: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.bundleId, { period: args.period });
  },
});

export const _markFileParsed = internalMutation({
  args: {
    bundleId: v.id("rv_upload_bundles"),
    fileId: v.string(),
    rowsParsed: v.optional(v.number()),
    parseError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const bundle = await ctx.db.get(args.bundleId);
    if (!bundle) return;
    const next = bundle.files.map((f) =>
      f.id === args.fileId
        ? { ...f, rowsParsed: args.rowsParsed, parseError: args.parseError }
        : f,
    );
    await ctx.db.patch(args.bundleId, { files: next });
  },
});

export const _flipLatestForBundle = internalMutation({
  args: {
    propertyId: v.id("properties"),
    bundleId: v.id("rv_upload_bundles"),
    period: v.string(),
  },
  handler: async (ctx, args) => {
    // Mark prior "isLatest" rows as historical for any table whose newly-
    // committed bundle covers a more recent period. We keep all snapshots —
    // just toggle the latest pointer.
    const tables = [
      "rv_reservations",
      "rv_balances",
      "rv_payments",
      "rv_financials",
      "rv_pos_sales",
    ] as const;
    for (const table of tables) {
      const latest = await ctx.db
        .query(table)
        .withIndex("by_property_latest", (q) =>
          q.eq("propertyId", args.propertyId).eq("isLatest", true),
        )
        .collect();
      for (const row of latest) {
        // Older rows stay flagged latest until a NEWER period replaces them.
        if (row.snapshotPeriod < args.period) {
          await ctx.db.patch(row._id, { isLatest: false });
        }
      }
    }
  },
});

export const _commitBundleStatus = internalMutation({
  args: {
    bundleId: v.id("rv_upload_bundles"),
    committedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const bundle = await ctx.db.get(args.bundleId);
    await ctx.db.patch(args.bundleId, {
      status: "committed",
      committedAt: Date.now(),
      committedBy: args.committedBy,
    });
    // Flip property.hasData=true on the RV park's first successful commit so
    // the sidebar's "No data" badge clears. Commercial properties get this
    // via incomeLines.upsert; RV's never wrote it because RV financials
    // live in rv_financials, not income_lines.
    if (bundle?.propertyId) {
      const property = await ctx.db.get(bundle.propertyId);
      if (property && !property.hasData) {
        await ctx.db.patch(bundle.propertyId, { hasData: true });
      }
    }
  },
});

export const _bulkInsertReservations = internalMutation({
  args: { rows: v.array(v.any()) },
  handler: async (ctx, args) => {
    for (const r of args.rows) await ctx.db.insert("rv_reservations", r);
  },
});

export const _bulkInsertBalances = internalMutation({
  args: { rows: v.array(v.any()) },
  handler: async (ctx, args) => {
    for (const r of args.rows) await ctx.db.insert("rv_balances", r);
  },
});

export const _bulkInsertPos = internalMutation({
  args: { rows: v.array(v.any()) },
  handler: async (ctx, args) => {
    for (const r of args.rows) await ctx.db.insert("rv_pos_sales", r);
  },
});

export const _bulkInsertPayments = internalMutation({
  args: { rows: v.array(v.any()) },
  handler: async (ctx, args) => {
    for (const r of args.rows) await ctx.db.insert("rv_payments", r);
  },
});

export const _bulkInsertFinancials = internalMutation({
  args: { rows: v.array(v.any()) },
  handler: async (ctx, args) => {
    for (const r of args.rows) await ctx.db.insert("rv_financials", r);
  },
});

export const _upsertSites = internalMutation({
  args: {
    propertyId: v.id("properties"),
    sites: v.array(
      v.object({
        siteCode: v.string(),
        displayName: v.string(),
        siteType: v.string(),
        siteClass: v.optional(v.string()),
        snapshotDate: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const s of args.sites) {
      const existing = await ctx.db
        .query("rv_sites")
        .withIndex("by_property_code", (q) =>
          q.eq("propertyId", args.propertyId).eq("siteCode", s.siteCode),
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          displayName: s.displayName,
          siteType: s.siteType,
          siteClass: s.siteClass,
          lastSeen: s.snapshotDate,
        });
      } else {
        await ctx.db.insert("rv_sites", {
          propertyId: args.propertyId,
          siteCode: s.siteCode,
          displayName: s.displayName,
          siteType: s.siteType,
          siteClass: s.siteClass,
          firstSeen: s.snapshotDate,
          lastSeen: s.snapshotDate,
        });
      }
    }
  },
});

// ---------- Public read queries (RV park views consume these) ----------
export const listLatestReservations = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) =>
    await ctx.db
      .query("rv_reservations")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", args.propertyId).eq("isLatest", true),
      )
      .collect(),
});

export const listLatestBalances = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) =>
    await ctx.db
      .query("rv_balances")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", args.propertyId).eq("isLatest", true),
      )
      .collect(),
});

export const listLatestPos = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) =>
    await ctx.db
      .query("rv_pos_sales")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", args.propertyId).eq("isLatest", true),
      )
      .collect(),
});

export const listLatestPayments = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) =>
    await ctx.db
      .query("rv_payments")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", args.propertyId).eq("isLatest", true),
      )
      .collect(),
});

export const listFinancials = query({
  args: { propertyId: v.id("properties"), kind: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.kind) {
      return await ctx.db
        .query("rv_financials")
        .withIndex("by_property_kind_latest", (q) =>
          q.eq("propertyId", args.propertyId).eq("kind", args.kind!).eq("isLatest", true),
        )
        .collect();
    }
    return await ctx.db
      .query("rv_financials")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", args.propertyId).eq("isLatest", true),
      )
      .collect();
  },
});

export const listSites = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) =>
    await ctx.db
      .query("rv_sites")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect(),
});

// Distinct months (YYYY-MM) for which a financial package has been ingested.
// Powers the Period dropdown on the IS / Budget vs Actuals tabs so the user
// can pick which historical snapshot to view.
export const listFinancialPeriods = query({
  args: { propertyId: v.id("properties"), kind: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("rv_financials")
      .withIndex("by_property_period", (q) => q.eq("propertyId", args.propertyId))
      .collect();
    const set = new Set<string>();
    for (const r of rows) {
      if (args.kind && r.kind !== args.kind) continue;
      if (r.snapshotPeriod) set.add(r.snapshotPeriod);
    }
    return Array.from(set).sort();
  },
});

// Pull a specific historical snapshot of financial rows for the period the
// user picked. Falls back to the latest snapshot when `period` is omitted so
// existing callers keep their behavior.
export const listFinancialsForPeriod = query({
  args: {
    propertyId: v.id("properties"),
    period: v.optional(v.string()),
    kind: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.period) {
      const rows = await ctx.db
        .query("rv_financials")
        .withIndex("by_property_period", (q) =>
          q.eq("propertyId", args.propertyId).eq("snapshotPeriod", args.period!),
        )
        .collect();
      return args.kind ? rows.filter((r) => r.kind === args.kind) : rows;
    }
    if (args.kind) {
      return await ctx.db
        .query("rv_financials")
        .withIndex("by_property_kind_latest", (q) =>
          q.eq("propertyId", args.propertyId).eq("kind", args.kind!).eq("isLatest", true),
        )
        .collect();
    }
    return await ctx.db
      .query("rv_financials")
      .withIndex("by_property_latest", (q) =>
        q.eq("propertyId", args.propertyId).eq("isLatest", true),
      )
      .collect();
  },
});

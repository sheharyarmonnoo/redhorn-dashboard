import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// ===== VPS DATA INGESTION ENDPOINTS =====

// POST /api/sync/start — VPS calls this to create a sync job before pushing data
http.route({
  path: "/api/sync/start",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const id = await ctx.runMutation(api.syncJobs.create, {
      source: body.source || "n8n",
      propertyCode: body.propertyCode,
      reportTypes: body.reportTypes,
    });
    return new Response(JSON.stringify({ syncJobId: id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /api/sync/complete — VPS calls this when done
http.route({
  path: "/api/sync/complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    await ctx.runMutation(api.syncJobs.complete, {
      id: body.syncJobId,
      status: body.status || "completed",
      recordsCreated: body.recordsCreated || 0,
      errorMessage: body.errorMessage,
      anomalies: body.anomalies,
    });
    // Log to activity
    await ctx.runMutation(api.activityLog.log, {
      type: "sync",
      description: `Yardi sync ${body.status || "completed"} — ${body.recordsCreated || 0} records (${body.propertyCode || "all"})`,
      user: "System",
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /api/ingest/tenants — VPS pushes parsed tenant/lease data
http.route({
  path: "/api/ingest/tenants",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    // body: { propertyCode, snapshotDate, syncJobId?, tenants: [...] }
    const prop = await ctx.runQuery(api.properties.getByCode, { code: body.propertyCode });
    if (!prop) {
      return new Response(JSON.stringify({ error: "Property not found" }), { status: 404 });
    }

    // Mark old tenants as not latest
    const oldTenants = await ctx.runQuery(api.tenants.listByProperty, { propertyId: prop._id });
    for (const t of oldTenants) {
      await ctx.runMutation(api.tenants.markNotLatest, { id: t._id });
    }

    // Insert new tenant records
    let count = 0;
    for (const t of body.tenants) {
      await ctx.runMutation(api.tenants.insertOne, {
        propertyId: prop._id,
        unit: t.unit,
        building: t.building || t.unit.charAt(0),
        tenant: t.tenant || "",
        leaseType: t.leaseType || "Office Gross Lease",
        sqft: t.sqft || 0,
        leaseFrom: t.leaseFrom || "",
        leaseTo: t.leaseTo || "",
        monthlyRent: t.monthlyRent || 0,
        monthlyElectric: t.monthlyElectric || 0,
        securityDeposit: t.securityDeposit || 0,
        status: t.status || "current",
        pastDueAmount: t.pastDueAmount || 0,
        electricPosted: t.electricPosted ?? true,
        lastPaymentDate: t.lastPaymentDate || "",
        notes: t.notes,
        delinquencyStage: t.delinquencyStage,
        delinquencyDate: t.delinquencyDate,
        snapshotDate: body.snapshotDate || new Date().toISOString().slice(0, 10),
        isLatest: true,
      });
      count++;
    }

    return new Response(JSON.stringify({ inserted: count }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /api/ingest/aging — VPS pushes parsed aging data
http.route({
  path: "/api/ingest/aging",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const prop = await ctx.runQuery(api.properties.getByCode, { code: body.propertyCode });
    if (!prop) {
      return new Response(JSON.stringify({ error: "Property not found" }), { status: 404 });
    }

    // Mark old aging records as not latest
    const old = await ctx.runQuery(api.agingRecords.listByProperty, { propertyId: prop._id });
    for (const r of old) {
      await ctx.runMutation(api.agingRecords.markNotLatest, { id: r._id });
    }

    let count = 0;
    for (const r of body.records) {
      await ctx.runMutation(api.agingRecords.insert, {
        propertyId: prop._id,
        tenantName: r.tenantName,
        leaseCode: r.leaseCode,
        currentOwed: r.currentOwed || 0,
        days0_30: r.days0_30 || 0,
        days31_60: r.days31_60 || 0,
        days61_90: r.days61_90 || 0,
        over90: r.over90 || 0,
        prepayments: r.prepayments || 0,
        totalOwed: r.totalOwed || 0,
        snapshotDate: body.snapshotDate || new Date().toISOString().slice(0, 10),
        isLatest: true,
      });
      count++;
    }

    return new Response(JSON.stringify({ inserted: count }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /api/ingest/revenue — VPS pushes monthly revenue summary
http.route({
  path: "/api/ingest/revenue",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const prop = await ctx.runQuery(api.properties.getByCode, { code: body.propertyCode });
    if (!prop) {
      return new Response(JSON.stringify({ error: "Property not found" }), { status: 404 });
    }

    await ctx.runMutation(api.monthlyRevenue.upsert, {
      propertyId: prop._id,
      month: body.month,
      rent: body.rent || 0,
      cam: body.cam || 0,
      electric: body.electric || 0,
      lateFees: body.lateFees || 0,
      total: body.total || 0,
      occupancy: body.occupancy || 0,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /api/ingest/alerts — VPS pushes anomaly alerts from Claude analysis
http.route({
  path: "/api/ingest/alerts",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const prop = body.propertyCode
      ? await ctx.runQuery(api.properties.getByCode, { code: body.propertyCode })
      : null;

    let count = 0;
    for (const a of body.alerts) {
      await ctx.runMutation(api.alerts.create, {
        propertyId: prop?._id,
        alertType: a.alertType || a.type,
        severity: a.severity,
        title: a.title,
        body: a.body || a.detail,
        aiAnalysis: a.aiAnalysis || a.analysis,
        status: "new",
        unit: a.unit,
        date: a.date || new Date().toISOString(),
      });
      count++;
    }

    return new Response(JSON.stringify({ inserted: count }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// GET /api/sync/status — VPS or n8n can check last sync status
http.route({
  path: "/api/sync/status",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const jobs = await ctx.runQuery(api.syncJobs.list);
    const latest = jobs[0] || null;
    return new Response(JSON.stringify({ latest }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;

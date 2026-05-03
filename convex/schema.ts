import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ===== PROPERTIES =====
  properties: defineTable({
    code: v.string(),
    name: v.string(),
    location: v.string(),
    sqft: v.optional(v.string()),
    propertyType: v.optional(v.string()),
    hasData: v.boolean(),
    sitePlanSvg: v.optional(v.string()),
    isActive: v.boolean(),
  }).index("by_code", ["code"]),

  // ===== UNITS (physical attributes) =====
  units: defineTable({
    propertyId: v.id("properties"),
    unit: v.string(),
    building: v.string(),
    sqft: v.number(),
    amps: v.number(),
    hasBathroom: v.boolean(),
    hasOffice: v.boolean(),
    hasLoadingDock: v.boolean(),
    ceilingHeight: v.number(),
    hvacType: v.string(),
    makeReady: v.boolean(),
    splittable: v.boolean(),
    splitDetail: v.optional(v.string()),
    lastRenovation: v.optional(v.string()),
  })
    .index("by_property", ["propertyId"])
    .index("by_unit", ["propertyId", "unit"]),

  // ===== MAINTENANCE LOG =====
  maintenance_log: defineTable({
    unitId: v.id("units"),
    propertyId: v.id("properties"),
    date: v.string(),
    type: v.string(),
    description: v.string(),
    cost: v.optional(v.number()),
    vendor: v.optional(v.string()),
    status: v.string(),
  }).index("by_unit", ["unitId"]),

  // ===== TENANTS / LEASES =====
  tenants: defineTable({
    syncId: v.optional(v.id("sync_jobs")),
    propertyId: v.id("properties"),
    unitId: v.optional(v.id("units")),
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
  })
    .index("by_property_latest", ["propertyId", "isLatest"])
    .index("by_sync", ["syncId"])
    .index("by_unit", ["propertyId", "unit", "isLatest"]),

  // ===== AGING RECORDS =====
  aging_records: defineTable({
    syncId: v.optional(v.id("sync_jobs")),
    propertyId: v.id("properties"),
    tenantName: v.string(),
    leaseCode: v.optional(v.string()),
    currentOwed: v.number(),
    days0_30: v.number(),
    days31_60: v.number(),
    days61_90: v.number(),
    over90: v.number(),
    prepayments: v.number(),
    totalOwed: v.number(),
    snapshotDate: v.string(),
    isLatest: v.boolean(),
  })
    .index("by_property_latest", ["propertyId", "isLatest"])
    .index("by_sync", ["syncId"]),

  // ===== RECEIVABLE DETAILS =====
  receivable_details: defineTable({
    syncId: v.optional(v.id("sync_jobs")),
    propertyId: v.id("properties"),
    tenantName: v.string(),
    controlNumber: v.optional(v.string()),
    transactionDate: v.optional(v.string()),
    postMonth: v.optional(v.string()),
    chargeCode: v.optional(v.string()),
    charges: v.number(),
    receipts: v.number(),
    balance: v.number(),
    notes: v.optional(v.string()),
  })
    .index("by_property", ["propertyId"])
    .index("by_sync", ["syncId"]),

  // ===== INCOME STATEMENT LINES =====
  income_lines: defineTable({
    syncId: v.optional(v.id("sync_jobs")),
    propertyId: v.id("properties"),
    lineItem: v.string(),
    hierarchyLevel: v.number(),
    parentLine: v.optional(v.string()),
    currentPeriod: v.number(),
    yearToDate: v.number(),
    sinceInception: v.optional(v.number()),
    snapshotDate: v.string(),
    isLatest: v.boolean(),
  })
    .index("by_property_latest", ["propertyId", "isLatest"])
    .index("by_sync", ["syncId"]),

  // ===== LEDGER ENTRIES =====
  ledger_entries: defineTable({
    propertyId: v.id("properties"),
    unit: v.string(),
    date: v.string(),
    description: v.string(),
    charge: v.number(),
    payment: v.number(),
    balance: v.number(),
    type: v.string(),
    syncId: v.optional(v.id("sync_jobs")),
  }).index("by_unit", ["propertyId", "unit"]),

  // ===== MONTHLY REVENUE =====
  monthly_revenue: defineTable({
    propertyId: v.id("properties"),
    month: v.string(),
    rent: v.number(),
    cam: v.number(),
    electric: v.number(),
    lateFees: v.number(),
    total: v.number(),
    occupancy: v.number(),
  })
    .index("by_property", ["propertyId"])
    .index("by_month", ["propertyId", "month"]),

  // ===== SYNC JOBS =====
  sync_jobs: defineTable({
    source: v.string(),
    propertyCode: v.optional(v.string()),
    status: v.string(),
    reportTypes: v.optional(v.array(v.string())),
    recordsCreated: v.number(),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    files: v.optional(v.array(v.object({
      storageId: v.id("_storage"),
      fileName: v.string(),
      reportType: v.string(),
      rowsIngested: v.optional(v.number()),
    }))),
    anomalies: v.optional(v.array(v.object({
      type: v.string(),
      severity: v.string(),
      title: v.string(),
      detail: v.string(),
    }))),
  })
    .index("by_status", ["status"])
    .index("by_property", ["propertyCode"]),

  // ===== ALERTS =====
  alerts: defineTable({
    propertyId: v.optional(v.id("properties")),
    alertType: v.string(),
    severity: v.string(),
    title: v.string(),
    body: v.string(),
    aiAnalysis: v.optional(v.string()),
    dataContext: v.optional(v.any()),
    status: v.string(),
    resolvedAt: v.optional(v.string()),
    resolvedBy: v.optional(v.string()),
    unit: v.optional(v.string()),
    date: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_property", ["propertyId", "status"]),

  // ===== ACTION ITEMS =====
  action_items: defineTable({
    propertyId: v.optional(v.id("properties")),
    text: v.string(),
    column: v.string(),
    priority: v.string(),
    unit: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
    createdAt: v.string(),
  }).index("by_column", ["column"]),

  // ===== DELINQUENT CASES =====
  delinquent_cases: defineTable({
    propertyId: v.id("properties"),
    unitId: v.optional(v.id("units")),
    unit: v.string(),
    tenantName: v.string(),
    amountOwed: v.number(),
    stage: v.string(),
    stageEnteredAt: v.string(),
    deadline: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.boolean(),
    history: v.optional(v.array(v.object({
      fromStage: v.optional(v.string()),
      toStage: v.string(),
      changedBy: v.optional(v.string()),
      note: v.optional(v.string()),
      at: v.string(),
    }))),
  })
    .index("by_property", ["propertyId", "isActive"])
    .index("by_stage", ["stage", "isActive"]),

  // ===== DEALS =====
  deals: defineTable({
    name: v.string(),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    propertyType: v.string(),
    sqft: v.number(),
    units: v.number(),
    askingPrice: v.number(),
    pricePerSF: v.optional(v.number()),
    capRate: v.optional(v.number()),
    stage: v.string(),
    source: v.string(),
    assignedTo: v.string(),
    contacts: v.array(v.object({
      name: v.string(),
      role: v.string(),
      email: v.string(),
      phone: v.optional(v.string()),
    })),
    notes: v.array(v.object({
      id: v.string(),
      text: v.string(),
      author: v.string(),
      createdAt: v.string(),
    })),
    emails: v.array(v.object({
      id: v.string(),
      to: v.string(),
      subject: v.string(),
      body: v.string(),
      sentAt: v.string(),
      sentBy: v.string(),
    })),
    tasks: v.optional(v.array(v.object({
      id: v.string(),
      text: v.string(),
      done: v.boolean(),
      assignedTo: v.optional(v.string()),
      dueDate: v.optional(v.string()),
      createdAt: v.string(),
      completedAt: v.optional(v.string()),
    }))),
    documents: v.optional(v.array(v.object({
      id: v.string(),
      name: v.string(),
      storageId: v.optional(v.id("_storage")),
      type: v.string(),
      uploadedBy: v.string(),
      uploadedAt: v.string(),
      size: v.optional(v.number()),
    }))),
    closingDate: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_stage", ["stage"]),

  // ===== UNIT NOTES =====
  unit_notes: defineTable({
    propertyId: v.id("properties"),
    unit: v.string(),
    text: v.string(),
    createdAt: v.string(),
    updatedAt: v.optional(v.string()),
  }).index("by_unit", ["propertyId", "unit"]),

  // ===== ACTIVITY LOG =====
  activity_log: defineTable({
    type: v.string(),
    description: v.string(),
    user: v.string(),
    unit: v.optional(v.string()),
    dealId: v.optional(v.string()),
    createdAt: v.string(),
  }).index("by_type", ["type"]),
});

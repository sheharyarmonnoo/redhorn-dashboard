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
    // Property manager contact for the "Email PM" action
    pmName: v.optional(v.string()),
    pmEmail: v.optional(v.string()),
    pmPhone: v.optional(v.string()),
    pmCompany: v.optional(v.string()),
  }).index("by_code", ["code"]),

  // ===== TENANT OVERRIDES =====
  // Manual edits persist across syncs. Keyed by propertyId + unit so they
  // survive tenant row churn (sync replaces tenant docs each time). Each
  // override field is optional; only set fields apply. "Revert to pipeline"
  // = delete the override row for that unit.
  tenant_overrides: defineTable({
    propertyId: v.id("properties"),
    unit: v.string(),
    monthlyRent: v.optional(v.number()),
    monthlyElectric: v.optional(v.number()),
    securityDeposit: v.optional(v.number()),
    leaseFrom: v.optional(v.string()),
    leaseTo: v.optional(v.string()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
    pastDueAmount: v.optional(v.number()),
    delinquencyStage: v.optional(v.string()),
    // Manual entry until the Tenancy Schedule scraper lands. Date the rent
    // bumps next + the new monthly rent post-bump.
    nextRentIncrease: v.optional(v.string()),
    nextRentIncreaseAmount: v.optional(v.number()),
    // Manual contact info — tenant emails aren't in Yardi exports
    tenantEmail: v.optional(v.string()),
    tenantPhone: v.optional(v.string()),
    tenantContactName: v.optional(v.string()),
    updatedAt: v.string(),
    updatedBy: v.optional(v.string()),
  })
    .index("by_property", ["propertyId"])
    .index("by_property_unit", ["propertyId", "unit"]),

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
    // Show Detail rent roll columns — populated when the
    // Commercial Analytics rent roll runs successfully.
    leaseTermMonths: v.optional(v.number()),
    monthlyRentPerSF: v.optional(v.number()),
    annualRent: v.optional(v.number()),
    annualRentPerSF: v.optional(v.number()),
    annualRecPerSF: v.optional(v.number()),
    annualMiscPerSF: v.optional(v.number()),
    locAmount: v.optional(v.number()),
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
    unit: v.optional(v.string()),
    controlNumber: v.optional(v.string()),
    transactionDate: v.optional(v.string()),
    postMonth: v.optional(v.string()),
    chargeCode: v.optional(v.string()),
    description: v.optional(v.string()),
    charges: v.number(),
    receipts: v.number(),
    balance: v.number(),
    notes: v.optional(v.string()),
  })
    .index("by_property", ["propertyId"])
    .index("by_property_month", ["propertyId", "postMonth"])
    .index("by_property_tenant", ["propertyId", "tenantName"])
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
    // The reporting period these CP figures cover, e.g. "2026-04". Optional
    // for backwards compatibility with rows ingested before this field
    // existed; recompute logic falls back to snapshotDate when missing.
    period: v.optional(v.string()),
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

  // ===== GL TRANSACTIONS (line-level journal entries) =====
  // Every JE row from Yardi's GL Detail report. Aggregating these by month +
  // account reproduces the income statement; querying by date answers
  // "when was this expense posted, and is it normal vs prior months?"
  gl_transactions: defineTable({
    syncId: v.optional(v.id("sync_jobs")),
    propertyId: v.id("properties"),
    postingDate: v.string(),     // YYYY-MM-DD
    postMonth: v.optional(v.string()), // YYYY-MM
    accountCode: v.string(),     // GL account number
    accountName: v.string(),     // Human-readable account
    description: v.string(),
    reference: v.optional(v.string()),  // check #, invoice #
    vendor: v.optional(v.string()),
    debit: v.number(),
    credit: v.number(),
    amount: v.number(),          // signed: debit positive, credit negative (or vice versa per use)
  })
    .index("by_property_date", ["propertyId", "postingDate"])
    .index("by_property_month", ["propertyId", "postMonth"])
    .index("by_property_account", ["propertyId", "accountCode"])
    .index("by_sync", ["syncId"]),

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

  // ===== EMAIL LOG =====
  // Audit trail of every email sent through the dashboard. Each row carries
  // the SMTP response so a delivery failure can be diagnosed later.
  email_log: defineTable({
    propertyId: v.optional(v.id("properties")),
    relatedType: v.optional(v.string()),   // "tenant" | "alert" | "general"
    relatedId: v.optional(v.string()),     // unit code, alert id, etc.
    toEmail: v.string(),
    toName: v.optional(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    subject: v.string(),
    body: v.string(),
    isHtml: v.optional(v.boolean()),
    sentBy: v.string(),
    sentAt: v.string(),
    status: v.string(),                    // "sent" | "failed"
    smtpMessageId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  })
    .index("by_property", ["propertyId"])
    .index("by_related", ["relatedType", "relatedId"])
    .index("by_recipient", ["toEmail"]),

  // ===== LINE BUDGETS (manual input or Yardi budget export) =====
  // Annual budget per income-statement line item per property per year.
  // Compared against income_lines.currentPeriod (× 12 for full-year actual)
  // to drive the Budget vs Actuals view.
  line_budgets: defineTable({
    propertyId: v.id("properties"),
    year: v.string(),                    // "2026"
    lineItem: v.string(),                // matches income_lines.lineItem
    annualBudget: v.number(),
    notes: v.optional(v.string()),
    updatedAt: v.string(),
    updatedBy: v.optional(v.string()),
  })
    .index("by_property", ["propertyId"])
    .index("by_property_year", ["propertyId", "year"]),

  // ===== PROPERTY DEBT (manual input) =====
  // Per-property debt info entered by the user in settings. DSCR =
  // annualized NOI ÷ annual debt service. Yardi's IS only carries
  // interest, not principal, so we capture the full debt service here.
  property_debt: defineTable({
    propertyId: v.id("properties"),
    totalDebt: v.number(),                 // outstanding loan balance
    monthlyDebtService: v.number(),        // P&I (or interest-only) per month
    interestRate: v.optional(v.number()),  // annual %, informational
    lender: v.optional(v.string()),
    loanStartDate: v.optional(v.string()),
    loanMaturityDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    updatedAt: v.string(),
    updatedBy: v.optional(v.string()),
  }).index("by_property", ["propertyId"]),

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

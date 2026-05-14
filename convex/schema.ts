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
  // survive tenant row churn (sync replaces tenant docs each time). Limited
  // to user-curated fields ONLY — Yardi-sourced data (rent, lease dates,
  // status, past-due, etc.) flows from sync and is not overridable here.
  // "Revert to pipeline" = delete the override row for that unit.
  tenant_overrides: defineTable({
    propertyId: v.id("properties"),
    unit: v.string(),
    notes: v.optional(v.string()),
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
  // Tracks both ad-hoc repairs/inspections and recurring routine tasks
  // (gutter cleaning, drainage, HVAC service, etc). unitId is optional
  // because property-level tasks (e.g. roof, gutters) don't tie to a
  // specific unit; the freeform `unit` string lets us tag a unit code
  // even before the units table is populated.
  maintenance_log: defineTable({
    unitId: v.optional(v.id("units")),
    propertyId: v.id("properties"),
    date: v.string(),
    type: v.string(),
    description: v.string(),
    cost: v.optional(v.number()),
    vendor: v.optional(v.string()),
    status: v.string(),
    unit: v.optional(v.string()),
    category: v.optional(v.string()),       // "repair" | "inspection" | "routine" | "emergency" | "preventative"
    isRecurring: v.optional(v.boolean()),
    recurFrequency: v.optional(v.string()), // "monthly" | "quarterly" | "biannually" | "annually"
    nextDueDate: v.optional(v.string()),    // ISO date when the next instance is due
    meetingNotes: v.optional(v.array(v.object({
      id: v.string(),
      text: v.string(),
      author: v.string(),
      createdAt: v.number(),
    }))),
    updatedAt: v.optional(v.number()),
    createdBy: v.optional(v.string()),
  })
    .index("by_unit", ["unitId"])
    .index("by_property", ["propertyId"]),

  // ===== MEETINGS =====
  // Recurring PM meeting log — date, who was there, what was discussed,
  // a list of action items (optionally linked to a maintenance task), and
  // attached files (marketing decks, finance updates, photos, etc).
  meetings: defineTable({
    propertyId: v.id("properties"),
    date: v.string(),                 // ISO yyyy-mm-dd
    title: v.string(),                // e.g. "Tuesday PM sync"
    attendees: v.optional(v.array(v.string())),
    discussion: v.optional(v.string()),
    actionItems: v.optional(v.array(v.object({
      id: v.string(),
      text: v.string(),
      assignee: v.optional(v.string()),
      done: v.boolean(),
      createdAt: v.number(),
      maintenanceId: v.optional(v.id("maintenance_log")),
    }))),
    // Files dumped against this meeting — marketing updates, finance
    // packets, photos, etc. Stored in Convex file storage; we keep the
    // metadata here so the drawer can list them without an extra round
    // trip.
    files: v.optional(v.array(v.object({
      id: v.string(),
      storageId: v.id("_storage"),
      name: v.string(),
      size: v.number(),
      mimeType: v.optional(v.string()),
      category: v.optional(v.string()), // e.g. "marketing", "finance"
      uploadedAt: v.number(),
      uploadedBy: v.optional(v.string()),
    }))),
    createdBy: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_property_date", ["propertyId", "date"]),

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
    // Next scheduled rent escalation — synced from the Yardi Tenancy
    // Schedule (Lease Admin → Rent Steps). Only set on leases with an
    // upcoming step; leases without an escalation leave both undefined.
    nextRentIncrease: v.optional(v.string()),         // ISO date YYYY-MM-DD
    nextRentIncreaseAmount: v.optional(v.number()),   // new monthly $
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
    // Monday.com item ID — set when the deal was imported from the Monday
    // Deal Flow Tracker. Lets the importer dedupe on re-runs.
    mondayItemId: v.optional(v.string()),
    // User-defined custom fields. Values keyed by definition.key (camelCase).
    // The shape per-key is defined by deal_field_definitions.type — we store
    // raw JSON here so the schema stays flexible (text/number/date/select).
    customFields: v.optional(v.any()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_stage", ["stage"])
    .index("by_monday_id", ["mondayItemId"]),

  // ===== DEAL FIELD DEFINITIONS =====
  // Schemaless per-deal columns that the user can add from the UI. Used to
  // surface every Monday.com / xlsx field that doesn't have a first-class
  // home on the deals table (TDLR contacts, HCAD #, Lead Tier, etc.).
  deal_field_definitions: defineTable({
    key: v.string(),                            // stable machine key (camelCase)
    label: v.string(),                          // user-visible label
    type: v.union(
      v.literal("text"),
      v.literal("longtext"),
      v.literal("number"),
      v.literal("currency"),
      v.literal("date"),
      v.literal("select"),
    ),
    options: v.optional(v.array(v.string())),   // for type="select"
    order: v.number(),                          // display order
    showOnCard: v.optional(v.boolean()),        // surface on kanban card
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_key", ["key"])
    .index("by_order", ["order"]),

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
    annualBudget: v.number(),            // sum of monthlyBudgets when synced from Yardi
    notes: v.optional(v.string()),
    updatedAt: v.string(),
    updatedBy: v.optional(v.string()),
    // Optional Yardi-sync metadata. Manual entries omit these.
    monthlyBudgets: v.optional(v.array(v.number())),  // 12 numbers, in report column order (matches monthLabels)
    hierarchyLevel: v.optional(v.number()),           // for parent-child rendering
    parentLine: v.optional(v.string()),
    syncId: v.optional(v.id("sync_jobs")),
    snapshotDate: v.optional(v.string()),             // ISO timestamp of the Yardi sync that created this row
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
    monthlyPrincipal: v.optional(v.number()), // user-input principal portion of monthly payment
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

  // ===== AI CHAT THREADS =====
  // Persistent Claude chat sessions scoped to a Clerk user. Title is
  // auto-generated from the first user message so the thread list reads
  // sensibly without making the user name each conversation.
  chat_threads: defineTable({
    userId: v.string(),                  // Clerk user id
    title: v.string(),                   // auto-generated from first message
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_user", ["userId"]),

  // ===== AI CHAT MESSAGES =====
  // One row per message in a thread. dataContext optionally captures the
  // Convex data slice that informed the assistant's reply so we can audit
  // (or re-render) what Claude was actually shown for that turn.
  chat_messages: defineTable({
    threadId: v.id("chat_threads"),
    role: v.string(),                    // "user" | "assistant"
    content: v.string(),
    createdAt: v.string(),
    dataContext: v.optional(v.any()),
  }).index("by_thread", ["threadId"]),

  // ===== RV PARK: monthly upload bundles =====
  // Max uploads the 5-file Campspot+Northgate bundle once a month. Drop-zone is
  // gated to once-a-month: locked until the 1st of the month, unlocks for one
  // bundle, then locks again until next 1st. Period derived from the file
  // contents (filenames + sheet titles), NOT the upload timestamp — Max may
  // be backdating Jan/Feb/Mar even though it's May.
  rv_upload_bundles: defineTable({
    propertyId: v.id("properties"),
    period: v.string(),                          // "YYYY-MM" — period the bundle represents
    status: v.string(),                          // "draft" (files uploading) | "committed" (parsed + locked)
    files: v.array(v.object({
      id: v.string(),
      storageId: v.id("_storage"),
      name: v.string(),
      size: v.number(),
      fileType: v.string(),                      // "rentRoll" | "balances" | "pos" | "payments" | "financial" | "unknown"
      rowsParsed: v.optional(v.number()),
      parseError: v.optional(v.string()),
      uploadedAt: v.number(),
    })),
    uploadedBy: v.optional(v.string()),
    committedAt: v.optional(v.number()),
    committedBy: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_property_period", ["propertyId", "period"])
    .index("by_property_status", ["propertyId", "status"])
    .index("by_property", ["propertyId"]),

  // ===== RV SITES =====
  // Physical RV sites. Discovered from rent-roll uploads and persisted so the
  // site plan / rent roll views can render even between reservation snapshots.
  rv_sites: defineTable({
    propertyId: v.id("properties"),
    siteCode: v.string(),                        // "208", "059B", "Glamping A/409"
    displayName: v.string(),                     // "Seasonal Premium RV Site 208"
    siteType: v.string(),                        // "Seasonal Premium RV", "Lakeside", "Cabin", "Glamping"
    siteClass: v.optional(v.string()),           // "RV Sites" | "Cabins" | etc
    firstSeen: v.string(),                       // YYYY-MM-DD when first observed in any bundle
    lastSeen: v.string(),                        // YYYY-MM-DD most recent snapshot containing this site
  })
    .index("by_property_code", ["propertyId", "siteCode"])
    .index("by_property", ["propertyId"]),

  // ===== RV RESERVATIONS (snapshots) =====
  // Append-only by snapshotPeriod. Same reservation (same confirmation #) may
  // appear in multiple monthly snapshots with different paid % / balance —
  // that's the time series. isLatest flags rows from the most recent snapshot
  // for live views.
  rv_reservations: defineTable({
    bundleId: v.id("rv_upload_bundles"),
    propertyId: v.id("properties"),
    snapshotPeriod: v.string(),                  // "YYYY-MM"
    isLatest: v.boolean(),
    confirmation: v.string(),                    // R00000004616 — natural key
    siteCode: v.string(),
    siteName: v.string(),
    siteType: v.string(),
    siteClass: v.optional(v.string()),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    arrivalDate: v.string(),                     // YYYY-MM-DD
    departureDate: v.string(),
    nights: v.number(),
    reservationCharges: v.number(),
    occupancyCharges: v.number(),
    surcharges: v.number(),
    discounts: v.number(),
    tax: v.number(),
    total: v.number(),
    totalChargesOnInvoice: v.number(),
    totalPaymentsOnInvoice: v.number(),
    percentPaid: v.number(),
    balanceOnReservation: v.number(),
    balanceOnInvoice: v.number(),
    utilityCharges: v.number(),
    posCharges: v.number(),
    packageApplied: v.optional(v.string()),
    promoCode: v.optional(v.string()),
    reservationSource: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    invoiceLink: v.optional(v.string()),
  })
    .index("by_property_latest", ["propertyId", "isLatest"])
    .index("by_property_period", ["propertyId", "snapshotPeriod"])
    .index("by_confirmation", ["propertyId", "confirmation"])
    .index("by_bundle", ["bundleId"]),

  // ===== RV BALANCES (Guests with Balance report) =====
  // Per-guest A/R as of the snapshot date. Mirrors the commercial aging table.
  rv_balances: defineTable({
    bundleId: v.id("rv_upload_bundles"),
    propertyId: v.id("properties"),
    snapshotPeriod: v.string(),
    isLatest: v.boolean(),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    totalCharges: v.number(),
    totalPayments: v.number(),
    balance: v.number(),
    campsiteType: v.optional(v.string()),
    campsiteNames: v.optional(v.string()),
    arrivalDate: v.optional(v.string()),
    departureDate: v.optional(v.string()),
    confirmation: v.optional(v.string()),
    status: v.optional(v.string()),
    invoiceNumber: v.optional(v.string()),
  })
    .index("by_property_latest", ["propertyId", "isLatest"])
    .index("by_property_period", ["propertyId", "snapshotPeriod"]),

  // ===== RV POS SALES =====
  // Daily camp-store revenue lines. Granularity = day × financial account ×
  // product category. saleMonth duplicated for fast monthly rollups.
  rv_pos_sales: defineTable({
    bundleId: v.id("rv_upload_bundles"),
    propertyId: v.id("properties"),
    snapshotPeriod: v.string(),
    isLatest: v.boolean(),
    saleDate: v.string(),                        // YYYY-MM-DD
    saleMonth: v.string(),                       // YYYY-MM
    financialAccount: v.string(),                // "Merchandise Revenue", "Grocery Revenue", "Additional Person Fees"
    productCategory: v.string(),                 // "Hardware", "Beverage", "Day Passes", etc
    netQuantitySold: v.number(),
    subTotal: v.number(),
    totalDiscount: v.number(),
    totalTax: v.number(),
    total: v.number(),
    defaultCost: v.number(),
  })
    .index("by_property_date", ["propertyId", "saleDate"])
    .index("by_property_month", ["propertyId", "saleMonth"])
    .index("by_property_latest", ["propertyId", "isLatest"]),

  // ===== RV PAYMENTS (payment-mix summary) =====
  rv_payments: defineTable({
    bundleId: v.id("rv_upload_bundles"),
    propertyId: v.id("properties"),
    snapshotPeriod: v.string(),
    isLatest: v.boolean(),
    paymentType: v.string(),                     // "Cash" | "Credit" | "Credit Terminal" | "Check" | "ACH" | "Certificate" | "Transfer Internal"
    cardType: v.optional(v.string()),            // "Visa", "Mastercard" — empty for non-card
    reservationSystem: v.number(),
    posSystem: v.number(),
    totalPayments: v.number(),
  })
    .index("by_property_latest", ["propertyId", "isLatest"])
    .index("by_property_period", ["propertyId", "snapshotPeriod"]),

  // ===== RV FINANCIALS (Northgate xlsx package) =====
  // One row per financial-statement line. kind discriminates which sheet:
  // "isBudget" (P&L vs budget MTD/YTD), "balanceSheet", "cashFlow", "generalLedger".
  rv_financials: defineTable({
    bundleId: v.id("rv_upload_bundles"),
    propertyId: v.id("properties"),
    snapshotPeriod: v.string(),                  // "YYYY-MM" of the financial package
    isLatest: v.boolean(),
    kind: v.string(),                            // "isBudget" | "balanceSheet" | "cashFlow" | "generalLedger"
    lineItem: v.optional(v.string()),
    hierarchyLevel: v.optional(v.number()),
    parentLine: v.optional(v.string()),
    // IS vs Budget
    subsidiary: v.optional(v.string()),
    amountMtd: v.optional(v.number()),
    budgetMtd: v.optional(v.number()),
    varianceMtd: v.optional(v.number()),
    pctVarianceMtd: v.optional(v.number()),
    amountYtd: v.optional(v.number()),
    budgetYtd: v.optional(v.number()),
    // Balance sheet
    balanceAmount: v.optional(v.number()),
    // Cash flow (per-month column)
    cashFlowMonth: v.optional(v.string()),       // "YYYY-MM"
    cashFlowAmount: v.optional(v.number()),
    // GL
    glAccountCode: v.optional(v.string()),
    glAccountName: v.optional(v.string()),
    glDate: v.optional(v.string()),
    glDocumentNumber: v.optional(v.string()),
    glName: v.optional(v.string()),
    glDebit: v.optional(v.number()),
    glCredit: v.optional(v.number()),
    glBalance: v.optional(v.number()),
    glType: v.optional(v.string()),              // "Journal" | "Bill Payment" | etc
  })
    .index("by_property_latest", ["propertyId", "isLatest"])
    .index("by_property_kind_latest", ["propertyId", "kind", "isLatest"])
    .index("by_property_period", ["propertyId", "snapshotPeriod"]),

  // ===== RV LABOR (weekly payroll report PDF) =====
  // One row per (week, department). The Northgate payroll PDF is a weekly
  // budget-vs-scheduled-vs-actual report. Multiple weekly PDFs can roll
  // up into a single monthly bundle. Parsed via Claude PDF document
  // attachment in rvParsers.parseLaborPdf.
  rv_labor: defineTable({
    bundleId: v.id("rv_upload_bundles"),
    propertyId: v.id("properties"),
    snapshotPeriod: v.string(),                  // "YYYY-MM" — bundle month for _flipLatestForBundle
    isLatest: v.boolean(),
    periodStart: v.string(),                     // "YYYY-MM-DD" — week start (Sun)
    periodEnd: v.string(),                       // "YYYY-MM-DD" — week end (Sat)
    reportDay: v.optional(v.string()),           // "YYYY-MM-DD" — report-generation day
    department: v.string(),                      // "Maintenance" | "Housekeeping" | "Guest Services" | etc
    // Period-to-Date Performance columns
    budget: v.number(),                          // adjusted budget per dept (based on forecasted rev)
    scheduledPtd: v.number(),                    // PTD scheduled labor $
    actualPtd: v.number(),                       // PTD actual labor $
    varianceDollar: v.number(),                  // sched - actual; positive = under budget
    variancePct: v.optional(v.number()),         // 0..1 (0.87 = 87% of budget)
    // Expected Final Performance columns
    scheduledRemaining: v.optional(v.number()),  // sch.1 — remaining scheduled labor for period
    estimatedFinal: v.optional(v.number()),      // est.1 — projected total for the week
    expectedVariance: v.optional(v.number()),    // var 1 — expected variance vs budget
  })
    .index("by_property_latest", ["propertyId", "isLatest"])
    .index("by_property_period", ["propertyId", "snapshotPeriod"])
    .index("by_property_week", ["propertyId", "periodStart"])
    .index("by_bundle", ["bundleId"]),
});

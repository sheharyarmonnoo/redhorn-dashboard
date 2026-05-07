"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect, useCallback } from "react";

// ===== ACTIVE PROPERTY (localStorage for UI preference) =====

const PORTFOLIO_KEY = "redhorn_active_property";

export function useActivePropertyId() {
  const [propId, setPropId] = useState("hollister");

  useEffect(() => {
    setPropId(localStorage.getItem(PORTFOLIO_KEY) || "hollister");
    function handle(e: Event) {
      const detail = (e as CustomEvent).detail;
      setPropId(detail.id);
    }
    window.addEventListener("portfolio-changed", handle);
    return () => window.removeEventListener("portfolio-changed", handle);
  }, []);

  const setActiveProperty = useCallback((id: string) => {
    localStorage.setItem(PORTFOLIO_KEY, id);
    window.dispatchEvent(new CustomEvent("portfolio-changed", { detail: { id } }));
  }, []);

  return { propId, setActiveProperty };
}

// ===== PROPERTIES =====

export function useProperties() {
  const properties = useQuery(api.properties.list);
  const createProperty = useMutation(api.properties.create);
  const updateProperty = useMutation(api.properties.update);
  const removeProperty = useMutation(api.properties.remove);
  return { properties: properties ?? [], createProperty, updateProperty, removeProperty };
}

// ===== ACTIVE PROPERTY (resolved from Convex) =====

export function useActiveProperty() {
  const { propId } = useActivePropertyId();
  const { properties } = useProperties();
  return properties.find(p => p.code === propId) || properties[0] || null;
}

// ===== TENANTS =====

export function useTenants(propertyId: string | undefined) {
  const tenants = useQuery(
    api.tenants.listByProperty,
    propertyId ? { propertyId: propertyId as any } : "skip"
  );
  return tenants ?? [];
}

// Same query, exposes loading state for skeleton rendering during navigation.
export function useTenantsWithLoading(propertyId: string | undefined) {
  const tenants = useQuery(
    api.tenants.listByProperty,
    propertyId ? { propertyId: propertyId as any } : "skip"
  );
  return { tenants: tenants ?? [], loading: !!propertyId && tenants === undefined };
}

export function useAllTenants() {
  const tenants = useQuery(api.tenants.listAll);
  return tenants ?? [];
}

// ===== UNITS =====

export function useUnits(propertyId: string | undefined) {
  const units = useQuery(
    api.units.listByProperty,
    propertyId ? { propertyId: propertyId as any } : "skip"
  );
  return units ?? [];
}

// Loading-aware variant for pages that need a skeleton state (e.g. site plan).
export function useUnitsWithLoading(propertyId: string | undefined) {
  const units = useQuery(
    api.units.listByProperty,
    propertyId ? { propertyId: propertyId as any } : "skip"
  );
  return { units: units ?? [], loading: !!propertyId && units === undefined };
}

// ===== MONTHLY REVENUE =====

export function useMonthlyRevenue(propertyId: string | undefined) {
  const revenue = useQuery(
    api.monthlyRevenue.listByProperty,
    propertyId ? { propertyId: propertyId as any } : "skip"
  );
  return revenue ?? [];
}

// True while any of the dashboard's primary queries are still streaming in.
// Convex deduplicates identical queries from the same client so calling these
// here in addition to the individual hooks is essentially free at runtime.
export function useDashboardLoading(propertyId: string | undefined) {
  const tenants = useQuery(
    api.tenants.listByProperty,
    propertyId ? { propertyId: propertyId as any } : "skip"
  );
  const units = useQuery(
    api.units.listByProperty,
    propertyId ? { propertyId: propertyId as any } : "skip"
  );
  const revenue = useQuery(
    api.monthlyRevenue.listByProperty,
    propertyId ? { propertyId: propertyId as any } : "skip"
  );
  if (!propertyId) return true;
  return tenants === undefined || units === undefined || revenue === undefined;
}

// Tenants from the rent-roll panel can carry comma-separated units when one
// lease covers multiple units (e.g. "A-103, A-112, A-85"). The Total Units
// list always shows individual units. To compare them correctly we have to
// split the tenant.unit field; otherwise every shared unit gets miscounted
// as vacant. Returns a normalized lowercase set.
export function leasedUnitKeys(tenants: { unit?: string }[]): Set<string> {
  const set = new Set<string>();
  for (const t of tenants) {
    const raw = (t.unit || "").trim();
    if (!raw) continue;
    for (const part of raw.split(",")) {
      const k = part.trim().toLowerCase();
      if (k) set.add(k);
    }
  }
  return set;
}

// Pure helper — does this lease end within the next N days (default 90)?
// Used in both the KPI count on the dashboard and the drawer detail so the
// two never disagree. Range is inclusive of today, exclusive of holdovers
// (already-past lease ends).
export function isExpiringWithin(leaseTo: string | undefined, days = 90): boolean {
  if (!leaseTo) return false;
  const lease = new Date(leaseTo);
  if (Number.isNaN(lease.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + days);
  return lease >= today && lease <= cutoff;
}

// ===== DEALS =====

export function useDeals() {
  const deals = useQuery(api.deals.list);
  const createDeal = useMutation(api.deals.create);
  const updateStage = useMutation(api.deals.updateStage);
  const updateField = useMutation(api.deals.updateField);
  const addNote = useMutation(api.deals.addNote);
  const addTask = useMutation(api.deals.addTask);
  const updateTask = useMutation(api.deals.updateTask);
  const toggleTask = useMutation(api.deals.toggleTask);
  const removeTask = useMutation(api.deals.removeTask);
  const addDocument = useMutation(api.deals.addDocument);
  const removeDocument = useMutation(api.deals.removeDocument);
  const removeDeal = useMutation(api.deals.remove);
  return {
    deals: deals ?? [],
    createDeal,
    updateStage,
    updateField,
    addNote,
    addTask,
    updateTask,
    toggleTask,
    removeTask,
    addDocument,
    removeDocument,
    removeDeal,
  };
}

// ===== ACTION ITEMS =====

export function useActionItems() {
  const items = useQuery(api.actionItems.list);
  const createItem = useMutation(api.actionItems.create);
  const moveItem = useMutation(api.actionItems.move);
  const updateItem = useMutation(api.actionItems.update);
  const removeItem = useMutation(api.actionItems.remove);
  return { items: items ?? [], createItem, moveItem, updateItem, removeItem };
}

// ===== ALERTS =====

export function useAlerts(status?: string) {
  const alerts = useQuery(api.alerts.list, status ? { status } : {});
  const updateAlertStatus = useMutation(api.alerts.updateStatus);
  return { alerts: alerts ?? [], loading: alerts === undefined, updateAlertStatus };
}

// ===== ACTIVITY LOG =====

export function useActivityLog(limit?: number) {
  const activity = useQuery(api.activityLog.list, limit ? { limit } : {});
  return activity ?? [];
}

// ===== SYNC JOBS =====

export function useSyncJobs() {
  const jobs = useQuery(api.syncJobs.list);
  return jobs ?? [];
}

// Same query, but exposes the loading state so callers can distinguish
// "still streaming" from "actually empty" and avoid flashing the empty
// state during the brief Convex round-trip after navigation.
export function useSyncJobsWithLoading() {
  const jobs = useQuery(api.syncJobs.list);
  return { jobs: jobs ?? [], loading: jobs === undefined };
}

// ===== RECEIVABLE DETAILS =====

export function useReceivableDetails(propertyId: string | undefined) {
  const rows = useQuery(
    api.receivableDetails.listByProperty,
    propertyId ? { propertyId: propertyId as any } : "skip"
  );
  return rows ?? [];
}

// Per-tenant per-month rollup: aggregates receivable_details rows by tenant
// and charge category (rent / cam / electric / insurance / late fees / other)
// for the most recent reporting month. Also returns current balance (last
// transaction's running balance per tenant). Tenant key is normalized to
// match how rent-roll matches lease names.
export function useChargeSummary(propertyId: string | undefined) {
  const rows = useReceivableDetails(propertyId);
  return useChargeSummaryFromRows(rows);
}

function useChargeSummaryFromRows(rows: any[]) {
  if (!rows.length) return { byTenant: new Map<string, ChargeSummary>(), latestMonth: null };
  const months = rows.map(r => r.postMonth).filter(Boolean).sort();
  const latestMonth = months[months.length - 1] || null;
  const byTenant = new Map<string, ChargeSummary>();
  for (const r of rows) {
    const key = normalizeTenantName(r.tenantName || "");
    if (!key) continue;
    let entry = byTenant.get(key);
    if (!entry) {
      entry = { rent: 0, cam: 0, electric: 0, insurance: 0, lateFees: 0, other: 0, currentMonthCharges: 0, currentBalance: 0, recoveries: 0, _lastTxDate: "" };
      byTenant.set(key, entry);
    }
    const cat = classifyCharge(r.description || "", r.chargeCode || "");
    if (r.postMonth === latestMonth) {
      entry.currentMonthCharges += r.charges || 0;
      if (cat === "rent") entry.rent += r.charges || 0;
      else if (cat === "cam") entry.cam += r.charges || 0;
      else if (cat === "electric") entry.electric += r.charges || 0;
      else if (cat === "insurance") entry.insurance += r.charges || 0;
      else if (cat === "lateFees") entry.lateFees += r.charges || 0;
      else entry.other += r.charges || 0;
    }
    // Track latest transaction's running balance as "current balance"
    const txDate = r.transactionDate || "";
    if (txDate && txDate >= entry._lastTxDate) {
      entry._lastTxDate = txDate;
      entry.currentBalance = r.balance || 0;
    }
  }
  // Recoveries = total billed-back operating costs for the current month
  // (CAM + Electric + Insurance + late fees). These are the line items
  // landlord recovers from tenants under net leases.
  byTenant.forEach((entry) => {
    entry.recoveries = entry.cam + entry.electric + entry.insurance + entry.lateFees;
  });
  return { byTenant, latestMonth };
}

export interface ChargeSummary {
  rent: number;
  cam: number;
  electric: number;
  insurance: number;
  lateFees: number;
  other: number;
  currentMonthCharges: number;
  currentBalance: number;
  recoveries: number;
  _lastTxDate: string;
}

export function normalizeTenantName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[.,]/g, " ")
    .replace(/\b(llc|inc|corp|co|ltd|llp)\b\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyCharge(description: string, chargeCode: string): "rent" | "cam" | "electric" | "insurance" | "lateFees" | "other" {
  const d = (description || "").toLowerCase();
  const c = (chargeCode || "").toLowerCase();
  if (/electric|electricity|cam-elec/.test(d) || /electric|cam-elec/.test(c)) return "electric";
  if (/cam-ins|insurance/.test(d) || /cam-ins|insurance/.test(c)) return "insurance";
  if (/^cam\b|cam-cy|common\s*area/.test(d) || /^cam/.test(c)) return "cam";
  if (/late\s*fee/.test(d) || /late/.test(c)) return "lateFees";
  if (/^base\s*rent|^rent\b|rental\s*income/.test(d) || /^rent|^base/.test(c)) return "rent";
  return "other";
}

// ===== INCOME LINES =====

export function useIncomeLines(propertyId: string | undefined) {
  const lines = useQuery(
    api.incomeLines.listByProperty,
    propertyId ? { propertyId: propertyId as any } : "skip"
  );
  return lines ?? [];
}

// Same query, but exposes loading state so the Financials page can show a
// skeleton instead of misleading $0 placeholders while the query streams in.
export function useIncomeLinesWithLoading(propertyId: string | undefined) {
  const lines = useQuery(
    api.incomeLines.listByProperty,
    propertyId ? { propertyId: propertyId as any } : "skip"
  );
  return { lines: lines ?? [], loading: !!propertyId && lines === undefined };
}

// ===== PROPERTY DEBT (manual input for DSCR) =====

export function useDebt(propertyId: string | undefined) {
  const debt = useQuery(
    api.propertyDebt.getByProperty,
    propertyId ? { propertyId: propertyId as any } : "skip"
  );
  const upsertDebt = useMutation(api.propertyDebt.upsert);
  const clearDebt = useMutation(api.propertyDebt.clear);
  return { debt: debt ?? null, loading: debt === undefined, upsertDebt, clearDebt };
}

// ===== LINE BUDGETS =====

export function useLineBudgets(propertyId: string | undefined, year: string) {
  const rows = useQuery(
    api.lineBudgets.listByPropertyYear,
    propertyId ? { propertyId: propertyId as any, year } : "skip"
  );
  const upsertBudget = useMutation(api.lineBudgets.upsert);
  const bulkUpsertBudgets = useMutation(api.lineBudgets.bulkUpsert);
  const removeBudget = useMutation(api.lineBudgets.remove);
  return { budgets: rows ?? [], loading: rows === undefined, upsertBudget, bulkUpsertBudgets, removeBudget };
}

// ===== AGING RECORDS =====

export function useAgingRecords(propertyId: string | undefined) {
  const records = useQuery(
    api.agingRecords.listByProperty,
    propertyId ? { propertyId: propertyId as any } : "skip"
  );
  return records ?? [];
}

// ===== DELINQUENT CASES =====

export function useDelinquentCases() {
  const cases = useQuery(api.delinquentCases.listActive);
  const createCase = useMutation(api.delinquentCases.create);
  const advanceStage = useMutation(api.delinquentCases.advanceStage);
  return { cases: cases ?? [], createCase, advanceStage };
}

// ===== UNIT NOTES =====

export function useUnitNotes(propertyId: string | undefined, unit: string | undefined) {
  const notes = useQuery(
    api.unitNotes.listByUnit,
    propertyId && unit ? { propertyId: propertyId as any, unit } : "skip"
  );
  const createNote = useMutation(api.unitNotes.create);
  const updateNote = useMutation(api.unitNotes.update);
  const removeNote = useMutation(api.unitNotes.remove);
  return { notes: notes ?? [], createNote, updateNote, removeNote };
}

// ===== MAINTENANCE LOG =====

export function useMaintenance(propertyId: string | undefined) {
  const items = useQuery(
    api.maintenanceLog.listByProperty,
    propertyId ? { propertyId: propertyId as any } : "skip"
  );
  const create = useMutation(api.maintenanceLog.create);
  const update = useMutation(api.maintenanceLog.update);
  const remove = useMutation(api.maintenanceLog.remove);
  const markCompleted = useMutation(api.maintenanceLog.markCompleted);
  return {
    items: items ?? [],
    loading: items === undefined,
    create,
    update,
    remove,
    markCompleted,
  };
}

// ===== TENANT MUTATIONS =====

export function useTenantMutations() {
  const updateStatus = useMutation(api.tenants.updateStatus);
  const updateNotes = useMutation(api.tenants.updateNotes);
  const updateDelinquency = useMutation(api.tenants.updateDelinquency);
  const updateElectricPosted = useMutation(api.tenants.updateElectricPosted);
  return { updateStatus, updateNotes, updateDelinquency, updateElectricPosted };
}

// ===== HELPER: format currency =====

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(amount);
}

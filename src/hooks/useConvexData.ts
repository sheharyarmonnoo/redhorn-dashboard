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

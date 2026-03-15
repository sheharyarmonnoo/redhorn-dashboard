// Client-side store for tenant note edits and status updates.
// In production this would be backed by a database — for the MVP
// we persist to localStorage so edits survive page refreshes.

import { Tenant, tenants as seedTenants } from "./tenants";

const STORAGE_KEY = "redhorn_tenant_overrides";

export interface TenantOverride {
  notes?: string;
  status?: Tenant["status"];
}

function loadOverrides(): Record<string, TenantOverride> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOverrides(overrides: Record<string, TenantOverride>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function getTenantWithOverrides(): Tenant[] {
  const overrides = loadOverrides();
  return seedTenants.map(t => {
    const override = overrides[t.unit];
    if (!override) return t;
    return {
      ...t,
      notes: override.notes !== undefined ? override.notes : t.notes,
      status: override.status !== undefined ? override.status : t.status,
    };
  });
}

export function updateTenantNote(unit: string, notes: string) {
  const overrides = loadOverrides();
  overrides[unit] = { ...overrides[unit], notes };
  saveOverrides(overrides);
}

export function updateTenantStatus(unit: string, status: Tenant["status"]) {
  const overrides = loadOverrides();
  overrides[unit] = { ...overrides[unit], status };
  saveOverrides(overrides);
}

export function getOverrideForUnit(unit: string): TenantOverride | undefined {
  return loadOverrides()[unit];
}

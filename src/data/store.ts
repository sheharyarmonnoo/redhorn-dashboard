// Client-side store for tenant overrides and action items.
// Persists to localStorage — in production this would be a database.

import { Tenant, tenants as seedTenants } from "./tenants";

// --- Tenant Overrides ---

const TENANT_KEY = "redhorn_tenant_overrides";

export interface TenantOverride {
  notes?: string;
  status?: Tenant["status"];
  delinquencyStage?: string;
  chargePostings?: Record<string, boolean>; // e.g. { electric: true, water: false, lateFee: true }
}

function loadOverrides(): Record<string, TenantOverride> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(TENANT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveOverrides(overrides: Record<string, TenantOverride>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TENANT_KEY, JSON.stringify(overrides));
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

export function updateDelinquencyStage(unit: string, stage: string) {
  const overrides = loadOverrides();
  overrides[unit] = { ...overrides[unit], delinquencyStage: stage };
  saveOverrides(overrides);
}

export function updateChargePosting(unit: string, chargeType: string, posted: boolean) {
  const overrides = loadOverrides();
  const existing = overrides[unit]?.chargePostings || {};
  overrides[unit] = { ...overrides[unit], chargePostings: { ...existing, [chargeType]: posted } };
  saveOverrides(overrides);
}

export function getChargePostings(unit: string): Record<string, boolean> {
  return loadOverrides()[unit]?.chargePostings || {};
}

// --- Kanban Action Items ---

const KANBAN_KEY = "redhorn_kanban_items";

export type KanbanColumn = "todo" | "in_progress" | "done";

export interface KanbanItem {
  id: string;
  text: string;
  column: KanbanColumn;
  priority: "high" | "medium" | "low";
  unit?: string; // optional link to a unit
  createdAt: string;
}

const defaultKanban: KanbanItem[] = [
  { id: "k1", text: "Follow up with PM — late fees not auto-posted for $40K past due", column: "todo", priority: "high", createdAt: "2026-03-12" },
  { id: "k2", text: "C-212 & C-305 — electric charges not posted for March", column: "todo", priority: "high", unit: "C-212", createdAt: "2026-03-12" },
  { id: "k3", text: "A-90 holdover — lease expired Feb 28. Escalate to legal", column: "todo", priority: "high", unit: "A-90", createdAt: "2026-03-10" },
  { id: "k4", text: "C-207 default letter sent 03/10 — verify tenant response", column: "in_progress", priority: "medium", unit: "C-207", createdAt: "2026-03-10" },
  { id: "k5", text: "A-106A lease expires Jun 30 — initiate renewal with QuickShip", column: "todo", priority: "medium", unit: "A-106A", createdAt: "2026-03-08" },
  { id: "k6", text: "Request Yardi API access from PM company", column: "done", priority: "low", createdAt: "2026-03-01" },
  { id: "k7", text: "Verify Feb electric billing for all Net Lease tenants", column: "done", priority: "medium", createdAt: "2026-02-15" },
];

export function loadKanban(): KanbanItem[] {
  if (typeof window === "undefined") return defaultKanban;
  try {
    const raw = localStorage.getItem(KANBAN_KEY);
    return raw ? JSON.parse(raw) : defaultKanban;
  } catch { return defaultKanban; }
}

export function saveKanban(items: KanbanItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KANBAN_KEY, JSON.stringify(items));
}

export function addKanbanItem(text: string, priority: KanbanItem["priority"] = "medium", unit?: string): KanbanItem {
  const items = loadKanban();
  const item: KanbanItem = {
    id: Date.now().toString(),
    text,
    column: "todo",
    priority,
    unit,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  saveKanban([item, ...items]);
  return item;
}

export function moveKanbanItem(id: string, column: KanbanColumn) {
  const items = loadKanban();
  const updated = items.map(i => i.id === id ? { ...i, column } : i);
  saveKanban(updated);
}

export function removeKanbanItem(id: string) {
  const items = loadKanban();
  saveKanban(items.filter(i => i.id !== id));
}

export function updateKanbanItem(id: string, updates: Partial<Pick<KanbanItem, "text" | "priority" | "unit">>) {
  const items = loadKanban();
  const updated = items.map(i => i.id === id ? { ...i, ...updates } : i);
  saveKanban(updated);
}

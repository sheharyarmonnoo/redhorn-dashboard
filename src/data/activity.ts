// Activity log / audit trail — Ori requested a notifications feed
// to track all recent actions (tasks added, status changes, etc.)

export interface ActivityEntry {
  id: string;
  type: "task_added" | "task_completed" | "task_assigned" | "status_change" | "note_added" | "deal_update" | "alert_created" | "alert_resolved" | "email_sent" | "sync" | "login";
  description: string;
  user: string;
  unit?: string;
  dealId?: string;
  createdAt: string;
}

const ACTIVITY_KEY = "redhorn_activity_log";

const seedActivity: ActivityEntry[] = [
  { id: "a1", type: "task_added", description: "Added task: Follow up with PM — late fees not auto-posted", user: "System", createdAt: "2026-03-12T08:00:00Z" },
  { id: "a2", type: "alert_created", description: "Alert generated: C-212 electric not posted for March", user: "System", unit: "C-212", createdAt: "2026-03-12T08:05:00Z" },
  { id: "a3", type: "alert_created", description: "Alert generated: C-305 electric not posted for March", user: "System", unit: "C-305", createdAt: "2026-03-12T08:05:00Z" },
  { id: "a4", type: "status_change", description: "A-90 delinquency escalated: Past Due → Default Notice", user: "Ori", unit: "A-90", createdAt: "2026-03-10T14:30:00Z" },
  { id: "a5", type: "note_added", description: "Note added to C-207: PM sent default letter 03/10", user: "Max", unit: "C-207", createdAt: "2026-03-10T11:00:00Z" },
  { id: "a6", type: "task_completed", description: "Completed: Request Yardi API access from PM company", user: "Max", createdAt: "2026-03-09T16:00:00Z" },
  { id: "a7", type: "deal_update", description: "Deal updated: Cypress Creek Flex Space moved to LOI stage", user: "Ori", dealId: "deal-3", createdAt: "2026-03-17T15:00:00Z" },
  { id: "a8", type: "email_sent", description: "Email sent to jrodriguez@cbre.com — Westheimer Office Complex T12 request", user: "Max", dealId: "deal-1", createdAt: "2026-03-13T09:00:00Z" },
  { id: "a9", type: "sync", description: "Yardi sync completed — Rent Roll updated (52 units)", user: "System", createdAt: "2026-03-12T08:00:00Z" },
  { id: "a10", type: "sync", description: "Yardi sync completed — Lease Ledger updated", user: "System", createdAt: "2026-03-12T08:02:00Z" },
  { id: "a11", type: "task_assigned", description: "Task assigned to Ori: A-90 holdover — escalate to legal", user: "Max", unit: "A-90", createdAt: "2026-03-10T09:00:00Z" },
  { id: "a12", type: "note_added", description: "Note added to A-90: Lease expired — holdover tenant. 2 months past due.", user: "Ori", unit: "A-90", createdAt: "2026-03-08T10:00:00Z" },
  { id: "a13", type: "deal_update", description: "New deal added: Tomball Warehouse — $1.65M, 22K SF", user: "Ori", dealId: "deal-5", createdAt: "2026-03-19T08:30:00Z" },
  { id: "a14", type: "alert_resolved", description: "Alert resolved: Feb electric billing verified for all Net Lease tenants", user: "Max", createdAt: "2026-03-08T15:00:00Z" },
  { id: "a15", type: "deal_update", description: "Deal killed: FM 1960 Retail Strip — cap rate too low", user: "Max", dealId: "deal-4", createdAt: "2026-03-05T10:00:00Z" },
];

export function loadActivity(): ActivityEntry[] {
  if (typeof window === "undefined") return seedActivity;
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    return raw ? JSON.parse(raw) : seedActivity;
  } catch { return seedActivity; }
}

export function saveActivity(entries: ActivityEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(entries));
}

export function logActivity(entry: Omit<ActivityEntry, "id" | "createdAt">) {
  const entries = loadActivity();
  const newEntry: ActivityEntry = {
    ...entry,
    id: `a-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  saveActivity([newEntry, ...entries]);
  window.dispatchEvent(new Event("activity-updated"));
}

export function getActivityIcon(type: ActivityEntry["type"]): string {
  const map: Record<ActivityEntry["type"], string> = {
    task_added: "+",
    task_completed: "✓",
    task_assigned: "→",
    status_change: "↑",
    note_added: "✎",
    deal_update: "$",
    alert_created: "!",
    alert_resolved: "✓",
    email_sent: "✉",
    sync: "↻",
    login: "●",
  };
  return map[type];
}

export function getActivityColor(type: ActivityEntry["type"]): string {
  const map: Record<ActivityEntry["type"], string> = {
    task_added: "bg-[#2563eb]",
    task_completed: "bg-[#16a34a]",
    task_assigned: "bg-[#7c3aed]",
    status_change: "bg-[#d97706]",
    note_added: "bg-[#71717a]",
    deal_update: "bg-[#0891b2]",
    alert_created: "bg-[#dc2626]",
    alert_resolved: "bg-[#16a34a]",
    email_sent: "bg-[#2563eb]",
    sync: "bg-[#71717a]",
    login: "bg-[#a1a1aa]",
  };
  return map[type];
}

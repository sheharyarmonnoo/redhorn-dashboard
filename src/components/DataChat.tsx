"use client";
import { useState, useRef, useEffect } from "react";
import { tenants, monthlyRevenue, formatCurrency, getAlerts, Tenant } from "@/data/tenants";
import { addKanbanItem, loadKanban, updateTenantNote } from "@/data/store";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function answerQuestion(q: string): string {
  const lower = q.toLowerCase().trim();

  // Occupancy
  if (lower.includes("occupancy") || lower.includes("how many occupied") || lower.includes("vacancy rate")) {
    const occupied = tenants.filter(t => t.status !== "vacant");
    const vacant = tenants.filter(t => t.status === "vacant");
    const rate = Math.round((occupied.length / tenants.length) * 100);
    return `Occupancy is **${rate}%** — ${occupied.length} occupied out of ${tenants.length} total units. There are **${vacant.length} vacant units** (${formatCurrency(vacant.reduce((s, v) => s + v.sqft, 0))} sq ft available).`;
  }

  // Revenue
  if (lower.includes("revenue") || lower.includes("income") || lower.includes("how much") && lower.includes("month")) {
    const latest = monthlyRevenue[monthlyRevenue.length - 1];
    return `March 2026 projected revenue: **${formatCurrency(latest.total)}**\n- Base Rent: ${formatCurrency(latest.rent)}\n- CAM: ${formatCurrency(latest.cam)}\n- Electric Recovery: ${formatCurrency(latest.electric)}\n- Late Fees: ${formatCurrency(latest.lateFees)}`;
  }

  // Past due
  if (lower.includes("past due") || lower.includes("delinquent") || lower.includes("who owes") || lower.includes("overdue") || lower.includes("unpaid")) {
    const pastDue = tenants.filter(t => t.pastDueAmount > 0);
    if (pastDue.length === 0) return "No tenants are currently past due.";
    const total = pastDue.reduce((s, t) => s + t.pastDueAmount, 0);
    const list = pastDue.map(t => `- **${t.unit}** (${t.tenant}): ${formatCurrency(t.pastDueAmount)} — last paid ${t.lastPaymentDate}`).join("\n");
    return `**${formatCurrency(total)} total past due** across ${pastDue.length} tenants:\n${list}`;
  }

  // Electric not posted
  if (lower.includes("electric") || lower.includes("utility") || lower.includes("cam")) {
    const missing = tenants.filter(t => !t.electricPosted && t.leaseType === "Office Net Lease" && t.tenant && !t.tenant.includes("Owner"));
    if (missing.length === 0) return "All electric charges have been posted for March 2026.";
    const list = missing.map(t => `- **${t.unit}** (${t.tenant}): ~${formatCurrency(t.monthlyElectric)}/mo NOT POSTED`).join("\n");
    return `**${missing.length} units** missing electric postings for March 2026:\n${list}\n\nAction: Follow up with PM to post these charges immediately.`;
  }

  // Vacant
  if (lower.includes("vacant") || lower.includes("empty") || lower.includes("available")) {
    const vacant = tenants.filter(t => t.status === "vacant");
    const list = vacant.map(t => `- **${t.unit}** (Bldg ${t.building}): ${t.sqft.toLocaleString()} sq ft${t.notes ? " — " + t.notes : ""}`).join("\n");
    return `**${vacant.length} vacant units:**\n${list}\n\nTotal vacant: ${vacant.reduce((s, t) => s + t.sqft, 0).toLocaleString()} sq ft`;
  }

  // Expiring leases
  if (lower.includes("expir") || lower.includes("renewal") || lower.includes("lease end")) {
    const expiring = tenants.filter(t => t.status === "expiring_soon");
    const list = expiring.map(t => `- **${t.unit}** (${t.tenant}): expires ${t.leaseTo} — ${formatCurrency(t.monthlyRent)}/mo`).join("\n");
    return `**${expiring.length} leases expiring soon:**\n${list}\n\nAction: Ensure PM has initiated renewal discussions.`;
  }

  // Specific unit lookup
  const unitMatch = lower.match(/(?:unit\s+)?([acd]-?\d+[a-z]?)/i);
  if (unitMatch) {
    const unitId = unitMatch[1].toUpperCase().replace(/^([ACD])(\d)/, "$1-$2");
    const tenant = tenants.find(t => t.unit === unitId);
    if (tenant) {
      if (tenant.status === "vacant") {
        return `**${tenant.unit}** (Building ${tenant.building}) — VACANT\n- ${tenant.sqft.toLocaleString()} sq ft\n${tenant.notes ? "- " + tenant.notes : ""}`;
      }
      return `**${tenant.unit}** (Building ${tenant.building})\n- Tenant: ${tenant.tenant}\n- Lease Type: ${tenant.leaseType}\n- Size: ${tenant.sqft.toLocaleString()} sq ft\n- Rent: ${formatCurrency(tenant.monthlyRent)}/mo\n- Lease: ${tenant.leaseFrom} → ${tenant.leaseTo}\n- Status: ${tenant.status.replace("_", " ").toUpperCase()}\n- Electric: ${tenant.monthlyElectric > 0 ? formatCurrency(tenant.monthlyElectric) + "/mo" : "Included in gross lease"}${tenant.pastDueAmount > 0 ? "\n- **PAST DUE: " + formatCurrency(tenant.pastDueAmount) + "**" : ""}${tenant.notes ? "\n- Notes: " + tenant.notes : ""}`;
    }
  }

  // Alerts
  if (lower.includes("alert") || lower.includes("issue") || lower.includes("problem") || lower.includes("action item") || lower.includes("what needs attention")) {
    const alerts = getAlerts();
    const critical = alerts.filter(a => a.type === "critical");
    const warning = alerts.filter(a => a.type === "warning");
    return `**${alerts.length} active alerts:**\n\n🔴 ${critical.length} Critical:\n${critical.map(a => `- ${a.unit}: ${a.message}`).join("\n")}\n\n🟡 ${warning.length} Warnings:\n${warning.map(a => `- ${a.unit}: ${a.message}`).join("\n")}`;
  }

  // Building summary
  if (lower.includes("building a") || lower.includes("building c") || lower.includes("building d") || lower.includes("buildings")) {
    const buildings = ["A", "C", "D"] as const;
    const summaries = buildings.map(b => {
      const units = tenants.filter(t => t.building === b);
      const occupied = units.filter(t => t.status !== "vacant");
      const revenue = occupied.reduce((s, t) => s + t.monthlyRent, 0);
      return `**Building ${b}:** ${occupied.length}/${units.length} occupied — ${formatCurrency(revenue)}/mo`;
    });
    return summaries.join("\n");
  }

  // Largest tenants
  if (lower.includes("largest") || lower.includes("biggest") || lower.includes("top tenant")) {
    const sorted = [...tenants].filter(t => t.status !== "vacant" && !t.tenant.includes("Owner")).sort((a, b) => b.monthlyRent - a.monthlyRent);
    const top5 = sorted.slice(0, 5);
    const list = top5.map((t, i) => `${i + 1}. **${t.tenant}** (${t.unit}): ${formatCurrency(t.monthlyRent)}/mo — ${t.sqft.toLocaleString()} sq ft`).join("\n");
    return `**Top 5 tenants by rent:**\n${list}`;
  }

  // Holdover
  if (lower.includes("holdover") || lower.includes("expired lease")) {
    const holdovers = tenants.filter(t => {
      if (!t.leaseTo || t.status === "vacant") return false;
      return new Date(t.leaseTo) < new Date("2026-03-15");
    });
    if (holdovers.length === 0) return "No holdover tenants currently.";
    const list = holdovers.map(t => `- **${t.unit}** (${t.tenant}): lease ended ${t.leaseTo}`).join("\n");
    return `**${holdovers.length} holdover tenant(s):**\n${list}`;
  }

  // PM call prep
  if (lower.includes("pm call") || lower.includes("meeting") || lower.includes("weekly call") || lower.includes("prep")) {
    const pastDue = tenants.filter(t => t.pastDueAmount > 0);
    const missingElectric = tenants.filter(t => !t.electricPosted && t.leaseType === "Office Net Lease" && t.tenant && !t.tenant.includes("Owner"));
    const expiring = tenants.filter(t => t.status === "expiring_soon");
    return `**PM Call Agenda — March 2026:**\n\n1. **Collections** (${pastDue.length} items):\n${pastDue.map(t => `   - ${t.unit} (${t.tenant}): ${formatCurrency(t.pastDueAmount)}`).join("\n")}\n\n2. **Missing Electric Postings** (${missingElectric.length}):\n${missingElectric.map(t => `   - ${t.unit}: ~${formatCurrency(t.monthlyElectric)}/mo`).join("\n")}\n\n3. **Lease Renewals** (${expiring.length}):\n${expiring.map(t => `   - ${t.unit} (${t.tenant}): expires ${t.leaseTo}`).join("\n")}`;
  }

  // Add action item: "add task: ..." or "action item: ..."
  const addMatch = lower.match(/^(?:add task|action item|todo|add action|new task)[:\s]+(.+)/i);
  if (addMatch) {
    const text = addMatch[1].trim();
    // Detect priority
    let priority: "high" | "medium" | "low" = "medium";
    if (lower.includes("urgent") || lower.includes("high") || lower.includes("asap")) priority = "high";
    if (lower.includes("low") || lower.includes("minor")) priority = "low";
    // Detect unit reference
    const unitRef = text.match(/([ACD]-?\d+[A-Za-z]?)/i);
    const unit = unitRef ? unitRef[1].toUpperCase().replace(/^([ACD])(\d)/, "$1-$2") : undefined;
    addKanbanItem(text, priority, unit);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("kanban-updated"));
    return `Added to **To Do** board:\n- "${text}"\n- Priority: **${priority}**${unit ? `\n- Linked to unit: **${unit}**` : ""}\n\nCheck your Kanban board on the dashboard.`;
  }

  // Show kanban board items
  if (lower.includes("kanban") || lower.includes("board") || lower.includes("action items") || lower.includes("tasks") || lower.includes("todo list")) {
    const items = loadKanban();
    const todo = items.filter(i => i.column === "todo");
    const inProg = items.filter(i => i.column === "in_progress");
    const done = items.filter(i => i.column === "done");
    return `**Kanban Board:**\n\n**To Do** (${todo.length}):\n${todo.map(i => `- ${i.text}`).join("\n") || "- (empty)"}\n\n**In Progress** (${inProg.length}):\n${inProg.map(i => `- ${i.text}`).join("\n") || "- (empty)"}\n\n**Done** (${done.length}):\n${done.map(i => `- ${i.text}`).join("\n") || "- (empty)"}`;
  }

  // Update unit note: "note A-102: ..." or "update note for A-102: ..."
  const noteMatch = lower.match(/^(?:note|update note|add note|set note)\s*(?:for\s*)?([acd]-?\d+[a-z]?)[:\s]+(.+)/i);
  if (noteMatch) {
    const unitId = noteMatch[1].toUpperCase().replace(/^([ACD])(\d)/, "$1-$2");
    const noteText = noteMatch[2].trim();
    const tenant = tenants.find(t => t.unit === unitId);
    if (!tenant) return `Unit **${unitId}** not found.`;
    updateTenantNote(unitId, noteText);
    return `Updated note for **${unitId}**${tenant.tenant ? ` (${tenant.tenant})` : ""}:\n"${noteText}"\n\nView it on the Site Plan by clicking the unit.`;
  }

  // Help / default
  return `I can help with:\n- **"What's past due?"** — delinquent tenants & amounts\n- **"Show revenue"** — monthly revenue breakdown\n- **"Vacant units"** — available spaces\n- **"Electric status"** — missing utility postings\n- **"Expiring leases"** — renewal pipeline\n- **"Unit A-102"** — specific unit details\n- **"Alerts"** — active issues\n- **"PM call prep"** — meeting agenda\n- **"Largest tenants"** — top 5 by rent\n- **"Add task: [text]"** — add to Kanban board\n- **"Note A-102: [text]"** — update unit notes\n- **"Show kanban"** — view action items\n\nAsk me anything about the Hollister portfolio!`;
}

function renderMarkdown(text: string) {
  // Simple markdown: **bold** and line breaks
  const parts = text.split("\n");
  return parts.map((line, i) => {
    const rendered = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return (
      <span key={i}>
        {i > 0 && <br />}
        <span dangerouslySetInnerHTML={{ __html: rendered }} />
      </span>
    );
  });
}

export default function DataChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm your Hollister portfolio assistant. Ask me about tenants, revenue, alerts, vacant units, or anything else. Try **\"PM call prep\"** to get your meeting agenda." },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsTyping(true);

    // Simulate a brief delay
    setTimeout(() => {
      const response = answerQuestion(userMsg);
      setMessages(prev => [...prev, { role: "assistant", content: response }]);
      setIsTyping(false);
    }, 400);
  }

  const alertCount = getAlerts().length;

  return (
    <>
      {/* Chat Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 lg:left-[256px] lg:right-auto z-50 bg-[#18181b] text-white rounded w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center hover:bg-[#27272a] transition-colors cursor-pointer"
        >
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {alertCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {alertCount}
            </span>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-0 left-0 right-0 sm:bottom-4 sm:right-4 sm:left-auto lg:left-[256px] lg:right-auto z-50 w-full sm:w-[360px] h-[85vh] sm:h-[500px] bg-white sm:rounded border border-[#e4e4e7] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-[#18181b] text-white px-4 py-2.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-[13px] font-bold">Portfolio Chat</p>
                <p className="text-[10px] text-slate-300">Ask about your data</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-300 hover:text-white transition-colors cursor-pointer">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-indigo-500 text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {renderMarkdown(msg.content)}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-xl px-3 py-2 text-[12px] text-gray-500">
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          <div className="px-3 py-1.5 flex gap-1.5 overflow-x-auto shrink-0 border-t border-gray-100">
            {["PM call prep", "What's past due?", "Show kanban", "Alerts", "Add task:"].map(q => (
              <button
                key={q}
                onClick={() => { setInput(q); }}
                className="shrink-0 text-[10px] px-2.5 py-1 bg-gray-100 hover:bg-indigo-50 hover:text-indigo-600 rounded-full text-gray-600 transition-colors cursor-pointer whitespace-nowrap"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="px-3 py-2.5 border-t border-gray-200 shrink-0">
            <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about tenants, revenue, alerts..."
                className="flex-1 text-[12px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-300 text-white rounded-xl p-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

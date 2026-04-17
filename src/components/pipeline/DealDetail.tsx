"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  X,
  Building2,
  MapPin,
  User,
  Mail,
  Phone,
  FileText,
  Trash2,
  Plus,
  CheckSquare,
  Square,
  Upload,
  Download,
  Paperclip,
} from "lucide-react";
import { formatCurrency } from "@/hooks/useConvexData";
import { DealStage, getStageLabel, getStageColor } from "@/data/_seed_deals";

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

function formatNumber(n: number | undefined | null): string {
  if (n == null) return "\u2014";
  return new Intl.NumberFormat("en-US").format(n);
}

function formatDateTime(d: string | undefined | null): string {
  if (!d) return "\u2014";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "\u2014";
  }
}

function formatDate(d: string | undefined | null): string {
  if (!d) return "\u2014";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "\u2014";
  }
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const STAGES: DealStage[] = ["lead", "outreach", "underwriting", "loi", "due_diligence", "closing", "closed", "dead"];

interface DealDetailProps {
  deal: any;
  onClose: () => void;
  onStageChange: (dealId: string, stage: DealStage) => void;
  onDelete: () => void;
  updateField?: (args: { id: any; field: string; value: any; user?: string }) => void;
  addNote: (args: { id: any; text: string; author: string }) => void;
  addTask: (args: { id: any; text: string; assignedTo?: string; dueDate?: string; createdBy?: string }) => void;
  updateTask: (args: { id: any; taskId: string; text?: string; assignedTo?: string; dueDate?: string }) => void;
  toggleTask: (args: { id: any; taskId: string; user?: string }) => void;
  removeTask: (args: { id: any; taskId: string }) => void;
  addDocument: (args: { id: any; name: string; storageId?: any; type: string; uploadedBy: string; size?: number }) => void;
  removeDocument: (args: { id: any; docId: string }) => void;
  removeDeal: (args: { id: any; user?: string }) => void;
}

export function DealDetail({
  deal,
  onClose,
  onStageChange,
  onDelete,
  updateField,
  addNote,
  addTask,
  updateTask,
  toggleTask,
  removeTask,
  addDocument,
  removeDocument,
  removeDeal,
}: DealDetailProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "tasks" | "docs" | "notes">("overview");
  const [currentUser, setCurrentUser] = useState("Ori");
  const [newNote, setNewNote] = useState("");
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const notes = deal.notes || [];
  const tasks = deal.tasks || [];
  const documents = deal.documents || [];

  function saveField(field: string, value: any) {
    if (updateField) {
      updateField({ id: deal._id, field, value, user: currentUser });
    }
  }

  function handleDelete() {
    if (confirm(`Delete deal "${deal.name}"? This cannot be undone.`)) {
      removeDeal({ id: deal._id, user: currentUser });
      onDelete();
    }
  }

  function handleAddNote() {
    if (!newNote.trim()) return;
    addNote({ id: deal._id, text: newNote.trim(), author: currentUser });
    setNewNote("");
  }

  function handleAddTask() {
    if (!newTaskText.trim()) return;
    addTask({
      id: deal._id,
      text: newTaskText.trim(),
      assignedTo: newTaskAssignee || undefined,
      dueDate: newTaskDueDate || undefined,
      createdBy: currentUser,
    });
    setNewTaskText("");
    setNewTaskAssignee("");
    setNewTaskDueDate("");
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();
      await addDocument({
        id: deal._id,
        name: file.name,
        storageId,
        type: file.type || "application/octet-stream",
        uploadedBy: currentUser,
        size: file.size,
      });
    } catch (err) {
      console.error("Upload failed", err);
      alert("File upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-[2px] z-40 animate-in fade-in" onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen w-full max-w-[600px] bg-white dark:bg-[#18181b] z-50 flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#e4e4e7] dark:border-[#3f3f46] flex items-start justify-between bg-gradient-to-br from-white to-[#fafafa] dark:from-[#18181b] dark:to-[#27272a]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Building2 size={14} className="text-[#71717a] dark:text-[#a1a1aa]" />
              <p className="text-[15px] font-semibold text-[#18181b] dark:text-[#fafafa] truncate">{deal.name}</p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#71717a] dark:text-[#a1a1aa]">
              <MapPin size={11} />
              <span>{deal.address}, {deal.city}, {deal.state}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-3">
            <select
              value={currentUser}
              onChange={(e) => setCurrentUser(e.target.value)}
              className="text-[10px] px-2 py-1 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#27272a] text-[#71717a] dark:text-[#a1a1aa] cursor-pointer"
              title="Acting as"
            >
              <option value="Ori">as Ori</option>
              <option value="Max">as Max</option>
            </select>
            <button
              onClick={handleDelete}
              className="text-[#a1a1aa] dark:text-[#71717a] hover:text-[#dc2626] cursor-pointer p-1 rounded transition-colors"
              title="Delete deal"
            >
              <Trash2 size={15} />
            </button>
            <button onClick={onClose} className="text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer p-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Stage selector */}
        <div className="px-5 py-3 border-b border-[#e4e4e7] dark:border-[#3f3f46] flex items-center gap-1.5 overflow-x-auto">
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => onStageChange(deal._id, s)}
              className={cn(
                "text-[10px] font-medium px-2.5 py-1 rounded cursor-pointer transition-colors whitespace-nowrap",
                deal.stage === s
                  ? `${getStageColor(s)} text-white`
                  : "bg-[#f4f4f5] dark:bg-[#27272a] text-[#71717a] dark:text-[#a1a1aa] hover:bg-[#e4e4e7] dark:hover:bg-[#3f3f46]"
              )}
            >
              {getStageLabel(s)}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="px-5 border-b border-[#e4e4e7] dark:border-[#3f3f46] flex gap-5">
          {([
            { key: "overview", label: "Overview" },
            { key: "tasks", label: "Tasks", count: tasks.length },
            { key: "docs", label: "Docs", count: documents.length },
            { key: "notes", label: "Notes", count: notes.length },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "text-[12px] font-medium py-2.5 border-b-2 cursor-pointer transition-colors",
                activeTab === tab.key
                  ? "border-[#18181b] dark:border-[#fafafa] text-[#18181b] dark:text-[#fafafa]"
                  : "border-transparent text-[#a1a1aa] dark:text-[#71717a] hover:text-[#71717a] dark:hover:text-[#a1a1aa]"
              )}
            >
              {tab.label}
              {"count" in tab && tab.count ? ` (${tab.count})` : ""}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === "overview" && (
            <div className="space-y-5">
              {/* Editable name */}
              <EditableTextField
                value={deal.name}
                placeholder="Deal name..."
                onSave={(v) => saveField("name", v)}
                className="text-[18px] font-semibold text-[#18181b] dark:text-[#fafafa]"
              />

              {/* Key Metrics — editable */}
              <div className="grid grid-cols-3 gap-2">
                <EditableMetric label="Asking" value={deal.askingPrice} type="currency" onSave={(v) => saveField("askingPrice", v)} />
                <EditableMetric label="Cap Rate" value={deal.capRate} type="percent" onSave={(v) => saveField("capRate", v)} />
                <MetricCard label="$/SF" display={deal.pricePerSF ? `$${deal.pricePerSF}` : "\u2014"} />
                <EditableMetric label="Size" value={deal.sqft} type="number" suffix=" SF" onSave={(v) => saveField("sqft", v)} />
                <EditableMetric label="Units" value={deal.units} type="number" onSave={(v) => saveField("units", v)} />
                <MetricCard label="$/Unit" display={deal.units && deal.askingPrice ? formatCurrency(Math.round(deal.askingPrice / deal.units)) : "\u2014"} />
                {deal.capRate && deal.askingPrice ? (
                  <MetricCard label="Est. NOI" display={formatCurrency(Math.round(deal.askingPrice * (deal.capRate / 100)))} />
                ) : null}
                <MetricCard label="Days in Stage" display={deal.updatedAt ? String(Math.floor((Date.now() - new Date(deal.updatedAt).getTime()) / 86400000)) : "\u2014"} />
                <MetricCard label="Activity" display={String((deal.notes?.length || 0) + (deal.tasks?.length || 0) + (deal.documents?.length || 0))} />
              </div>

              {/* Property */}
              <section>
                <p className="text-[10px] font-semibold text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wider mb-2.5">Property</p>
                <div className="grid grid-cols-2 gap-3">
                  <EditableField
                    label="Type"
                    value={deal.propertyType}
                    options={["Office/Warehouse", "Industrial", "Flex/Office", "Retail", "Warehouse", "Mixed Use"]}
                    onSave={(v) => saveField("propertyType", v)}
                  />
                  <EditableField
                    label="Address"
                    value={deal.address}
                    icon={<MapPin size={11} />}
                    onSave={(v) => saveField("address", v)}
                  />
                  <EditableField label="City" value={deal.city} onSave={(v) => saveField("city", v)} />
                  <EditableField label="State" value={deal.state} onSave={(v) => saveField("state", v)} />
                  <EditableField
                    label="Closing Date"
                    value={deal.closingDate}
                    type="date"
                    displayValue={formatDate(deal.closingDate)}
                    onSave={(v) => saveField("closingDate", v)}
                  />
                  <Field label="Created" value={formatDate(deal.createdAt)} />
                </div>
              </section>

              {/* Team & Source */}
              <section>
                <p className="text-[10px] font-semibold text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wider mb-2.5">Team & Source</p>
                <div className="grid grid-cols-2 gap-3">
                  <EditableField
                    label="Assigned To"
                    value={deal.assignedTo}
                    icon={<User size={11} />}
                    options={["Ori", "Max"]}
                    onSave={(v) => saveField("assignedTo", v)}
                  />
                  <EditableField
                    label="Source"
                    value={deal.source}
                    onSave={(v) => saveField("source", v)}
                  />
                  <Field label="Last Updated" value={formatDateTime(deal.updatedAt)} />
                  <Field label="Stage" value={getStageLabel(deal.stage)} />
                </div>
              </section>

              {/* Contacts */}
              {deal.contacts && deal.contacts.length > 0 && (
                <section>
                  <p className="text-[10px] font-semibold text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wider mb-2.5">Contacts</p>
                  <div className="space-y-2">
                    {deal.contacts.map((c: any, i: number) => (
                      <div key={i} className="bg-[#fafafa] dark:bg-[#27272a] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[12px] font-medium text-[#18181b] dark:text-[#fafafa]">{c.name}</p>
                          <span className="text-[10px] text-[#71717a] dark:text-[#a1a1aa] bg-white dark:bg-[#18181b] px-2 py-0.5 rounded border border-[#e4e4e7] dark:border-[#3f3f46]">
                            {c.role}
                          </span>
                        </div>
                        {c.email && (
                          <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-[11px] text-[#2563eb] dark:text-[#60a5fa] hover:underline mt-1">
                            <Mail size={11} /> {c.email}
                          </a>
                        )}
                        {c.phone && (
                          <div className="flex items-center gap-1.5 text-[11px] text-[#71717a] dark:text-[#a1a1aa] mt-0.5">
                            <Phone size={11} /> {c.phone}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {activeTab === "tasks" && (
            <div className="space-y-4">
              {/* Add task */}
              <div className="bg-[#fafafa] dark:bg-[#27272a] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-3 space-y-2">
                <input
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                  placeholder="New task..."
                  className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#18181b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
                />
                <div className="flex gap-2">
                  <select
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="text-[11px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#18181b] text-[#71717a] dark:text-[#a1a1aa] flex-1"
                  >
                    <option value="">Unassigned</option>
                    <option value="Ori">Ori</option>
                    <option value="Max">Max</option>
                  </select>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="text-[11px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#18181b] text-[#71717a] dark:text-[#a1a1aa] flex-1"
                  />
                  <button
                    onClick={handleAddTask}
                    disabled={!newTaskText.trim()}
                    className="flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Plus size={11} /> Add
                  </button>
                </div>
              </div>

              {/* Task list */}
              <div className="space-y-1.5">
                {tasks.map((task: any) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    dealId={deal._id}
                    currentUser={currentUser}
                    toggleTask={toggleTask}
                    updateTask={updateTask}
                    removeTask={removeTask}
                  />
                ))}
                {tasks.length === 0 && (
                  <p className="text-[12px] text-[#a1a1aa] dark:text-[#71717a] text-center py-8">No tasks yet. Add one above.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === "docs" && (
            <div className="space-y-4">
              {/* Upload */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 text-[12px] font-medium px-3 py-3 bg-[#fafafa] dark:bg-[#27272a] border-2 border-dashed border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg text-[#71717a] dark:text-[#a1a1aa] hover:border-[#18181b] dark:hover:border-[#fafafa] hover:text-[#18181b] dark:hover:text-[#fafafa] transition-colors cursor-pointer disabled:opacity-40"
                >
                  <Upload size={14} />
                  {uploading ? "Uploading..." : "Upload Document"}
                </button>
              </div>

              {/* Docs list */}
              <div className="space-y-1.5">
                {documents.map((doc: any) => (
                  <DocRow key={doc.id} doc={doc} dealId={deal._id} removeDocument={removeDocument} />
                ))}
                {documents.length === 0 && (
                  <p className="text-[12px] text-[#a1a1aa] dark:text-[#71717a] text-center py-8">No documents yet.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === "notes" && (
            <div className="space-y-3">
              <div className="space-y-2 bg-[#fafafa] dark:bg-[#27272a] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-3">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleAddNote();
                    }
                  }}
                  placeholder="Write a note... (Cmd/Ctrl + Enter to save)"
                  rows={3}
                  className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#18181b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa] resize-y leading-relaxed"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleAddNote}
                    disabled={!newNote.trim()}
                    className="flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Plus size={11} /> Add Note
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {notes.map((note: any, idx: number) => (
                  <div key={note.id || idx} className="border-l-2 border-[#e4e4e7] dark:border-[#3f3f46] pl-3 py-1">
                    <p className="text-[12px] text-[#18181b] dark:text-[#fafafa] leading-relaxed whitespace-pre-wrap">{note.text}</p>
                    <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] mt-1">
                      {note.author} \u00B7 {formatDateTime(note.createdAt)}
                    </p>
                  </div>
                ))}
                {notes.length === 0 && <p className="text-[12px] text-[#a1a1aa] dark:text-[#71717a] text-center py-6">No notes yet</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function TaskRow({
  task,
  dealId,
  currentUser,
  toggleTask,
  updateTask,
  removeTask,
}: {
  task: any;
  dealId: any;
  currentUser: string;
  toggleTask: (args: { id: any; taskId: string; user?: string }) => void;
  updateTask: (args: { id: any; taskId: string; text?: string; assignedTo?: string; dueDate?: string }) => void;
  removeTask: (args: { id: any; taskId: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const [editAssignee, setEditAssignee] = useState(task.assignedTo || "");
  const [editDueDate, setEditDueDate] = useState(task.dueDate || "");

  function save() {
    const patch: any = { id: dealId, taskId: task.id };
    if (editText.trim() !== task.text) patch.text = editText.trim();
    if (editAssignee !== (task.assignedTo || "")) patch.assignedTo = editAssignee;
    if (editDueDate !== (task.dueDate || "")) patch.dueDate = editDueDate;
    if (editText.trim()) {
      updateTask(patch);
    }
    setEditing(false);
  }

  function cancel() {
    setEditText(task.text);
    setEditAssignee(task.assignedTo || "");
    setEditDueDate(task.dueDate || "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="border border-[#18181b] dark:border-[#fafafa] rounded-lg p-3 bg-[#fafafa] dark:bg-[#27272a] space-y-2">
        <input
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
          autoFocus
          className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#18181b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#71717a]"
        />
        <div className="flex gap-2">
          <select
            value={editAssignee}
            onChange={(e) => setEditAssignee(e.target.value)}
            className="text-[11px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#18181b] text-[#71717a] dark:text-[#a1a1aa] flex-1"
          >
            <option value="">Unassigned</option>
            <option value="Ori">Ori</option>
            <option value="Max">Max</option>
          </select>
          <input
            type="date"
            value={editDueDate}
            onChange={(e) => setEditDueDate(e.target.value)}
            className="text-[11px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#18181b] text-[#71717a] dark:text-[#a1a1aa] flex-1"
          />
          <button onClick={save} className="text-[11px] font-medium px-3 py-1.5 bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] rounded cursor-pointer">
            Save
          </button>
          <button onClick={cancel} className="text-[11px] text-[#71717a] dark:text-[#a1a1aa] cursor-pointer px-2">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const isOverdue = task.dueDate && !task.done && new Date(task.dueDate) < new Date();

  return (
    <div className="group flex items-start gap-2 p-2.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg hover:border-[#a1a1aa] dark:hover:border-[#52525b] transition-colors">
      <button
        onClick={() => toggleTask({ id: dealId, taskId: task.id, user: currentUser })}
        className="mt-0.5 flex-shrink-0 cursor-pointer"
        title={task.done ? "Mark incomplete" : "Mark complete"}
      >
        {task.done ? (
          <CheckSquare size={15} className="text-[#16a34a]" />
        ) : (
          <Square size={15} className="text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] transition-colors" />
        )}
      </button>
      <div className="flex-1 min-w-0" onDoubleClick={() => setEditing(true)}>
        <p
          className={cn(
            "text-[12px] leading-relaxed cursor-text",
            task.done ? "text-[#a1a1aa] dark:text-[#71717a] line-through" : "text-[#18181b] dark:text-[#fafafa]"
          )}
        >
          {task.text}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {task.assignedTo && (
            <span className="text-[9px] text-[#2563eb] dark:text-[#60a5fa] font-medium">{task.assignedTo}</span>
          )}
          {task.dueDate && (
            <span className={cn("text-[9px] font-medium", isOverdue ? "text-[#dc2626]" : "text-[#71717a] dark:text-[#a1a1aa]")}>
              Due {formatDate(task.dueDate)}
            </span>
          )}
          <span className="text-[9px] text-[#a1a1aa] dark:text-[#71717a]">Created {formatDateTime(task.createdAt)}</span>
          {task.done && task.completedAt && (
            <span className="text-[9px] text-[#16a34a]">Done {formatDateTime(task.completedAt)}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setEditing(true)}
          className="text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer p-1"
          title="Edit task"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button
          onClick={() => removeTask({ id: dealId, taskId: task.id })}
          className="text-[#a1a1aa] dark:text-[#71717a] hover:text-[#dc2626] cursor-pointer p-1"
          title="Delete task"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function MetricCard({ label, display }: { label: string; display: string }) {
  return (
    <div className="bg-gradient-to-br from-[#fafafa] to-white dark:from-[#27272a] dark:to-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-3">
      <p className="text-[9px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium">{label}</p>
      <p className="text-[15px] font-semibold text-[#18181b] dark:text-[#fafafa] mt-1">{display}</p>
    </div>
  );
}

function EditableMetric({
  label,
  value,
  type,
  suffix,
  onSave,
}: {
  label: string;
  value: number | undefined;
  type: "currency" | "percent" | "number";
  suffix?: string;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  function display(): string {
    if (value == null) return "\u2014";
    if (type === "currency") return formatCurrency(value);
    if (type === "percent") return value ? `${value}%` : "\u2014";
    return `${formatNumber(value)}${suffix || ""}`;
  }

  function commit() {
    const n = Number(draft);
    if (!isNaN(n) && n !== value) onSave(n);
    setEditing(false);
  }

  return (
    <div
      className="bg-gradient-to-br from-[#fafafa] to-white dark:from-[#27272a] dark:to-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg p-3 cursor-pointer hover:border-[#a1a1aa] dark:hover:border-[#52525b] transition-colors"
      onClick={() => !editing && (setDraft(String(value ?? "")), setEditing(true))}
    >
      <p className="text-[9px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide font-medium">{label}</p>
      {editing ? (
        <input
          type="number"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 w-full text-[15px] font-semibold text-[#18181b] dark:text-[#fafafa] bg-white dark:bg-[#18181b] border border-[#18181b] dark:border-[#fafafa] rounded px-1 py-0.5 focus:outline-none"
        />
      ) : (
        <p className="text-[15px] font-semibold text-[#18181b] dark:text-[#fafafa] mt-1">{display()}</p>
      )}
    </div>
  );
}

function EditableTextField({
  value,
  placeholder,
  onSave,
  className,
}: {
  value: string | undefined;
  placeholder?: string;
  onSave: (value: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  function commit() {
    if (draft !== (value || "")) onSave(draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        placeholder={placeholder}
        className={cn(
          "w-full bg-white dark:bg-[#18181b] border border-[#18181b] dark:border-[#fafafa] rounded px-2 py-1 focus:outline-none",
          className
        )}
      />
    );
  }

  return (
    <p
      className={cn(className, "cursor-text hover:bg-[#fafafa] dark:hover:bg-[#27272a] rounded px-1 -mx-1 transition-colors")}
      onClick={() => { setDraft(value || ""); setEditing(true); }}
    >
      {value || placeholder || "\u2014"}
    </p>
  );
}

function EditableField({
  label,
  value,
  icon,
  options,
  type,
  displayValue,
  onSave,
}: {
  label: string;
  value: string | undefined;
  icon?: React.ReactNode;
  options?: string[];
  type?: "text" | "date";
  displayValue?: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  function commit() {
    if (draft !== (value || "")) onSave(draft);
    setEditing(false);
  }

  return (
    <div>
      <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide mb-1 flex items-center gap-1">
        {icon}
        {label}
      </p>
      {editing ? (
        options ? (
          <select
            value={draft}
            autoFocus
            onChange={(e) => { setDraft(e.target.value); onSave(e.target.value); setEditing(false); }}
            onBlur={() => setEditing(false)}
            className="w-full text-[12px] text-[#18181b] dark:text-[#fafafa] bg-white dark:bg-[#18181b] border border-[#18181b] dark:border-[#fafafa] rounded px-2 py-1 focus:outline-none"
          >
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            type={type || "text"}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            className="w-full text-[12px] text-[#18181b] dark:text-[#fafafa] bg-white dark:bg-[#18181b] border border-[#18181b] dark:border-[#fafafa] rounded px-2 py-1 focus:outline-none"
          />
        )
      ) : (
        <p
          className="text-[12px] text-[#18181b] dark:text-[#fafafa] cursor-text hover:bg-[#fafafa] dark:hover:bg-[#27272a] rounded px-1 -mx-1 py-0.5 transition-colors"
          onClick={() => { setDraft(value || ""); setEditing(true); }}
        >
          {displayValue || value || "\u2014"}
        </p>
      )}
    </div>
  );
}

function Field({ label, value, icon }: { label: string; value: string | undefined; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-[#a1a1aa] dark:text-[#71717a] uppercase tracking-wide mb-1 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-[12px] text-[#18181b] dark:text-[#fafafa]">{value || "\u2014"}</p>
    </div>
  );
}

function DocRow({ doc, dealId, removeDocument }: { doc: any; dealId: any; removeDocument: (args: { id: any; docId: string }) => void }) {
  const url = useQuery(api.files.getUrl, doc.storageId ? { storageId: doc.storageId } : "skip");

  return (
    <div className="group flex items-center gap-2 p-2.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg hover:border-[#a1a1aa] dark:hover:border-[#52525b] transition-colors">
      <Paperclip size={13} className="text-[#71717a] dark:text-[#a1a1aa] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-[#18181b] dark:text-[#fafafa] truncate">{doc.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] text-[#71717a] dark:text-[#a1a1aa]">{doc.uploadedBy}</span>
          <span className="text-[9px] text-[#d4d4d8] dark:text-[#52525b]">·</span>
          <span className="text-[9px] text-[#a1a1aa] dark:text-[#71717a]">{formatDateTime(doc.uploadedAt)}</span>
          {doc.size && (
            <>
              <span className="text-[9px] text-[#d4d4d8] dark:text-[#52525b]">·</span>
              <span className="text-[9px] text-[#a1a1aa] dark:text-[#71717a]">{formatFileSize(doc.size)}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {url && (
          <a
            href={url}
            download={doc.name}
            target="_blank"
            rel="noreferrer"
            className="text-[#a1a1aa] dark:text-[#71717a] hover:text-[#18181b] dark:hover:text-[#fafafa] cursor-pointer p-1"
            title="Download"
          >
            <Download size={12} />
          </a>
        )}
        <button
          onClick={() => {
            if (confirm(`Delete ${doc.name}?`)) {
              removeDocument({ id: dealId, docId: doc.id });
            }
          }}
          className="text-[#a1a1aa] dark:text-[#71717a] hover:text-[#dc2626] cursor-pointer p-1"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

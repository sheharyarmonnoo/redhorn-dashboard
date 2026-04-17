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
  addNote: (args: { id: any; text: string; author: string }) => void;
  addTask: (args: { id: any; text: string; assignedTo?: string; dueDate?: string; createdBy?: string }) => void;
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
  addNote,
  addTask,
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
      <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40 animate-in fade-in" onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen w-full max-w-[600px] bg-white z-50 flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#e4e4e7] flex items-start justify-between bg-gradient-to-br from-white to-[#fafafa]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Building2 size={14} className="text-[#71717a]" />
              <p className="text-[15px] font-semibold text-[#18181b] truncate">{deal.name}</p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#71717a]">
              <MapPin size={11} />
              <span>{deal.address}, {deal.city}, {deal.state}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-3">
            <select
              value={currentUser}
              onChange={(e) => setCurrentUser(e.target.value)}
              className="text-[10px] px-2 py-1 border border-[#e4e4e7] rounded bg-white text-[#71717a] cursor-pointer"
              title="Acting as"
            >
              <option value="Ori">as Ori</option>
              <option value="Max">as Max</option>
            </select>
            <button
              onClick={handleDelete}
              className="text-[#a1a1aa] hover:text-[#dc2626] cursor-pointer p-1 rounded transition-colors"
              title="Delete deal"
            >
              <Trash2 size={15} />
            </button>
            <button onClick={onClose} className="text-[#a1a1aa] hover:text-[#18181b] cursor-pointer p-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Stage selector */}
        <div className="px-5 py-3 border-b border-[#e4e4e7] flex items-center gap-1.5 overflow-x-auto">
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => onStageChange(deal._id, s)}
              className={cn(
                "text-[10px] font-medium px-2.5 py-1 rounded cursor-pointer transition-colors whitespace-nowrap",
                deal.stage === s
                  ? `${getStageColor(s)} text-white`
                  : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
              )}
            >
              {getStageLabel(s)}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="px-5 border-b border-[#e4e4e7] flex gap-5">
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
                  ? "border-[#18181b] text-[#18181b]"
                  : "border-transparent text-[#a1a1aa] hover:text-[#71717a]"
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
              {/* Metric cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gradient-to-br from-[#fafafa] to-white border border-[#e4e4e7] rounded-lg p-3">
                  <p className="text-[9px] text-[#a1a1aa] uppercase tracking-wide font-medium">Asking</p>
                  <p className="text-[15px] font-semibold text-[#18181b] mt-1">{formatCurrency(deal.askingPrice || 0)}</p>
                </div>
                <div className="bg-gradient-to-br from-[#fafafa] to-white border border-[#e4e4e7] rounded-lg p-3">
                  <p className="text-[9px] text-[#a1a1aa] uppercase tracking-wide font-medium">Cap Rate</p>
                  <p className="text-[15px] font-semibold text-[#18181b] mt-1">{deal.capRate ? `${deal.capRate}%` : "\u2014"}</p>
                </div>
                <div className="bg-gradient-to-br from-[#fafafa] to-white border border-[#e4e4e7] rounded-lg p-3">
                  <p className="text-[9px] text-[#a1a1aa] uppercase tracking-wide font-medium">$/SF</p>
                  <p className="text-[15px] font-semibold text-[#18181b] mt-1">{deal.pricePerSF ? `$${deal.pricePerSF}` : "\u2014"}</p>
                </div>
              </div>

              {/* Property */}
              <section>
                <p className="text-[10px] font-semibold text-[#71717a] uppercase tracking-wider mb-2.5">Property</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type" value={deal.propertyType} />
                  <Field label="Sq Ft" value={formatNumber(deal.sqft)} />
                  <Field label="Units" value={String(deal.units || "\u2014")} />
                  <Field label="Closing Date" value={formatDate(deal.closingDate)} />
                </div>
              </section>

              {/* Team & Source */}
              <section>
                <p className="text-[10px] font-semibold text-[#71717a] uppercase tracking-wider mb-2.5">Team & Source</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Assigned To" value={deal.assignedTo} icon={<User size={11} />} />
                  <Field label="Source" value={deal.source || "\u2014"} />
                </div>
              </section>

              {/* Contacts */}
              {deal.contacts && deal.contacts.length > 0 && (
                <section>
                  <p className="text-[10px] font-semibold text-[#71717a] uppercase tracking-wider mb-2.5">Contacts</p>
                  <div className="space-y-2">
                    {deal.contacts.map((c: any, i: number) => (
                      <div key={i} className="bg-[#fafafa] border border-[#e4e4e7] rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[12px] font-medium text-[#18181b]">{c.name}</p>
                          <span className="text-[10px] text-[#71717a] bg-white px-2 py-0.5 rounded border border-[#e4e4e7]">
                            {c.role}
                          </span>
                        </div>
                        {c.email && (
                          <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-[11px] text-[#2563eb] hover:underline mt-1">
                            <Mail size={11} /> {c.email}
                          </a>
                        )}
                        {c.phone && (
                          <div className="flex items-center gap-1.5 text-[11px] text-[#71717a] mt-0.5">
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
              <div className="bg-[#fafafa] border border-[#e4e4e7] rounded-lg p-3 space-y-2">
                <input
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                  placeholder="New task..."
                  className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] rounded bg-white focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
                />
                <div className="flex gap-2">
                  <select
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="text-[11px] px-2 py-1.5 border border-[#e4e4e7] rounded bg-white text-[#71717a] flex-1"
                  >
                    <option value="">Unassigned</option>
                    <option value="Ori">Ori</option>
                    <option value="Max">Max</option>
                  </select>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="text-[11px] px-2 py-1.5 border border-[#e4e4e7] rounded bg-white text-[#71717a] flex-1"
                  />
                  <button
                    onClick={handleAddTask}
                    disabled={!newTaskText.trim()}
                    className="flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 bg-[#18181b] text-white rounded hover:bg-[#27272a] transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Plus size={11} /> Add
                  </button>
                </div>
              </div>

              {/* Task list */}
              <div className="space-y-1.5">
                {tasks.map((task: any) => (
                  <div
                    key={task.id}
                    className="group flex items-start gap-2 p-2.5 border border-[#e4e4e7] rounded-lg hover:border-[#a1a1aa] transition-colors"
                  >
                    <button
                      onClick={() => toggleTask({ id: deal._id, taskId: task.id, user: currentUser })}
                      className="mt-0.5 flex-shrink-0 cursor-pointer"
                    >
                      {task.done ? (
                        <CheckSquare size={15} className="text-[#16a34a]" />
                      ) : (
                        <Square size={15} className="text-[#a1a1aa] hover:text-[#18181b] transition-colors" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-[12px] leading-relaxed",
                          task.done ? "text-[#a1a1aa] line-through" : "text-[#18181b]"
                        )}
                      >
                        {task.text}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {task.assignedTo && (
                          <span className="text-[9px] text-[#2563eb] font-medium">{task.assignedTo}</span>
                        )}
                        {task.dueDate && (
                          <span className="text-[9px] text-[#71717a]">Due {formatDate(task.dueDate)}</span>
                        )}
                        <span className="text-[9px] text-[#a1a1aa]">Created {formatDateTime(task.createdAt)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeTask({ id: deal._id, taskId: task.id })}
                      className="opacity-0 group-hover:opacity-100 text-[#a1a1aa] hover:text-[#dc2626] transition-all cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {tasks.length === 0 && (
                  <p className="text-[12px] text-[#a1a1aa] text-center py-8">No tasks yet. Add one above.</p>
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
                  className="w-full flex items-center justify-center gap-2 text-[12px] font-medium px-3 py-3 bg-[#fafafa] border-2 border-dashed border-[#e4e4e7] rounded-lg text-[#71717a] hover:border-[#18181b] hover:text-[#18181b] transition-colors cursor-pointer disabled:opacity-40"
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
                  <p className="text-[12px] text-[#a1a1aa] text-center py-8">No documents yet.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === "notes" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                  placeholder="Add a note..."
                  className="flex-1 text-[12px] px-3 py-2 border border-[#e4e4e7] rounded bg-[#fafafa] focus:outline-none focus:border-[#71717a] placeholder-[#a1a1aa]"
                />
                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim()}
                  className="text-[11px] font-medium px-3 py-1.5 bg-[#18181b] text-white rounded hover:bg-[#27272a] transition-colors cursor-pointer disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              <div className="space-y-3">
                {notes.map((note: any, idx: number) => (
                  <div key={note.id || idx} className="border-l-2 border-[#e4e4e7] pl-3 py-1">
                    <p className="text-[12px] text-[#18181b] leading-relaxed whitespace-pre-wrap">{note.text}</p>
                    <p className="text-[10px] text-[#a1a1aa] mt-1">
                      {note.author} \u00B7 {formatDateTime(note.createdAt)}
                    </p>
                  </div>
                ))}
                {notes.length === 0 && <p className="text-[12px] text-[#a1a1aa] text-center py-6">No notes yet</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, value, icon }: { label: string; value: string | undefined; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wide mb-1 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-[12px] text-[#18181b]">{value || "\u2014"}</p>
    </div>
  );
}

function DocRow({ doc, dealId, removeDocument }: { doc: any; dealId: any; removeDocument: (args: { id: any; docId: string }) => void }) {
  const url = useQuery(api.files.getUrl, doc.storageId ? { storageId: doc.storageId } : "skip");

  return (
    <div className="group flex items-center gap-2 p-2.5 border border-[#e4e4e7] rounded-lg hover:border-[#a1a1aa] transition-colors">
      <Paperclip size={13} className="text-[#71717a] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-[#18181b] truncate">{doc.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] text-[#71717a]">{doc.uploadedBy}</span>
          <span className="text-[9px] text-[#d4d4d8]">\u00B7</span>
          <span className="text-[9px] text-[#a1a1aa]">{formatDateTime(doc.uploadedAt)}</span>
          {doc.size && (
            <>
              <span className="text-[9px] text-[#d4d4d8]">\u00B7</span>
              <span className="text-[9px] text-[#a1a1aa]">{formatFileSize(doc.size)}</span>
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
            className="text-[#a1a1aa] hover:text-[#18181b] cursor-pointer p-1"
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
          className="text-[#a1a1aa] hover:text-[#dc2626] cursor-pointer p-1"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

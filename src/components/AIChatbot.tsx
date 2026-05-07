"use client";

import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation, useAction } from "convex/react";
import { Sparkles, X, Send, Plus, Trash2, MessageSquare, ChevronLeft } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useActiveProperty } from "@/hooks/useConvexData";

/**
 * Floating Claude chatbot, mounted globally in the dashboard layout. The
 * pill button stays bottom-right; clicking opens a 480px right-edge drawer
 * (full-width on mobile). Threads are persisted per-Clerk-user in Convex
 * via convex/chat.ts and the assistant action lives in convex/chatAction.ts.
 */

type ThreadDoc = { _id: string; title: string; updatedAt: string };
type MessageDoc = { _id: string; role: string; content: string; createdAt: string };

export default function AIChatbot() {
  const { user, isSignedIn } = useUser();
  const userId = user?.id;
  const property = useActiveProperty() as any;

  const [open, setOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showThreadList, setShowThreadList] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const threads = useQuery(
    api.chat.listThreads,
    userId ? { userId } : "skip"
  ) as ThreadDoc[] | undefined;

  const threadDoc = useQuery(
    api.chat.getThread,
    activeThreadId ? { id: activeThreadId as any } : "skip"
  ) as (ThreadDoc & { messages: MessageDoc[] }) | null | undefined;

  const createThread = useMutation(api.chat.createThread);
  const addUserMessage = useMutation(api.chat.addUserMessage);
  const removeThread = useMutation(api.chat.removeThread);
  const ask = useAction(api.chatAction.ask);

  // Auto-scroll the message list to the bottom when messages change or the
  // panel re-opens. The ref points at a sentinel <div> at the end of the list.
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [threadDoc?.messages?.length, open]);

  // When the user opens the panel and has prior threads, pre-select the most
  // recent so they don't land on an empty pane.
  useEffect(() => {
    if (open && !activeThreadId && threads && threads.length > 0) {
      setActiveThreadId(threads[0]._id);
    }
  }, [open, activeThreadId, threads]);

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!isSignedIn) return null;

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending || !userId) return;

    setSending(true);
    setErrorMsg(null);

    try {
      let threadId = activeThreadId;
      if (!threadId) {
        const id = await createThread({ userId });
        threadId = id as unknown as string;
        setActiveThreadId(threadId);
      }
      await addUserMessage({ threadId: threadId as any, content: text });
      setDraft("");

      const result = await ask({
        threadId: threadId as any,
        userQuestion: text,
        propertyId: property?._id || undefined,
      });
      if (!result?.ok && result?.error) setErrorMsg(result.error);
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
    } finally {
      setSending(false);
    }
  }

  function handleNewThread() {
    setActiveThreadId(null);
    setShowThreadList(false);
    setDraft("");
    setErrorMsg(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this conversation?")) return;
    await removeThread({ id: id as any });
    if (activeThreadId === id) setActiveThreadId(null);
  }

  const messages = threadDoc?.messages || [];

  return (
    <>
      {/* Floating button — always rendered so the user can re-open after closing */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#18181b] dark:bg-[#fafafa] text-[#fafafa] dark:text-[#18181b] px-4 py-3 shadow-lg shadow-black/20 hover:opacity-90 transition-all"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-[13px] font-medium hidden sm:inline">Ask AI</span>
        </button>
      )}

      {/* Backdrop — only on mobile so desktop users can keep working with
          the panel open. Click to dismiss. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 sm:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[480px] bg-white dark:bg-[#0c0c0d] border-l border-[#e4e4e7] dark:border-[#27272a] shadow-2xl transition-transform duration-200 flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-[#e4e4e7] dark:border-[#27272a] flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setShowThreadList((v) => !v)}
              className="p-1 rounded hover:bg-[#f4f4f5] dark:hover:bg-[#1f1f22] flex-shrink-0"
              aria-label="Toggle conversation list"
            >
              {showThreadList ? (
                <ChevronLeft className="w-4 h-4 text-[#71717a]" />
              ) : (
                <MessageSquare className="w-4 h-4 text-[#71717a]" />
              )}
            </button>
            <Sparkles className="w-4 h-4 text-[#18181b] dark:text-[#fafafa] flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#18181b] dark:text-[#fafafa] truncate">
                {threadDoc?.title || "Ask AI"}
              </p>
              <p className="text-[11px] text-[#71717a] truncate">
                {property?.name ? `Active: ${property.name}` : "No property selected"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleNewThread}
              className="p-1.5 rounded hover:bg-[#f4f4f5] dark:hover:bg-[#1f1f22]"
              aria-label="New conversation"
              title="New conversation"
            >
              <Plus className="w-4 h-4 text-[#71717a]" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded hover:bg-[#f4f4f5] dark:hover:bg-[#1f1f22]"
              aria-label="Close AI assistant"
            >
              <X className="w-4 h-4 text-[#71717a]" />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex">
          {/* Thread list (collapsible — overlays the conversation on mobile) */}
          {showThreadList && (
            <div className="w-full sm:w-44 flex-shrink-0 border-r border-[#e4e4e7] dark:border-[#27272a] overflow-y-auto bg-[#fafafa] dark:bg-[#09090b]">
              <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-[#a1a1aa] font-medium">
                Conversations
              </div>
              {(threads || []).length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-[#71717a]">No conversations yet.</div>
              ) : (
                (threads || []).map((t) => (
                  <div
                    key={t._id}
                    className={`group flex items-center justify-between px-3 py-2 cursor-pointer text-[12px] hover:bg-[#f4f4f5] dark:hover:bg-[#1f1f22] ${
                      activeThreadId === t._id ? "bg-[#f4f4f5] dark:bg-[#1f1f22]" : ""
                    }`}
                    onClick={() => {
                      setActiveThreadId(t._id);
                      setShowThreadList(false);
                    }}
                  >
                    <span className="truncate flex-1 text-[#18181b] dark:text-[#fafafa]">
                      {t.title}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(t._id);
                      }}
                      className="ml-2 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Message list */}
          <div className={`flex-1 overflow-y-auto px-4 py-3 ${showThreadList ? "hidden sm:block" : ""}`}>
            {messages.length === 0 ? (
              <EmptyState propertyName={property?.name} />
            ) : (
              <ul className="space-y-3">
                {messages.map((m) => (
                  <Bubble key={m._id} role={m.role} content={m.content} />
                ))}
                {sending && (
                  <Bubble role="assistant" content="Thinking…" pending />
                )}
              </ul>
            )}
            {errorMsg && (
              <div className="mt-3 text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded px-3 py-2">
                {errorMsg}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {/* Input */}
        <footer className={`border-t border-[#e4e4e7] dark:border-[#27272a] px-3 py-3 flex-shrink-0 ${showThreadList ? "hidden sm:block" : ""}`}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                property?.name
                  ? `Ask about ${property.name}…`
                  : "Ask about your properties…"
              }
              rows={2}
              disabled={sending}
              className="flex-1 resize-none rounded border border-[#e4e4e7] dark:border-[#27272a] bg-white dark:bg-[#09090b] px-3 py-2 text-[13px] text-[#18181b] dark:text-[#fafafa] placeholder-[#a1a1aa] focus:outline-none focus:border-[#a1a1aa] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="rounded bg-[#18181b] dark:bg-[#fafafa] text-[#fafafa] dark:text-[#18181b] p-2 disabled:opacity-40 hover:opacity-90 transition-opacity"
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="mt-1.5 text-[10px] text-[#a1a1aa]">
            Enter to send · Shift+Enter for newline
          </p>
        </footer>
      </aside>
    </>
  );
}

function EmptyState({ propertyName }: { propertyName?: string }) {
  const suggestions = useMemo(
    () => [
      "Who is past due and how much?",
      "What's the latest NOI?",
      "Which leases expire in the next 90 days?",
      "How is revenue trending vs last month?",
      "Any open alerts I should look at?",
    ],
    []
  );
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <div className="w-10 h-10 rounded-full bg-[#f4f4f5] dark:bg-[#1f1f22] flex items-center justify-center mb-3">
        <Sparkles className="w-5 h-5 text-[#18181b] dark:text-[#fafafa]" />
      </div>
      <p className="text-[14px] font-medium text-[#18181b] dark:text-[#fafafa]">
        Ask about {propertyName || "your portfolio"}
      </p>
      <p className="text-[12px] text-[#71717a] mt-1 max-w-[280px]">
        I can answer questions using your live Convex data — past-due tenants, NOI,
        budgets, lease expirations, sync status, and alerts.
      </p>
      <div className="mt-4 w-full space-y-1.5">
        {suggestions.map((s) => (
          <div
            key={s}
            className="text-[12px] text-left px-3 py-2 rounded border border-[#e4e4e7] dark:border-[#27272a] text-[#52525b] dark:text-[#a1a1aa]"
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

function Bubble({
  role,
  content,
  pending,
}: {
  role: string;
  content: string;
  pending?: boolean;
}) {
  const isUser = role === "user";
  return (
    <li className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? "bg-[#18181b] dark:bg-[#fafafa] text-[#fafafa] dark:text-[#18181b]"
            : "bg-[#f4f4f5] dark:bg-[#1f1f22] text-[#18181b] dark:text-[#fafafa]"
        } ${pending ? "italic opacity-70" : ""}`}
      >
        {isUser ? content : <MarkdownLite text={content} />}
      </div>
    </li>
  );
}

/**
 * Tiny markdown renderer: bold via **…**, line breaks preserved, leading
 * "- " becomes a bullet glyph. We don't pull in a real markdown lib because
 * the model is constrained by the system prompt to keep formatting simple.
 */
function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const isBullet = /^\s*-\s/.test(line);
        const stripped = isBullet ? line.replace(/^\s*-\s/, "") : line;
        const parts = stripped.split(/(\*\*[^*]+\*\*)/g);
        return (
          <Fragment key={i}>
            {isBullet && <span className="select-none text-[#71717a]">• </span>}
            {parts.map((p, j) =>
              p.startsWith("**") && p.endsWith("**") ? (
                <strong key={j}>{p.slice(2, -2)}</strong>
              ) : (
                <Fragment key={j}>{p}</Fragment>
              )
            )}
            {i < lines.length - 1 && <br />}
          </Fragment>
        );
      })}
    </>
  );
}

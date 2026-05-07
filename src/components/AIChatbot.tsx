"use client";

import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation, useAction } from "convex/react";
import { Sparkles, X, Send, Trash2, MessageSquare, ChevronLeft, Minimize2, Maximize2 } from "lucide-react";
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
  // "half" = compact bottom-right window. "full" = right-edge full-height.
  // Default to "half" so the dashboard stays visible. We persist the user's
  // choice in localStorage so reopening (or hard refresh) lands them in the
  // size they last used.
  const [size, setSize] = useState<"full" | "half">("half");
  const [sizeHydrated, setSizeHydrated] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem("rh-ai-chat-size");
      if (v === "full" || v === "half") setSize(v);
    } catch {}
    setSizeHydrated(true);
  }, []);
  useEffect(() => {
    if (!sizeHydrated) return;
    try { localStorage.setItem("rh-ai-chat-size", size); } catch {}
  }, [size, sizeHydrated]);
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
        userName: user?.fullName || undefined,
        userEmail: user?.primaryEmailAddress?.emailAddress || undefined,
      });
      if (!result?.ok && result?.error) setErrorMsg(result.error);
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this conversation?")) return;
    await removeThread({ id: id as any });
    if (activeThreadId === id) setActiveThreadId(null);
  }

  // "Clear chat" — wipes the active thread (and its messages) and drops back
  // to the empty state. Next send creates a fresh thread automatically.
  async function handleClearChat() {
    if (!activeThreadId) return;
    if (!confirm("Clear this chat? All messages in this conversation will be deleted.")) return;
    await removeThread({ id: activeThreadId as any });
    setActiveThreadId(null);
    setDraft("");
    setErrorMsg(null);
  }

  const messages = threadDoc?.messages || [];

  return (
    <>
      {/* Floating button — only when the drawer is closed. Dismissing the
          drawer is handled by the header X and the backdrop click. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          className="fixed bottom-16 right-5 z-50 flex items-center gap-2 rounded-full bg-[#18181b] dark:bg-[#fafafa] text-[#fafafa] dark:text-[#18181b] px-4 py-3 shadow-lg shadow-black/20 hover:opacity-90 transition-all"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-[13px] font-medium hidden sm:inline">Ask AI</span>
        </button>
      )}

      {/* Backdrop — click anywhere outside the drawer to close. Lighter on
          desktop so the dashboard stays partially visible behind the panel.
          Suppressed entirely in half-screen "minimized" mode so the user can
          keep clicking the dashboard while the chat docks at the corner. */}
      {open && size === "full" && (
        <div
          className="fixed inset-0 z-40 bg-black/30 sm:bg-black/15"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer — full-height right-edge OR half-height bottom-right docked. */}
      <aside
        className={`fixed z-50 bg-white dark:bg-[#0c0c0d] border border-[#e4e4e7] dark:border-[#27272a] shadow-2xl transition-all duration-200 flex flex-col ${
          size === "half"
            ? "bottom-0 right-0 h-[55vh] w-full sm:w-[420px] sm:bottom-3 sm:right-3 sm:rounded-lg"
            : "top-0 right-0 h-full w-full sm:w-[640px] lg:w-[720px] border-l"
        } ${open ? "translate-x-0 translate-y-0 opacity-100" : (size === "half" ? "translate-y-full opacity-0 pointer-events-none invisible" : "translate-x-full opacity-0 pointer-events-none invisible")}`}
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
            {activeThreadId && messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="p-1.5 rounded hover:bg-[#f4f4f5] dark:hover:bg-[#1f1f22]"
                aria-label="Clear chat"
                title="Clear chat"
              >
                <Trash2 className="w-4 h-4 text-[#71717a] hover:text-[#dc2626]" />
              </button>
            )}
            <button
              onClick={() => setSize(s => (s === "full" ? "half" : "full"))}
              className="p-1.5 rounded hover:bg-[#f4f4f5] dark:hover:bg-[#1f1f22]"
              aria-label={size === "full" ? "Minimize" : "Maximize"}
              title={size === "full" ? "Minimize to bottom" : "Expand to full"}
            >
              {size === "full" ? (
                <Minimize2 className="w-4 h-4 text-[#71717a]" />
              ) : (
                <Maximize2 className="w-4 h-4 text-[#71717a]" />
              )}
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
          {/* Conversation list — always in the DOM so toggling animates the
              width (0 → 176px on desktop, 0 → 100% on mobile) instead of
              snapping into place. The inner content also fades + translates
              from -8px so it doesn't pop. `overflow-hidden` clips children
              while the panel collapses so we don't see a flash of content. */}
          <div
            aria-hidden={!showThreadList}
            className={`flex-shrink-0 overflow-hidden border-r border-[#e4e4e7] dark:border-[#27272a] bg-[#fafafa] dark:bg-[#09090b] transition-[width] duration-200 ease-out ${
              showThreadList ? "w-full sm:w-44" : "w-0"
            }`}
          >
            <div
              className={`w-full sm:w-44 h-full overflow-y-auto transition-all duration-200 ease-out ${
                showThreadList ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 pointer-events-none"
              }`}
            >
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
          </div>

          {/* Message list — `key` on activeThreadId remounts the wrapper on
              thread switch so each new conversation slides in from the right
              instead of snapping. We use a slide+fade (24px translate + opacity)
              for ~220ms so the user sees the panel actually transition. */}
          <div className={`flex-1 overflow-y-auto px-4 py-3 ${showThreadList ? "hidden sm:block" : ""}`}>
            <div
              key={activeThreadId || "empty"}
              style={{ animation: "rh-slide-in-right 220ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
            >
              {messages.length === 0 ? (
                <EmptyState propertyName={property?.name} onPick={(s) => setDraft(s)} />
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
            </div>
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

function EmptyState({ propertyName, onPick }: { propertyName?: string; onPick: (s: string) => void }) {
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
      <div className="mt-4 w-full space-y-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="block w-full text-[12px] text-left px-3 py-2 rounded border border-[#e4e4e7] dark:border-[#27272a] text-[#52525b] dark:text-[#a1a1aa] hover:bg-[#f4f4f5] dark:hover:bg-[#1f1f22] hover:text-[#18181b] dark:hover:text-[#fafafa] hover:border-[#d4d4d8] dark:hover:border-[#3f3f46] cursor-pointer transition-colors"
          >
            {s}
          </button>
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
  // The assistant's bubble may render a <table> block which can't sit inside
  // a `whitespace-pre-wrap` container without breaking layout. Drop the
  // pre-wrap class on the assistant side and let MarkdownLite render line
  // breaks itself; user messages keep pre-wrap so multi-line questions look right.
  return (
    <li className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-lg px-3 py-2 text-[13px] leading-relaxed break-words ${
          isUser ? "whitespace-pre-wrap" : ""
        } ${
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

// One row's worth of pipe-separated cells. "| a | b | c |" → ["a","b","c"].
// Trims leading/trailing pipes + each cell's whitespace.
function parseTableRow(line: string): string[] {
  return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(c => c.trim());
}

// True when a line looks like the alignment row that follows a table header
// (e.g. "|---|:--|---:|"). Each cell is just dashes, colons, and whitespace.
function isTableSeparator(line: string): boolean {
  if (!/\|/.test(line)) return false;
  return parseTableRow(line).every(c => /^:?-+:?$/.test(c));
}

/**
 * Renders Claude's output. Handles:
 *   - GitHub-flavored markdown tables ( |...| header / |---| separator )
 *   - Bullet lists (lines starting with "- ")
 *   - Bold via **…**, inline code via `…`
 *   - Plain newlines preserved as line breaks
 *
 * No external markdown lib — keeps the bundle lean and gives us tight control
 * over table styling so it matches the rest of the dashboard.
 */
function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: Array<
    | { kind: "text"; lines: string[] }
    | { kind: "heading"; level: 1 | 2 | 3; content: string }
    | { kind: "table"; header: string[]; rows: string[][] }
  > = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    // Heading: ^#{1,3}\s
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      blocks.push({
        kind: "heading",
        level: headingMatch[1].length as 1 | 2 | 3,
        content: headingMatch[2].trim(),
      });
      continue;
    }
    // Table = a "|...|" header row followed by a "|---|---|" separator row,
    // followed by zero or more "|...|" data rows.
    if (line && /\|/.test(line) && next && isTableSeparator(next)) {
      const header = parseTableRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== "") {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      i--; // Step back so the outer for-loop's `i++` lands on the next line.
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last && last.kind === "text") last.lines.push(line);
    else blocks.push({ kind: "text", lines: [line] });
  }

  return (
    <>
      {blocks.map((block, bi) => {
        if (block.kind === "heading") {
          const sizes = {
            1: "text-[15px] font-semibold mt-2 mb-1",
            2: "text-[13px] font-semibold mt-2 mb-1",
            3: "text-[12px] font-semibold mt-1.5 mb-0.5 uppercase tracking-wider text-[#52525b] dark:text-[#a1a1aa]",
          } as const;
          return (
            <div key={bi} className={sizes[block.level]}>
              <InlineMd text={block.content} />
            </div>
          );
        }
        if (block.kind === "table") {
          return (
            <div key={bi} className="my-2 -mx-1 overflow-x-auto">
              <table className="text-[12px] border-collapse w-full">
                <thead>
                  <tr>
                    {block.header.map((h, hi) => (
                      <th
                        key={hi}
                        className="px-2 py-1.5 text-left font-semibold bg-[#fafafa] dark:bg-[#27272a] border border-[#e4e4e7] dark:border-[#3f3f46] text-[#18181b] dark:text-[#fafafa]"
                      >
                        <InlineMd text={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className="px-2 py-1 border border-[#e4e4e7] dark:border-[#3f3f46] align-top"
                        >
                          <InlineMd text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        // Trim trailing empty lines from a text block so tables don't get an
        // awkward extra <br> above them.
        const tl = [...block.lines];
        while (tl.length && tl[tl.length - 1].trim() === "") tl.pop();
        return (
          <Fragment key={bi}>
            {tl.map((line, i) => {
              const isBullet = /^\s*-\s/.test(line);
              const stripped = isBullet ? line.replace(/^\s*-\s/, "") : line;
              return (
                <Fragment key={i}>
                  {isBullet && <span className="select-none text-[#71717a]">• </span>}
                  <InlineMd text={stripped} />
                  {i < tl.length - 1 && <br />}
                </Fragment>
              );
            })}
          </Fragment>
        );
      })}
    </>
  );
}

// Inline-only formatting (bold, code) — used inside both regular paragraphs
// and table cells. Splits on the markdown delimiters, walks the chunks.
function InlineMd({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, j) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return <strong key={j}>{p.slice(2, -2)}</strong>;
        }
        if (p.startsWith("`") && p.endsWith("`") && p.length > 1) {
          return (
            <code
              key={j}
              className="px-1 py-0.5 rounded bg-[#e4e4e7] dark:bg-[#27272a] text-[12px] font-mono"
            >
              {p.slice(1, -1)}
            </code>
          );
        }
        return <Fragment key={j}>{p}</Fragment>;
      })}
    </>
  );
}

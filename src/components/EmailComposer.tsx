"use client";
import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { X, ExternalLink } from "lucide-react";
import { api } from "../../convex/_generated/api";
import {
  EMAIL_PROVIDER_LABELS,
  getEmailProvider,
  openComposeWindow,
  type EmailProvider,
} from "@/lib/emailProvider";
import Link from "next/link";

export interface EmailContext {
  propertyId?: string;
  relatedType?: "tenant" | "alert" | "general";
  relatedId?: string;
  toEmail: string;
  toName?: string;
  subject: string;
  body: string;
  ccDefault?: string[];
}

interface Props {
  open: boolean;
  context: EmailContext | null;
  onClose: () => void;
  onSent?: () => void;
}

export default function EmailComposer({ open, context, onClose, onSent }: Props) {
  // Outbound mail goes through the user's webmail (Gmail / Outlook web) — no
  // SMTP credentials live on the server. We just record "compose_opened" in
  // email_log for the audit trail.
  const logCompose = useMutation(api.emailsLog.logCompose);
  const { user } = useUser();
  const [toEmail, setToEmail] = useState("");
  const [toName, setToName] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [opening, setOpening] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [provider, setProvider] = useState<EmailProvider>("gmail");

  useEffect(() => {
    if (open && context) {
      setToEmail(context.toEmail || "");
      setToName(context.toName || "");
      setCc((context.ccDefault || []).join(", "));
      setSubject(context.subject || "");
      setBody(context.body || "");
      setResult(null);
      setProvider(getEmailProvider());
    }
  }, [open, context]);

  // Re-read the saved provider any time it changes elsewhere (e.g. user
  // toggles it on the Account page while a composer modal is open).
  useEffect(() => {
    function refresh() { setProvider(getEmailProvider()); }
    window.addEventListener("redhorn-email-provider-changed", refresh);
    return () => window.removeEventListener("redhorn-email-provider-changed", refresh);
  }, []);

  if (!open || !context) return null;

  async function handleOpenInProvider() {
    if (!toEmail.trim() || !subject.trim() || !body.trim()) return;
    setOpening(true);
    setResult(null);
    const ccList = cc.split(",").map(s => s.trim()).filter(Boolean);
    try {
      // window.open with noopener returns null in some browsers even on
      // success, so we trust the browser to show its own popup-blocked
      // indicator instead of guessing from the return value.
      openComposeWindow(provider, {
        to: toEmail.trim(),
        cc: ccList,
        subject: subject.trim(),
        body,
      });
      // Best-effort audit log. Don't block the user if it fails.
      try {
        await logCompose({
          propertyId: context!.propertyId as any,
          relatedType: context!.relatedType,
          relatedId: context!.relatedId,
          toEmail: toEmail.trim(),
          toName: toName.trim() || undefined,
          cc: ccList,
          subject: subject.trim(),
          body,
          sentBy: user?.fullName || user?.primaryEmailAddress?.emailAddress || "User",
          provider,
        });
      } catch {
        /* non-fatal */
      }
      setResult({ ok: true, message: `Compose window opened in ${EMAIL_PROVIDER_LABELS[provider]}. Review and click Send there.` });
      onSent?.();
      setTimeout(() => onClose(), 1500);
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 dark:bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#e4e4e7] dark:border-[#3f3f46]">
          <div>
            <p className="text-[14px] font-semibold text-[#18181b] dark:text-[#fafafa]">New Email</p>
            <p className="text-[10px] text-[#71717a] dark:text-[#a1a1aa] mt-0.5">
              Will open in {EMAIL_PROVIDER_LABELS[provider]} —{" "}
              <Link href="/account" className="underline hover:text-[#18181b] dark:hover:text-[#fafafa]">change provider</Link>
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] rounded cursor-pointer">
            <X size={16} className="text-[#a1a1aa]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <Field label="To">
            <div className="grid grid-cols-[1fr_180px] gap-2">
              <input
                type="email"
                value={toEmail}
                onChange={e => setToEmail(e.target.value)}
                placeholder="recipient@example.com"
                className="text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
              />
              <input
                type="text"
                value={toName}
                onChange={e => setToName(e.target.value)}
                placeholder="Name (optional)"
                className="text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
              />
            </div>
          </Field>

          <Field label="CC">
            <input
              type="text"
              value={cc}
              onChange={e => setCc(e.target.value)}
              placeholder="comma-separated emails (optional)"
              className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
            />
          </Field>

          <Field label="Subject">
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full text-[12px] px-2 py-1.5 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa]"
            />
          </Field>

          <Field label="Body">
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={12}
              className="w-full text-[12px] px-3 py-2 border border-[#e4e4e7] dark:border-[#3f3f46] rounded bg-white dark:bg-[#09090b] text-[#18181b] dark:text-[#fafafa] focus:outline-none focus:border-[#18181b] dark:focus:border-[#fafafa] resize-none leading-relaxed font-mono"
            />
          </Field>

          {result && (
            <div className={`text-[12px] px-3 py-2 rounded ${
              result.ok
                ? "bg-green-50 dark:bg-green-950/30 text-[#16a34a] border border-green-200 dark:border-green-900/40"
                : "bg-red-50 dark:bg-red-950/30 text-[#dc2626] border border-red-200 dark:border-red-900/40"
            }`}>
              {result.message}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#e4e4e7] dark:border-[#3f3f46]">
          <button
            onClick={onClose}
            disabled={opening}
            className="text-[12px] text-[#71717a] dark:text-[#a1a1aa] hover:text-[#18181b] dark:hover:text-[#fafafa] px-3 py-1.5 rounded cursor-pointer disabled:opacity-30"
          >
            Cancel
          </button>
          <button
            onClick={handleOpenInProvider}
            disabled={opening || !toEmail.trim() || !subject.trim() || !body.trim()}
            className="flex items-center gap-1.5 text-[12px] font-medium bg-[#18181b] dark:bg-[#fafafa] text-white dark:text-[#18181b] hover:bg-[#27272a] dark:hover:bg-[#e4e4e7] px-4 py-1.5 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ExternalLink size={13} />
            {opening ? "Opening…" : "Open in Client"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wide mb-1 block">{label}</label>
      {children}
    </div>
  );
}

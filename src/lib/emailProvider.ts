/**
 * Browser-side email provider integration.
 *
 * Inspired by the crexi-pipeline-ext Chrome extension at
 * `C:\Users\SheharyarMonnoo\crexi-pipeline-ext`. Instead of routing
 * outbound mail through SMTP / SendGrid (which needs server credentials),
 * we open the user's preferred webmail compose surface in a new tab with
 * the to / cc / subject / body pre-populated. The user reviews and clicks
 * Send themselves — no API keys, no server, fully "local".
 */

export type EmailProvider = "gmail" | "outlook";

export const EMAIL_PROVIDER_LABELS: Record<EmailProvider, string> = {
  gmail: "Gmail (web)",
  outlook: "Outlook (web)",
};

const STORAGE_KEY = "redhorn_email_provider";

export function getEmailProvider(): EmailProvider {
  if (typeof window === "undefined") return "outlook";
  const stored = window.localStorage.getItem(STORAGE_KEY) as EmailProvider | null;
  if (stored === "gmail" || stored === "outlook") return stored;
  return "outlook";
}

export function setEmailProvider(provider: EmailProvider) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, provider);
  window.dispatchEvent(new CustomEvent("redhorn-email-provider-changed", { detail: provider }));
}

export interface ComposeArgs {
  to: string;
  cc?: string[];
  subject: string;
  body: string;
}

/**
 * Build the provider-specific compose URL. Same templates as the crexi
 * extension; CC support added.
 */
export function buildComposeUrl(provider: EmailProvider, args: ComposeArgs): string {
  const to = encodeURIComponent(args.to);
  const cc = (args.cc || []).filter(Boolean).map(encodeURIComponent).join(",");
  const subject = encodeURIComponent(args.subject);
  const body = encodeURIComponent(args.body);

  if (provider === "gmail") {
    let url = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;
    if (cc) url += `&cc=${cc}`;
    return url;
  }
  // Outlook web: the legacy OWA compose endpoint at outlook.live.com is the
  // most reliable across both personal (outlook.com / hotmail) and work
  // (Microsoft 365) accounts in 2025/26 — Microsoft transparently redirects
  // signed-in M365 users to the matching outlook.office.com surface while
  // preserving the query params. The newer `/mail/deeplink/compose` URL
  // silently drops to/subject/body when the user isn't signed into the
  // exact surface that minted the deeplink, which is the bug we're fixing.
  let url = `https://outlook.live.com/owa/?path=/mail/action/compose&to=${to}&subject=${subject}&body=${body}`;
  if (cc) url += `&cc=${cc}`;
  return url;
}

/**
 * Open the compose URL in a new tab. Returns true on best-effort success —
 * there's no real "sent" signal since the user has to click Send in the
 * provider UI themselves.
 */
export function openComposeWindow(provider: EmailProvider, args: ComposeArgs): boolean {
  const url = buildComposeUrl(provider, args);
  const w = window.open(url, "_blank", "noopener,noreferrer");
  return !!w;
}

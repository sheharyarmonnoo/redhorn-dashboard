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

export type EmailProvider = "gmail" | "outlook" | "mailto";

export const EMAIL_PROVIDER_LABELS: Record<EmailProvider, string> = {
  gmail: "Gmail (web)",
  outlook: "Outlook (web)",
  mailto: "Default mail client (mailto:)",
};

const STORAGE_KEY = "redhorn_email_provider";

export function getEmailProvider(): EmailProvider {
  if (typeof window === "undefined") return "gmail";
  const stored = window.localStorage.getItem(STORAGE_KEY) as EmailProvider | null;
  if (stored === "gmail" || stored === "outlook" || stored === "mailto") return stored;
  return "gmail";
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
  if (provider === "outlook") {
    let url = `https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${subject}&body=${body}`;
    if (cc) url += `&cc=${cc}`;
    return url;
  }
  // mailto: hands off to whatever the OS has registered (Outlook desktop,
  // Apple Mail, Thunderbird). Keeps the link short — most clients accept
  // mailto bodies up to ~2k chars before truncating.
  let url = `mailto:${args.to}?subject=${subject}&body=${body}`;
  if (cc) url += `&cc=${cc}`;
  return url;
}

/**
 * Open the compose URL in a new tab (or hand off to the OS via mailto).
 * Returns true on best-effort success — there's no real "sent" signal
 * since the user has to click Send in the provider UI themselves.
 */
export function openComposeWindow(provider: EmailProvider, args: ComposeArgs): boolean {
  const url = buildComposeUrl(provider, args);
  if (provider === "mailto") {
    // mailto: works best as a same-tab navigation so the OS handler
    // catches it, but we can also try window.open. Try open first.
    const w = window.open(url, "_blank");
    if (!w) {
      window.location.href = url;
    }
    return true;
  }
  const w = window.open(url, "_blank", "noopener,noreferrer");
  return !!w;
}

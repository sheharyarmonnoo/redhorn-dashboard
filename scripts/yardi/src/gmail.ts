import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { config } from "./config.js";

/**
 * Polls Gmail for a fresh Yardi MFA code.
 *
 * Forwarded Yardi emails arrive in the INBOX (plus-aliased as `user+redhorn@gmail.com`);
 * the named REDHORN label only applies if a Gmail filter is set up, so we search
 * both. Returns the first 6-digit code from a Yardi-subject email received after
 * `afterDate`, polling until `timeoutMs`.
 */
export async function fetchYardi2FACode(opts: {
  afterDate?: Date;
  timeoutMs?: number;
  pollIntervalMs?: number;
} = {}): Promise<string> {
  const afterDate = opts.afterDate ?? new Date(Date.now() - 60_000);
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const code = await tryFetchOnce(afterDate);
    if (code) return code;
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for a Yardi MFA email in the ${config.GMAIL_USER} inbox or REDHORN label.`
  );
}

async function tryFetchOnce(afterDate: Date): Promise<string | null> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: config.GMAIL_USER, pass: config.GMAIL_PASSWORD },
    logger: false,
  });

  await client.connect();
  try {
    const mailboxes = ["INBOX", config.GMAIL_LABEL, `[Gmail]/${config.GMAIL_LABEL}`];
    for (const mailbox of mailboxes) {
      const code = await searchMailbox(client, mailbox, afterDate);
      if (code) return code;
    }
    return null;
  } finally {
    await client.logout().catch(() => { /* already closed */ });
  }
}

async function searchMailbox(client: ImapFlow, mailbox: string, afterDate: Date): Promise<string | null> {
  try {
    await client.status(mailbox, { messages: true });
  } catch {
    return null; // mailbox doesn't exist — skip silently
  }

  const lock = await client.getMailboxLock(mailbox);
  try {
    // Prefer unread emails (fresh codes). Fall back to time-based search if none unseen.
    const since = new Date(Math.min(afterDate.getTime(), Date.now() - 5 * 60_000));
    let uids = await client.search({ since, seen: false });
    if (!uids || uids.length === 0) {
      uids = await client.search({ since });
    }
    if (!uids || uids.length === 0) return null;

    const sorted = [...uids].sort((a, b) => b - a).slice(0, 15);
    for (const uid of sorted) {
      const msg = await client.fetchOne(String(uid), { source: true, envelope: true });
      if (!msg || !msg.source) continue;

      const dateObj = msg.envelope?.date ? new Date(msg.envelope.date) : null;
      if (dateObj && dateObj < afterDate) continue;

      const parsed = await simpleParser(msg.source);
      const subject = parsed.subject || "";
      const textBody = parsed.text || "";
      const htmlBody = parsed.html || "";
      const fromAddr = (parsed.from?.value?.[0]?.address || "").toLowerCase();
      const haystack = `${subject}\n${textBody}\n${htmlBody}`;

      // Accept forwarded emails too — match on subject/body content, not just sender
      const isYardi =
        /yardi/i.test(subject) ||
        /yardione/i.test(subject) ||
        /yardione/i.test(haystack) ||
        /verification code|YardiOne code|security code|one[- ]?time/i.test(subject) ||
        fromAddr.includes("yardi");
      if (!isYardi) continue;

      const match = haystack.match(/\b(\d{6})\b/);
      if (match) return match[1];
    }
    return null;
  } finally {
    lock.release();
  }
}
